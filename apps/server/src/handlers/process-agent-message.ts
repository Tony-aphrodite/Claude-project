// ============================================================================
// Espía path. Captures a reply sent by a human agent (Patrick, Giovanni,
// Grecia, …) so we can:
//   • surface the full timeline in the panel for handed-off conversations,
//   • observe lead-stage transitions the AI didn't drive (e.g. an agent
//     confirming a deposit transfer manually),
//   • feed future training datasets with real human sales patterns.
//
// We DO NOT call Claude here. Once a human is replying we treat the thread
// as human-owned. If the agent message looks like a payment confirmation
// or a hand-off cue, we record the corresponding lead_stage transition so
// the pipeline view stays accurate.
//
// The pilot gate still applies: only Gili Trawangan agent messages are
// captured during Pieza 1. Other branches return ok:false ignored.
// ============================================================================

import type { FastifyBaseLogger } from "fastify";
import { eq } from "drizzle-orm";

import type { LeadMetadata, RespondIoIncomingMessage } from "@dpm/shared";
import { conversaciones, getDb } from "@dpm/db";

import { loadEnv } from "../env.js";
import { chatContactsService } from "../services/chat-contacts.js";
import { conversationService } from "../services/conversation.js";
import { followUpProcessor } from "../services/follow-up.js";
import { leadStageService } from "../services/lead-stage.js";
import { respondIoClient } from "../services/respond-io.js";
import { sedeService } from "../services/sede.js";
import { isValidRefCode } from "../tools/solicitar-deposito.js";

export type EspiaResult =
  | {
      ok: true;
      espia: true;
      conversationId: string;
      sede: string;
      agentName: string | null;
      capturedChars: number;
      stageTransition: { from: string; to: string } | null;
      latencyMs: number;
    }
  | {
      ok: true;
      duplicate: true;
      conversationId: string;
      respondIoMessageId: string;
      latencyMs: number;
    }
  | {
      ok: false;
      ignored: true;
      reason:
        | "branch_other_sede"
        | "branch_empty"
        | "sede_not_seeded"
        | "test_tag_missing";
      branch?: string | null;
      latencyMs: number;
    };

export async function processAgentMessage(
  payload: RespondIoIncomingMessage,
  agentName: string | null,
  log: FastifyBaseLogger,
): Promise<EspiaResult> {
  const t0 = Date.now();
  const text = (payload.message.text ?? "").trim();

  const resolution = await sedeService.resolveForPilot(
    payload.contact,
    payload.channelId,
  );
  if (!resolution.ok) {
    log.info(
      {
        reason: resolution.reason,
        branch: resolution.branchValue,
        contactId: payload.contact.id,
        channelId: payload.channelId ?? null,
        agentName,
      },
      "espia: pilot gate rejected agent message",
    );
    return {
      ok: false,
      ignored: true,
      reason: resolution.reason,
      branch: resolution.branchValue,
      latencyMs: Date.now() - t0,
    };
  }
  const sede = resolution.sede;

  // Pilot test gate — same rule as the client-inbound path so we don't end
  // up capturing real human-agent traffic before Miguel says "go live".
  // V2 payloads omit tags; fetch via API when missing.
  const requiredTag = loadEnv().PILOT_REQUIRE_TAG;
  if (requiredTag) {
    let tags: string[] = payload.contact.tags ?? [];
    if (tags.length === 0) {
      const fetched = await respondIoClient
        .getContact(payload.contact.id)
        .catch((err) => {
          log.warn(
            { err },
            "respond_io get_contact failed during espia pilot gate — treating as untagged",
          );
          return null;
        });
      tags = fetched?.tags ?? [];
    }
    if (!tags.includes(requiredTag)) {
      log.info(
        {
          contactId: payload.contact.id,
          requiredTag,
          contactTags: tags,
        },
        "espia: test gate rejected — contact lacks required tag",
      );
      return {
        ok: false,
        ignored: true,
        reason: "test_tag_missing",
        branch: sede.nombre,
        latencyMs: Date.now() - t0,
      };
    }
  }

  const contact = await chatContactsService.upsertFromWebhook({
    respondIoContactId: payload.contact.id,
    phone: payload.contact.phone,
    name: payload.contact.name,
    language: payload.contact.language,
    tags: payload.contact.tags,
    sedeId: sede.id,
  });

  const conversation = await conversationService.upsertOnInbound({
    respondIoConversationId: payload.conversation?.id ?? `tmp_${contact.respondIoContactId}`,
    respondIoContactId: contact.respondIoContactId,
    sedeId: sede.id,
  });

  const messageId = payload.message.messageId;
  if (messageId) {
    const existing = await conversationService.findByRespondIoMessageId(
      conversation.id,
      messageId,
    );
    if (existing) {
      log.info(
        {
          conversationId: conversation.id,
          respondIoMessageId: messageId,
          existingMensajeId: existing.id,
        },
        "espia: duplicate agent message — skipping",
      );
      return {
        ok: true,
        duplicate: true,
        conversationId: conversation.id,
        respondIoMessageId: messageId,
        latencyMs: Date.now() - t0,
      };
    }
  }

  await conversationService.appendAgentMessage(conversation.id, text, agentName, {
    respondIoMessageId: messageId,
    capturedAt: new Date().toISOString(),
  });

  // Cancel pending follow-ups: a human replied, the conversation is no
  // longer "dormida" from the AI's perspective.
  followUpProcessor
    .cancelOpenFollowUpsForConversation(conversation.id, "agent_replied")
    .catch((err) => log.warn({ err }, "espia: follow-up cancel-on-agent-reply failed"));

  // ─── Take-over silence (Tony fix 2026-06-07) ───────────────────────────
  // A human agent sent a message from the Respond.io panel. This is the
  // most definitive signal of human take-over we can get.
  //
  // We tried two webhook-based signals first and both failed:
  //   1. `conversation.assignee.changed` webhook → Respond.io doesn't
  //      fire this event for self-assignments in the UI (only for some
  //      API-driven changes).
  //   2. Active GET to /contact/.../conversation → returns 404 (no such
  //      endpoint exists in Respond.io v2).
  //
  // Message-based detection is the ONLY reliable signal we have. When
  // any human sends a message (regardless of how they took over the
  // conversation), we stamp `human_took_over` on the conversation.
  // The next inbound customer message hits the silence guard in
  // process-message.ts (persistedHumanTookOver check) and the AI
  // stays quiet.
  //
  // Limitation we accept: if a human ASSIGNS but doesn't message, AI
  // may respond ONCE more before the next assignment-with-message
  // resets the flag. In real usage humans almost always message after
  // taking over, so the gap is short.
  void getDb()
    .update(conversaciones)
    .set({
      leadMetadata: {
        ...((conversation.leadMetadata as LeadMetadata | null) ?? {}),
        human_took_over: true,
        human_took_over_at: new Date().toISOString(),
        human_took_over_by: agentName ?? "panel_agent",
      },
      updatedAt: new Date(),
    })
    .where(eq(conversaciones.id, conversation.id))
    .then(() => {
      log.info(
        {
          conversationId: conversation.id,
          contactId: payload.contact.id,
          agentName: agentName ?? "panel_agent",
        },
        "espia: human_took_over flag set from agent message",
      );
    })
    .catch((err: unknown) =>
      log.warn(
        { err: (err as Error).message },
        "espia: human_took_over flag stamp failed",
      ),
    );

  const stageTransition = await observeStageFromAgentMessage({
    conversationId: conversation.id,
    currentStage: conversation.leadStage as string,
    leadMetadata: (conversation.leadMetadata as LeadMetadata | null) ?? null,
    text,
    agentName,
    log,
  });

  return {
    ok: true,
    espia: true,
    conversationId: conversation.id,
    sede: sede.nombre,
    agentName,
    capturedChars: text.length,
    stageTransition,
    latencyMs: Date.now() - t0,
  };
}

