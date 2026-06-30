"use client";

// ============================================================================
// Conversation chat composer (Miguel 2026-06-12 resilience #2, exposed
// 2026-06-30). Client component because we need:
//
//   - controlled textarea (live character counter)
//   - Enter-to-send keyboard shortcut (Shift+Enter for newline)
//   - explicit reset after a successful send
//
// All of those rely on local state that <ActionForm> (server-rendered
// wrapper) doesn't expose. We still use ActionForm internally for the
// error banner + auto-refresh + loading state.
// ============================================================================

import { useRef, useState, type KeyboardEvent } from "react";

import { ActionForm } from "~/app/_components/action-form";
import { SubmitButton } from "~/app/_components/submit-button";
import { sendOperatorMessage } from "~/app/actions/inbox";

const MAX_LENGTH = 4096;
const WARN_LENGTH = 3800; // start nagging before the hard wall

type ChatComposerProps = {
  conversacionId: string;
  /**
   * Whether the AI is currently silenced (`human_took_over === true`).
   * Drives the helper text under the textarea — purely cosmetic;
   * sending always silences the AI regardless of starting state.
   */
  humanAttending: boolean;
};

export function ChatComposer({
  conversacionId,
  humanAttending,
}: ChatComposerProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const length = text.length;

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter alone = send. Shift+Enter / Ctrl+Enter = newline.
    if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      // Submit the closest form. We use requestSubmit so React's
      // synthetic event hooks (used by ActionForm) fire correctly.
      const form = textareaRef.current?.form;
      if (form && text.trim().length > 0) {
        form.requestSubmit();
      }
    }
  }

  const isOverLimit = length > MAX_LENGTH;
  const isEmpty = text.trim().length === 0;
  const counterTone =
    isOverLimit
      ? "text-bad-700 font-semibold"
      : length >= WARN_LENGTH
        ? "text-warn-700"
        : "text-ink-500";

  return (
    <ActionForm
      action={sendOperatorMessage}
      className="flex flex-col gap-2"
      successMessage="Mensaje enviado al cliente"
    >
      <input type="hidden" name="conversacionId" value={conversacionId} />

      <div className="relative">
        <textarea
          ref={textareaRef}
          name="text"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            humanAttending
              ? "Escribí tu respuesta al cliente. Enter envía; Shift+Enter para nueva línea."
              : "Tomar la conversación: al enviar, la AI deja de responder hasta que liberes."
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
              <span className="text-warn-700">Humano atendiendo · AI silenciada</span>
            ) : (
              <span className="text-brand-300">AI activa · enviar tomará la conversación</span>
            )}
          </span>
        </div>
        <SubmitButton
          variant="primary"
          loadingLabel="Enviando…"
          disabled={isEmpty || isOverLimit}
        >
          Enviar a WhatsApp
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
