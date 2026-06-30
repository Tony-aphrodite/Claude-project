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
// The component is pure presentation; the "Save as quick reply" form
// stays in the parent page so we can keep it as a server-rendered
// ActionForm next to the bubble.
// ============================================================================

import type { ReactNode } from "react";

type Sender = "cliente" | "ai" | "agente" | "system" | "internal_note";

export type BubbleMessage = {
  id: string;
  sender: string;
  content: string;
  createdAt: Date;
  agenteName?: string | null;
  fuentes?: string[];
};

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
    // Internal notes are admin-only context, render as centered grey strip.
    return (
      <div className="my-2 flex justify-center">
        <div className="max-w-md rounded-md bg-ink-200/40 px-3 py-1.5 text-[11px] text-ink-500">
          {message.content}
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
          <div className="whitespace-pre-wrap break-words leading-snug">
            {message.content}
          </div>
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
