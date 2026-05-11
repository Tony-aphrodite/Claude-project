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
import { runOcrOnAttachment, type OcrVerdict } from "../services/ocr-comprobante.js";
import { pickFirstAttachment } from "../services/respond-io-attachment.js";
import {
  addDays,
  computeTurno,
  getRequiredSlots,
  isClosureDay,
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
        | "test_tag_missing"
        | "ai_silenced_post_handoff";
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
  // Respond.io does not retry. V2 webhook payloads (2026-05-10+) omit the
  // customFields, so we also accept channel-id-based identification when
  // Branch is missing.
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
  //
  // V2 webhook payloads omit `tags` on the contact; when the env requires
  // a tag and we got an empty tags array, we look the contact up via the
  // Respond.io REST API to make a confident decision.
  const requiredTag = loadEnv().PILOT_REQUIRE_TAG;
  if (requiredTag) {
    let tags: string[] = payload.contact.tags ?? [];
    if (tags.length === 0) {
      const fetched = await respondIoClient
        .getContact(payload.contact.id)
        .catch((err) => {
          log.warn({ err }, "respond_io get_contact failed during pilot gate — treating as untagged");
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

  // Non-text handling. Owner spec INSTRUCCIONES_PAGO §5 + §7. When the
  // client sends an image / PDF (typically a payment proof) while the
  // lead is in deposit_pending we:
  //   1. Run OCR (Anthropic Vision) to extract amount/currency/refCode.
  //   2. Reject screenshots in foreign currencies up-front (§5 rule).
  //   3. Persist verdict in lead_metadata.ocr_result for the panel.
  //   4. Acknowledge the customer with the §7 wording.
  // The operator still has the final word — a green AI verdict is a hint,
  // not an auto-confirm.
  if (!incomingText) {
    if (conversation.leadStage === "deposit_pending") {
      const meta = (conversation.leadMetadata as LeadMetadata | null) ?? null;
      const expected =
        meta?.ref_code && meta.deposit_amount && meta.deposit_currency
          ? {
              refCode: meta.ref_code,
              amount: meta.deposit_amount,
              currency: meta.deposit_currency,
            }
          : null;

      const attachment = pickFirstAttachment(payload.message);

      // Diagnostic logging — make the OCR decision path observable so we
      // can tell from logs alone whether OCR (a) actually ran, (b) was
      // skipped for lack of attachment, (c) was skipped for lack of
      // expected metadata. Before this log, OCR skips were silent and
      // ocr_result columns ended up NULL with no audit trail.
      log.info(
        {
          conversationId: conversation.id,
          hasAttachment: !!attachment,
          hasExpected: !!expected,
          metaRefCode: meta?.ref_code ?? null,
          metaAmount: meta?.deposit_amount ?? null,
          metaCurrency: meta?.deposit_currency ?? null,
        },
        "ocr decision",
      );

      let ocrVerdict: OcrVerdict | null = null;
      if (attachment && expected) {
        ocrVerdict = await runOcrOnAttachment({
          attachmentUrl: attachment.url,
          attachmentMime: attachment.mimeType,
          expected,
        });
        log.info(
          {
            conversationId: conversation.id,
            ocrOk: ocrVerdict.ok,
            ocrReason: ocrVerdict.ok ? null : ocrVerdict.reason,
            validated: ocrVerdict.ok ? ocrVerdict.validated : null,
          },
          "ocr verdict",
        );
      }

      // Pick the customer-facing message:
      //   - If we know we'll reject the screenshot for a foreign currency,
      //     send the §5 "ask for PDF" message instead of the generic ACK.
      //   - Otherwise use the §7 mensaje-comprobante-recibido.
      const language = contact.language ?? null;
      const screenshotRejected =
        ocrVerdict !== null && !ocrVerdict.ok && ocrVerdict.reason === "screenshot_rejected";
      const replyText = screenshotRejected
        ? pickScreenshotRejection(language)
        : pickComprobanteAck(language);

      try {
        await respondIoClient.sendMessage({
          conversationId: payload.conversation?.id ?? conversation.respondIoConversationId,
          contactId: payload.contact.id,
          text: replyText,
        });
      } catch (err) {
        log.error({ err }, "respond_io send failed during comprobante reply");
      }

      await getDb()
        .insert(mensajes)
        .values({
          conversacionId: conversation.id,
          sender: "ai",
          content: replyText,
          metadata: {
            synthetic: true,
            reason: screenshotRejected
              ? "comprobante_screenshot_rejected"
              : "comprobante_received_ack",
            ocr: ocrVerdict ?? undefined,
          },
        })
        .catch((err) =>
          log.warn({ err }, "failed to persist comprobante reply mensaje"),
        );

      // Stamp the OCR verdict onto lead_metadata so the panel can show it.
      // Owner spec DPM_AI_LAUNCH §3.4 (2026-05-07): when OCR validates the
      // PDF (ref + currency + amount within ±2% / ≤+10%), the AI auto-
      // confirms — no manual operator click. Mismatches (suspect amounts,
      // wrong ref, screenshot rejection) stay in deposit_pending and the
      // operator handles them through the panel.
      if (ocrVerdict) {
        const ocrSummary = ocrVerdict.ok
          ? {
              at: new Date().toISOString(),
              ok: true,
              validated: ocrVerdict.validated,
              mismatches: ocrVerdict.mismatches,
              extraction: ocrVerdict.extraction,
              attachmentMime: ocrVerdict.attachmentMime,
            }
          : {
              at: new Date().toISOString(),
              ok: false,
              reason: ocrVerdict.reason,
              attachmentMime: ocrVerdict.attachmentMime ?? null,
            };

        const autoConfirmed =
          ocrVerdict.ok === true && ocrVerdict.validated === true;

        const targetStage = autoConfirmed ? "deposit_paid" : "deposit_pending";

        await leadStageService
          .forceTransition({
            conversacionId: conversation.id,
            to: targetStage,
            by: "system",
            note: autoConfirmed
              ? "ocr_auto_confirmed"
              : `ocr_${ocrVerdict.ok ? "mismatched" : ocrVerdict.reason}`,
            metadataPatch: { ocr_result: ocrSummary },
          })
          .catch((err) =>
            log.warn({ err }, "ocr_result metadata patch failed"),
          );

        // Auto-confirm path. Owner spec DPM_AI_LAUNCH 2026-05-07 reply
        // §3 + §4: the post-venta workflow is wired in Respond.io and
        // dispatches snippets (gten_paperwork with sizes, predive_tips,
        // SSI app, location, accommodation) when it sees the
        // `deposit_paid` tag. Our server's job is to:
        //   1. Apply the `deposit_paid` tag (Miguel's workflow trigger)
        //   2. Push contact custom fields (programa / start_date / pax /
        //      monto / moneda / codigo_referencia) so the snippets render
        //      with real values via $contact.X
        //   3. Move the lead to handed_off so the panel reflects state
        //   4. Queue the gilit@dpmdiving.com notification
        // We DO NOT send a long confirmation message ourselves — that
        // would duplicate the snippets the workflow dispatches.
        if (autoConfirmed) {
          const meta = (conversation.leadMetadata as LeadMetadata | null) ?? null;

          // 1. Tag the contact — Respond.io workflow listens for this.
          try {
            await respondIoClient.addContactTag({
              contactId: payload.contact.id,
              tag: "deposit_paid",
            });
          } catch (err) {
            log.error({ err }, "respond_io add deposit_paid tag failed");
          }

          // 2. Push deposit-related fields onto the contact.
          void respondIoClient
            .updateContactCustomFields({
              contactId: payload.contact.id,
              fields: {
                monto: meta?.deposit_amount ?? "",
                moneda: meta?.deposit_currency ?? "",
                codigo_referencia: meta?.ref_code ?? "",
              },
            })
            .catch((err) =>
              log.warn({ err }, "respond_io update_custom_fields failed (auto-confirm)"),
            );

          // 3. Move lead to handed_off — operator panel mirrors state.
          await leadStageService
            .forceTransition({
              conversacionId: conversation.id,
              to: "handed_off",
              by: "system",
              note: "ocr_auto_handoff_after_deposit",
            })
            .catch((err) =>
              log.warn({ err }, "auto handoff transition failed"),
            );

          // 4. Queue gilit@dpmdiving.com notification (Wise-side already
          // active per §8; this is the in-AI redundancy).
          const targetEmail =
            loadEnv().HANDOFF_NOTIFICATION_EMAIL ?? "gilit@dpmdiving.com";
          await getDb()
            .insert(errores)
            .values({
              source: "internal",
              conversacionId: conversation.id,
              errorType: "handoff_email_pending",
              errorMessage: `Notify ${targetEmail}: deposit auto-confirmed by OCR`,
              context: {
                targetEmail,
                trigger: "ocr_auto_confirm",
                refCode: meta?.ref_code ?? null,
                program: meta?.programa ?? null,
                startDate: meta?.start_date ?? null,
                currency: meta?.deposit_currency ?? null,
                amount: meta?.deposit_amount ?? null,
                ocrExtraction: ocrVerdict.ok ? ocrVerdict.extraction : null,
              },
            })
            .catch((err) =>
              log.warn({ err }, "failed to queue ocr handoff email"),
            );
        }
      }

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

  // Hard guard: once a conversation has crossed into a post-handoff stage,
  // the AI must stay silent regardless of what the system prompt says.
  // The schema declares `handed_off — AI silenced; sede team owns the
  // thread`; we extend the silence to `deposit_paid` (payment confirmed,
  // workflow snippets are flying, AI must not interleave), `closed`
  // (booking finalized), and `lost` (dead lead). The customer message
  // is still persisted above so the panel timeline is complete; we
  // simply do not generate or send a reply.
  const POST_HANDOFF_STAGES = new Set([
    "deposit_paid",
    "handed_off",
    "closed",
    "lost",
  ]);
  if (POST_HANDOFF_STAGES.has(conversation.leadStage)) {
    log.info(
      {
        conversationId: conversation.id,
        leadStage: conversation.leadStage,
        contactId: payload.contact.id,
      },
      "ai silenced post handoff — message persisted, no reply generated",
    );
    return {
      ok: false,
      ignored: true,
      reason: "ai_silenced_post_handoff",
      branch: sede.nombre,
      latencyMs: Date.now() - t0,
    };
  }

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

    // Owner spec DPM_AI_LAUNCH §9 (2026-05-07): Gili Trawangan closes
    // Dec 25 + Jan 1. Reservations starting on those dates are rejected.
    // Programs spanning a closure day pause/resume on the operator side —
    // we surface the conflict so the AI offers the next day instead.
    const closureDates: string[] = [];
    const windowSpan = required.length === 0 ? 0 : maxDayOffset(required);
    for (let i = 0; i <= windowSpan; i++) {
      const d = addDays(input.start_date, i);
      if (isClosureDay(d)) closureDates.push(d);
    }
    if (closureDates.length > 0) {
      return {
        ok: false,
        reason: "program_not_scheduled",
        message: `El centro está cerrado el ${closureDates.join(", ")} (Navidad / Año Nuevo). Ofrecé al cliente empezar el día siguiente.`,
      };
    }

    // Programs that don't need any boat capacity (e.g. ReactRight, theory
    // only) skip the roster check entirely. Returning available=true with
    // empty slots tells the AI it can confirm any date.
    if (required.length === 0) {
      void leadStageService
        .transition({
          conversacionId: conversation.id,
          to: "proposed",
          by: "ai",
          note: `consultar_disponibilidad ${input.programa} ${input.start_date} (no boat)`,
          metadataPatch: {
            programa: input.programa,
            start_date: input.start_date,
          },
        })
        .catch(() => {});
      // Push to Respond.io contact custom fields so Miguel's Sheet
      // Logger picks them up. Best-effort — failures don't block.
      void respondIoClient
        .updateContactCustomFields({
          contactId: payload.contact.id,
          fields: {
            programa: input.programa,
            start_date: input.start_date,
          },
        })
        .catch((err) =>
          log.warn({ err }, "respond_io update_custom_fields failed (no-boat path)"),
        );
      return {
        ok: true,
        programa: input.programa,
        startDate: input.start_date,
        available: true,
        slots: [],
        notes: "Programa sin requerimiento de barco — cualquier fecha funciona, confirmá horario con la sede.",
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

    // Push to Respond.io contact custom fields (DPM_AI_LAUNCH 2026-05-07
    // §1: programa, turno, start_date for Miguel's Sheet Logger).
    void respondIoClient
      .updateContactCustomFields({
        contactId: payload.contact.id,
        fields: {
          programa: input.programa,
          turno: computeTurno(required) ?? "",
          start_date: input.start_date,
        },
      })
      .catch((err) =>
        log.warn({ err }, "respond_io update_custom_fields failed (proposed path)"),
      );

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

    // Push deposit-related fields to Respond.io contact (DPM_AI_LAUNCH
    // 2026-05-07 §2). The Sheet Logger reads from these the moment the
    // conversation closes — we don't have to coordinate further.
    void respondIoClient
      .updateContactCustomFields({
        contactId: payload.contact.id,
        fields: {
          monto,
          moneda: currency,
          codigo_referencia: refCode,
        },
      })
      .catch((err) =>
        log.warn({ err }, "respond_io update_custom_fields failed (deposit path)"),
      );

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

  // Step 9b: handoff signal handling. If the AI declared an escalation,
  // we (a) push the `motivo_escalation` custom field so the human team
  // sees the reason in the Respond.io contact card, and (b) apply the
  // `ai_escalation` tag — Miguel's "DPM GT - AI Escalation" workflow
  // listens for this tag and round-robins the conversation to an online
  // agent. Without the tag, the AI's "te conecto" sentence is just text
  // and nobody is paged. Best-effort: failures here must not block the
  // user reply we are about to send.
  if (claudeResult.escalationReason) {
    void respondIoClient
      .updateContactCustomFields({
        contactId: payload.contact.id,
        fields: { motivo_escalation: claudeResult.escalationReason },
      })
      .catch((err) =>
        log.warn({ err }, "respond_io update_custom_fields failed (motivo_escalation)"),
      );
    void respondIoClient
      .addContactTag({
        contactId: payload.contact.id,
        tag: "ai_escalation",
      })
      .catch((err) =>
        log.warn({ err }, "respond_io add_tag failed (ai_escalation)"),
      );
  }

  // Step 9c: descuento custom field. If the AI quoted (or confirmed
  // "Sin descuento" after negotiation), push the value so Miguel's Sheet
  // Logger captures it on conversation close. Anything >10% never reaches
  // here — it gets routed through escalation_reason=discount_over_10
  // instead.
  if (claudeResult.descuento) {
    void respondIoClient
      .updateContactCustomFields({
        contactId: payload.contact.id,
        fields: { descuento: claudeResult.descuento },
      })
      .catch((err) =>
        log.warn({ err }, "respond_io update_custom_fields failed (descuento)"),
      );
  }

  // Step 10: send back to Respond.io. Owner spec §flujo: the deposit
  // step must arrive as 3 separate WhatsApp bubbles (price, bank block,
  // closing question) — a single long bubble is hard to scan and the
  // bank block in particular needs to be copy-pasteable on its own. The
  // system prompt instructs Claude to emit a single `respuesta` string
  // separated by `\n\n---\n\n` (newline + 3 dashes + newline). We split
  // here and send each chunk sequentially. Single-segment text is just
  // one send — no marker, no behavior change.
  const MESSAGE_SEPARATOR = /\n\n---+\n\n/;
  const segments = claudeResult.text
    .split(MESSAGE_SEPARATOR)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  try {
    for (const segment of segments) {
      await respondIoClient.sendMessage({
        conversationId: payload.conversation?.id ?? conversation.respondIoConversationId,
        contactId: payload.contact.id,
        text: segment,
      });
    }
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
 * typically the customer's bank receipt. OCR runs in parallel; the verdict
 * lands in the panel for the operator to act on.
 */
export function pickComprobanteAck(language: string | null): string {
  const lang = (language ?? "es").slice(0, 2).toLowerCase();
  if (lang === "en") {
    return "Got it, thanks 🙏 Let me confirm the transfer with the team and I'll get back to you in a few minutes.";
  }
  return "¡Recibido, gracias 🙏! Déjame confirmar la transferencia con el equipo y te aviso en unos minutos.";
}

/**
 * Owner spec DPM_AI_LAUNCH §3.4 (2026-05-07): auto-confirmation message
 * sent when OCR validates the receipt. We chain it after the §7 ACK so the
 * customer sees "Got it" → "Confirmed". Mirrors the panel handoff text
 * structure (program + date + sizing + maps + check-in time + handoff
 * line) so the auto-flow matches what the operator would manually trigger.
 */
export function buildAutoConfirmedText(ctx: {
  programa: string | null;
  fecha: string | null;
  language: string | null;
}): string {
  const lang = (ctx.language ?? "es").slice(0, 2).toLowerCase();
  const isEn = lang === "en";
  const SCHOOL_MAPS_URL = "https://maps.app.goo.gl/9e7PLpg1WU8b8S9R9";
  const lead =
    ctx.programa && ctx.fecha
      ? isEn
        ? `Deposit confirmed ✅ Your spot is locked in for ${ctx.programa} on ${ctx.fecha}.`
        : `¡Depósito confirmado ✅! Tu lugar está reservado para ${ctx.programa} el ${ctx.fecha}.`
      : isEn
        ? "Deposit confirmed ✅ Your spot is locked in."
        : "¡Depósito confirmado ✅! Tu lugar está reservado.";

  if (isEn) {
    return [
      lead,
      "",
      "To finish your booking, please share:",
      "• Full name (as on your ID)",
      "• T-shirt size (XS to 4XL)",
      "• European shoe size",
      "",
      `Also, please drop by the school the day before your program between 8am and 6pm for registration. Here's the location: ${SCHOOL_MAPS_URL}`,
      "",
      "My colleague from Gili Trawangan will message you shortly to coordinate the rest 🤿",
    ].join("\n");
  }
  return [
    lead,
    "",
    "Para terminar la reserva, mandame por favor:",
    "• Nombre completo (como figura en tu documento)",
    "• Talla de camiseta (XS a 4XL)",
    "• Talla de calzado europeo",
    "",
    `Además, pasá por la escuela el día anterior a tu programa entre 8am y 6pm para el registro. La ubicación: ${SCHOOL_MAPS_URL}`,
    "",
    "Mi compañero/a de Gili Trawangan te escribe en breve para coordinar el resto 🤿",
  ].join("\n");
}

/**
 * Owner spec INSTRUCCIONES_PAGO §5 §screenshot-rechazo. Sent when the
 * customer attaches an image (screenshot) but the deposit currency is
 * EUR/GBP/AUD/USD — for foreign transfers the bank must produce a real PDF.
 */
export function pickScreenshotRejection(language: string | null): string {
  const lang = (language ?? "es").slice(0, 2).toLowerCase();
  if (lang === "en") {
    return 'Thanks 🙏 Could you share the bank confirmation as a PDF instead of a screenshot? Most banks have a "Download" or "Export PDF" option in the transaction details. We need the PDF to validate the transfer properly.';
  }
  return 'Gracias 🙏 ¿Podés compartir la confirmación del banco en PDF en vez de captura? La mayoría de los bancos tienen una opción "Descargar" o "Exportar PDF" en los detalles de la transacción. Necesitamos el PDF para validar la transferencia correctamente.';
}
