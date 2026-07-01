// ============================================================================
// MessageBubble — chat row renderer for the redesigned conversation page
// (Steve 2026-06-30 messenger style).
//
// Three variants distinguished by message.sender:
//   • cliente — incoming, left-aligned, neutral grey bubble, avatar shown
//   • ai      — outgoing, right-aligned, brand-blue bubble, "AI" badge,
//               fuentes chip strip, "Guardar" link
//   • agente  — outgoing, right-aligned, teal/agent bubble, operator name
//
// Attachments (Steve 2026-07-01): when a customer sends an image or PDF,
// the server stores a `[attachment:image/jpeg]` placeholder in `content`
// and the real URL in mensajes.metadata. This component detects the
// placeholder + reads the metadata to render:
//   • images  → inline <img> preview (click to open full-size in a tab)
//   • PDFs / other files → a clickable chip with the file icon + mime.
// Without this the operator sees "[attachment:image/jpeg]" text and has
// no idea what the customer actually sent (Miguel/Steve 2026-07-01).
//
// The component is pure presentation; the "Save as quick reply" form
// stays in the parent page so we can keep it as a server-rendered
// ActionForm next to the bubble.
// ============================================================================

import type { ReactNode } from "react";

type Sender = "cliente" | "ai" | "agente" | "system" | "internal_note";

export type BubbleAttachment = {
  /** Direct URL to the attachment (Respond.io CDN typically). */
  url: string;
  /** MIME type as reported by WhatsApp / Respond.io. */
  mimeType?: string | null;
};

export type BubbleMessage = {
  id: string;
  sender: string;
  content: string;
  createdAt: Date;
  agenteName?: string | null;
  fuentes?: string[];
  /**
   * Normalised list of attachments derived from mensajes.metadata.
   * Empty when the message is pure text.
   */
  attachments?: BubbleAttachment[];
};

/** True when `content` is a server-generated attachment placeholder. */
function isAttachmentPlaceholder(content: string): boolean {
  return /^\[attachment:[^\]]+\](?:\s*x\d+)?$/.test(content.trim());
}

function isImage(mime: string | null | undefined): boolean {
  return typeof mime === "string" && mime.startsWith("image/");
}
function isPdf(mime: string | null | undefined): boolean {
  return typeof mime === "string" && mime === "application/pdf";
}

function fileLabel(mime: string | null | undefined): string {
  if (isImage(mime)) return "Imagen";
  if (isPdf(mime)) return "PDF";
  if (!mime) return "Archivo";
  return mime.split("/")[1]?.toUpperCase() ?? "Archivo";
}

/**
 * Split note text into an alternating sequence of plain-text runs and
 * @-mention spans. A mention token is `@` followed by an email-shaped
 * substring (word chars, dots, dashes, plus, and exactly one @-domain).
 * Keys are index-based because mention text can legitimately repeat.
 * Steve 2026-07-01 — used by the internal-note bubble.
 */
function renderMentionText(text: string) {
  const MENTION_RE =
    /@[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
  const nodes: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = MENTION_RE.exec(text)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(text.slice(lastIdx, match.index));
    }
    nodes.push(
      <span
        key={`m-${key++}`}
        className="rounded bg-brand-500/20 px-1 font-medium text-brand-300"
      >
        {match[0]}
      </span>,
    );
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    nodes.push(text.slice(lastIdx));
  }
  return nodes;
}

