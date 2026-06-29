// ============================================================================
// Internal-note → AI context handler (Miguel 2026-06-29 M1).
//
// Operator drops an internal note in Respond.io and @-mentions the sede's
// AI user (Francisco / Colomba / John / Emma / David). Respond.io fires a
// `comment.created` webhook to `/webhook/respond-io/internal-note/<slug>`;
// this module decides whether the note is for the AI and, if so, queues it
// for the next AI turn.
//
// Behaviour (locked-in decisions 2026-06-29, see memory + chat history):
//   #1 URL path:    per-sede (5 endpoints, one per sede slug). Toggling
//                   one sede's webhook off in Respond.io silences notes
//                   for that sede without touching the others.
//   #2 Trigger:     @-mention of the sede AI user (mentionedUserIds[]).
//                   Notes without the mention stay human-only — they are
//                   logged in mensajes (audit) but NOT queued for the AI.
//   #3 Injection:   one-shot — the note rides the NEXT AI turn's prompt,
//                   then is removed from the queue. Miguel's rationale:
//                   "cada mensaje es diferente" (each is situational).
//                   Standing facts belong in Custom Fields, not here.
//   #4 Audit:       mensajes table with sender="internal_note", content=
//                   text, metadata={mentioned_ai_id, by, source}. Stored
//                   regardless of whether the AI consumed the note — gives
//                   Miguel the full operator-action trail.
//
// What this handler does NOT do:
//   - It does NOT trigger the AI immediately. The note sits in the queue
//     until the customer's next inbound message (or a manual trigger we
//     might add later). Option C (fire-now) was rejected — too risky.
//   - It does NOT understand the note semantically. The note text goes
//     into the system prompt verbatim; interpretation is the AI's job.
// ============================================================================

import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { eq } from "drizzle-orm";

import type { LeadMetadata } from "@dpm/shared";
import { conversaciones, getDb, mensajes } from "@dpm/db";

import type { AiEnabledSedeName } from "../services/sede.js";

// Same map used by contact-state-event.ts. Keep in sync — adding a sede
// here without updating that file (or vice versa) silently breaks the
// mention detection for that sede.
const SEDE_AI_ASSIGNEE_ID: Readonly<Record<AiEnabledSedeName, number>> = {
  "Koh Phi Phi": 440519,
  "Gili Air": 441308,
  "Gili Trawangan": 462203,
  "Koh Tao": 464075,
  "Nusa Penida": 973488,
};

export type InternalNoteResult =
  | {
      ok: true;
      action: "queued";
      conversationId: string;
      noteId: string;
      mentionedAiId: number;
    }
  | {
      ok: true;
      action: "logged_only";
      reason: "no_ai_mention" | "wrong_event_type" | "empty_text";
      conversationId?: string;
    }
  | {
      ok: false;
      reason:
        | "missing_contact_id"
        | "missing_text"
        | "conversation_not_found"
        | "sede_not_enabled";
    };

type IncomingPayload = {
  event_type?: string;
  event?: string;
  comment?: { text?: string };
  text?: string;
  data?: { text?: string };
  contact?: { id?: string | number };
  mentionedUserIds?: Array<string | number>;
  mentionedUserEmails?: Array<string>;
  commentAuthor?: { name?: string; email?: string };
  assignee?: { name?: string } | number | string | null;
  [key: string]: unknown;
};

