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
  EnviarCatalogoInput,
  EnviarCatalogoResult,
  LeadMetadata,
  RespondIoIncomingMessage,
  SlotVerdict,
  SolicitarDepositoInput,
  SolicitarDepositoResult,
} from "@dpm/shared";
import { depositAmountFor } from "@dpm/shared";

import { errores, getDb, mensajes } from "@dpm/db";

import { loadEnv } from "../env.js";
import { callClaude } from "../services/anthropic.js";
import { appsScriptService } from "../services/apps-script.js";
import { bookableSlots } from "../services/bookable-slots.js";
import {
  describeMissingCatalog,
  getCatalogEntry,
} from "../services/catalog-registry.js";
import { chatContactsService } from "../services/chat-contacts.js";
import { conversationService } from "../services/conversation.js";
import { detectCurrencyFromPhone } from "../services/currency-detection.js";
import {
  addDays,
  getRequiredSlots,
  maxDayOffset,
} from "../services/program-schedule.js";
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
      reason:
        | "non_text"
        | "branch_other_sede"
        | "branch_empty"
        | "sede_not_seeded"
        | "test_tag_missing";
      branch?: string | null;
      latencyMs: number;
    }
  | {
      ok: true;
      acknowledgedAttachment: true;
      conversationId: string;
      latencyMs: number;
    };