export function MessageBubble({
  message,
  contactInitials,
  saveAction,
}: {
  message: BubbleMessage;
  contactInitials: string;
  /** Optional "save as quick reply" affordance — only shown when sender=ai. */
  saveAction?: ReactNode;
}) {
  const sender = message.sender as Sender;
  const isCliente = sender === "cliente";
  const isAi = sender === "ai";
  const isAgente = sender === "agente";
  const isInternal = sender === "internal_note" || sender === "system";

  if (isInternal) {
    // Internal notes are operator-facing context. Rendered as a centered
    // grey strip, but with @-mention tokens highlighted so anyone reading
    // the timeline sees who was tagged. Steve 2026-07-01.
    return (
      <div className="my-2 flex justify-center">
        <div className="max-w-md rounded-md bg-ink-200/40 px-3 py-1.5 text-[11px] text-ink-600">
          <span className="whitespace-pre-wrap">
            {renderMentionText(message.content)}
          </span>
          {message.agenteName ? (
            <span className="ml-2 text-[10px] text-ink-500">
              · {message.agenteName}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  const align = isCliente ? "justify-start" : "justify-end";
  const bubbleStyle = isCliente
    ? "bg-ink-200/80 text-ink-900"
    : isAi
      ? "bg-brand-500 text-white"
      : "bg-emerald-600 text-white";
  const senderLabel = isCliente
    ? "Cliente"
    : isAi
      ? "AI"
      : `Agente${message.agenteName ? ` · ${message.agenteName}` : ""}`;
  const fuentes = message.fuentes ?? [];

  return (
    <div className="space-y-1">
      <div className={`flex items-end gap-2 ${align}`}>
        {isCliente ? (
          <div className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-200/60 text-[10px] font-semibold text-ink-700">
            {contactInitials || "·"}
          </div>
        ) : null}
        <div
          className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${bubbleStyle}`}
        >
          <div
            className={`mb-0.5 flex items-center gap-2 text-[10px] uppercase tracking-wider ${
              isCliente ? "text-ink-500" : "text-white/70"
            }`}
          >
            <span>{senderLabel}</span>
            <span>·</span>
            <span className="lowercase normal-case tabular-nums">
              {formatTime(message.createdAt)}
            </span>
          </div>
          {/* Attachment rendering (Steve 2026-07-01). When the message
              content is a `[attachment:...]` placeholder, we suppress
              the placeholder text and show the actual file(s) instead.
              Free-text messages fall through to the normal rendering.
              Mixed messages (text + attachment) render both. */}
          {message.attachments && message.attachments.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {message.attachments.map((a, i) => (
                <a
                  key={`${a.url}-${i}`}
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block overflow-hidden rounded-lg ring-1 ring-inset ${
                    isCliente
                      ? "ring-ink-300/60 bg-ink-100/40 hover:ring-brand-400/60"
                      : "ring-white/25 bg-white/10 hover:ring-white/50"
                  }`}
                  title={
                    isImage(a.mimeType)
                      ? "Abrir imagen en tamaño real"
                      : isPdf(a.mimeType)
                        ? "Descargar / abrir PDF"
                        : "Descargar archivo"
                  }
                >
                  {isImage(a.mimeType) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.url}
                      alt="Adjunto del cliente"
                      className="max-h-64 w-full max-w-xs object-contain"
                    />
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2 text-xs">
                      <span aria-hidden="true" className="text-lg">
                        {isPdf(a.mimeType) ? "📄" : "📎"}
                      </span>
                      <span
                        className={
                          isCliente ? "text-ink-800" : "text-white/95"
                        }
                      >
                        {fileLabel(a.mimeType)}
                        {a.mimeType ? (
                          <span
                            className={`ml-1 text-[10px] ${
                              isCliente
                                ? "text-ink-500"
                                : "text-white/70"
                            }`}
                          >
                            · {a.mimeType}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  )}
                </a>
              ))}
            </div>
          ) : null}
          {/* Text content. Skipped only when the whole content is a
              placeholder AND we have attachments to render — otherwise
              a customer's plain text still shows normally. */}
          {(message.attachments?.length ?? 0) > 0 &&
          isAttachmentPlaceholder(message.content) ? null : (
            <div className="whitespace-pre-wrap break-words leading-snug">
              {message.content}
            </div>
          )}
          {isAi && fuentes.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {fuentes.map((f) => (
                <span
                  key={f}
                  className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-[10px] text-white/95 ring-1 ring-inset ring-white/25"
                  title="Fuente declarada por la AI"
                >
                  {f}
                </span>
              ))}
            </div>
          ) : null}
          {isAi && fuentes.length === 0 ? (
            <div className="mt-1.5 text-[10px] text-white/60">
              sin fuentes declaradas
            </div>
          ) : null}
          {isAi && saveAction ? (
            <div className="mt-1.5 text-right">{saveAction}</div>
          ) : null}
        </div>
        {isAgente ? (
          <div className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600/20 text-[10px] font-semibold text-emerald-700">
            {(message.agenteName ?? "AG").slice(0, 2).toUpperCase()}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function formatTime(d: Date): string {
  const dt = d instanceof Date ? d : new Date(d);
  // Keep it terse — date is implicit (same conversation, sorted in order).
  // Show full date only when it differs from "today".
  const now = new Date();
  const sameDay =
    dt.getFullYear() === now.getFullYear() &&
    dt.getMonth() === now.getMonth() &&
    dt.getDate() === now.getDate();
  if (sameDay) {
    return dt.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return dt.toLocaleString("es-ES", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