function readString(obj: unknown, key: string): string | null {
  if (obj == null || typeof obj !== "object") return null;
  const value = (obj as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function readAuthorName(payload: IncomingPayload): string | null {
  // Respond.io's comment.created payload shape isn't fully documented;
  // accept a few likely fields without crashing if any are absent.
  const direct =
    payload.commentAuthor?.name ??
    (typeof payload.assignee === "object" && payload.assignee !== null
      ? (payload.assignee as { name?: string }).name
      : null) ??
    null;
  if (direct) return direct;
  // Some Respond.io tenants surface the author as a top-level "author"
  // object; check it loosely.
  const author = (payload as { author?: { name?: string } }).author;
  return author?.name ?? null;
}

/**
 * Parse a Respond.io `comment.created` payload and, if the sede's AI user
 * was @-mentioned, append a one-shot note to the conversation's queue.
 * Always writes an audit row in `mensajes` (sender="internal_note") —
 * mentioned or not — so the operator-action trail is complete.
 */
export async function handleInternalNoteWebhook(
  payload: IncomingPayload,
  sedeName: AiEnabledSedeName,
  log: FastifyBaseLogger,
): Promise<InternalNoteResult> {
  const aiAssigneeId = SEDE_AI_ASSIGNEE_ID[sedeName];
  if (!aiAssigneeId) {
    return { ok: false, reason: "sede_not_enabled" };
  }

  const event = payload.event_type ?? payload.event ?? "";
  if (event !== "comment.created") {
    log.info({ sedeName, event }, "internal-note: wrong event type — logged_only");
    return { ok: true, action: "logged_only", reason: "wrong_event_type" };
  }

  const contactId = payload.contact?.id;
  if (contactId === undefined || contactId === null || contactId === "") {
    log.warn({ sedeName, event }, "internal-note: missing contact.id");
    return { ok: false, reason: "missing_contact_id" };
  }

  const text =
    readString(payload.comment, "text") ??
    readString(payload, "text") ??
    readString(payload.data, "text");
  if (!text || text.trim().length === 0) {
    log.info(
      { sedeName, contactId },
      "internal-note: empty text — logged_only",
    );
    return { ok: true, action: "logged_only", reason: "empty_text" };
  }

  // Find the conversation. Per-sede webhook already enforced Branch match
  // on the URL; we look up by respond_io_contact_id and trust the URL slug
  // to keep us inside the right sede.
  const db = getDb();
  const [conv] = await db
    .select({
      id: conversaciones.id,
      leadMetadata: conversaciones.leadMetadata,
      sedeId: conversaciones.sedeId,
    })
    .from(conversaciones)
    .where(eq(conversaciones.respondIoContactId, String(contactId)))
    .limit(1);
  if (!conv) {
    log.warn(
      { sedeName, contactId },
      "internal-note: no conversation for contact — note dropped",
    );
    return { ok: false, reason: "conversation_not_found" };
  }

  const mentioned = Array.isArray(payload.mentionedUserIds)
    ? payload.mentionedUserIds.some(
        (id) => String(id) === String(aiAssigneeId),
      )
    : false;

  const authorName = readAuthorName(payload);

  // Audit row — always written. The AI never re-reads this row; it's purely
  // for operator-side debugging ("who wrote what when") and panel display.
  await db.insert(mensajes).values({
    conversacionId: conv.id,
    sender: "internal_note",
    agenteName: authorName,
    content: text,
    metadata: {
      source: "respond_io_comment",
      sede: sedeName,
      mentioned_ai_id: mentioned ? aiAssigneeId : null,
      // Preserve the raw mention list so future tooling can surface
      // "this note was for human X" without re-parsing the webhook.
      mentioned_user_ids: payload.mentionedUserIds ?? [],
      respond_io_contact_id: String(contactId),
    },
  });

  if (!mentioned) {
    log.info(
      {
        sedeName,
        contactId,
        conversationId: conv.id,
        textLen: text.length,
        mentionedUserIdsCount: payload.mentionedUserIds?.length ?? 0,
      },
      "internal-note: AI not @-mentioned — audit row written, queue skipped",
    );
    return {
      ok: true,
      action: "logged_only",
      reason: "no_ai_mention",
      conversationId: conv.id,
    };
  }

  // Queue the note for the next AI turn. lead_metadata.pending_internal_notes
  // is jsonb; we read-modify-write under withConversationLock (the per-conv
  // lock is held by message processing too, so a note arriving DURING an AI
  // generation will land AFTER the consume — see process-message for the
  // capture-then-remove flow that prevents double-consume).
  const noteId = generateUuid();
  const oldMeta = (conv.leadMetadata as LeadMetadata | null) ?? {};
  const oldNotes = oldMeta.pending_internal_notes ?? [];
  const newMeta: LeadMetadata = {
    ...oldMeta,
    pending_internal_notes: [
      ...oldNotes,
      {
        id: noteId,
        text,
        by: authorName,
        at: new Date().toISOString(),
        mentioned_ai_id: aiAssigneeId,
      },
    ],
  };
  await db
    .update(conversaciones)
    .set({ leadMetadata: newMeta })
    .where(eq(conversaciones.id, conv.id));

  log.info(
    {
      sedeName,
      contactId,
      conversationId: conv.id,
      noteId,
      mentionedAiId: aiAssigneeId,
      textLen: text.length,
      queueDepth: newMeta.pending_internal_notes?.length ?? 0,
    },
    "internal-note: queued for next AI turn",
  );

  return {
    ok: true,
    action: "queued",
    conversationId: conv.id,
    noteId,
    mentionedAiId: aiAssigneeId,
  };
}

function generateUuid(): string {
  return randomUUID();
}