export async function processIncomingMessage(
  payload: RespondIoIncomingMessage,
  log: FastifyBaseLogger,
): Promise<ProcessResult> {
  const t0 = Date.now();

  const incomingText = (payload.message.text ?? "").trim();

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

  // Step 2a: pilot test gate. While we are still validating the AI before
  // exposing it to the full Gili Trawangan customer base, we require an
  // operator-controlled tag (e.g. "ai-test") on the contact. Real customers
  // without that tag are silently dropped here so they continue to be
  // handled by the human team. Setting the env var empty disables the gate.
  const requiredTag = loadEnv().PILOT_REQUIRE_TAG;
  if (requiredTag && !payload.contact.tags?.includes(requiredTag)) {
    log.info(
      {
        contactId: payload.contact.id,
        requiredTag,
        contactTags: payload.contact.tags ?? [],
      },
      "test gate rejected — contact lacks required tag",
    );
    return {
      ok: false,
      ignored: true,
      reason: "test_tag_missing",
      branch: resolution.via === "branch" ? sede.nombre : null,
      latencyMs: Date.now() - t0,
    };
  }

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

  // Non-text handling. Owner spec INSTRUCCIONES_PAGO §7
  // (mensaje-comprobante-recibido) — when the client sends an image / PDF
  // (typically a payment proof) while the lead is in deposit_pending, the AI
  // must acknowledge so the customer doesn't go silent. We skip OCR
  // validation for now; an operator confirms manually from the panel.
  if (!incomingText) {
    if (conversation.leadStage === "deposit_pending") {
      const ackText = pickComprobanteAck(contact.language ?? null);
      try {
        await respondIoClient.sendMessage({
          conversationId: payload.conversation?.id ?? conversation.respondIoConversationId,
          contactId: payload.contact.id,
          text: ackText,
        });
      } catch (err) {
        log.error({ err }, "respond_io send failed during comprobante ack");
      }
      // Persist the AI message so the panel + history reflect what the
      // customer saw. Mark synthetic so the regression suite can filter it.
      await getDb()
        .insert(mensajes)
        .values({
          conversacionId: conversation.id,
          sender: "ai",
          content: ackText,
          metadata: { synthetic: true, reason: "comprobante_received_ack" },
        })
        .catch((err) =>
          log.warn({ err }, "failed to persist comprobante ack mensaje"),
        );
      return {
        ok: true,
        acknowledgedAttachment: true,
        conversationId: conversation.id,
        latencyMs: Date.now() - t0,
      };
    }
    log.info("ignoring non-text message (not deposit_pending)");
    return { ok: false, ignored: true, reason: "non_text", latencyMs: Date.now() - t0 };
  }

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

  // Step 6 (preview): availability fetch — we eagerly start a 7-day window
  // starting today so Bloque 4 can show the AI a snapshot for context. The
  // tool handler will refetch with a narrower window when the AI commits to
  // a specific start_date. Cache TTL is 30s so this prefetch is essentially
  // free for the tool call that follows seconds later.
  const todayWita = wITAYmd();
  const rosterPromise = appsScriptService.fetchAvailability(sede, {
    date: todayWita,
    days: 7,
  });

  // Step 6: dynamic block + 5: 4-block prompt
  const detectedLanguage = detectLanguage(incomingText) ?? contact.language ?? undefined;
  // Resolve deposit currency from phone prefix per INSTRUCCIONES_PAGO §3.
  // null when prefix isn't in the table → AI prompts the client to choose.
  const suggestedCurrency = detectCurrencyFromPhone(contact.phone);
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
    suggestedCurrency,
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

    // Resolve which (date, slot) pairs need boat capacity for this program.
    const required = getRequiredSlots(input.programa, input.fundive_slot);
    if (!required) {
      return {
        ok: false,
        reason: "program_not_scheduled",
        message: `${input.programa} no tiene un patrón de barco definido — derivar a humano para confirmar disponibilidad.`,
      };
    }

    // Fetch a window covering the highest dayOffset.
    const windowDays = maxDayOffset(required) + 1;
    const fresh = await appsScriptService.fetchAvailability(sede, {
      date: input.start_date,
      days: windowDays,
    });
    if (!fresh) {
      return {
        ok: false,
        reason: "timeout",
        message: "El sistema de disponibilidad no respondió en el plazo permitido. Verificá con el equipo manualmente.",
      };
    }

    const detalleByDate = new Map(fresh.detalle.map((d) => [d.fecha, d]));
    // The Apps Script's "today" is whatever date matches its WITA clock —
    // we infer it from fecha_consultada which is the first day in the
    // requested window. If hora_actual_wita is on the same date, that's
    // today; if start_date is in the future, no time-cutoff needed.
    const todayWitaStr = wITAYmd();

    const slots: SlotVerdict[] = [];
    let allAvailable = true;

    for (const req of required) {
      const date = addDays(input.start_date, req.dayOffset);
      const dayDetail = detalleByDate.get(date);
      if (!dayDetail) {
        slots.push({ date, slot: req.slot, available: false, espacios: 0, reason: "missing_data" });
        allAvailable = false;
        continue;
      }
      const slotData =
        req.slot === "AM" ? dayDetail.turno_manana : dayDetail.turno_tarde;
      const espacios = slotData.espacios ?? 0;

      const bookable = bookableSlots(fresh.hora_actual_wita, todayWitaStr, date);
      if (!bookable.has(req.slot)) {
        slots.push({ date, slot: req.slot, available: false, espacios, reason: "past_today" });
        allAvailable = false;
        continue;
      }
      if (!slotData.disponible || espacios <= 0) {
        slots.push({ date, slot: req.slot, available: false, espacios, reason: "full" });
        allAvailable = false;
        continue;
      }
      slots.push({ date, slot: req.slot, available: true, espacios });
    }

    // Move pipeline forward — the AI is actively proposing dates.
    // Stamp programa + start_date onto lead_metadata so when the operator
    // later confirms the deposit, the panel handoff message can fill the
    // [PROGRAMA] / [FECHA] placeholders from the latest proposal
    // (INSTRUCCIONES_PAGO §7).
    void leadStageService
      .transition({
        conversacionId: conversation.id,
        to: "proposed",
        by: "ai",
        note: `consultar_disponibilidad ${input.programa} ${input.start_date}`,
        metadataPatch: {
          programa: input.programa,
          start_date: input.start_date,
        },
      })
      .catch(() => {});

    return {
      ok: true,
      programa: input.programa,
      startDate: input.start_date,
      horaActualWita: fresh.hora_actual_wita,
      available: allAvailable,
      slots,
      ...(fresh.primer_dia_disponible &&
      fresh.primer_dia_disponible !== input.start_date
        ? { alternativeStartDate: fresh.primer_dia_disponible }
        : {}),
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

  const enviarCatalogoHandler = async (
    input: EnviarCatalogoInput,
  ): Promise<EnviarCatalogoResult> => {
    if (input.sede_id !== sede.id) {
      log.warn(
        { claimed: input.sede_id, actual: sede.id },
        "enviar_catalogo sede_id mismatch — overriding to active sede",
      );
    }

    const entry = getCatalogEntry(sede.nombre, input.programa);
    if (!entry) {
      const message = describeMissingCatalog(sede.nombre, input.programa);
      log.info(
        { sede: sede.nombre, programa: input.programa },
        "enviar_catalogo: not configured — degrading to text",
      );
      return {
        ok: false,
        reason: "not_configured",
        message,
        programa: input.programa,
      };
    }

    try {
      await respondIoClient.sendCatalogMessage({
        conversationId:
          payload.conversation?.id ?? conversation.respondIoConversationId,
        contactId: payload.contact.id,
        payload: entry.payload,
      });

      // Mark the lead as proposed once the AI sends a specific program
      // card — this is the same intent signal as consultar_disponibilidad.
      void leadStageService
        .transition({
          conversacionId: conversation.id,
          to: "proposed",
          by: "ai",
          note: `enviar_catalogo ${input.programa}`,
        })
        .catch(() => {});

      return {
        ok: true,
        sent: true,
        programa: input.programa,
        catalogRef: entry.label,
      };
    } catch (err) {
      log.warn(
        {
          err: (err as Error).message,
          sede: sede.nombre,
          programa: input.programa,
        },
        "enviar_catalogo: send failed — AI will degrade to text",
      );
      return {
        ok: false,
        reason: "send_failed",
        message: (err as Error).message,
        programa: input.programa,
      };
    }
  };

  const claudeResult = await callClaude({
    system,
    messages,
    toolHandlers: {
      consultar_disponibilidad: consultarDisponibilidadHandler,
      solicitar_deposito: solicitarDepositoHandler,
      enviar_catalogo: enviarCatalogoHandler,
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
      contactId: payload.contact.id,
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

/**
 * Today's date as YYYY-MM-DD in Asia/Makassar (WITA, UTC+8). The Apps
 * Script reports `hora_actual_wita` in this zone, so the time-cutoff logic
 * needs the matching calendar date for the same wall clock.
 */
function wITAYmd(): string {
  // Use Intl in en-CA which produces YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Owner spec INSTRUCCIONES_PAGO §7 mensaje-comprobante-recibido. Sent the
 * moment a non-text message lands while the lead is in deposit_pending —
 * typically the customer's bank receipt. The actual OCR validation is not
 * implemented yet (Pieza 1 v1 launches with manual operator verification),
 * so this is a polite "wait while we check" placeholder.
 */
export function pickComprobanteAck(language: string | null): string {
  const lang = (language ?? "es").slice(0, 2).toLowerCase();
  if (lang === "en") {
    return "Got it, thanks 🙏 Let me confirm the transfer with the team and I'll get back to you in a few minutes.";
  }
  return "¡Recibido, gracias 🙏! Déjame confirmar la transferencia con el equipo y te aviso en unos minutos.";
}
