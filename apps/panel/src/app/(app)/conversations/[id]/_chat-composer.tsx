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
//   2. "Enviar a WhatsApp" → sendOperatorMessage
//        Goes to WhatsApp directly + flips human_took_over=true.
//        Use when you want to answer AS the human (AI silenced).
//
// Enter still submits the WhatsApp form (primary action). To send an
// internal note, click "Instruir a la AI" explicitly — a note that
// silently escapes to the customer would be a bad accident.
// ============================================================================

import { useRef, useState, type KeyboardEvent } from "react";

import { ActionForm } from "~/app/_components/action-form";
import { SubmitButton } from "~/app/_components/submit-button";
import { sendOperatorMessage } from "~/app/actions/inbox";
import { sendInternalNoteToAi } from "~/app/actions/internal-note";

const MAX_LENGTH = 4096;
const WARN_LENGTH = 3800; // start nagging before the hard wall
const MAX_NOTE_LENGTH = 2000; // matches the server-side limit

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
              action is one click away. */}
          <ActionForm
            action={sendInternalNoteToAi}
            className="inline-flex"
            successMessage="Nota enviada a la AI"
            onSuccess={clearText}
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

          {/* Primary: WhatsApp. */}
          <ActionForm
            action={sendOperatorMessage}
            className="inline-flex"
            successMessage="Mensaje enviado al cliente"
            onSuccess={clearText}
          >
            {/* We attach the ref to the underlying <form> via
                a mount-time query — ActionForm doesn't expose a
                ref prop, but its rendered <form> is the direct
                child of this ActionForm wrapper's fragment. */}
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
                for Enter-to-send. document.getElementById is fine
                here because the ref would need ActionForm changes. */}
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
