// ============================================================================
// Orchestrator for an inbound Respond.io message. Wires the 10 steps from
// guide §6:
//   1. Webhook received (done by route layer, signature already verified)
//   2. Pilot gate — read contact.Branch field; only "Gili Trawangan"
//      proceeds. Other sedes / empty Branch return HTTP 200 ignored so the
//      human flow continues unchanged.
//   3. Contact upsert (chat_contacts) + conversation upsert + history
//   4. KB + prompt loaded from Supabase
//   5. 4-block prompt build with cache_control
//   6. Dynamic block (current time + 7-day roster + msg)
//   7. Apps Script consult (tool_use, conditional)
//   8. Claude API call
//   9. Response handling + logging
//  10. Send via Respond.io outbound API
//
// Architectural rules:
//   • chat_contacts is the only place per-person identity lives. The
//     conversation row only references the contact_id. We MUST upsert the
//     contact BEFORE the conversation so the FK is satisfied.
//   • The deposit reference code is generated AT MOST ONCE per conversation;
//     subsequent solicitar_deposito calls reuse the existing code (per
//     INSTRUCCIONES_PAGO_GiliTrawangansteve.md §codigo-generacion).
// ============================================================================

import type { FastifyBaseLogger } from "fastify";

import type {
  ConsultarDisponibilidadInput,
  ConsultarDisponibilidadResult,
  DepositCurrency,
  LeadMetadata,
  RespondIoIncomingMessage,
  SolicitarDepositoInput,
  SolicitarDepositoResult,
} from "@dpm/shared";
import { depositAmountFor } from "@dpm/shared";

import { errores, getDb } from "@dpm/db";
import { callClaude } from "../services/anthropic.js";
import { appsScriptService } from "../services/apps-script.js";
import { chatContactsService } from "../services/chat-contacts.js";
import { conversationService } from "../services/conversation.js";
import {
  buildPaymentInstructions,
  sedeHasAutomaticGateway,
  type SedeKey,
} from "../services/deposit-instructions.js";
import { followUpProcessor } from "../services/follow-up.js";
import { detectLanguage } from "../services/language.js";
import { leadStageService } from "../services/lead-stage.js";
import { buildFourBlockPrompt } from "../services/prompt-builder.js";
import { promptsService } from "../services/prompts.js";
import { respondIoClient } from "../services/respond-io.js";
import { sedeService } from "../services/sede.js";
import {
  generateRefCode,
  isValidRefCode,
} from "../tools/solicitar-deposito.js";

export type ProcessResult =
  | {
      ok: true;
      conversationId: string;
      sede: string;
      responseSentChars: number;
      latencyMs: number;
      toolCalls: string[];
      cacheHitRate: number;
      costUsd: number;
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
      reason: "non_text" | "branch_other_sede" | "branch_empty" | "sede_not_seeded";
      branch?: string | null;
      latencyMs: number;
    };

