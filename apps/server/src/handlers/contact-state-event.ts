// ============================================================================
// Bidirectional sync — handles Respond.io webhooks that signal operator-
// side state changes (lifecycle moved, tag added/removed, assignee
// changed). Without this, every conversation that reaches handed_off is
// stuck silenced from the AI side: even if the operator clears
// `deposit_paid` and moves lifecycle back to "New Lead" in the Respond.io
// UI, our server still has `lead_stage = handed_off` and the
// POST_HANDOFF_STAGES guard refuses to engage. Miguel hit this on
// 2026-05-12 (5-12-feedback.md §1).
//
// Activation: Miguel must enable the matching event types in Respond.io
// workspace settings → "Webhook events". If those aren't enabled the
// events never reach us and this handler stays dormant.
// ============================================================================

import type { FastifyBaseLogger } from "fastify";

import { eq } from "drizzle-orm";

import { conversaciones, getDb } from "@dpm/db";
import type { LeadMetadata } from "@dpm/shared";

import { loadEnv } from "../env.js";
import { leadStageService } from "../services/lead-stage.js";

type IncomingPayload = {
  contact?: { id?: string | number };
  data?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  [k: string]: unknown;
};

export type ContactStateResult =
  | { ok: true; action: "no_conversation" }
  | { ok: true; action: "lifecycle_reset"; from: string; to: string }
  | { ok: true; action: "tag_event_ignored"; reason: string }
  | { ok: true; action: "human_takeover"; assignee: string }
  | { ok: true; action: "human_released"; clearedFlag: boolean }
  | { ok: true; action: "noop"; reason: string };

/**
 * Map Respond.io lifecycle labels to the lead_stage rollback we want.
 * "Customer" / "Engaging" / "Following Up" don't trigger anything — those
 * are normal forward states. Only "New Lead" (operator reset) and
 * "Lost Lead" (operator gave up) drive a rollback / terminal move.
 */
const LIFECYCLE_ROLLBACK: Record<string, "new" | "lost"> = {
  "new lead": "new",
  "lost lead": "lost",
};