// ── Lead-stage observation from agent text ──────────────────────────────────
// Heuristic: agents announcing a deposit confirmation or a hand-off cause us
// to advance the pipeline. We deliberately keep this conservative — false
// negatives are recoverable from the panel; false positives ride the audit
// trail and confuse Miguel's team.
//
// Rules:
//   • current=deposit_pending and text confirms payment ("recibido", "llegó
//     el pago", "deposito ok", "pagado", or quotes the ref_code with a
//     positive verb) → move to deposit_paid (system actor).
//   • current=deposit_paid and text mentions hand-off cues ("paso al
//     instructor", "te paso a", "tu instructor es") → move to handed_off.
async function observeStageFromAgentMessage(args: {
  conversationId: string;
  currentStage: string;
  leadMetadata: LeadMetadata | null;
  text: string;
  agentName: string | null;
  log: FastifyBaseLogger;
}): Promise<{ from: string; to: string } | null> {
  const lower = args.text.toLowerCase();

  if (args.currentStage === "deposit_pending") {
    const refCode = args.leadMetadata?.ref_code ?? null;
    const mentionsRef =
      !!refCode && isValidRefCode(refCode) && lower.includes(refCode.toLowerCase());
    const positivePaymentCue = [
      "recibido",
      "llegó el pago",
      "llego el pago",
      "deposito ok",
      "depósito ok",
      "deposito recibido",
      "depósito recibido",
      "pago recibido",
      "pago confirmado",
      "pagado",
      "confirmo el pago",
      "transferencia recibida",
    ].some((cue) => lower.includes(cue));

    if (mentionsRef || positivePaymentCue) {
      const result = await leadStageService.transition({
        conversacionId: args.conversationId,
        to: "deposit_paid",
        by: "system",
        note: `espia: agent ${args.agentName ?? "?"} confirmed deposit`,
      });
      if (result.ok) return { from: result.from, to: result.to };
      args.log.warn(
        { reason: result.reason, from: result.from, to: result.to },
        "espia: deposit_paid transition rejected",
      );
    }
  }

  if (args.currentStage === "deposit_paid") {
    const handoffCue = [
      "te paso al instructor",
      "te paso a",
      "tu instructor es",
      "your instructor",
      "i'll hand you over",
      "handing you over",
    ].some((cue) => lower.includes(cue));
    if (handoffCue) {
      const result = await leadStageService.transition({
        conversacionId: args.conversationId,
        to: "handed_off",
        by: "system",
        note: `espia: agent ${args.agentName ?? "?"} handed off`,
      });
      if (result.ok) return { from: result.from, to: result.to };
    }
  }

  return null;
}
