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

import { isAiAssignee, loadEnv } from "../env.js";
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
  //
  // Multi-tag + Branch match (2026-06-15): PILOT_REQUIRE_TAG is a CSV of
  // allowed pilot sedes. The contact passes if EITHER any required value
  // is on its tag list OR its Branch (= sede.nombre) is in the CSV.
  // Empty/unset = gate disabled.
  const requiredTagRaw = loadEnv().PILOT_REQUIRE_TAG;
  const requiredTags = requiredTagRaw
    ? requiredTagRaw.split(",").map((t) => t.trim()).filter((t) => t.length > 0)
    : [];
  if (requiredTags.length > 0) {
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
    const matchedByTag = requiredTags.some((t) => tags.includes(t));
    const matchedByBranch = requiredTags.includes(sede.nombre);
    if (!matchedByTag && !matchedByBranch) {
      log.info(
        {
          contactId: payload.contact.id,
          requiredTags,
          contactTags: tags,
          sede: sede.nombre,
        },
        "espia: test gate rejected — contact lacks required tag and Branch not in allowed sedes",
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

  // ─── Take-over silence (Tony 2026-06-07, refined Miguel 2026-06-26) ───
  // A human sent a message from the Respond.io panel. Two scenarios:
  //
  //   FORMAL takeover — the human assigned the conversation to themselves
  //   in Respond.io and is now the conversation's assignee. AI must
  //   silence. The `conversation.assignee.changed` webhook handler
  //   (contact-state-event.ts) stamps `human_took_over=true`.
  //
  //   INFORMAL interjection — the human typed a correction / clarification
  //   from the panel WITHOUT taking over (conversation's assignee is
  //   still the per-sede AI bot). Miguel 2026-06-26 spec: AI should keep
  //   the thread, see the human's message in history (Bloque 3 renders
  //   `agente_humano` sender as "AGENTE (name)"), and reply with full
  //   context — not silence. Previously this branch stamped the flag
  //   unconditionally and the AI lost the thread until self-heal cleared
  //   it on the next turn.
  //
  // We disambiguate by the conversation's current assignee at the time of
  // the agent message. The Respond.io payload's `conversation.assignee`
  // field carries it; when missing, we read `lead_metadata.last_known_*`
  // from prior webhook state or accept the ambiguity and stamp (safer
  // default — formal takeovers must not leak AI replies).
  //
  // Refinement Miguel 2026-06-26: the AI must SEE every agent message on
  // its next turn, whether silenced or not. Persistence above (line ~184)
  // is what gets the message into Bloque 3 history. The flag controls
  // whether the AI is invoked again; the message itself is always saved.
  const currentAssigneeRaw = (
    payload as { conversation?: { assignee?: string | number | null } }
  ).conversation?.assignee;
  const currentAssigneeIsAiBot =
    currentAssigneeRaw !== undefined &&
    currentAssigneeRaw !== null &&
    currentAssigneeRaw !== "" &&
    isAiAssignee(currentAssigneeRaw);

  if (currentAssigneeIsAiBot) {
    log.info(
      {
        conversationId: conversation.id,
        contactId: payload.contact.id,
        agentName: agentName ?? "panel_agent",
        currentAssignee: currentAssigneeRaw,
      },
      "espia: agent message arrived while AI bot is still the assignee — INFORMAL interjection, message persisted but human_took_over flag NOT set (Miguel 2026-06-26 rule)",
    );
  } else {
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
            currentAssignee: currentAssigneeRaw ?? null,
          },
          "espia: human_took_over flag set from agent message (current assignee is not AI bot — formal takeover)",
        );
      })
      .catch((err: unknown) =>
        log.warn(
          { err: (err as Error).message },
          "espia: human_took_over flag stamp failed",
        ),
      );
  }

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
