// ============================================================================
// Orchestrator for an inbound Respond.io message. Wires the 10 steps from
// guide §6:
//   1. Webhook received (done by route layer, signature already verified)
//   2. Sede identification (tag → DB)
//   3. Conversation history (sliding window)
//   4. KB + prompt loaded from Supabase
//   5. 4-block prompt build with cache_control
//   6. Dynamic block (current time + 7-day roster + msg)
//   7. Apps Script consult (tool_use, conditional)
//   8. Claude API call
//   9. Response handling + logging
//  10. Send via Respond.io outbound API
// ============================================================================

import type { FastifyBaseLogger } from "fastify";

import type { ConsultarDisponibilidadInput, ConsultarDisponibilidadResult, RespondIoIncomingMessage } from "@dpm/shared";

import { errores, getDb } from "@dpm/db";
import { callClaude } from "../services/anthropic.js";
import { appsScriptService } from "../services/apps-script.js";
import { conversationService } from "../services/conversation.js";
import { followUpProcessor } from "../services/follow-up.js";
import { detectLanguage } from "../services/language.js";
import { buildFourBlockPrompt } from "../services/prompt-builder.js";
import { promptsService } from "../services/prompts.js";
import { respondIoClient } from "../services/respond-io.js";
import { sedeService } from "../services/sede.js";

export type ProcessResult = {
  conversationId: string;
  sede: string;
  responseSentChars: number;
  latencyMs: number;
  toolCalls: string[];
  cacheHitRate: number;
  costUsd: number;
};

export async function processIncomingMessage(
  payload: RespondIoIncomingMessage,
  log: FastifyBaseLogger,
): Promise<ProcessResult> {
  const t0 = Date.now();

  const incomingText = (payload.message.text ?? "").trim();
  if (!incomingText) {
    log.info("ignoring non-text message");
    return {
      conversationId: payload.conversation?.id ?? "",
      sede: "",
      responseSentChars: 0,
      latencyMs: Date.now() - t0,
      toolCalls: [],
      cacheHitRate: 0,
      costUsd: 0,
    };
  }

  // Step 2: sede identification
  const { sede, usedFallback } = await sedeService.resolveOrPilot(payload.contact.tags);
  if (usedFallback) {
    log.warn(
      { tags: payload.contact.tags, fallback: sede.nombre },
      "no sede tag — using pilot fallback",
    );
  }

  // Step 3: conversation upsert + history
  const conversation = await conversationService.upsertOnInbound({
    respondIoConversationId: payload.conversation?.id ?? `tmp_${payload.contact.id}`,
    sedeId: sede.id,
    clientPhone: payload.contact.phone ?? `unknown:${payload.contact.id}`,
    clientName: payload.contact.name,
    clientLanguage: payload.contact.language,
  });
  await conversationService.appendInboundMessage(conversation.id, incomingText, {
    respondIoMessageId: payload.message.messageId,
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
  const detectedLanguage = detectLanguage(incomingText);
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

  // Step 7+8: tool_use handler + Claude call
  const toolHandler = async (
    input: ConsultarDisponibilidadInput,
  ): Promise<ConsultarDisponibilidadResult> => {
    if (input.sede_id !== sede.id) {
      // Defensive: the model sometimes emits a different sede_id from the
      // dynamic block. We ignore the model's claim and use the bound sede.
      log.warn(
        { claimed: input.sede_id, actual: sede.id },
        "tool_use sede_id mismatch — overriding",
      );
    }
    const fresh = await appsScriptService.getRoster(sede);
    if (!fresh) {
      return {
        ok: false,
        reason: "timeout",
        message: "Apps Script no respondió en el plazo permitido",
      };
    }
    // Find the requested day + course in the snapshot. This logic is a
    // stub that we will extend once we see the real Apps Script schema in
    // Semana 0; for now we return the closest day's slot info.
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
    const slot = input.horario === "AM" ? course.am : input.horario === "PM" ? course.pm : input.horario === "Night" ? course.night : (course.am ?? course.pm ?? course.night);
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

  const claudeResult = await callClaude({
    system,
    messages,
    toolHandler,
    conversacionId: conversation.id,
    sedeId: sede.id,
    promptVersionId: promptVersion?.id,
  });

  // Step 9: persist AI message
  await conversationService.appendAiMessage(conversation.id, claudeResult.text, {
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
    // We've already logged the AI message and llamadas_api row. The error
    // here is just the outbound send — log and store, but don't unwind.
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
    conversationId: conversation.id,
    sede: sede.nombre,
    responseSentChars: claudeResult.text.length,
    latencyMs: Date.now() - t0,
    toolCalls: claudeResult.toolCalls,
    cacheHitRate: claudeResult.cost.cacheHitRate,
    costUsd: claudeResult.cost.totalUsd,
  };
}
