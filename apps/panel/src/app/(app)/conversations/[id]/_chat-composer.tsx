"use client";

// ============================================================================
// Conversation chat composer (Miguel 2026-06-12 resilience #2, exposed
// 2026-06-30; Steve 2026-07-01 — added internal-note-to-AI second action).
//
// Two side-by-side actions share one textarea:
//
//   1. "Instruir a la AI"  → sendInternalNoteToAi
//        Writes to lead_metadata.pending_internal_notes + fires an
//        immediate reroll. NEVER touches WhatsApp; AI keeps handling
//        the conversation. Use when you want to *guide* the AI on the
//        next turn ("ojo, ya pagaron por Wise el 22", "es amigo de
//        Miguel, dale 10% de descuento", "responde en italiano").
//
//   2. "Enviar mensaje"    → sendOperatorMessage
//        Goes to WhatsApp directly + flips human_took_over=true.
//        Use when you want to answer AS the human (AI silenced).
//
// Enter still submits the WhatsApp form (primary action). To send an
// internal note, click "Instruir a la AI" explicitly — a note that
// silently escapes to the customer would be a bad accident.
//
// AUTO-REFRESH (Steve 2026-07-01, after Joaco/KT test):
// After an internal note is queued the server rerolls the AI, which
// takes 10-25 s in production. Panel's normal `router.refresh()` at
// action-completion time is too early — the AI hasn't answered yet.
// We start a 30 s polling window that refreshes every 3 s so the AI's
// reply lands on screen the moment it commits, without the operator
// having to hit F5.
// ============================================================================

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";

import { ActionForm } from "~/app/_components/action-form";
import { SubmitButton } from "~/app/_components/submit-button";
import { sendOperatorMessage } from "~/app/actions/inbox";
import { sendInternalNoteToAi } from "~/app/actions/internal-note";

const MAX_LENGTH = 4096;
const WARN_LENGTH = 3800; // start nagging before the hard wall
const MAX_NOTE_LENGTH = 2000; // matches the server-side limit

/** Total polling window (ms) after an internal note is queued. */
const POLL_WINDOW_MS = 30_000;
/** Interval between router.refresh() calls during the polling window. */
const POLL_INTERVAL_MS = 3_000;

type ChatComposerProps = {
  conversacionId: string;
  /**
   * Whether the AI is currently silenced (`human_took_over === true`).
   * Drives the helper text under the textarea — purely cosmetic;
   * sending to WhatsApp always silences the AI regardless of starting
   * state; sending an internal note NEVER silences it.
   */
  humanAttending: boolean;
};

export function ChatComposer({
  conversacionId,
  humanAttending,
}: ChatComposerProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const whatsappFormRef = useRef<HTMLFormElement | null>(null);
  const length = text.length;
  const router = useRouter();

  // ── Auto-refresh polling after internal note ─────────────────────────
  // `pollingUntil` is the timestamp (ms since epoch) after which we stop
  // refreshing. null = idle. Set when a note lands successfully; the
  // effect below polls until we cross that deadline.
  const [pollingUntil, setPollingUntil] = useState<number | null>(null);

  useEffect(() => {
    if (pollingUntil === null) return;
    const interval = setInterval(() => {
      if (Date.now() >= pollingUntil) {
        setPollingUntil(null);
        return;
      }
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [pollingUntil, router]);

  const startPollingForAiReply = () => {
    setPollingUntil(Date.now() + POLL_WINDOW_MS);
  };

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter alone = send to WhatsApp. Shift+Enter / Ctrl+Enter = newline.
    // Internal notes are click-only — the operator has to explicitly
    // pick the "Instruir a la AI" button to route to the note flow.
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      event.preventDefault();
      if (whatsappFormRef.current && text.trim().length > 0) {
        whatsappFormRef.current.requestSubmit();
      }
    }
  }

  const isOverWaLimit = length > MAX_LENGTH;
  const isOverNoteLimit = length > MAX_NOTE_LENGTH;
  const isEmpty = text.trim().length === 0;
  const counterTone = isOverWaLimit
    ? "text-bad-700 font-semibold"
    : length >= WARN_LENGTH
      ? "text-warn-700"
      : "text-ink-500";

  const clearText = () => setText("");
  const pollingActive = pollingUntil !== null && Date.now() < pollingUntil;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <textarea
          ref={textareaRef}
          id="composer-textarea"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            humanAttending
              ? "Enviar mensaje → respuesta al cliente · Instruir a la AI → nota interna. Enter envía; Shift+Enter para nueva línea."
              : "Escribí acá. Enviar mensaje toma la conversación (AI silenciada). Instruir a la AI es una nota interna — no llega al cliente y la AI responde el próximo turno."
          }
          className="w-full resize-y rounded-lg border border-ink-300/70 bg-ink-100/70 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-500 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
        />
      </div>

      {/* AI-is-thinking hint — Steve 2026-07-01. Fires immediately after
          "Instruir a la AI" succeeds so the operator understands the AI
          takes ~10-25 s to answer and the panel is auto-refreshing to
          catch the reply. Auto-dismisses when polling window ends. */}
      {pollingActive ? (
        <div className="flex items-center gap-2 rounded-md border border-brand-400/30 bg-brand-500/10 px-3 py-1.5 text-[11px] text-brand-300">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="h-3.5 w-3.5 animate-spin"
            aria-hidden="true"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
              className="opacity-25"
            />
            <path
              d="M4 12a8 8 0 018-8"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <span>
            AI está respondiendo (10–25 s). La conversación se refresca sola
            cuando llegue el mensaje.
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] text-ink-500">
          <span className={counterTone}>
            {length} / {MAX_LENGTH}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {humanAttending ? (
              <span className="text-warn-700">
                Humano atendiendo · AI silenciada
              </span>
            ) : (
              <span className="text-brand-300">AI activa</span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Internal note — writes to pending_internal_notes + immediate
              reroll. Sits BEFORE the WhatsApp button so the visual
              "primary" action stays on the right, but the safer/silent
              action is one click away. Success message + auto-refresh
              polling both fire together on completion. */}
          <ActionForm
            action={sendInternalNoteToAi}
            className="inline-flex"
            successMessage="Nota enviada · AI respondiendo (10–25s)"
            onSuccess={() => {
              clearText();
              startPollingForAiReply();
            }}
          >
            <input type="hidden" name="conversacionId" value={conversacionId} />
            <input type="hidden" name="text" value={text} />
            <SubmitButton
              variant="warn"
              loadingLabel="Enviando nota…"
              disabled={isEmpty || isOverNoteLimit}
            >
              Instruir a la AI
            </SubmitButton>
          </ActionForm>

          {/* Primary: send message directly to the customer. */}
          <ActionForm
            action={sendOperatorMessage}
            className="inline-flex"
            successMessage="Mensaje enviado al cliente"
            onSuccess={clearText}
          >
            <input
              type="hidden"
              name="conversacionId"
              value={conversacionId}
            />
            <input type="hidden" name="text" value={text} />
            <SubmitButton
              variant="primary"
              loadingLabel="Enviando…"
              disabled={isEmpty || isOverWaLimit}
            >
              Enviar mensaje
            </SubmitButton>
            {/* Sentinel input that lets us grab the actual <form>
                for Enter-to-send. ActionForm doesn't expose a ref
                prop, so we walk from a child DOM node to el.form. */}
            <input
              type="hidden"
              ref={(el) => {
                whatsappFormRef.current = el?.form ?? null;
              }}
            />
          </ActionForm>
        </div>
      </div>
    </div>
  );
}