export async function processIncomingMessage(
  payload: RespondIoIncomingMessage,
  log: FastifyBaseLogger,
): Promise<ProcessResult> {
  const t0 = Date.now();

  const incomingText = (payload.message.text ?? "").trim();
  if (!incomingText) {
    log.info("ignoring non-text message");
    return { ok: false, ignored: true, reason: "non_text", latencyMs: Date.now() - t0 };
  }

  // Step 2: Pilot gate. The Branch contact field decides whether this
  // message belongs to our system. Anything other than "Gili Trawangan"
  // (including empty) is the human team's responsibility — return 200 so
  // Respond.io does not retry.
  const resolution = await sedeService.resolveForPilot(payload.contact);
  if (!resolution.ok) {
    log.info(
      {
        reason: resolution.reason,
        branch: resolution.branchValue,
        contactId: payload.contact.id,
      },
      "pilot gate rejected message",
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

  // Step 2b: contact upsert. This is the canonical store for per-person data;
  // the conversation row only carries a foreign key.
  const contact = await chatContactsService.upsertFromWebhook({
    respondIoContactId: payload.contact.id,
    phone: payload.contact.phone,
    name: payload.contact.name,
    language: payload.contact.language,
    tags: payload.contact.tags,
    sedeId: sede.id,
  });

  // Step 3: conversation upsert + history
  const conversation = await conversationService.upsertOnInbound({
    respondIoConversationId: payload.conversation?.id ?? `tmp_${contact.respondIoContactId}`,
    respondIoContactId: contact.respondIoContactId,
    sedeId: sede.id,
  });

  // Idempotency: Respond.io retries any 5xx, so a network blip during reply
  // would otherwise re-trigger a Claude call + double reply. If we already
  // stored the inbound row for this messageId, exit before any expensive work.
  const incomingMessageId = payload.message.messageId;
  if (incomingMessageId) {
    const existing = await conversationService.findByRespondIoMessageId(
      conversation.id,
      incomingMessageId,
    );
    if (existing) {
      log.info(
        {
          conversationId: conversation.id,
          respondIoMessageId: incomingMessageId,
          existingMensajeId: existing.id,
        },
        "duplicate inbound message — skipping",
      );
      return {
        ok: true,
        duplicate: true,
        conversationId: conversation.id,
        respondIoMessageId: incomingMessageId,
        latencyMs: Date.now() - t0,
      };
    }
  }

  await conversationService.appendInboundMessage(conversation.id, incomingText, {
    respondIoMessageId: incomingMessageId,
  });

  // Client just replied — cancel any open follow-ups for this conversation.
  // Don't await: it's a side-effect that must not slow the main response.
  followUpProcessor
    .cancelOpenFollowUpsForConversation(conversation.id, "client_responded")
    .catch((err) => log.warn({ err }, "follow-up cancel-on-reply failed"));

  const history = await conversationService.recentMessages(conversation.id);

  // Step 4: prompt + KB
  const [{ content: systemPrompt, version: promptVersion }, sedeKb] = await Promise.all([
    promptsService.loadSystemPrompt(sede),
    promptsService.loadSedeKb(sede),
  ]);

  // Step 6 (preview): roster fetch is conditional but we eagerly start it in
  // parallel with prompt build because it's bounded at 2s and Bloque 4 needs
  // it. If it fails, we just embed a "no roster" note.
  const rosterPromise = appsScriptService.getRoster(sede);

  // Step 6: dynamic block + 5: 4-block prompt
  const detectedLanguage = detectLanguage(incomingText) ?? contact.language ?? undefined;
  const roster = await rosterPromise;

  // Drop the bot's own message from the history we send back to Claude;
  // the new client message becomes the dynamic block input.
  const historyExcludingCurrent = history.slice(0, -1);
  const { system, messages } = buildFourBlockPrompt({
    systemPrompt,
    sedeKb,
    history: historyExcludingCurrent,
    sede,
    roster,
    incomingMessage: incomingText,
    detectedLanguage,
  });

  // Step 7+8: tool_use handlers + Claude call
  const consultarDisponibilidadHandler = async (
    input: ConsultarDisponibilidadInput,
  ): Promise<ConsultarDisponibilidadResult> => {
    if (input.sede_id !== sede.id) {
      log.warn(
        { claimed: input.sede_id, actual: sede.id },
        "tool_use sede_id mismatch — overriding",
      );
    }
    void leadStageService
      .transition({
        conversacionId: conversation.id,
        to: "proposed",
        by: "ai",
        note: `consultar_disponibilidad ${input.curso} ${input.fecha}`,
      })
      .catch(() => {});

    const fresh = await appsScriptService.getRoster(sede);
    if (!fresh) {
      return {
        ok: false,
        reason: "timeout",
        message: "Apps Script no respondió en el plazo permitido",
      };
    }
    const day = fresh.days.find((d) => d.date === input.fecha) ?? null;
    if (!day) {
      return {
        ok: true,
        available: false,
        slotsRemaining: 0,
        instructorName: null,
        notes: `No hay datos para ${input.fecha} en el roster cargado`,
      };
    }
    const course = day.courses.find((c) => c.code === input.curso) ?? null;
    if (!course) {
      return {
        ok: true,
        available: false,
        slotsRemaining: 0,
        instructorName: null,
        notes: `No hay franjas de ${input.curso} ese día`,
      };
    }
    const slot =
      input.horario === "AM"
        ? course.am
        : input.horario === "PM"
          ? course.pm
          : input.horario === "Night"
            ? course.night
            : (course.am ?? course.pm ?? course.night);
    if (!slot) {
      return {
        ok: true,
        available: false,
        slotsRemaining: 0,
        instructorName: null,
        notes: `No hay franja ${input.horario ?? "ninguna"} ese día`,
      };
    }
    const remaining = Math.max(slot.capacity - slot.booked, 0);
    return {
      ok: true,
      available: remaining > 0,
      slotsRemaining: remaining,
      instructorName: null,
      notes: null,
    };
  };

  const solicitarDepositoHandler = async (
    input: SolicitarDepositoInput,
  ): Promise<SolicitarDepositoResult> => {
    if (input.sede_id !== sede.id) {
      log.warn(
        { claimed: input.sede_id, actual: sede.id },
        "solicitar_deposito sede_id mismatch — overriding",
      );
    }

    // Block IDR for clients without an Indonesian bank account. We can't
    // verify that from the AI side, so we trust the client's claim — but
    // we record the decision in lead_metadata for audit.
    const currency = input.moneda_cliente as DepositCurrency;
    const monto = depositAmountFor(currency);

    // Reuse the existing reference code if this conversation already has
    // one (owner spec — never mint twice for the same lead). We look at
    // lead_metadata.ref_code as the canonical store.
    const existingMeta =
      (conversation.leadMetadata as LeadMetadata | null) ?? null;
    const existingRefCode =
      existingMeta?.ref_code && isValidRefCode(existingMeta.ref_code)
        ? existingMeta.ref_code
        : null;
    const reused = existingRefCode !== null;
    const refCode = existingRefCode ?? generateRefCode();

    const requiresHumanVerification = !sedeHasAutomaticGateway(
      sede.nombre as SedeKey,
    );

    const instrucciones = buildPaymentInstructions({
      sedeNombre: sede.nombre,
      language: input.cliente_idioma,
      currency,
      refCode,
    });

    // Only transition to deposit_pending the first time the tool is
    // invoked. Subsequent reuses are no-ops on the state machine but still
    // refresh the snapshot of instructions for audit.
    const transitionResult = await leadStageService.transition({
      conversacionId: conversation.id,
      to: "deposit_pending",
      by: "ai",
      note: reused
        ? `solicitar_deposito reuse ${refCode} ${currency}`
        : `solicitar_deposito ${refCode} ${currency}`,
      metadataPatch: {
        ref_code: refCode,
        deposit_amount: monto,
        deposit_currency: currency,
        payment_instructions_snapshot: instrucciones,
        requires_human_verification: requiresHumanVerification,
      },
    });

    if (!transitionResult.ok) {
      log.warn(
        {
          reason: transitionResult.reason,
          from: transitionResult.from,
          to: transitionResult.to,
          reused,
        },
        "solicitar_deposito transition rejected — returning instructions anyway",
      );
    }

    return {
      ok: true,
      ref_code: refCode,
      monto,
      moneda: currency,
      instrucciones,
      requires_human_verification: requiresHumanVerification,
      reused_existing: reused,
    };
  };

  const claudeResult = await callClaude({
    system,
    messages,
    toolHandlers: {
      consultar_disponibilidad: consultarDisponibilidadHandler,
      solicitar_deposito: solicitarDepositoHandler,
    },
    conversacionId: conversation.id,
    sedeId: sede.id,
    promptVersionId: promptVersion?.id,
  });

  // Step 9: persist AI message with citations
  await conversationService.appendAiMessage(conversation.id, claudeResult.text, {
    fuentes: claudeResult.fuentes,
    model: claudeResult.model,
    latencyMs: claudeResult.latencyMs,
    cacheHitRate: claudeResult.cost.cacheHitRate,
    costUsd: claudeResult.cost.totalUsd,
    toolCalls: claudeResult.toolCalls,
  });

  // Step 10: send back to Respond.io
  try {
    await respondIoClient.sendMessage({
      conversationId: payload.conversation?.id ?? conversation.respondIoConversationId,
      text: claudeResult.text,
    });
  } catch (err) {
    log.error({ err }, "respond_io send failed; AI text saved but not delivered");
    await getDb()
      .insert(errores)
      .values({
        source: "respond_io",
        conversacionId: conversation.id,
        errorType: "send_message_failed",
        errorMessage: (err as Error).message,
        context: { aiText: claudeResult.text.slice(0, 500) },
      })
      .catch(() => {});
    throw err;
  }

  return {
    ok: true,
    conversationId: conversation.id,
    sede: sede.nombre,
    responseSentChars: claudeResult.text.length,
    latencyMs: Date.now() - t0,
    toolCalls: claudeResult.toolCalls,
    cacheHitRate: claudeResult.cost.cacheHitRate,
    costUsd: claudeResult.cost.totalUsd,
  };
}
