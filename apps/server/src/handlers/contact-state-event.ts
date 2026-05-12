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

  // Lifecycle change is the strongest signal. We accept it from any
  // shape — Respond.io v2 puts the lifecycle on `data.lifecycle`,
  // `payload.lifecycle`, or as a top-level field depending on the
  // event variant. We try all three.
  if (event.startsWith("contact.lifecycle.")) {
    const lifecycle =
      readString(payload.data, "lifecycle") ??
      readString(payload.payload, "lifecycle") ??
      readString(payload, "lifecycle");
    if (!lifecycle) {
      log.warn(
        { event, contactId },
        "lifecycle event without lifecycle string — noop",
      );
      return { ok: true, action: "noop", reason: "no_lifecycle_value" };
    }
    const target = LIFECYCLE_ROLLBACK[lifecycle.toLowerCase()];
    if (!target) {
      // Forward lifecycle changes (Engaging, Following Up, Customer) are
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
  // lifecycle. Tag ADDED events are noisy (the operator may apply tags
  // for filtering, not for state) so we ignore them by default.
  //
  // Respond.io v2 Spanish UI exposes a single event "Etiqueta de
  // contacto actualizada" that fires for BOTH add and remove (Miguel
  // 2026-05-12). The webhook payload distinguishes the two via an
  // `action` (or `change`) field — we accept any of the candidate
  // shapes since v2 has been moving the field name around.
  if (
    event === "contact.tag.removed" ||
    event === "contact.tag.added" ||
    event === "contact.tag.updated"
  ) {
    const tag =
      readString(payload.data, "tag") ??
      readString(payload.payload, "tag") ??
      readString(payload, "tag");
    // Infer add vs remove. Explicit event name wins; otherwise read
    // an action/change/operation/type field from the payload.
    const action =
      event === "contact.tag.removed"
        ? "removed"
        : event === "contact.tag.added"
          ? "added"
          : readString(payload.data, "action") ??
            readString(payload.payload, "action") ??
            readString(payload, "action") ??
            readString(payload.data, "change") ??
            readString(payload.payload, "change") ??
            readString(payload, "change") ??
            readString(payload.data, "operation") ??
            readString(payload.payload, "operation") ??
            readString(payload, "operation") ??
            null;

    if (action === "removed" && tag === "deposit_paid" && conv.leadStage !== "proposed") {
      const result = await leadStageService.forceTransition({
        conversacionId: conv.id,
        to: "proposed",
        by: "human",
        note: "respond_io_deposit_paid_tag_removed",
      });
      log.info(
        { contactId, from: result.ok ? result.from : null, success: result.ok },
        "deposit_paid removal drove server rollback to proposed",
      );
      return { ok: true, action: "tag_event_ignored", reason: `removed:${tag}` };
    }
    return {
      ok: true,
      action: "tag_event_ignored",
      reason: `${action ?? "unknown_action"}:${tag ?? "unknown_tag"}`,
    };
  }

  return { ok: true, action: "tag_event_ignored", reason: event };
}

function readString(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== "object") return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "string" ? v : null;
}
