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

import { and, eq, sql as drizzleSql } from "drizzle-orm";

import { conversaciones, getDb, mensajes, sedes } from "@dpm/db";
import type { LeadMetadata } from "@dpm/shared";

import { getAiAssigneeIds, isAiAssignee, loadEnv } from "../env.js";
import { leadStageService } from "../services/lead-stage.js";
import { respondIoClient } from "../services/respond-io.js";

// Per-sede welcome message + AI assignee for the auto-greeting that fires
// when the bienvenida workflow finishes and the AI takes over. Tony rule
// 2026-06-15: GA / KT / GT / NP must match PP's flow — sede AI sends "I'm
// X from Y" greeting automatically right after sede selection, no
// customer message needed in between.
const SEDE_AI_USERS: Readonly<Record<string, { assigneeId: number; welcome: string }>> = {
  "Koh Phi Phi": {
    assigneeId: 440519,
    welcome: "¡Hola! Soy Francisco Emilio de DPM Diving Koh Phi Phi 🤿 ¿En qué te puedo ayudar?",
  },
  "Gili Air": {
    assigneeId: 441308,
    welcome: "¡Hola! Soy Colomba de DPM Diving Gili Air 🤿 ¿En qué te puedo ayudar?",
  },
  "Gili Trawangan": {
    assigneeId: 462203,
    welcome: "¡Hola! Soy John de DPM Diving Gili Trawangan 🤿 ¿En qué te puedo ayudar?",
  },
  "Nusa Penida": {
    assigneeId: 464075,
    welcome: "¡Hola! Soy David de DPM Diving Nusa Penida 🤿 ¿En qué te puedo ayudar?",
  },
};

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
  if (
    event.startsWith("conversation.assignee.") ||
    event.startsWith("contact.assignee.") ||
    /assignee/i.test(event)
  ) {
    const newAssignee = readNumberOrNull(
      payload.assignee ??
        (payload.data as Record<string, unknown> | undefined)?.assignee ??
        (payload.payload as Record<string, unknown> | undefined)?.assignee,
    );

    // Multi-AI (2026-06-15): a human takeover is anyone outside the
    // configured AI set (Francisco, Colomba, Emma, ...). Reassigning from
    // Francisco to Colomba (e.g. sede switch) is NOT a takeover.
    const aiAssigneeIds = getAiAssigneeIds();
    const isHuman = newAssignee !== null && !isAiAssignee(newAssignee);

    // Workflow-routing vs operator-takeover (Tony rule 2026-06-15):
    // distinguish via prior AI activity. If the AI never spoke on this
    // thread, this assignment is the bienvenida workflow's default
    // routing, NOT a takeover — match what process-message.ts does in
    // its self-assign block. We log the assignee, but do NOT stamp the
    // human_took_over flag in that case (otherwise every brand-new
    // conversation would be flagged on the first webhook and the AI
    // would never get to talk).
    let priorAiCount = 0;
    if (isHuman) {
      const [row] = await db
        .select({ count: drizzleSql<number>`count(*)::int` })
        .from(mensajes)
        .where(
          and(
            eq(mensajes.conversacionId, conv.id),
            eq(mensajes.sender, "ai"),
          ),
        );
      priorAiCount = row?.count ?? 0;
    }
    const isRealTakeover = isHuman && priorAiCount > 0;

    log.info(
      { event, contactId, newAssignee, aiAssigneeIds, isHuman, priorAiCount, isRealTakeover },
      "assignee event parsed",
    );

    const oldMeta = (conv.leadMetadata as LeadMetadata | null) ?? {};

    // Workflow-setup auto-greeting (Tony rule 2026-06-15): when the
    // bienvenida workflow finishes by routing the thread to a human
    // BEFORE the AI has spoken, this isn't a takeover — it's the workflow
    // handing the customer off "to the team." Mi server matches what PP
    // does naturally (where the workflow assigns to Francisco AI directly):
    //   1. Reassign the thread to the sede AI so the panel shows the right
    //      persona.
    //   2. Send the sede AI's welcome message ("I'm X from Y, how can I
    //      help?") immediately, no need for the customer to nudge.
    //   3. Persist the welcome as an `ai` mensaje so future webhook events
    //      on this same thread see prior AI activity and correctly classify
    //      a later assignee change as a real takeover.
    //
    // Only fires once per thread (gated by the priorAiCount == 0 check) and
    // only when we can resolve the sede via conv.sedeId.
    if (isHuman && !isRealTakeover && conv.sedeId) {
      const [sede] = await db
        .select({ nombre: sedes.nombre })
        .from(sedes)
        .where(eq(sedes.id, conv.sedeId));
      const sedeName = sede?.nombre;
      const sedeAi = sedeName ? SEDE_AI_USERS[sedeName] : undefined;
      if (sedeAi) {
        // Fire and forget — same pattern as the rest of this handler. If
        // either the Respond.io call or the mensaje insert fails, log it
        // but don't block the webhook response.
        void (async () => {
          try {
            // Reassign first so when the welcome lands in Respond.io it
            // already shows the AI as owner. Best-effort — if the API
            // call fails the welcome still sends.
            await respondIoClient
              .assignConversation({
                contactId: String(contactId),
                assignee: sedeAi.assigneeId,
              })
              .catch((err) =>
                log.warn(
                  { err: (err as Error).message, sedeName, contactId },
                  "workflow setup: reassign to sede AI failed (non-blocking)",
                ),
              );

            // sendMessage uses contact-based fallback when conversationId
            // looks like an unresolved template (or our temp prefix), which
            // covers brand-new threads where Respond.io hasn't returned the
            // real conv id yet. Always pass contactId so the fallback fires.
            const respondIoConvId =
              typeof conv.respondIoConversationId === "string"
                ? conv.respondIoConversationId
                : "$conversation.id";
            await respondIoClient.sendMessage({
              conversationId: respondIoConvId,
              contactId: String(contactId),
              text: sedeAi.welcome,
            });

            await db.insert(mensajes).values({
              conversacionId: conv.id,
              sender: "ai",
              content: sedeAi.welcome,
              metadata: { auto_welcome: true, sede: sedeName },
            });

            log.info(
              { contactId, sedeName, newAssigneeId: sedeAi.assigneeId },
              "workflow setup: sent auto-welcome and reassigned to sede AI",
            );
          } catch (err) {
            log.error(
              { err: (err as Error).message, contactId, sedeName },
              "workflow setup: auto-welcome failed (non-blocking)",
            );
          }
        })();
      }
    }

    if (isRealTakeover) {
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
    // Miguel rule 2026-06-05: when the release ORIGINATED from a takeover
    // (oldMeta.human_took_over === true), the operator wants the AI to fully
    // resume — not just on "new-topic" messages. We therefore:
    //   1. Clear the human_took_over flag (silence master switch).
    //   2. If lead_stage is currently `handed_off`, force-transition it back
    //      to `qualified` so the POST_HANDOFF guard in process-message no
    //      longer trips on the next inbound message.
    //
    // We only touch lead_stage when the prior flag was set — i.e. the
    // handoff was caused by THIS subsystem, not by an AI-driven handoff_human
    // tool call (which has its own semantics: "AI thinks this needs human").
    // Touching lead_stage on AI-driven handoffs would undo the AI's own
    // judgment, which is not what the operator's reassign-to-AI action means.
    if (oldMeta.human_took_over) {
      const { human_took_over, human_took_over_at, human_took_over_by, ...rest } =
        oldMeta;
      // Persist the flag-clear immediately so even if the stage transition
      // below fails (e.g. terminal state), the flag part lands.
      await db
        .update(conversaciones)
        .set({ leadMetadata: rest as LeadMetadata, updatedAt: new Date() })
        .where(eq(conversaciones.id, conv.id));

      let stageReset = false;
      if (conv.leadStage === "handed_off") {
        const stageResult = await leadStageService.forceTransition({
          conversacionId: conv.id,
          to: "qualified",
          by: "human",
          note: `respond_io_human_release:${newAssignee ?? "null"}`,
        });
        stageReset = stageResult.ok;
        if (!stageResult.ok) {
          log.warn(
            { contactId, reason: stageResult.reason },
            "human release: stage reset failed (flag still cleared)",
          );
        }
      }
      log.info(
        { contactId, newAssignee, stageReset },
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