export async function handleContactStateEvent(
  payload: IncomingPayload,
  event: string,
  log: FastifyBaseLogger,
): Promise<ContactStateResult> {
  const contactId =
    payload.contact?.id !== undefined ? String(payload.contact.id) : null;
  if (!contactId) {
    log.warn({ event }, "contact-state event without contactId — ignored");
    return { ok: true, action: "noop", reason: "no_contact_id" };
  }

  // Find the conversation row. If we don't have one yet for this
  // contact, this event predates any AI interaction — nothing to sync.
  const db = getDb();
  const [conv] = await db
    .select()
    .from(conversaciones)
    .where(eq(conversaciones.respondIoContactId, contactId))
    .limit(1);
  if (!conv) {
    log.info(
      { event, contactId },
      "contact-state event: no conversation in DB yet — noop",
    );
    return { ok: true, action: "no_conversation" };
  }

  // Lifecycle change is the strongest signal. Respond.io v2's confirmed
  // payload shape (verified against live webhook logs 2026-05-12 evening):
  //   {
  //     "event_type": "contact.lifecycle.updated",
  //     "lifecycle": "Payment",          ← top-level: the NEW lifecycle
  //     "oldLifecycle": "In process",    ← previous value (informational)
  //     "action": "update",
  //     "contact": { ..., "lifecycle": "Payment" }
  //   }
  // We read the new lifecycle from the top-level field, falling back to
  // data/payload wrappers for older shapes that other v2 tenants may use.
  if (event.startsWith("contact.lifecycle.")) {
    const lifecycle =
      readString(payload, "lifecycle") ??
      readString(payload.data, "lifecycle") ??
      readString(payload.payload, "lifecycle");
    const oldLifecycle =
      readString(payload, "oldLifecycle") ??
      readString(payload.data, "oldLifecycle") ??
      readString(payload.payload, "oldLifecycle");
    log.info(
      { event, contactId, lifecycle, oldLifecycle },
      "lifecycle event parsed",
    );
    if (!lifecycle) {
      log.warn(
        { event, contactId },
        "lifecycle event without lifecycle string — noop",
      );
      return { ok: true, action: "noop", reason: "no_lifecycle_value" };
    }
    const target = LIFECYCLE_ROLLBACK[lifecycle.toLowerCase()];
    if (!target) {
      // Forward lifecycle changes (In process, Payment, Customer) are
      // already driven by our own state machine — ignore the echo.
      return { ok: true, action: "noop", reason: `lifecycle_forward:${lifecycle}` };
    }
    // Reset is a force-transition: it bypasses the strict transition
    // edges (e.g. handed_off → new isn't on the normal forward path).
    const result = await leadStageService.forceTransition({
      conversacionId: conv.id,
      to: target,
      by: "human",
      note: `respond_io_lifecycle_${lifecycle.toLowerCase().replace(/\s+/g, "_")}`,
    });
    if (!result.ok) {
      log.warn(
        { event, contactId, reason: result.reason },
        "lifecycle reset failed",
      );
      return { ok: true, action: "noop", reason: `reset_failed:${result.reason}` };
    }
    log.info(
      { event, contactId, from: result.from, to: result.to, lifecycle },
      "lifecycle event drove server lead_stage rollback",
    );
    return {
      ok: true,
      action: "lifecycle_reset",
      from: result.from ?? "?",
      to: result.to,
    };
  }

  // Tag events: today we only care about `deposit_paid` being REMOVED —
  // it means the operator wants to undo the deposit confirmation. We
  // drop the stage back to `proposed` so the AI can re-engage the
  // deposit conversation without the operator having to fiddle with
  // lifecycle. Tag ADD events are ignored by default (operators apply
  // many filtering tags, only a few drive state).
  //
  // Confirmed payload shape (verified against live webhook logs
  // 2026-05-12 evening):
  //   {
  //     "event_type": "contact.tag.updated",
  //     "tag": "deposit_paid",
  //     "action": "add" | "remove",     ← exact values, no "-ed" suffix
  //     "contact": { ... }
  //   }
  // Older code expected "added"/"removed" — this was the silent bug that
  // made REMOVE-tag tests appear to land but not trigger the rollback.
  // We still accept legacy `data.*` / `payload.*` wrappers for v2
  // tenants that haven't moved to the flat shape, and accept the
  // "-ed" variants in case Respond.io introduces a workspace setting
  // that toggles between the two.
  if (
    event === "contact.tag.removed" ||
    event === "contact.tag.added" ||
    event === "contact.tag.updated"
  ) {
    const tag =
      readString(payload, "tag") ??
      readString(payload.data, "tag") ??
      readString(payload.payload, "tag");

    // Resolve add vs remove. Explicit event name wins; otherwise read
    // from the top-level `action` field, then legacy wrappers/aliases.
    const rawAction =
      event === "contact.tag.removed"
        ? "remove"
        : event === "contact.tag.added"
          ? "add"
          : readString(payload, "action") ??
            readString(payload.data, "action") ??
            readString(payload.payload, "action") ??
            readString(payload, "change") ??
            readString(payload.data, "change") ??
            readString(payload.payload, "change") ??
            null;

    // Normalize to "add" | "remove" — accept either "add" or "added",
    // either "remove" or "removed", so a future Respond.io shape change
    // can't silently break us again.
    const action: "add" | "remove" | null = rawAction
      ? rawAction === "remove" || rawAction === "removed"
        ? "remove"
        : rawAction === "add" || rawAction === "added"
          ? "add"
          : null
      : null;

    log.info(
      { event, contactId, tag, action, rawAction },
      "tag event parsed",
    );

    if (
      action === "remove" &&
      tag === "deposit_paid" &&
      conv.leadStage !== "proposed"
    ) {
      const result = await leadStageService.forceTransition({
        conversacionId: conv.id,
        to: "proposed",
        by: "human",
        note: "respond_io_deposit_paid_tag_removed",
      });
      log.info(
        {
          contactId,
          from: result.ok ? result.from : null,
          success: result.ok,
        },
        "deposit_paid removal drove server rollback to proposed",
      );
      return { ok: true, action: "tag_event_ignored", reason: `remove:${tag}` };
    }
    return {
      ok: true,
      action: "tag_event_ignored",
      reason: `${action ?? "unknown_action"}:${tag ?? "unknown_tag"}`,
    };
  }

  // ────────────────────────────────────────────────────────────────────────
  // Conversation assignee changed — Miguel rule (2026-06-05):
  //   "si un agente humano hace take over, no volver a interferir"
  //
  // When a human operator clicks "Assign to me" (or reassigns to a
  // teammate) in the Respond.io panel, Respond.io fires
  // `conversation.assignee.changed` with the new assignee userId. We:
  //   1. Detect non-AI assignee  → mark `human_took_over` in leadMetadata
  //      AND force-transition to handed_off so the existing silence guard
  //      in process-message.ts trips. The flag is what makes the silence
  //      DEFINITIVE (bypasses the new-topic re-engagement heuristic).
  //   2. Detect null/AI assignee → operator handed it back. Clear the flag
  //      but DO NOT auto-reset lead_stage — the operator should drive
  //      stage transitions via lifecycle to be explicit. (Aborting a
  //      take-over by re-assigning to AI is the rare case anyway.)
  //
  // Payload shape (Respond.io v2):
  //   { event_type: "conversation.assignee.changed",
  //     assignee: <number | null>,    ← new assignee userId (NULL = unassigned)
  //     oldAssignee: <number | null>, ← previous (informational)
  //     contact: { id: ... } }
  // We also accept legacy data/payload wrappers + nested `userId` keys.
  // ────────────────────────────────────────────────────────────────────────
  if (event.startsWith("conversation.assignee.")) {
    const newAssignee = readNumberOrNull(
      payload.assignee ??
        (payload.data as Record<string, unknown> | undefined)?.assignee ??
        (payload.payload as Record<string, unknown> | undefined)?.assignee,
    );

    const aiAssigneeId = loadEnv().RESPOND_IO_AI_ASSIGNEE_ID;
    const isHuman = newAssignee !== null && newAssignee !== aiAssigneeId;

    log.info(
      { event, contactId, newAssignee, aiAssigneeId, isHuman },
      "assignee event parsed",
    );

    const oldMeta = (conv.leadMetadata as LeadMetadata | null) ?? {};
    if (isHuman) {
      const result = await leadStageService.forceTransition({
        conversacionId: conv.id,
        to: "handed_off",
        by: "human",
        note: `respond_io_human_takeover:${newAssignee}`,
        metadataPatch: {
          human_took_over: true,
          human_took_over_at: new Date().toISOString(),
          human_took_over_by: String(newAssignee),
        },
      });
      if (!result.ok) {
        // Stage transition may fail when conv is already in handed_off or a
        // terminal state. The metadata patch is the load-bearing part —
        // write it directly so the silence flag is set regardless.
        await db
          .update(conversaciones)
          .set({
            leadMetadata: {
              ...oldMeta,
              human_took_over: true,
              human_took_over_at: new Date().toISOString(),
              human_took_over_by: String(newAssignee),
            },
            updatedAt: new Date(),
          })
          .where(eq(conversaciones.id, conv.id));
        log.info(
          { contactId, transitionReason: result.reason },
          "human takeover: stage transition skipped, flag set directly",
        );
      }
      return { ok: true, action: "human_takeover", assignee: String(newAssignee) };
    }

    // Assignee is null or the AI bot → human gave it back (or never had it).
    // Clear the flag if it was set; leave lead_stage alone.
    if (oldMeta.human_took_over) {
      const { human_took_over, human_took_over_at, human_took_over_by, ...rest } =
        oldMeta;
      await db
        .update(conversaciones)
        .set({ leadMetadata: rest as LeadMetadata, updatedAt: new Date() })
        .where(eq(conversaciones.id, conv.id));
      log.info(
        { contactId, newAssignee },
        "human released conversation back to AI/null — flag cleared",
      );
      return { ok: true, action: "human_released", clearedFlag: true };
    }
    return { ok: true, action: "human_released", clearedFlag: false };
  }

  return { ok: true, action: "tag_event_ignored", reason: event };
}

function readNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  if (typeof v === "object" && v !== null) {
    const obj = v as Record<string, unknown>;
    // Some shapes wrap assignee in { userId: N } or { id: N }
    return readNumberOrNull(obj.userId ?? obj.id);
  }
  return null;
}

function readString(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== "object") return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "string" ? v : null;
}
