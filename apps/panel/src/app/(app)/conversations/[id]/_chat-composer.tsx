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
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";

import { ActionForm } from "~/app/_components/action-form";
import { SubmitButton } from "~/app/_components/submit-button";
import { sendOperatorMessage } from "~/app/actions/inbox";
import { sendInternalNoteToAi } from "~/app/actions/internal-note";
import type { MentionUser } from "~/app/actions/mentions";

import { MentionPicker } from "./_mention-picker";

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
  /** Panel users available for @-mention autocomplete on internal notes. */
  mentionableUsers: MentionUser[];
};

export function ChatComposer({
  conversacionId,
  humanAttending,
  mentionableUsers,
}: ChatComposerProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const whatsappFormRef = useRef<HTMLFormElement | null>(null);
  const length = text.length;
  const router = useRouter();

  // ── @-mention autocomplete state ─────────────────────────────────────
  // `mentionQuery` is the substring after "@" the operator is typing;
  // null means the picker is closed. `mentionAnchor` records the offset
  // of the "@" in the textarea so we can splice the picked email back in.
  // `mentionedUserIds` accumulates picked users for the server action.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const mentionAnchorRef = useRef<number | null>(null);
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);

  const updateMentionState = useCallback((value: string, caret: number) => {
    // Walk backward from the caret until we hit either whitespace/newline
    // or an "@". If we hit "@" first, we're in a mention-in-progress.
    let i = caret - 1;
    while (i >= 0) {
      const ch = value[i];
      if (ch === "@") {
        const query = value.slice(i + 1, caret);
        // A mention shouldn't span whitespace — if the substring has
        // any, the operator moved past the mention.
        if (/\s/.test(query)) {
          setMentionQuery(null);
          mentionAnchorRef.current = null;
          return;
        }
        mentionAnchorRef.current = i;
        setMentionQuery(query);
        return;
      }
      if (ch === undefined || /\s/.test(ch)) break;
      i--;
    }
    setMentionQuery(null);
    mentionAnchorRef.current = null;
  }, []);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);
    updateMentionState(value, e.target.selectionStart ?? value.length);
  };

  const handleSelectionChange = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    updateMentionState(ta.value, ta.selectionStart ?? ta.value.length);
  };

  const insertMention = useCallback(
    (user: MentionUser) => {
      const anchor = mentionAnchorRef.current;
      const ta = textareaRef.current;
      if (anchor === null || !ta) return;
      const before = text.slice(0, anchor);
      const after = text.slice(ta.selectionStart ?? text.length);
      const inserted = `@${user.email} `;
      const nextText = `${before}${inserted}${after}`;
      setText(nextText);
      setMentionedUserIds((prev) =>
        prev.includes(user.id) ? prev : [...prev, user.id],
      );
      setMentionQuery(null);
      mentionAnchorRef.current = null;
      // Move caret to just after the inserted mention on next tick.
      requestAnimationFrame(() => {
        const t = textareaRef.current;
        if (!t) return;
        const pos = before.length + inserted.length;
        t.focus();
        t.setSelectionRange(pos, pos);
      });
    },
    [text],
  );

  // Rebuild the list of ACTUAL mentions that survive in the text — if the
  // operator deleted "@email" after picking, we drop that userId. The
  // server-authoritative list uses the intersection of "picked" and
  // "email appears in text".
  const activeMentionedIds = useMemo(() => {
    if (mentionedUserIds.length === 0) return [] as string[];
    return mentionedUserIds.filter((id) => {
      const user = mentionableUsers.find((u) => u.id === id);
      if (!user) return false;
      return text.includes(`@${user.email}`);
    });
  }, [mentionedUserIds, mentionableUsers, text]);

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
    // While the mention picker is open, DON'T send — Enter picks a
    // user from the popover (handled inside MentionPicker). Same
    // rule for Tab / Arrow keys.
    if (mentionQuery !== null) return;
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
          onChange={handleTextChange}
          onKeyUp={handleSelectionChange}
          onClick={handleSelectionChange}
          onKeyDown={handleKeyDown}
          placeholder={
            humanAttending
              ? "Enviar mensaje → respuesta al cliente · Instruir a la AI → nota interna. Escribí @ para mencionar usuario. Enter envía; Shift+Enter para nueva línea."
              : "Escribí acá. Enviar mensaje toma la conversación (AI silenciada). Instruir a la AI es una nota interna — escribí @ para mencionar a otro usuario."
          }
          className="w-full resize-y rounded-lg border border-ink-300/70 bg-ink-100/70 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-500 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
        />
        {/* Mention picker overlays above the textarea when in mention mode. */}
        {mentionQuery !== null ? (
          <MentionPicker
            query={mentionQuery}
            users={mentionableUsers}
            onPick={insertMention}
            onDismiss={() => {
              setMentionQuery(null);
              mentionAnchorRef.current = null;
            }}
          />
        ) : null}
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
              setMentionedUserIds([]);
              startPollingForAiReply();
            }}
          >
            <input type="hidden" name="conversacionId" value={conversacionId} />
            <input type="hidden" name="text" value={text} />
            <input
              type="hidden"
              name="mentionedUserIds"
              value={activeMentionedIds.join(",")}
            />
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
