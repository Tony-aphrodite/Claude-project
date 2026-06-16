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
  AvailabilityProgram,
  ConsultarDisponibilidadInput,
  ConsultarDisponibilidadResult,
  DepositCurrency,
  EnviarCatalogoInput,
  EnviarCatalogoResult,
  LeadMetadata,
  RespondIoIncomingMessage,
  SendProductCardInput,
  SendProductCardResult,
  SlotVerdict,
  SolicitarDepositoInput,
  SolicitarDepositoResult,
  TurnoKey,
} from "@dpm/shared";
import { depositAmountFor } from "@dpm/shared";

import { and, eq, sql as drizzleSql } from "drizzle-orm";
import { conversaciones, errores, getDb, mensajes, type Sede } from "@dpm/db";

import { getAiAssigneeIds, isAiAssignee, loadEnv, resolveHandoffEmail } from "../env.js";
import { callClaude } from "../services/anthropic.js";
import { appsScriptService } from "../services/apps-script.js";
import { bookableSlots } from "../services/bookable-slots.js";
import {
  ALT_SCAN_DAYS_FORWARD,
  buildDetalleMap,
  findVerifiedAlternativeStartDates,
  validateRequiredSlots,
} from "../services/slot-validator.js";
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
  sedeSupportsCurrency,
  supportedCurrenciesForSede,
  type SedeKey,
} from "../services/deposit-instructions.js";
import { followUpProcessor } from "../services/follow-up.js";
import { sendMetaProductCard } from "../services/meta-whatsapp.js";
import { rosterDbService } from "../services/roster-db.js";
import { salesLoggerService } from "../services/sales-logger.js";
import {
  agenteCierreFor,
  formatSaleTimestamp,
  marketingAttributionFor,
  programaDisplayName,
  splitContactName,
} from "../services/sales-logger-mapping.js";
import { detectLanguage, languageLabelToIso2 } from "../services/language.js";
import { isNewTopicAfterHandoff } from "../services/new-topic-detector.js";
import { leadStageService } from "../services/lead-stage.js";
import { buildFourBlockPrompt } from "../services/prompt-builder.js";
import { promptsService } from "../services/prompts.js";
import { respondIoClient } from "../services/respond-io.js";
import { AI_ENABLED_SEDE_NAMES_CONST, sedeService } from "../services/sede.js";
import { getSedeBehavior } from "../services/sede-behavior.js";
import {
  generateRefCode,
  isValidRefCode,
} from "../tools/solicitar-deposito.js";
import { validateProductCardIds } from "../tools/send-product-card.js";

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
        | "ai_silenced_post_handoff"
        | "ai_silenced_human_assignee"
        | "sede_selector_button";
      branch?: string | null;
      latencyMs: number;
    }
  | {
      ok: true;
      acknowledgedAttachment: true;
      conversationId: string;
      latencyMs: number;
    };

// Per-conversation lock that serializes AI processing. Tony 2026-06-16 Bug 1:
// when a customer sends two short turns back-to-back ("AM", "Hace 5 días"),
// each fires its own webhook → its own processIncomingMessage invocation →
// they race through history load + Claude call in parallel. Result: 2-3
// near-identical replies because each invocation reads a history snapshot
// that doesn't yet contain the other invocation's AI message.
//
// Fix: a Map<conversationId, Promise<void>> that the AI-call section of
// each invocation awaits before proceeding. The second invocation waits
// until the first finishes (its AI message is persisted), then re-reads
// history and processes with full context — naturally producing a
// follow-up reply instead of a duplicate.
//
// PP-safe: PP threads that don't send rapid turns hit the lock with
// nothing in flight (no-op fast path). Only conversations with true
// parallel activity see the serialization.
const convAiLock = new Map<string, Promise<void>>();

export async function processIncomingMessage(
  payload: RespondIoIncomingMessage,
  log: FastifyBaseLogger,
): Promise<ProcessResult> {
  const t0 = Date.now();

  const incomingText = (payload.message.text ?? "").trim();

  // Step 1: Bienvenida sede-selector button click skip (Tony rule 2026-06-16).
  //
  // The welcome workflow shows a sede picker as quick-reply buttons. The
  // customer's click is delivered to us as a regular incoming text message
  // whose body is exactly the sede name ("Gili Air", "Koh Phi Phi", ...).
  // Letting the AI process this:
  //   1. Triggers a greeting reply, which seeds priorAiCount=1 BEFORE the
  //      workflow has finished its routing — when the workflow then assigns
  //      a human (Alba/Grecia/Fabiola), contact-state-event classifies it
  //      as a real takeover and silences the AI permanently.
  //   2. Has no semantic value for the customer — the workflow already
  //      sends a "Genial, enseguida estaremos contigo" confirmation.
  // We skip the click here. The post-pick sede AI greeting is driven by
  // contact-state-event.maybeSendWorkflowAutoWelcome (fires on the
  // workflow's assignee.updated event AFTER Branch has been set on the
  // contact).
  if (
    incomingText &&
    (AI_ENABLED_SEDE_NAMES_CONST as readonly string[]).includes(incomingText)
  ) {
    log.info(
      { contactId: payload.contact.id, text: incomingText },
      "skipped: text matches sede name (bienvenida button click) — letting workflow handle",
    );
    return {
      ok: false,
      ignored: true,
      reason: "sede_selector_button",
      latencyMs: Date.now() - t0,
    };
  }

  // Step 2: Pilot gate. The Branch contact field decides which sede this
  // message belongs to. Two AI-enabled sedes are accepted: Gili Trawangan
  // (John) and Gili Air (Colomba). Other sedes / empty go back to the
  // human flow — return 200 so Respond.io does not retry.
  //
  // V2 webhook payloads (2026-05-10+) frequently OMIT customFields from
  // the contact body, so reading Branch off payload.contact alone would
  // miss it and fall through to the channel-id default (GT) every time.
  // To avoid silently misrouting GA contacts, when the payload's
  // customFields are missing we eagerly fetch the contact from Respond.io
  // and overlay the real custom_fields into the contact body before
  // resolution. Cheap: getContact is a single GET we'd do later anyway
  // for the test-tag gate; doing it here too just hits the same cached
  // path.
  // Always read Branch from a FRESH GET to Respond.io rather than trusting
  // the webhook payload. Two failure modes the payload-trust path hits:
  //   1. v2 webhooks frequently OMIT customFields entirely → readBranchField
  //      returns null → channel-id fallback → GT default. Misroutes GA.
  //   2. The payload arrives with a STALE Branch value: when an operator
  //      changes Branch in Respond.io and the customer's next message
  //      fires the webhook within a few seconds, Respond.io occasionally
  //      ships the pre-change snapshot. The race is small but real and
  //      it locks the conversation to the wrong sede.
  // Cost: one extra GET per inbound. We're already doing this GET for
  // the test-tag gate a few lines below so it's effectively free —
  // moving it up just reuses the same call.
  let contactForResolution = payload.contact;
  const fetchedFresh = await respondIoClient
    .getContact(payload.contact.id)
    .catch((err) => {
      log.warn(
        { err: (err as Error).message, contactId: payload.contact.id },
        "respond_io get_contact failed before sede resolution — falling back to payload",
      );
      return null;
    });
  if (fetchedFresh?.customFields) {
    contactForResolution = {
      ...payload.contact,
      customFields: fetchedFresh.customFields,
      tags: fetchedFresh.tags ?? payload.contact.tags,
    };
  }

  const resolution = await sedeService.resolveForPilot(
    contactForResolution,
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
  //
  // 2026-06-03 fix (C2 — persist-before-gate): the original gate returned
  // here without persisting the customer message. Miguel's June-3 test
  // surfaced the consequence: a brand-new lead's first "Hola" arrives
  // BEFORE Respond.io's workflow has applied the sede tag, so the gate
  // rejected it. The next message ("Koh Phi Phi" button click) passed
  // the gate (tag now applied) but Francisco had no Spanish context in
  // history → replied in English. Fix: even when gated, persist the
  // contact + conversation + message so the next turn's history carries
  // the original language signal. We still suppress the AI reply for
  // gated messages — that's the gate's job.
  // Pilot gate (2026-06-15): PILOT_REQUIRE_TAG accepts a CSV of allowed
  // pilot sedes. The gate matches against EITHER a contact tag OR the
  // contact's Branch (i.e. the resolved sede name) — Miguel's workflows
  // currently set Branch reliably but only sometimes apply the matching
  // tag, so requiring both would block legit traffic. Whitespace around
  // commas is tolerated. Empty string / unset = gate disabled.
  //
  // Example: "Koh Phi Phi,Gili Air" — pilot is open to PP and GA contacts
  // (whether identified by tag or by Branch=Gili Air). KT/GT/NP contacts
  // fall through to the gate-rejected branch.
  const requiredTagRaw = loadEnv().PILOT_REQUIRE_TAG;
  const requiredTags = requiredTagRaw
    ? requiredTagRaw.split(",").map((t) => t.trim()).filter((t) => t.length > 0)
    : [];
  let gateRejected = false;
  if (requiredTags.length > 0) {
    // Reuse tags from the pre-resolution fetch when possible. fetchedFresh
    // was populated a few lines above (used for sede Branch lookup); it
    // also carries the canonical tag list. Falling back to payload.contact
    // or a fresh GET only when the prior fetch failed.
    let tags: string[] =
      fetchedFresh?.tags ?? payload.contact.tags ?? [];
    if (tags.length === 0 && !fetchedFresh) {
      const fetched = await respondIoClient
        .getContact(payload.contact.id)
        .catch((err) => {
          log.warn({ err }, "respond_io get_contact failed during pilot gate — treating as untagged");
          return null;
        });
      tags = fetched?.tags ?? [];
    }
    const matchedByTag = requiredTags.some((t) => tags.includes(t));
    const matchedByBranch = requiredTags.includes(sede.nombre);
    if (!matchedByTag && !matchedByBranch) {
      gateRejected = true;
      log.info(
        {
          contactId: payload.contact.id,
          requiredTags,
          contactTags: tags,
          sede: sede.nombre,
        },
        "test gate rejected — contact lacks required tag and Branch not in allowed sedes",
      );
    }
  }

  // Step 2b: contact upsert. This is the canonical store for per-person data;
  // the conversation row only carries a foreign key. Runs whether the gate
  // passed or not, so history is preserved for the next-message correction.
  // Wrapped in try/catch (C2 safety per adversarial review) so a transient
  // DB failure here doesn't crash the gate-rejection path.
  let contact;
  let conversation;
  try {
    contact = await chatContactsService.upsertFromWebhook({
      respondIoContactId: payload.contact.id,
      phone: payload.contact.phone,
      name: payload.contact.name,
      language: payload.contact.language,
      tags: payload.contact.tags,
      sedeId: sede.id,
    });

    // Step 3: conversation upsert + history
    conversation = await conversationService.upsertOnInbound({
      respondIoConversationId: payload.conversation?.id ?? `tmp_${contact.respondIoContactId}`,
      respondIoContactId: contact.respondIoContactId,
      sedeId: sede.id,
    });
  } catch (err) {
    log.error(
      { err, contactId: payload.contact.id, gateRejected },
      "contact/conversation upsert failed — falling through",
    );
    // If the upsert failed AND we were going to reject anyway, return now.
    // If the upsert failed but the gate would have passed, we can't proceed
    // safely (no conversation row), so rethrow.
    if (gateRejected) {
      return {
        ok: false,
        ignored: true,
        reason: "test_tag_missing",
        branch: resolution.via === "branch" ? sede.nombre : null,
        latencyMs: Date.now() - t0,
      };
    }
    throw err;
  }

  // If the gate rejected, persist the customer's message as conversation
  // history (so the language signal survives for the next turn) and exit
  // without invoking the AI. The dedup gate downstream uses messageId, so
  // a duplicate "Hola" delivery is correctly skipped on retry.
  if (gateRejected) {
    // appendInboundMessage takes a flat metadata object — all keys at the
    // top level. Mark gated so panel/diags can filter, but keep the
    // message text in history so the next non-gated turn has the
    // language signal.
    await conversationService
      .appendInboundMessage(conversation.id, incomingText, {
        respondIoMessageId: payload.message.messageId,
        gated: true,
        gateReason: "test_tag_missing",
      })
      .catch((err) =>
        log.warn({ err, conversationId: conversation.id }, "gated inbound persist failed"),
      );
    return {
      ok: false,
      ignored: true,
      reason: "test_tag_missing",
      branch: resolution.via === "branch" ? sede.nombre : null,
      latencyMs: Date.now() - t0,
    };
  }

  // Idempotency gate for both text AND attachment paths. Respond.io
  // re-delivers the same `messageId` (wamid) on its own retry policy when
  // it doesn't get a snappy 2xx, and the OCR call below can take 8-15s
  // which sometimes trips that timer. Without this check up-front, a
  // single PDF upload could fire OCR + comprobante-ack multiple times —
  // Miguel saw 4 duplicate acks for one PDF 2026-05-11. We move the
  // check above the non-text branch so both paths share it.
  const incomingMessageIdForDedup = payload.message.messageId;
  if (incomingMessageIdForDedup) {
    const existingDup = await conversationService.findByRespondIoMessageId(
      conversation.id,
      incomingMessageIdForDedup,
    );
    if (existingDup) {
      log.info(
        {
          conversationId: conversation.id,
          respondIoMessageId: incomingMessageIdForDedup,
          existingMensajeId: existingDup.id,
          path: incomingText ? "text" : "attachment",
        },
        "duplicate inbound message — skipping (pre-branch)",
      );
      return {
        ok: true,
        duplicate: true,
        conversationId: conversation.id,
        respondIoMessageId: incomingMessageIdForDedup,
        latencyMs: Date.now() - t0,
      };
    }
  }

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
    // Persist the inbound attachment as a mensaje row before any side
    // effects, so the pre-branch idempotency check above can match on
    // subsequent retries of the same wamid. content is a small marker
    // string (the actual file lives at attachment.url) and the
    // respondIoMessageId is stamped on metadata so findByRespondIoMessageId
    // works the same way as for text messages.
    if (incomingMessageIdForDedup) {
      const att = pickFirstAttachment(payload.message);
      await conversationService
        .appendInboundMessage(
          conversation.id,
          att
            ? `[attachment:${att.mimeType ?? "unknown"}]`
            : "[non-text message]",
          {
            respondIoMessageId: incomingMessageIdForDedup,
            attachmentUrl: att?.url ?? null,
            attachmentMime: att?.mimeType ?? null,
          },
        )
        .catch((err) =>
          log.warn({ err }, "failed to persist inbound attachment mensaje"),
        );
    }

    // OCR path eligibility — broadened 2026-06-16 PM after Tony observed
    // the Bug 4 fallback ACK shadowing the OCR path. The original check
    // was strictly `leadStage === "deposit_pending"`. If the
    // `solicitar_deposito` tool's stage transition was rejected (it logs
    // a warn but still returns the bank instructions to the customer),
    // the conv could end up with deposit metadata stamped on
    // lead_metadata but leadStage NOT in "deposit_pending" — the
    // ref_code/amount/currency are all there, the customer transferred
    // and sent the PDF, but the PDF lands here, fails the strict check,
    // gets a generic "Recibí tu archivo" ACK, and the OCR pipeline
    // never runs. Fix: if the deposit triplet (ref_code + amount +
    // currency) is fully stamped, treat the conv as deposit_pending
    // for routing purposes.
    const _depositMeta = (conversation.leadMetadata as LeadMetadata | null) ?? null;
    const hasDepositTriplet =
      !!_depositMeta?.ref_code &&
      !!_depositMeta?.deposit_currency &&
      !!(_depositMeta?.deposit_amount_total ?? _depositMeta?.deposit_amount);
    if (conversation.leadStage === "deposit_pending" || hasDepositTriplet) {
      if (conversation.leadStage !== "deposit_pending" && hasDepositTriplet) {
        log.info(
          { conversationId: conversation.id, leadStage: conversation.leadStage },
          "OCR path: leadStage not deposit_pending but deposit triplet stamped — routing to OCR (broadened check 2026-06-16)",
        );
      }
      const meta = (conversation.leadMetadata as LeadMetadata | null) ?? null;
      // OCR target amount is the TOTAL (pax × per-person). Falls back to
      // per-person for legacy conversations that don't have
      // deposit_amount_total set — those were created before 2026-05-12 so
      // they pre-date the fix; the fallback keeps them working at the
      // (acknowledged) risk of accepting a 1-pax PDF on a multi-pax booking.
      const expectedAmount = meta?.deposit_amount_total ?? meta?.deposit_amount;
      const expected =
        meta?.ref_code && expectedAmount && meta.deposit_currency
          ? {
              refCode: meta.ref_code,
              amount: expectedAmount,
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

      // Beneficiary name per currency (KB-03 INSTRUCCIONES_PAGO). Used as
      // a strong fallback signal when the customer didn't include the
      // ref code in their bank's Libellé / Concept / Reference field.
      const EXPECTED_BENEFICIARY_BY_CURRENCY: Record<string, string> = {
        EUR: "DPM Diving Gili T LLC",
        GBP: "DPM Diving Gili T LLC",
        AUD: "DPM Diving Gili T LLC",
        USD: "Dpm Diving",
        IDR: "Dalam Professional Menyelam",
      };
      const expectedBeneficiary = expected
        ? EXPECTED_BENEFICIARY_BY_CURRENCY[expected.currency] ?? undefined
        : undefined;

      let ocrVerdict: OcrVerdict | null = null;
      if (attachment && expected) {
        ocrVerdict = await runOcrOnAttachment({
          attachmentUrl: attachment.url,
          attachmentMime: attachment.mimeType,
          expected,
          expectedBeneficiary,
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
      // Auto-confirm rules retuned 2026-05-13 per Miguel feedback (see
      // 5-13-feedback-deposit-autoconfirm-spec.md):
      //   - Validate on currency match + amount within ±5 % / ≤+10 %.
      //   - Ref code is informational only — extracted + reported in
      //     mismatches for audit but does not gate validation, because
      //     >50 % of real customers never paste the DPM code into the
      //     bank's Concept/Libellé field.
      //   - Screenshots are accepted for all currencies (previously
      //     hard-rejected for EUR/GBP/AUD/USD).
      // The safety net for the looser gate is the auto-confirm dashboard
      // (Phase B, separate work): operators cross-reference auto-confirmed
      // rows against the Wise/Mandiri bank emails landing in
      // gilit@dpmdiving.com.
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

        // ── Phase 2 roster — atomic booking write on auto-confirm ──────
        //
        // When the OCR validates the deposit, write one roster_bookings row
        // per (fecha = start_date + dayOffset, turno = slot) from the
        // required_slots stamped by consultar_disponibilidad earlier.
        // Idempotent: if lead_metadata.roster_booking_ids is already
        // populated (re-OCR / re-validation case), skip the write.
        //
        // Race-safe: confirmBooking uses SERIALIZABLE transaction + recomputes
        // capacity − reserved inside the txn. If overbooked (concurrent
        // confirmation collided), we log a warning but still let the lead
        // sit at deposit_paid — Patrick/operator reviews from the panel
        // and decides whether to refund or accommodate.
        //
        // 2026-06-04 (Phase 2 of "el roster vive dentro del AI", Miguel
        // architectural pivot).
        if (autoConfirmed) {
          const freshMeta =
            (conversation.leadMetadata as LeadMetadata | null) ?? {};
          const alreadyWritten =
            Array.isArray(freshMeta.roster_booking_ids) &&
            freshMeta.roster_booking_ids.length > 0;
          const startDate = freshMeta.start_date;
          const programa = freshMeta.programa;
          const pax = freshMeta.pax;
          const requiredSlots = freshMeta.required_slots;

          if (alreadyWritten) {
            log.info(
              {
                convId: conversation.id,
                existingBookingIds: freshMeta.roster_booking_ids,
              },
              "roster_db: skip — bookings already confirmed for this conversation",
            );
          } else if (
            !startDate ||
            !programa ||
            !pax ||
            !Array.isArray(requiredSlots) ||
            requiredSlots.length === 0
          ) {
            log.warn(
              {
                convId: conversation.id,
                hasStartDate: !!startDate,
                hasPrograma: !!programa,
                hasPax: !!pax,
                requiredSlotCount: Array.isArray(requiredSlots)
                  ? requiredSlots.length
                  : 0,
              },
              "roster_db: skip — booking metadata incomplete (AI never finalized programa/start_date via consultar_disponibilidad)",
            );
          } else {
            const insertedIds: string[] = [];
            for (const slot of requiredSlots) {
              const fecha = addDays(startDate, slot.dayOffset);
              const result = await rosterDbService.confirmBooking({
                sedeId: sede.id,
                fecha,
                turno: slot.slot,
                programa,
                pax,
                conversacionId: conversation.id,
                contactId: payload.contact.id,
              });
              if (result.ok) {
                insertedIds.push(result.booking.id);
                log.info(
                  {
                    convId: conversation.id,
                    bookingId: result.booking.id,
                    fecha,
                    turno: slot.slot,
                    programa,
                    pax,
                  },
                  "roster_db: booking written on OCR auto-confirm",
                );
              } else {
                log.warn(
                  {
                    convId: conversation.id,
                    fecha,
                    turno: slot.slot,
                    programa,
                    pax,
                    reason: result.reason,
                    ...(result.reason === "overbooked"
                      ? {
                          available: result.available,
                          capacity: result.capacity,
                          reserved: result.reserved,
                        }
                      : {}),
                  },
                  "roster_db: booking refused — operator review needed",
                );
              }
            }
            if (insertedIds.length > 0) {
              await leadStageService
                .transition({
                  conversacionId: conversation.id,
                  to: "deposit_paid",
                  by: "system",
                  note: `roster_bookings written: ${insertedIds.length}`,
                  metadataPatch: { roster_booking_ids: insertedIds },
                })
                .catch((err) =>
                  log.warn(
                    { err },
                    "roster_booking_ids metadata patch failed (non-blocking)",
                  ),
                );
            }
          }
        }

        // OCR rejection auto-message for clear cases (5-12-feedback follow-up).
        // When the verdict is validated=false AND the mismatch is unambiguous
        // (currency wrong / amount way off), send a specific message so the
        // customer knows what to fix without waiting for human review. Stays
        // silent on ambiguous mismatches (ref-code typo, amount within
        // ±20% — could be bank fees) to preserve the operator-decides path.
        if (
          ocrVerdict.ok === true &&
          ocrVerdict.validated === false &&
          expected
        ) {
          const mismatchMessage = pickOcrMismatchMessage(
            ocrVerdict,
            expected.amount,
            expected.currency,
            language,
          );
          if (mismatchMessage) {
            try {
              await respondIoClient.sendMessage({
                conversationId:
                  payload.conversation?.id ?? conversation.respondIoConversationId,
                contactId: payload.contact.id,
                text: mismatchMessage,
              });
              await getDb()
                .insert(mensajes)
                .values({
                  conversacionId: conversation.id,
                  sender: "ai",
                  content: mismatchMessage,
                  metadata: {
                    synthetic: true,
                    reason: "ocr_mismatch_auto_message",
                    mismatches: ocrVerdict.mismatches,
                  },
                })
                .catch((err) =>
                  log.warn({ err }, "failed to persist ocr_mismatch mensaje"),
                );
              log.info(
                {
                  convId: conversation.id,
                  mismatches: ocrVerdict.mismatches,
                },
                "ocr mismatch auto-message sent",
              );
            } catch (err) {
              log.warn({ err }, "ocr mismatch auto-message send failed");
            }
          }
        }

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

          // 1. Push deposit-related fields AND Branch BEFORE the tag. Miguel's
          //    "DPM GT - Onboarding Piloto" workflow trigger is `Etiqueta de
          //    contacto actualizada` and Rama #2 filters on
          //    `Branch tiene cualquiera de "Gili Trawangan"`. If Branch is
          //    unset (v2 webhooks omit customFields, so via=channel contacts
          //    never had Branch written) the workflow fires but the branch
          //    condition fails and the 7 onboarding snippets never dispatch.
          //    We MUST await this so the tag-update event sees Branch=GT.
          try {
            await respondIoClient.updateContactCustomFields({
              contactId: payload.contact.id,
              fields: {
                sede: sede.nombre,
                // Pass null for missing values; the client filters them out
                // so we don't blow away the field with an empty string.
                monto: meta?.deposit_amount ?? null,
                moneda: meta?.deposit_currency ?? null,
                codigo_referencia: meta?.ref_code ?? null,
                programa: meta?.programa ?? null,
                start_date: meta?.start_date ?? null,
              },
            });
          } catch (err) {
            log.warn({ err }, "respond_io update_custom_fields failed (auto-confirm) — proceeding to tag anyway");
          }

          // 2. Tag the contact — Respond.io workflow listens for this.
          //    Tag-update events fire on a DIFF, not on tag presence. If
          //    deposit_paid is already pegged from an earlier test or a
          //    manual retest, our PUT looks like a no-op and the workflow
          //    sees nothing (§7 in 5-12-feedback). Forcing a remove → add
          //    cycle guarantees a fresh "tag added" event so the
          //    Onboarding Piloto workflow fires regardless of prior state.
          try {
            await respondIoClient.removeContactTag({
              contactId: payload.contact.id,
              tag: "deposit_paid",
            });
          } catch (err) {
            log.warn({ err }, "respond_io remove deposit_paid (pre-refresh) failed — proceeding to add anyway");
          }
          try {
            await respondIoClient.addContactTag({
              contactId: payload.contact.id,
              tag: "deposit_paid",
            });
          } catch (err) {
            log.error({ err }, "respond_io add deposit_paid tag failed");
          }

          // 3. Move lead to deposit_paid (or handed_off if the sede has no
          //    post-purchase grace window). Sedes with a grace > 0 stay in
          //    deposit_paid for `behavior.postPurchaseGraceMinutes` so the
          //    AI keeps handling immediate logistics questions ("where do
          //    we meet?", "what should I bring?"). The grace-expiry
          //    scanner transitions them to handed_off when the window
          //    ends. handoff_human escalations during the grace window
          //    bypass this and silence the AI immediately.
          const sedeBehavior = await getSedeBehavior(sede.id);
          const targetAutoStage =
            sedeBehavior.postPurchaseGraceMinutes > 0
              ? ("deposit_paid" as const)
              : ("handed_off" as const);
          await leadStageService
            .forceTransition({
              conversacionId: conversation.id,
              to: targetAutoStage,
              by: "system",
              note:
                targetAutoStage === "handed_off"
                  ? "ocr_auto_handoff_after_deposit"
                  : "ocr_deposit_paid_grace_started",
            })
            .catch((err) =>
              log.warn({ err }, "auto handoff transition failed"),
            );

          // ─── close_sale: write rows to DPM_Ventas_Master ─────────────
          // Miguel rule 2026-06-06: one row PER PROGRAM. Each row carries
          // its program-specific ref code + agent="Francisco" so the
          // master sheet can filter AI-vs-human. Idempotent via
          // leadMetadata.sale_logged_at_by_program. Failures DON'T block
          // the rest of the post-deposit flow — the panel will surface a
          // "manual log needed" row from the errores table.
          try {
            await logSaleRowsForBooking({
              sede,
              conversation,
              contact: payload.contact,
              log,
            });
          } catch (err) {
            log.warn(
              { err: (err as Error).message },
              "close_sale auto-fire failed — manual log required",
            );
          }

          // 4. Queue gilit@dpmdiving.com notification (Wise-side already
          // active per §8; this is the in-AI redundancy).
          const targetEmail = resolveHandoffEmail(log);
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
    // Non-text message arrived but the conv isn't in deposit_pending — most
    // commonly because the AI hasn't yet invoked `solicitar_deposito` (the
    // tool that transitions the stage and stamps the expected amount). Bug
    // 4 (Tony 2026-06-16 GA pilot): the customer uploaded a PDF receipt
    // and the AI went silent because this branch returned ignored without
    // any reply. Customer reads it as "se paró ahí".
    //
    // Fix: send a localized acknowledgment so the customer knows the file
    // arrived. We deliberately DO NOT run OCR or change lead_stage — the
    // expected metadata isn't there yet, and we'd be guessing the amount
    // / currency. Operator (or a follow-up AI turn) handles the rest.
    //
    // PP-safe: PP threads that correctly hit `solicitar_deposito` enter
    // the deposit_pending block above and never reach this branch; their
    // OCR path is unchanged. Only previously-silent flows are affected.
    const fallbackAck = pickPreDepositAttachmentAck(contact.language ?? null);
    try {
      await respondIoClient.sendMessage({
        conversationId: payload.conversation?.id ?? conversation.respondIoConversationId,
        contactId: payload.contact.id,
        text: fallbackAck,
      });
    } catch (err) {
      log.error(
        { err: (err as Error).message },
        "respond_io send failed during pre-deposit attachment ack",
      );
    }
    await getDb()
      .insert(mensajes)
      .values({
        conversacionId: conversation.id,
        sender: "ai",
        content: fallbackAck,
        metadata: {
          synthetic: true,
          reason: "attachment_pre_deposit_ack",
          leadStageAtArrival: conversation.leadStage,
        },
      })
      .catch((err) =>
        log.warn(
          { err: (err as Error).message },
          "failed to persist pre-deposit attachment ack mensaje",
        ),
      );
    log.info(
      { conversationId: conversation.id, leadStage: conversation.leadStage },
      "non-text message acknowledged outside deposit_pending (Bug 4 fallback)",
    );
    return {
      ok: true,
      acknowledgedAttachment: true,
      conversationId: conversation.id,
      latencyMs: Date.now() - t0,
    };
  }

  // Idempotency was already gated above (before the non-text branch) so by
  // the time we get here we know this is a fresh wamid. Persist the text
  // message with the same metadata shape the dedup check expects, so a
  // late-arriving Respond.io retry of THIS same wamid would hit the
  // pre-branch check next time.
  const incomingMessageId = incomingMessageIdForDedup;
  await conversationService.appendInboundMessage(conversation.id, incomingText, {
    respondIoMessageId: incomingMessageId,
  });

  // Client just replied — cancel any open follow-ups for this conversation.
  // Don't await: it's a side-effect that must not slow the main response.
  followUpProcessor
    .cancelOpenFollowUpsForConversation(conversation.id, "client_responded")
    .catch((err) => log.warn({ err }, "follow-up cancel-on-reply failed"));

  // ────────────────────────────────────────────────────────────────────────
  // Human-takeover hard silence (Miguel rule 2026-06-05):
  // "si un agente humano hace take over, no volver a interferir".
  //
  // Two complementary signals — first one to fire wins:
  //  (a) The persisted flag `leadMetadata.human_took_over` set by the
  //      `conversation.assignee.changed` webhook handler. Authoritative.
  //  (b) Inline payload check: the incoming message envelope sometimes
  //      carries `conversation.assignee` directly. Useful for the race
  //      condition where the customer's next message arrives BEFORE the
  //      assignee.changed webhook fires (Respond.io doesn't guarantee
  //      ordering between message + state webhooks).
  //
  // When either trips, the message is still persisted above (panel
  // timeline stays complete) but the AI does not generate or send a reply.
  // ────────────────────────────────────────────────────────────────────────
  const persistedHumanTookOver =
    (conversation.leadMetadata as LeadMetadata | null)?.human_took_over === true;
  if (persistedHumanTookOver) {
    log.info(
      {
        conversationId: conversation.id,
        contactId: payload.contact.id,
      },
      "ai silenced — human_took_over flag set (Miguel rule)",
    );
    return {
      ok: false,
      ignored: true,
      reason: "ai_silenced_human_assignee",
      latencyMs: Date.now() - t0,
    };
  }
  const incomingAssignee = payload.conversation?.assignee;
  // Multi-AI support (2026-06-15): the guard accepts any id in the union
  // of singular RESPOND_IO_AI_ASSIGNEE_ID + CSV RESPOND_IO_AI_ASSIGNEE_IDS.
  // Per-sede production added Colomba AI (GA), Emma (KT), etc. as separate
  // Respond.io users on top of the original Francisco Emilio AI (PP).
  const aiAssigneeIdsForGuard = getAiAssigneeIds();
  const hasAiConfigured = aiAssigneeIdsForGuard.length > 0;

  // "Takeover only counts if the AI was actually engaged" (2026-06-15).
  // Miguel's workflow auto-assigns new leads to Fabiola Ramos (human) BEFORE
  // the AI gets a chance to send the first message. Without this guard,
  // every brand-new GA/KT/GT/NP conversation would be flagged as a takeover
  // on the very first inbound, the human_took_over flag would stamp itself,
  // and the AI would stay silent forever even if the operator never
  // intended to take over. Real takeover semantics only make sense once
  // the AI has actually replied at least once — until then, a human
  // assignee is a workflow setup choice, not a takeover.
  //
  // Cost: one COUNT query against mensajes; only runs when the inline or
  // active-GET checks would otherwise silence the AI (i.e. when the
  // assignee is a human). For conversations already taken over (Layer 1
  // catches them earlier) or normal AI-assigned threads, this never fires.
  const conversationHasAiActivity = async (): Promise<boolean> => {
    const [row] = await getDb()
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(mensajes)
      .where(
        and(
          eq(mensajes.conversacionId, conversation.id),
          eq(mensajes.sender, "ai"),
        ),
      );
    return (row?.count ?? 0) > 0;
  };

  if (incomingAssignee !== undefined && incomingAssignee !== null && incomingAssignee !== "") {
    // assignee from webhook is a string; coerce both sides to string for compare.
    const isAi = isAiAssignee(incomingAssignee);
    if (!isAi) {
      const hadAiActivity = await conversationHasAiActivity();
      if (!hadAiActivity) {
        log.info(
          {
            conversationId: conversation.id,
            contactId: payload.contact.id,
            incomingAssignee,
          },
          "human assignee on inbound, but no prior AI activity — treating as workflow misconfig, proceeding without silencing",
        );
        // Fall through to normal processing; do NOT stamp human_took_over.
      } else {
        log.info(
          {
            conversationId: conversation.id,
            contactId: payload.contact.id,
            incomingAssignee,
          },
          "ai silenced — inbound payload shows human assignee (race-cover before assignee.changed webhook)",
        );
        // Best-effort: stamp the flag so subsequent messages skip the inline
        // check too. Fire-and-forget so we still bail fast on this one.
        void getDb()
          .update(conversaciones)
          .set({
            leadMetadata: {
              ...((conversation.leadMetadata as LeadMetadata | null) ?? {}),
              human_took_over: true,
              human_took_over_at: new Date().toISOString(),
              human_took_over_by: String(incomingAssignee),
            },
            updatedAt: new Date(),
          })
          .where(eq(conversaciones.id, conversation.id))
          .catch((err) =>
            log.warn({ err: (err as Error).message }, "human_took_over flag stamp failed"),
          );
        return {
          ok: false,
          ignored: true,
          reason: "ai_silenced_human_assignee",
          latencyMs: Date.now() - t0,
        };
      }
    }
  } else if (hasAiConfigured) {
    // THIRD defense layer (Miguel test 2026-06-07 — "AI sigue contestando"
    // even when a human took over).
    //
    // The first two checks (persisted flag + inline payload assignee) both
    // rely on Respond.io reliably sending events:
    //   • Flag → depends on `conversation.assignee.changed` webhook firing
    //     AND our handler processing it before the next inbound message.
    //   • Inline payload → depends on Respond.io including `conversation.
    //     assignee` in the regular message webhook (which it OMITS in many
    //     v2 payloads).
    //
    // When BOTH fail, the AI used to respond + steal the conversation back.
    // This 3rd layer actively GETs the current assignee from Respond.io
    // and silences if a human has it. Cost: +150ms per inbound message
    // when the inline check didn't already fire. Worth it for trust:
    // operators MUST be able to take over and have AI shut up.
    const currentAssignee = await respondIoClient
      .getConversationAssignee({ contactId: payload.contact.id })
      .catch(() => null);
    if (
      currentAssignee?.assigneeId &&
      !isAiAssignee(currentAssignee.assigneeId)
    ) {
      // Same "no AI activity = no takeover" guard as the inline check above.
      // The active GET can return a human assignee on a brand-new thread
      // simply because the workflow auto-assigned to one before the AI
      // had a chance.
      const hadAiActivity = await conversationHasAiActivity();
      if (!hadAiActivity) {
        log.info(
          {
            conversationId: conversation.id,
            contactId: payload.contact.id,
            currentAssigneeId: currentAssignee.assigneeId,
          },
          "active GET shows human assignee, but no prior AI activity — treating as workflow misconfig, proceeding without silencing",
        );
        // Fall through to normal processing; do NOT stamp human_took_over.
      } else {
        log.info(
          {
            conversationId: conversation.id,
            contactId: payload.contact.id,
            currentAssigneeId: currentAssignee.assigneeId,
          },
          "ai silenced — active GET confirms human assignee (3rd defense layer)",
        );
        // Stamp the flag so subsequent messages skip the GET (faster path).
        void getDb()
          .update(conversaciones)
          .set({
            leadMetadata: {
              ...((conversation.leadMetadata as LeadMetadata | null) ?? {}),
              human_took_over: true,
              human_took_over_at: new Date().toISOString(),
              human_took_over_by: String(currentAssignee.assigneeId),
            },
            updatedAt: new Date(),
          })
          .where(eq(conversaciones.id, conversation.id))
          .catch((err) =>
            log.warn(
              { err: (err as Error).message },
              "human_took_over flag stamp failed (after GET)",
            ),
          );
        return {
          ok: false,
          ignored: true,
          reason: "ai_silenced_human_assignee",
          latencyMs: Date.now() - t0,
        };
      }
    }
  }

  // Hard guard: once a conversation has crossed into a post-handoff stage,
  // the AI must stay silent regardless of what the system prompt says.
  // The schema declares `handed_off — AI silenced; sede team owns the
  // thread`; we extend the silence to `deposit_paid` (payment confirmed,
  // workflow snippets are flying, AI must not interleave), `closed`
  // (booking finalized), and `lost` (dead lead). The customer message
  // is still persisted above so the panel timeline is complete; we
  // simply do not generate or send a reply.
  //
  // 2026-05-12 follow-up: the silence breaks a real use case Miguel
  // demonstrated — booked OW, came back hours later to ask about night
  // dives. With the guard always on, the AI never replied. The
  // `isNewTopicAfterHandoff` heuristic now lets the AI re-engage IF the
  // message clearly looks like a new inquiry (intent keyword + length +
  // time gap). Conservative thresholds tilt toward staying silent on
  // ambiguous messages so a quick "thanks!" never wakes the AI back up
  // mid-onboarding-workflow.
  //
  // 2026-05-26: per-sede post-purchase grace window. Sedes with
  // `behavior_config.post_purchase_grace_minutes > 0` (e.g. Phi Phi)
  // intentionally KEEP `lead_stage = deposit_paid` for `grace_minutes`
  // after the deposit lands so the AI can keep handling logistics
  // questions (meeting point, what to bring, timing). During the grace
  // window the guard short-circuits and processing continues normally.
  // The grace-expiry scanner transitions to handed_off when the window
  // ends; `handoff_human` escalations bypass the grace and silence the
  // AI immediately.
  const POST_HANDOFF_STAGES = new Set([
    "deposit_paid",
    "handed_off",
    "closed",
    "lost",
  ]);
  if (POST_HANDOFF_STAGES.has(conversation.leadStage)) {
    // Check the post-purchase grace window first: if we're inside it for
    // a `deposit_paid` conversation, allow the AI through without even
    // running the new-topic heuristic — every customer question during
    // grace is in-scope (logistics for the just-confirmed booking).
    //
    // Within the grace window there's a smaller "start-delay" sub-window
    // right after deposit_paid (sede.postPurchaseStartDelaySeconds) where
    // the AI STAYS SILENT so that any Respond.io onboarding workflow
    // message (e.g. the bilingual welcome that lands at ~+60s) is the
    // first thing the customer reads after paying. Once that delay
    // elapses the AI takes over for logistics questions until the grace
    // window expires.
    const insideGraceWindow = await (async () => {
      if (conversation.leadStage !== "deposit_paid") return false;
      if (!conversation.sedeId) return false;
      const behavior = await getSedeBehavior(conversation.sedeId);
      if (behavior.postPurchaseGraceMinutes <= 0) return false;
      const startedAt = conversation.leadStageChangedAt;
      if (!startedAt) return false;
      const elapsedMs = Date.now() - startedAt.getTime();
      const delayMs = behavior.postPurchaseStartDelaySeconds * 1000;
      // Onboarding-protect sub-window — silence the AI so the workflow
      // message reaches the customer first.
      if (elapsedMs < delayMs) return false;
      return elapsedMs <= behavior.postPurchaseGraceMinutes * 60_000;
    })();
    if (insideGraceWindow) {
      log.info(
        {
          conversationId: conversation.id,
          leadStage: conversation.leadStage,
          contactId: payload.contact.id,
        },
        "ai active in post-purchase grace window — proceeding with reply",
      );
    } else {
      // Miguel rule 2026-06-05: if the silence is driven by a HUMAN
      // takeover (not the AI's own escalation), skip the new-topic
      // re-engagement heuristic — "no volver a interferir" is absolute.
      // The flag-based fast-return above normally catches this case;
      // we leave the check here as defense-in-depth in case lead_stage
      // is handed_off via takeover but the flag got cleared by an
      // operator unassign-then-leave-stuck-in-handed_off sequence.
      const meta = conversation.leadMetadata as LeadMetadata | null;
      const isNewTopic = meta?.human_took_over === true
        ? false
        : isNewTopicAfterHandoff({
            text: incomingText,
            leadStageChangedAt: conversation.leadStageChangedAt ?? null,
          });
      if (!isNewTopic) {
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
          latencyMs: Date.now() - t0,
        };
      }
      log.info(
        {
          conversationId: conversation.id,
          leadStage: conversation.leadStage,
          contactId: payload.contact.id,
        },
        "ai re-engaging after handoff — new-topic heuristic matched",
      );
    }
  }

  // Acquire the per-conv AI lock (Bug 1, re-fixed 2026-06-16 PM after
  // Tony observed the original fix still produced 3 parallel replies).
  //
  // First attempt had a race: every waiter read the SAME prior lock,
  // awaited it, then ALL woke up simultaneously and overwrote each
  // other's lock entries. Net effect was no serialization for
  // pile-on traffic.
  //
  // Correct pattern is a queue chain — install MY lock into the map
  // BEFORE awaiting the previous one. The next invocation that comes
  // in will see MY lock, not the lock I'm waiting on, so it chains
  // behind me. Result is a linear queue rather than a stampede.
  let releaseAiLock: () => void = () => {};
  const myAiLock = new Promise<void>((resolve) => {
    releaseAiLock = resolve;
  });
  const prevAiLock = convAiLock.get(conversation.id);
  convAiLock.set(conversation.id, myAiLock); // install BEFORE await
  if (prevAiLock) {
    log.info(
      { conversationId: conversation.id },
      "ai lock: waiting for in-flight AI invocation on this conv (Bug 1 serialization)",
    );
    await prevAiLock.catch(() => {});
  }

  try {

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
  // Slice 3a (2026-06-05): PP cuts over to DB-backed roster. Other sedes
  // continue to read from Apps Script until each cuts over individually.
  // The flag is per-sede in rosterConfig.use_db_roster — when true we
  // skip Apps Script entirely and pull capacity/bookings from our DB.
  const useDbRoster =
    (sede.rosterConfig as { use_db_roster?: boolean } | null)?.use_db_roster ===
    true;
  // Tony perf feedback 2026-06-07: prefetch window reduced 7→3 days.
  // Bloque 4 only needs a few days of snapshot context for Claude to
  // understand "what's the current state". 7 days was overkill — for
  // sedes still on Apps Script it meant pulling 7 days of data on EVERY
  // inbound message even though most messages don't need it. 3-day
  // window is half the latency while still giving Claude useful
  // context for short-term suggestions. The tool handler does its
  // own targeted fetch when AI commits to a specific date, so this
  // prefetch is purely for prompt context.
  const PREFETCH_DAYS = 3;
  const rosterPromise = useDbRoster
    ? rosterDbService
        .fetchAvailability(sede.id, { date: todayWita, days: PREFETCH_DAYS })
        .then((r) => r)
        .catch((err) => {
          log.warn(
            { err: (err as Error).message, sede: sede.nombre },
            "roster_db fetchAvailability failed (prefetch) — falling back to Apps Script",
          );
          return appsScriptService.fetchAvailability(sede, {
            date: todayWita,
            days: PREFETCH_DAYS,
          });
        })
    : appsScriptService.fetchAvailability(sede, {
        date: todayWita,
        days: PREFETCH_DAYS,
      });

  // Step 6: dynamic block + 5: 4-block prompt
  //
  // 2026-05-19 (Entry #12): removed the `?? contact.language` fallback.
  // It used to inherit Respond.io's persisted language tag when franc
  // couldn't detect from short messages, but a single franc
  // misclassification (Spanish-without-accents → PT) would write "pt"
  // to contact.language and then every subsequent short message
  // ("sí", "ok") fell back to that polluted value as a HARD anchor,
  // keeping the AI in PT until a long Spanish turn arrived. The AI
  // already has the full conversation history in Bloque 3 — when
  // franc can't decide, the prompt-builder's soft anchor lets the AI
  // maintain language continuity from history instead of from a
  // pollutable external variable. See language.ts header for the
  // matching detection-side PT-grapheme guard.
  // Short-greeting bias for messages too short for franc (<60 chars
  // threshold). Without this, a customer that writes just "Hello" gets
  // detectedLanguage=undefined → prompt-builder falls to its generic
  // (Spanish-worded) instruction → Claude defaults to Spanish because
  // the rest of the prompt is mostly Spanish (Miguel test 2026-06-02).
  // We only catch UNAMBIGUOUS single-word greetings so a longer
  // multi-word message still goes through franc normally.
  const SHORT_GREETING_EN = /^(hi|hello|hey|good\s+(morning|afternoon|evening|night)|yo|sup|howdy|greetings)[\s,.!?]*$/i;
  const SHORT_GREETING_ES = /^(hola|buenas|buen[oa]s?\s+(d[ií]as|tardes|noches|noche)|qué\s+tal|que\s+tal)[\s,.!?]*$/i;
  let detectedLanguage = detectLanguage(incomingText) ?? undefined;
  if (!detectedLanguage) {
    const trimmed = incomingText.trim();
    if (SHORT_GREETING_EN.test(trimmed)) detectedLanguage = "english";
    else if (SHORT_GREETING_ES.test(trimmed)) detectedLanguage = "español";
  }
  // ISO-639-1 code (e.g. "es", "en") for Respond.io's contact.language
  // field. Pushed through updateContactCustomFields so Miguel's
  // "DPM GT - Onboarding Piloto" workflow routes Spanish-speaking
  // customers to Rama 1 (Spanish) instead of falling through to Otra
  // (English fallback). Tony's 2026-05-11 test got the English chain
  // even though he wrote Spanish, because contact.language was empty —
  // this push fixes that for real customers from message 1 forward.
  // Returns null when the detection didn't fire (text < 60 chars) so
  // we never overwrite an existing value with a guess.
  const detectedLanguageIso = languageLabelToIso2(detectedLanguage ?? null);
  // Resolve deposit currency from phone prefix per INSTRUCCIONES_PAGO §3.
  // null when prefix isn't in the table → AI prompts the client to choose.
  const suggestedCurrency = detectCurrencyFromPhone(contact.phone);
  const prefetchT0 = Date.now();
  const roster = await rosterPromise;
  log.info(
    {
      conversationId: conversation.id,
      prefetchLatencyMs: Date.now() - prefetchT0,
      prefetchDays: PREFETCH_DAYS,
      useDbRoster,
    },
    "PERF prefetch roster complete",
  );

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
            pax: input.pax,
          },
        })
        .catch(() => {});
      // Push to Respond.io contact custom fields so Miguel's Sheet
      // Logger picks them up. Best-effort — failures don't block.
      void respondIoClient
        .updateContactCustomFields({
          contactId: payload.contact.id,
          fields: {
            sede: sede.nombre,
            programa: input.programa,
            start_date: input.start_date,
            pax: input.pax,
            // Early populate moneda from phone-prefix hint so the operations
            // team sees a likely currency before the deposit is requested.
            // Null when the prefix isn't in the table — we leave the field
            // untouched in that case rather than guess.
            ...(suggestedCurrency ? { moneda: suggestedCurrency } : {}),
          },
          language: detectedLanguageIso ?? undefined,
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
    //
    // 2026-05-18: forward pax + programa + mode to the Apps Script so the
    // Koh Tao v2 roster script can filter slots by group size / course
    // type / consecutive-window. Older sede scripts (pre-v2) silently
    // ignore unknown params, so this is safe everywhere. See
    // information/16-information-koh-tao/ROSTER_SCRIPT_v2_NOTES.md for
    // the contract and the AOW→Advanced / RescueDiver→Rescue mapping
    // open question.
    // Miguel rule 2026-06-05 (OW June 22→23 hallucination): fetch a wider
    // window than strictly needed so that when the requested start_date
    // fails, we can scan forward for VERIFIED alternative start dates the
    // AI may propose without a second tool call. The base window covers
    // the program's max day offset; the extra ALT_SCAN_DAYS_FORWARD days
    // give the scanner room to find up to ALT_SCAN_RESULT_LIMIT viable
    // starts. Cost = one larger Apps Script / DB call per consult; benefit
    // = AI can never fabricate an unverified date.
    const baseWindow = maxDayOffset(required) + 1;
    const windowDays = baseWindow + ALT_SCAN_DAYS_FORWARD;
    // Slice 3a (2026-06-05): same per-sede flag as the prefetch above. PP
    // uses DB-backed roster; other sedes read Apps Script until cut over.
    const useDbRosterTool =
      (sede.rosterConfig as { use_db_roster?: boolean } | null)
        ?.use_db_roster === true;
    // Tony perf feedback 2026-06-07: log roster fetch latency to identify
    // bottleneck (Apps Script call can be 10s+ with 30-day window).
    const rosterFetchT0 = Date.now();
    let fresh = useDbRosterTool
      ? await rosterDbService
          .fetchAvailability(sede.id, {
            date: input.start_date,
            days: windowDays,
          })
          .catch((err) => {
            log.warn(
              { err: (err as Error).message, sede: sede.nombre },
              "roster_db fetchAvailability failed (tool) — falling back to Apps Script",
            );
            return null;
          })
      : null;
    if (!fresh) {
      fresh = await appsScriptService.fetchAvailability(sede, {
        date: input.start_date,
        days: windowDays,
        pax: input.pax,
        curso: input.programa,
        mode: windowDays > 1 ? "range" : "single",
      });
    }
    log.info(
      {
        sedeId: sede.id,
        sedeNombre: sede.nombre,
        programa: input.programa,
        windowDays,
        useDbRosterTool,
        rosterFetchLatencyMs: Date.now() - rosterFetchT0,
        rosterFetchOk: fresh !== null,
      },
      "PERF roster fetch complete",
    );
    if (!fresh) {
      return {
        ok: false,
        reason: "timeout",
        message: "El sistema de disponibilidad no respondió en el plazo permitido. Verificá con el equipo manualmente.",
      };
    }

    // Out-of-scope handoff from Miguel's v3/v4 .gs: course is not
    // bookable through availability (Divemaster/Instructor at any
    // sede). The AI must NOT confirm or quote — it must follow the
    // prompt's escalation path. We surface the structured payload so
    // the AI sees exactly which accion to take (capturar_numero_y_derivar
    // for KT/NP/PP/GA, derivar_a_sede for GT) plus the office phone or
    // target sede. See MIGUEL_FEEDBACK_LOG entries #1-#5 for the
    // prompt-side counterpart of this rule.
    if (fresh.out_of_scope === true) {
      const accion = fresh.accion ?? "capturar_numero_y_derivar";
      const notes =
        accion === "derivar_a_sede"
          ? `Curso fuera del scope de esta sede — derivar al cliente a ${
              fresh.derivar_a_sede ?? "otra sede DPM"
            }. Seguir el flujo del prompt §escalar (excepción Divemaster/Instructor).`
          : `Curso fuera del scope de la AI — pedir contacto al cliente (número/nombre/email según prompt de la sede) y derivar a oficina ${
              fresh.oficina_tel ?? ""
            }. NO cotizar precio ni disponibilidad.${
              fresh.proximamente
                ? ' El curso aún no se imparte aquí — usar framing "próximamente / coming soon".'
                : ""
            }`;
      return {
        ok: true,
        programa: input.programa,
        startDate: input.start_date,
        available: false,
        slots: [],
        outOfScope: {
          accion,
          ...(fresh.oficina_tel ? { oficinaTel: fresh.oficina_tel } : {}),
          ...(fresh.derivar_a_sede
            ? { derivarASede: fresh.derivar_a_sede }
            : {}),
          ...(typeof fresh.proximamente === "boolean"
            ? { proximamente: fresh.proximamente }
            : {}),
        },
        notes,
      };
    }

    const detalleByDate = buildDetalleMap(fresh);
    // The Apps Script's "today" is whatever date matches its WITA clock —
    // we infer it from fecha_consultada which is the first day in the
    // requested window. If hora_actual_wita is on the same date, that's
    // today; if start_date is in the future, no time-cutoff needed.
    const todayWitaStr = wITAYmd();

    const validation = validateRequiredSlots({
      required,
      detalleByDate,
      horaActualWita: fresh.hora_actual_wita,
      todayWitaStr,
      startDate: input.start_date,
      pax: input.pax,
    });
    const { slots, allAvailable } = validation;

    // Miguel rule 2026-06-05: when the requested start_date is NOT
    // available, the AI MUST NOT invent an alternative. Compute the
    // verified list here so the AI has fact-checked options to choose
    // from. When `available=true`, no need to scan — caller wants this
    // date and we already confirmed it works.
    const verifiedAlternativeStartDates = allAvailable
      ? []
      : findVerifiedAlternativeStartDates({
          programa: input.programa,
          fundiveSlot: input.fundive_slot,
          fromDate: input.start_date,
          detalleByDate,
          horaActualWita: fresh.hora_actual_wita,
          todayWitaStr,
          pax: input.pax,
        });

    // Move pipeline forward — the AI is actively proposing dates.
    // Stamp programa + start_date + required_slots onto lead_metadata so
    // when the OCR-validation path later confirms the deposit, the
    // process-message hook has the data needed to write atomic
    // roster_bookings rows (Phase 2 roster, 2026-06-04). Also used by the
    // panel handoff message to fill [PROGRAMA] / [FECHA] in the spec
    // template (INSTRUCCIONES_PAGO §7).
    void leadStageService
      .transition({
        conversacionId: conversation.id,
        to: "proposed",
        by: "ai",
        note: `consultar_disponibilidad ${input.programa} ${input.start_date}`,
        metadataPatch: {
          programa: input.programa,
          start_date: input.start_date,
          pax: input.pax,
          required_slots: required.map((r) => ({
            dayOffset: r.dayOffset,
            slot: r.slot,
          })),
        },
      })
      .catch(() => {});

    // Push to Respond.io contact custom fields (DPM_AI_LAUNCH 2026-05-07
    // §1: programa, turno, start_date for Miguel's Sheet Logger).
    void respondIoClient
      .updateContactCustomFields({
        contactId: payload.contact.id,
        fields: {
          sede: sede.nombre,
          programa: input.programa,
          turno: computeTurno(required) ?? "",
          start_date: input.start_date,
          pax: input.pax,
          // Early moneda from phone-prefix hint (see no-boat path above).
          ...(suggestedCurrency ? { moneda: suggestedCurrency } : {}),
        },
        language: detectedLanguageIso ?? undefined,
      })
      .catch((err) =>
        log.warn({ err }, "respond_io update_custom_fields failed (proposed path)"),
      );

    const failingSlots = validation.failingSlots;
    return {
      ok: true,
      programa: input.programa,
      startDate: input.start_date,
      horaActualWita: fresh.hora_actual_wita,
      available: allAvailable,
      slots,
      ...(failingSlots.length > 0 ? { failingSlots } : {}),
      ...(verifiedAlternativeStartDates.length > 0
        ? { verifiedAlternativeStartDates }
        : {}),
      ...(fresh.primer_dia_disponible &&
      fresh.primer_dia_disponible !== input.start_date
        ? { alternativeStartDate: fresh.primer_dia_disponible }
        : {}),
      // v2 rollout (Miguel 2026-05-19): the .gs returns offset_dias
      // when its 14-day forward search had to walk past the requested
      // date. Surfacing it lets the AI compose precise replies
      // ("el día que pediste no entraba, te ofrezco 2 días después").
      // Older scripts don't return the field — `?? undefined` keeps
      // the property off the result entirely in that case.
      ...(typeof fresh.offset_dias === "number" && fresh.offset_dias > 0
        ? { offsetDias: fresh.offset_dias }
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

    // ────────────────────────────────────────────────────────────────────
    // Miguel rule 2026-06-05 (Part C, server-side guard): before we touch
    // any state, RE-VALIDATE that the (programa, start_date) the AI
    // committed to via consultar_disponibilidad still has every required
    // slot available. Catches two failure modes:
    //   1. AI hallucinated an alternative start_date that was never
    //      actually verified (the OW June 22→23 incident).
    //   2. Race: between consultar_disponibilidad and solicitar_deposito,
    //      another customer took the last seat on a required day.
    //
    // The guard is silent when the prior consult succeeded AND the data
    // is still fresh; it only fires (and rejects the booking) when
    // re-validation shows a real conflict. We surface verified
    // alternatives in the rejection payload so the AI can pivot the
    // customer to a date that actually works, without another tool call.
    // ────────────────────────────────────────────────────────────────────
    const preflightMeta =
      (conversation.leadMetadata as LeadMetadata | null) ?? null;
    const preflightPrograma = preflightMeta?.programa;
    const preflightStartDate = preflightMeta?.start_date;
    if (!preflightPrograma || !preflightStartDate) {
      return {
        ok: false,
        reason: "booking_not_finalized",
        message:
          "El AI no completó consultar_disponibilidad antes de pedir el depósito. Llamá esa tool primero con el programa y fecha de inicio del cliente.",
      };
    }
    const preflightRequired = getRequiredSlots(
      preflightPrograma as AvailabilityProgram,
      undefined, // fundive_slot stamped only when relevant; default no-op
    );
    if (preflightRequired && preflightRequired.length > 0) {
      const preflightWindow =
        maxDayOffset(preflightRequired) + 1 + ALT_SCAN_DAYS_FORWARD;
      const useDbRosterDeposit =
        (sede.rosterConfig as { use_db_roster?: boolean } | null)
          ?.use_db_roster === true;
      let preflightFresh = useDbRosterDeposit
        ? await rosterDbService
            .fetchAvailability(sede.id, {
              date: preflightStartDate,
              days: preflightWindow,
            })
            .catch((err) => {
              log.warn(
                { err: (err as Error).message },
                "roster_db preflight failed — falling back to Apps Script",
              );
              return null;
            })
        : null;
      if (!preflightFresh) {
        preflightFresh = await appsScriptService.fetchAvailability(sede, {
          date: preflightStartDate,
          days: preflightWindow,
          pax: input.pax,
          curso: preflightPrograma,
          mode: preflightWindow > 1 ? "range" : "single",
        });
      }
      if (preflightFresh) {
        const preflightDetalle = buildDetalleMap(preflightFresh);
        const todayWita = wITAYmd();
        const preflightVerdict = validateRequiredSlots({
          required: preflightRequired,
          detalleByDate: preflightDetalle,
          horaActualWita: preflightFresh.hora_actual_wita,
          todayWitaStr: todayWita,
          startDate: preflightStartDate,
          pax: input.pax,
        });
        if (!preflightVerdict.allAvailable) {
          // Re-check failed — either AI proposed a date it never verified
          // (Miguel's exact bug) or someone took the seat. Compute fresh
          // alternatives so the AI has a fact-checked answer ready.
          const verifiedAlternativeStartDates = findVerifiedAlternativeStartDates({
            programa: preflightPrograma as AvailabilityProgram,
            fundiveSlot: undefined,
            fromDate: preflightStartDate,
            detalleByDate: preflightDetalle,
            horaActualWita: preflightFresh.hora_actual_wita,
            todayWitaStr: todayWita,
            pax: input.pax,
          });
          log.warn(
            {
              conversationId: conversation.id,
              programa: preflightPrograma,
              startDate: preflightStartDate,
              failingSlots: preflightVerdict.failingSlots,
              alternativeCount: verifiedAlternativeStartDates.length,
            },
            "solicitar_deposito rejected — required slots no longer available (Miguel rule 2026-06-05)",
          );
          return {
            ok: false,
            reason: "slot_unavailable",
            message:
              "Antes de confirmar el depósito, re-verifiqué la disponibilidad y uno o más días del programa ya no tienen lugar. NO confirmes el depósito — disculpate con el cliente y ofrecé una fecha alternativa de la lista verificada.",
            failingSlots: preflightVerdict.failingSlots,
            ...(verifiedAlternativeStartDates.length > 0
              ? { verifiedAlternativeStartDates }
              : {}),
          };
        }
      } else {
        // Roster fetch failed AND we had no fallback. We err on the side
        // of safety: reject the booking rather than proceed with stale
        // data. The AI must re-try consultar_disponibilidad which will
        // surface the timeout to the customer with the prompt's mandated
        // "verifying with team" reply.
        log.warn(
          { sedeId: sede.id, startDate: preflightStartDate },
          "solicitar_deposito preflight roster fetch returned null — rejecting to avoid stale booking",
        );
        return {
          ok: false,
          reason: "slot_unavailable",
          message:
            "No pude re-verificar disponibilidad antes del depósito (sistema de roster no respondió). Volvé a llamar consultar_disponibilidad para confirmar antes de pedir la seña.",
        };
      }
    }
    // ────────────────────────────────────────────────────────────────────

    // Per-sede currency support (Miguel rules 2026-06-16, audit):
    //   • NP rejects USD ("no usa cuenta en dólares")
    //   • KT rejects IDR (Thailand)
    //   • GA supports USD by silently sharing KT's CFSB account
    //   • PP/GT support their full matrix
    // If the AI invoked the tool with an unsupported currency, refuse
    // BEFORE we generate a ref code or stamp lead_metadata — the
    // customer would receive bank details for the wrong sede/entity
    // and the deposit would land in an unreachable account.
    const requestedCurrency = input.moneda_cliente as DepositCurrency;
    if (!sedeSupportsCurrency(sede.nombre, requestedCurrency)) {
      const supported = supportedCurrenciesForSede(sede.nombre);
      log.warn(
        {
          sede: sede.nombre,
          requestedCurrency,
          supported,
        },
        "solicitar_deposito rejected — sede does not support this currency",
      );
      return {
        ok: false,
        reason: "sede_currency_not_supported",
        message: `La sede ${sede.nombre} no acepta ${requestedCurrency}. Monedas soportadas: ${supported.join(", ")}. Preguntá al cliente con cuál de esas prefiere y volvé a invocar solicitar_deposito.`,
      };
    }

    // Block IDR for clients without an Indonesian bank account. We can't
    // verify that from the AI side, so we trust the client's claim — but
    // we record the decision in lead_metadata for audit.
    const currency = requestedCurrency;
    const monto = depositAmountFor(currency); // per-person, e.g. 40 EUR
    const pax = input.pax;
    // Total amount the customer should transfer. OCR validates the PDF
    // against this number (incident 2026-05-12: a 40 EUR PDF auto-confirmed
    // a 2-pax booking that required 80 EUR — root cause was OCR comparing
    // the per-person amount instead of the booking total).
    const montoTotal = monto * pax;

    // Reuse the existing reference code if this conversation already has
    // one (owner spec — never mint twice for the same lead). We look at
    // lead_metadata.ref_code as the canonical store.
    const existingMeta =
      (conversation.leadMetadata as LeadMetadata | null) ?? null;
    const existingRefCode =
      existingMeta?.ref_code && isValidRefCode(existingMeta.ref_code)
        ? existingMeta.ref_code
        : null;
    const existingRefCodesByProgram = existingMeta?.ref_codes_by_program ?? null;
    const reused = existingRefCode !== null;

    // Miguel rule 2026-06-06: multi-program bookings get ONE ref code per
    // program. Resolve the program list from (priority order):
    //   1. input.programas (AI explicitly passed it)
    //   2. existing ref_codes_by_program keys (reuse on retry/idempotency)
    //   3. existing leadMetadata.programa (singular field stamped by
    //      consultar_disponibilidad) → single-program booking
    //   4. unknown → single code, no per-program mapping (legacy behavior)
    let programaList: string[] = [];
    if (input.programas && input.programas.length > 0) {
      // Dedup while preserving order — multi-pax same program collapses.
      const seen = new Set<string>();
      for (const p of input.programas) {
        if (!seen.has(p)) {
          seen.add(p);
          programaList.push(p);
        }
      }
    } else if (existingRefCodesByProgram) {
      programaList = Object.keys(existingRefCodesByProgram);
    } else if (existingMeta?.programa) {
      programaList = [existingMeta.programa];
    }

    // Generate codes. Reuse existing ones (the never-mint-twice rule) by
    // program key, then mint new codes for any program without one.
    // Miguel 2026-06-06: pass sede.nombre so the code carries the correct
    // 2-letter sede prefix (PP/GT/GA/KT/NP) instead of legacy "GT".
    //
    // Miguel rule 2026-06-09 (PIVOT from 06-06): ONE CODE PER PERSON, not
    // per program. The same person reuses their code across all the
    // courses they're taking ("2 people, 1 OW + 1 AOW" = 2 codes, not 3).
    //
    // Resolution order for per-pax programs:
    //   1. input.pax_programs (explicit, recommended) — outer length =
    //      pax, inner = programs for that person
    //   2. Existing leadMetadata.pax_programs (idempotency on retry)
    //   3. Fallback: assume each person does ALL programs in programaList
    //      (covers single-program case + the old `programas` input shape)
    const existingRefCodesByPax = existingMeta?.ref_codes_by_pax ?? null;
    const existingPaxPrograms = existingMeta?.pax_programs ?? null;
    let paxPrograms: string[][];
    if (input.pax_programs && input.pax_programs.length > 0) {
      paxPrograms = input.pax_programs;
    } else if (existingPaxPrograms && existingPaxPrograms.length === pax) {
      paxPrograms = existingPaxPrograms;
    } else {
      // Each person does all listed programs (or none if programaList empty).
      paxPrograms = Array.from({ length: pax }, () => [...programaList]);
    }
    // Sanity: trim or pad paxPrograms to match `pax` exactly so downstream
    // code can iterate without bounds checks.
    if (paxPrograms.length > pax) {
      paxPrograms = paxPrograms.slice(0, pax);
    } else if (paxPrograms.length < pax) {
      const fillPrograms = programaList.length > 0 ? [...programaList] : [];
      while (paxPrograms.length < pax) paxPrograms.push([...fillPrograms]);
    }

    // Mint one code per person, reusing existing codes when present
    // (never-mint-twice rule scoped to pax index).
    const refCodesByPax: string[] = [];
    for (let i = 0; i < pax; i++) {
      const existing = existingRefCodesByPax?.[i];
      refCodesByPax.push(
        existing && isValidRefCode(existing)
          ? existing
          : generateRefCode(sede.nombre),
      );
    }
    // Primary `ref_code` for backwards compat = first person's code.
    let refCode: string = refCodesByPax[0] ?? existingRefCode ?? generateRefCode(sede.nombre);

    // Backwards-compat flat map (`ref_codes_by_program`): for each
    // program, pick the code of the FIRST pax doing it. Old consumers
    // that expect a single code per program still get a sensible value.
    let refCodesByProgram: Record<string, string> | undefined;
    if (programaList.length > 0) {
      const map: Record<string, string> = {};
      for (let i = 0; i < pax; i++) {
        for (const p of paxPrograms[i] ?? []) {
          if (!map[p]) map[p] = refCodesByPax[i]!;
        }
      }
      if (Object.keys(map).length > 0) refCodesByProgram = map;
    }

    const requiresHumanVerification = !sedeHasAutomaticGateway(
      sede.nombre as SedeKey,
    );

    const instrucciones = buildPaymentInstructions({
      sedeNombre: sede.nombre,
      language: input.cliente_idioma,
      currency,
      refCode,
      pax,
      refCodesByPax,
    });

    // ─── Roster hold (Miguel rule 2026-06-09) ────────────────────────
    // Reserve the slots as `pending` in roster_bookings so concurrent
    // customers see fewer spots while this customer is paying. Held
    // for 4 hours by default; the expiry sweep (rosterDbService.
    // expirePendingBookings) releases capacity if the customer doesn't
    // OCR-confirm in time.
    //
    // Race condition: someone else may have just taken the last seat
    // between our `preflight` re-check above and now. The hold creates
    // its own SERIALIZABLE check so the race is closed at the database
    // level — if we lose, return `slot_unavailable` to the AI.
    //
    // Idempotent on retry: holdPendingBookings looks up existing
    // pending rows for this conversation first and reuses them, so an
    // AI tool retry doesn't create duplicate holds.
    const startDateForHold = existingMeta?.start_date;
    const requiredSlotsForHold = existingMeta?.required_slots ?? [];
    const programaForHold = existingMeta?.programa;
    if (
      startDateForHold &&
      programaForHold &&
      Array.isArray(requiredSlotsForHold) &&
      requiredSlotsForHold.length > 0
    ) {
      const slotsForHold = requiredSlotsForHold.map((s) => ({
        fecha: addDays(startDateForHold, s.dayOffset),
        turno: s.slot as TurnoKey as unknown as Parameters<
          typeof rosterDbService.holdPendingBookings
        >[0]["slots"][number]["turno"],
        programa: programaForHold,
        pax,
      }));
      const holdResult = await rosterDbService.holdPendingBookings({
        sedeId: sede.id,
        conversacionId: conversation.id,
        contactId: payload.contact.id,
        slots: slotsForHold,
        notes: `pending hold for ${refCode} (${currency} × ${pax})`,
      });
      if (!holdResult.ok) {
        if (holdResult.reason === "overbooked") {
          log.warn(
            {
              conversationId: conversation.id,
              failingSlot: holdResult.failingSlot,
            },
            "solicitar_deposito rejected — pending hold raced (Miguel 2026-06-09 4h hold)",
          );
          return {
            ok: false,
            reason: "slot_unavailable",
            message:
              "Justo cuando iba a generar la seña re-verifiqué y se llenó un cupo. Ofrecé una fecha alternativa al cliente.",
            failingSlots: [
              {
                date: holdResult.failingSlot.fecha,
                slot: holdResult.failingSlot.turno as TurnoKey,
                available: false,
                espacios: holdResult.failingSlot.available,
                reason: "full",
              },
            ],
          };
        }
        // invalid_input — defensive, shouldn't happen since validators
        // run earlier. Treat as internal_error so the AI escalates.
        log.error(
          { conversationId: conversation.id, holdResult },
          "solicitar_deposito hold failed with invalid_input — escalating",
        );
        return {
          ok: false,
          reason: "internal_error",
          message:
            "No pude generar la reserva interna. Pasalo al equipo manualmente — Miguel revisa hoy mismo.",
        };
      }
      log.info(
        {
          conversationId: conversation.id,
          heldRows: holdResult.holds.length,
          heldIds: holdResult.holds.map((h) => h.id),
        },
        "solicitar_deposito: pending holds created (Miguel 4h TTL)",
      );
    } else {
      // No required_slots in metadata — legacy / programs without
      // a schedule (Divemaster, specialties). Skip the hold; the
      // booking still needs office attention so capacity isn't an
      // automated concern.
      log.info(
        { conversationId: conversation.id },
        "solicitar_deposito: skipping pending hold — required_slots empty (program without schedule)",
      );
    }

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
        ref_codes_by_pax: refCodesByPax,
        pax_programs: paxPrograms,
        ...(refCodesByProgram ? { ref_codes_by_program: refCodesByProgram } : {}),
        deposit_amount: monto, // per-person, kept for backward compat
        deposit_amount_total: montoTotal, // pax × per-person — OCR target
        deposit_currency: currency,
        pax,
        programa: existingMeta?.programa, // preserve from consultar transition
        start_date: existingMeta?.start_date,
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
    //
    // 2026-06-05 (Miguel feedback Slice 3c): ALSO push programa/turno/
    // start_date if available in lead_metadata. Previously only the
    // consultar_disponibilidad success path populated these, so if a
    // customer skipped the disponibilidad step or that step errored,
    // the contact panel ended up with empty programa + turno fields
    // (Miguel's screenshot of a deposit_paid lead showed exactly this).
    // We read from leadMetadata as the source of truth and re-push at
    // deposit time as a belt-and-suspenders.
    const depositMeta =
      (conversation.leadMetadata as LeadMetadata | null) ?? {};
    const extraFields: Record<string, string | number | null> = {
      sede: sede.nombre,
      monto: montoTotal,
      moneda: currency,
      codigo_referencia: refCode,
      pax,
    };
    if (depositMeta.programa) extraFields.programa = depositMeta.programa;
    if (depositMeta.start_date) extraFields.start_date = depositMeta.start_date;
    // Derive turno from required_slots if it isn't already an explicit field.
    // required_slots is Array<{dayOffset, slot:"AM"|"PM"}>. For multi-slot
    // programs we surface "AM/PM" so the office sees both.
    const reqSlots = depositMeta.required_slots ?? [];
    if (reqSlots.length > 0) {
      const slots = new Set(reqSlots.map((s) => s.slot));
      extraFields.turno =
        slots.has("AM") && slots.has("PM")
          ? "AM/PM"
          : slots.has("AM")
            ? "AM"
            : "PM";
    }
    void respondIoClient
      .updateContactCustomFields({
        contactId: payload.contact.id,
        fields: extraFields,
        language: detectedLanguageIso ?? undefined,
      })
      .catch((err) =>
        log.warn({ err }, "respond_io update_custom_fields failed (deposit path)"),
      );

    return {
      ok: true,
      ref_code: refCode,
      // Per-person codes (Miguel rule 2026-06-09). Always present, length = pax.
      ref_codes_by_pax: refCodesByPax,
      // Legacy multi-program mapping kept on the response only when more
      // than one program is involved — old callers branching on this
      // field keep working.
      ...(refCodesByProgram && Object.keys(refCodesByProgram).length > 1
        ? { ref_codes_by_program: refCodesByProgram }
        : {}),
      monto,
      monto_total: montoTotal,
      pax,
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

    // Catalog cards can be bilingual (e.g. Phi Phi has EN + ES image
    // variants per course). The per-inbound `detectLanguage()` requires
    // ≥60 chars and short turns (e.g. "Sí claro" = 8 chars) return
    // undefined — which used to fall through to EN as a default. That
    // produced an English catalog card to Spanish-speaking customers
    // (e2e test 2026-06-04: customer wrote 4 messages all <30 chars in
    // Spanish, AI replied in Spanish, but card came in English).
    //
    // Fallback when detectedLanguage is undefined: concatenate the recent
    // customer messages (sender='cliente') and re-run detectLanguage on
    // the combined text. Aggregated history typically exceeds the 60-char
    // threshold and surfaces a definitive Spanish/English verdict from
    // franc. Only fires when the per-inbound detection failed — avoids
    // extra DB work on the common path.
    let catalogLanguage: string | undefined = detectedLanguage ?? undefined;
    if (!catalogLanguage) {
      try {
        const recent = await conversationService.recentMessages(conversation.id);
        // Include AI mensajes too — when the customer's recent inputs are
        // all short (e.g. "Hola" + "Sí claro" + "Primera vez", all <30 chars),
        // the franc 60-char threshold rejects the combined customer-only
        // text. The AI's prior responses are the most reliable signal of
        // conversation language at that point (they're already several
        // sentences long and franc detects them deterministically). We
        // exclude `agente_humano` to avoid picking up operator interjections
        // in a different language (e.g. Miguel writes in English to test).
        const combinedText = recent
          .filter((m) => m.sender === "cliente" || m.sender === "ai")
          .slice(-12)
          .map((m) => m.content)
          .join(" ")
          .trim();
        if (combinedText.length > 0) {
          const detected = detectLanguage(combinedText);
          if (detected) {
            catalogLanguage = detected;
          } else {
            // Last-resort: scan recent mensajes for SHORT_GREETING regex
            // matches. Useful when the entire conversation is sub-60-char
            // turns ("Hola" / "Sí" / "Ok") — franc never fires but the
            // short-greeting bias still pins us to ES.
            const lastFew = recent.slice(-6).map((m) => m.content);
            const hasEsGreeting = lastFew.some((t) =>
              SHORT_GREETING_ES.test(t.trim()),
            );
            const hasEnGreeting = lastFew.some((t) =>
              SHORT_GREETING_EN.test(t.trim()),
            );
            if (hasEsGreeting && !hasEnGreeting) catalogLanguage = "español";
            else if (hasEnGreeting && !hasEsGreeting) catalogLanguage = "english";
          }
        }
      } catch (langErr) {
        log.warn(
          { err: (langErr as Error).message },
          "enviar_catalogo: language history-fallback lookup failed — using undefined (EN default)",
        );
      }
    }
    const entry = getCatalogEntry(sede.nombre, input.programa, catalogLanguage);
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

    // Dedup guard RESTORED 2026-06-16 PM (Tony GA pilot regression). The
    // guard was removed on 2026-06-05 on the theory that the prompt-level
    // rules alone were sufficient. They are not. Tony's evening test
    // produced the exact pattern the original guard was built to stop —
    // the same Bautizo de Buceo card landing 4 times in 6 minutes as the
    // customer ticked through date / currency / "where do I send"
    // confirmation turns. Each turn the AI saw the program key in the
    // conversation state and called `enviar_catalogo` again. The prompt
    // rules (§catalogo-meta 5/6 + the new SOLO-UN-CATÁLOGO-POR-PROGRAMA
    // in v2.2) read clearly but Claude flat-out skips them.
    //
    // New shape (avoids the 2026-06-05 multi-pax regression):
    //   • catalogsSent is keyed by PROGRAM, and stamped only AFTER a
    //     send completes. A multi-pax turn invokes the handler three
    //     times for three DISTINCT programs in the same Claude
    //     response; none of them is in catalogsSent yet (the
    //     per-call updates are fire-and-forget and we read the value
    //     into a local at the top of processIncomingMessage, so the
    //     three calls share the same snapshot). Fan-out works.
    //   • Repeat invocations across turns DO short-circuit. The new
    //     turn loads fresh conv state from DB, sees the prior turn's
    //     program key in catalogsSent, and returns alreadySent=true
    //     without re-firing the Cloudinary send.
    //   • If the customer genuinely needs the card again (rare —
    //     "perdí la imagen, mandámela de nuevo"), the AI prompt
    //     teaches it to describe in text instead. We accept the rare
    //     UX papercut to protect against the much more frequent
    //     stampede pattern.
    const conversationMeta =
      (conversation.leadMetadata as LeadMetadata | null) ?? {};
    const catalogsSentSoFar = Array.isArray(
      (conversationMeta as { catalogsSent?: unknown }).catalogsSent,
    )
      ? ((conversationMeta as { catalogsSent?: string[] }).catalogsSent ?? [])
      : [];

    if (catalogsSentSoFar.includes(input.programa)) {
      log.info(
        {
          conversationId: conversation.id,
          programa: input.programa,
          catalogsSent: catalogsSentSoFar,
        },
        "enviar_catalogo: program already sent earlier in this conversation — short-circuiting (Tony 2026-06-16 dedup restoration)",
      );
      return {
        ok: true,
        sent: false,
        alreadySent: true,
        programa: input.programa,
        catalogRef: entry.label,
      };
    }

    // Try Respond.io first (preserves operator visibility in their Inbox).
    // On failure — and only when META_WHATSAPP_* credentials are configured
    // — fall back to direct Meta WhatsApp Cloud API. The Meta path
    // bypasses Respond.io entirely; outbound visibility in Respond.io may
    // be partial depending on their Cloud API echo subscription.
    let sentVia: "respond_io" | "meta_direct" | null = null;
    let lastErr: Error | null = null;
    try {
      await respondIoClient.sendCatalogMessage({
        conversationId:
          payload.conversation?.id ?? conversation.respondIoConversationId,
        contactId: payload.contact.id,
        payload: entry.payload,
      });
      sentVia = "respond_io";
    } catch (err) {
      lastErr = err as Error;
      log.warn(
        { err: lastErr.message, sede: sede.nombre, programa: input.programa },
        "enviar_catalogo: Respond.io send failed — attempting Meta-direct fallback",
      );

      // Meta-direct fallback. Only attempt when the entry has a real
      // product_retailer_id (the new schema) AND the env credentials
      // are present AND the contact has a known phone.
      const fallbackEnv = loadEnv();
      const metaConfigured =
        !!fallbackEnv.META_WHATSAPP_PHONE_NUMBER_ID &&
        !!fallbackEnv.META_WHATSAPP_ACCESS_TOKEN;
      const productRetailerId =
        entry.payload.type === "fragment"
          ? entry.payload.fragmentId
          : entry.payload.type === "product"
            ? entry.payload.product_retailer_id
            : null;
      const toPhone = payload.contact.phone ?? contact.phone ?? null;

      if (metaConfigured && productRetailerId && toPhone) {
        try {
          await sendMetaProductCard({
            toPhone,
            catalogId: fallbackEnv.META_CATALOG_ID,
            productRetailerId,
          });
          sentVia = "meta_direct";
          log.info(
            {
              sede: sede.nombre,
              programa: input.programa,
              productRetailerId,
            },
            "enviar_catalogo: Meta-direct fallback succeeded",
          );
        } catch (metaErr) {
          log.error(
            {
              err: (metaErr as Error).message,
              sede: sede.nombre,
              programa: input.programa,
            },
            "enviar_catalogo: Meta-direct fallback also failed — AI will degrade to text",
          );
          lastErr = metaErr as Error;
        }
      } else {
        log.info(
          {
            metaConfigured,
            hasProductRetailerId: !!productRetailerId,
            hasPhone: !!toPhone,
          },
          "enviar_catalogo: Meta-direct fallback skipped (missing config/phone/id)",
        );
      }
    }

    if (sentVia) {
      // Persist that this programa was sent so the dedup guard on the next
      // turn returns alreadySent:true. We update lead_metadata directly
      // (fire-and-forget; failure logged but not blocking — worst case is
      // a duplicate card next turn, which is the regression we already
      // accept while degraded).
      void getDb()
        .update(conversaciones)
        .set({
          leadMetadata: {
            ...conversationMeta,
            catalogsSent: Array.from(
              new Set([...catalogsSentSoFar, input.programa]),
            ),
          },
          updatedAt: new Date(),
        })
        .where(eq(conversaciones.id, conversation.id))
        .catch((err) =>
          log.warn(
            { err: (err as Error).message, programa: input.programa },
            "enviar_catalogo: failed to persist catalogsSent (non-blocking)",
          ),
        );

      // Mark the lead as proposed once the AI sends a specific program
      // card — this is the same intent signal as consultar_disponibilidad.
      void leadStageService
        .transition({
          conversacionId: conversation.id,
          to: "proposed",
          by: "ai",
          note: `enviar_catalogo ${input.programa} via ${sentVia}`,
        })
        .catch(() => {});

      return {
        ok: true,
        sent: true,
        programa: input.programa,
        catalogRef: entry.label,
      };
    }

    return {
      ok: false,
      reason: "send_failed",
      message: lastErr?.message ?? "unknown",
      programa: input.programa,
    };
  };

  // send_product_card — Colomba (Gili Air) only. Different surface area
  // from enviar_catalogo: accepts raw Meta product retailer ids (1 or 2
  // per turn) and validates against ALLOWED_PRODUCT_IDS_GA. John (GT)
  // doesn't get this handler — his sede prompts emit enviar_catalogo
  // calls by programa key instead.
  const sendProductCardHandler = async (
    input: SendProductCardInput,
  ): Promise<SendProductCardResult> => {
    if (input.sede_id !== sede.id) {
      log.warn(
        { claimed: input.sede_id, actual: sede.id },
        "send_product_card sede_id mismatch — overriding to active sede",
      );
    }
    const validated = validateProductCardIds(input);
    if (!validated.ok) {
      log.info(
        { reason: validated.reason, sede: sede.nombre, rejected: validated.rejected },
        "send_product_card rejected — AI will degrade to text",
      );
      return validated;
    }
    const ids = validated.ids;
    // Send each card sequentially through the existing
    // respondIoClient.sendCatalogMessage path with a `product` payload.
    // Spec says cards first then text; the text goes out as the AI's main
    // `respuesta` after this handler returns, so we just push the cards
    // here. ~500ms gap between multi-card sends avoids Meta squashing.
    const sent: string[] = [];
    for (const id of ids) {
      try {
        await respondIoClient.sendCatalogMessage({
          conversationId:
            payload.conversation?.id ?? conversation.respondIoConversationId,
          contactId: payload.contact.id,
          payload: { type: "product", product_retailer_id: id },
        });
        sent.push(id);
        if (ids.length > 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } catch (err) {
        log.warn(
          { err: (err as Error).message, sede: sede.nombre, card_id: id },
          "send_product_card: send failed",
        );
        return {
          ok: false,
          reason: "send_failed",
          message: (err as Error).message,
          rejected: ids.slice(sent.length),
        };
      }
    }
    void leadStageService
      .transition({
        conversacionId: conversation.id,
        to: "proposed",
        by: "ai",
        note: `send_product_card ${ids.join(",")}`,
      })
      .catch(() => {});
    return { ok: true, sent };
  };

  // Build the tool surface per sede.
  //   • Colomba (Gili Air) — consultar + send_product_card. Bank block
  //     comes from KB-02 as text per Miguel's "opción B" decision.
  //   • Emma (Koh Tao) — consultar only. Emma also writes bank info
  //     from KB-06 as text (40€ or 1000 THB Stripe per her prompt) and
  //     there's no Meta catalog setup yet for KT, so no card tool.
  //   • Everyone else (John for GT) — keeps the original triad:
  //     consultar + solicitar_deposito + enviar_catalogo.
  const toolHandlers: Parameters<typeof callClaude>[0]["toolHandlers"] =
    sede.nombre === "Gili Air"
      ? {
          // 2026-06-15: added enviar_catalogo for Gili Air. Was previously
          // only send_product_card (Meta Cloud API product cards), but Meta
          // rejects those with 403 — DPM has 0 templates with catalog/mpm
          // button approved. Now Miguel has 22 Cloudinary URLs (11
          // programas × EN/ES) configured in Railway env vars, same delivery
          // path as Phi Phi. send_product_card kept as fallback for any
          // legacy flow still referencing Meta product_ids; Colomba's
          // prompt v4 directs the AI to prefer enviar_catalogo.
          consultar_disponibilidad: consultarDisponibilidadHandler,
          enviar_catalogo: enviarCatalogoHandler,
          send_product_card: sendProductCardHandler,
        }
      : sede.nombre === "Koh Tao"
        ? {
            // 2026-06-15: Miguel uploaded 32 Cloudinary URLs for KT (16
            // programas × EN/ES), including 6 KT-only marine-biology
            // specialties (Coral/Fish/Marine/BlueOceans/SeaTurtle/Shark
            // Ecology) plus Divemaster (DMT). Adding enviar_catalogo so
            // Emma can deliver the image cards.
            consultar_disponibilidad: consultarDisponibilidadHandler,
            enviar_catalogo: enviarCatalogoHandler,
          }
        : {
            consultar_disponibilidad: consultarDisponibilidadHandler,
            solicitar_deposito: solicitarDepositoHandler,
            enviar_catalogo: enviarCatalogoHandler,
          };

  // Tony perf feedback 2026-06-07: "3 minutes to respond". The Claude
  // call (with up to 2 tool-use round-trips) is usually the dominant
  // cost. Log explicitly so Railway logs make the bottleneck visible.
  // Deposit-step tool forcing (Tony 2026-06-16 PM 4th round). At the
  // moment the customer just confirmed the currency for an already-
  // qualified booking (programa + start_date + pax stamped on
  // lead_metadata), we need solicitar_deposito to be invoked
  // deterministically. The prompt rules alone failed five times in a
  // row today — Claude kept emitting "te preparo los datos en un
  // momento", "el equipo te escribe", etc. and finally calling
  // handoff_human without ever invoking the tool. Forcing tool_choice
  // closes that escape hatch.
  const _currencyConfirmedRegex = /^\s*(eur|gbp|aud|usd|idr|thb|euros?|dólares?|dollars?|libras?|pounds?)\s*$/i;
  const _depositMetaForForce =
    (conversation.leadMetadata as LeadMetadata | null) ?? null;
  const _hasQualifiedBooking =
    !!_depositMetaForForce?.programa &&
    !!_depositMetaForForce?.start_date;
  const _alreadyDepositPending =
    conversation.leadStage === "deposit_pending" ||
    !!(_depositMetaForForce?.ref_code &&
      _depositMetaForForce?.deposit_currency);
  const forceToolChoice =
    incomingText &&
    _currencyConfirmedRegex.test(incomingText) &&
    _hasQualifiedBooking &&
    !_alreadyDepositPending
      ? "solicitar_deposito"
      : undefined;
  if (forceToolChoice) {
    log.info(
      {
        conversationId: conversation.id,
        incomingText,
        programa: _depositMetaForForce?.programa,
        startDate: _depositMetaForForce?.start_date,
      },
      "claude tool_choice forced to solicitar_deposito (currency confirmation detected)",
    );
  }

  const claudeT0 = Date.now();
  const claudeResult = await callClaude({
    system,
    messages,
    toolHandlers,
    conversacionId: conversation.id,
    sedeId: sede.id,
    promptVersionId: promptVersion?.id,
    expectedLanguage: detectedLanguage,
    incomingMessage: incomingText,
    forceToolChoice,
  });
  log.info(
    {
      conversationId: conversation.id,
      claudeLatencyMs: Date.now() - claudeT0,
      claudeInternalLatencyMs: claudeResult.latencyMs,
      toolCalls: claudeResult.toolCalls,
      totalLatencySoFarMs: Date.now() - t0,
    },
    "PERF claude call complete",
  );

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
    // Push only motivo_escalation. We deliberately do NOT write `branch`
    // or `sede` here — those are OPERATOR-CONTROLLED fields. Earlier
    // this block also set branch=sede.nombre + sede=sede.nombre to keep
    // the AI Escalation workflow's Branch filter populated, but that
    // created a sneaky feedback loop (2026-05-15): if the contact's
    // Branch had been changed to "Gili Air" but a v2 webhook payload
    // was stale + the message routed to GT, this push would OVERWRITE
    // Branch back to "Gili Trawangan" — locking the contact into John
    // forever even after operator intervention. The Branch routing
    // works without us writing it; we only sync motivo_escalation.
    void respondIoClient
      .updateContactCustomFields({
        contactId: payload.contact.id,
        fields: {
          motivo_escalation: claudeResult.escalationReason,
        },
      })
      .catch((err) =>
        log.warn({ err }, "respond_io update_custom_fields failed (motivo_escalation)"),
      )
      .then(() =>
        respondIoClient.addContactTag({
          contactId: payload.contact.id,
          tag: "ai_escalation",
        }),
      )
      .catch((err) =>
        log.warn({ err }, "respond_io add_tag failed (ai_escalation)"),
      );

    // Grace-window escape: when an escalation lands inside the
    // post-purchase grace window (sede opted into the AI-keeps-handling-
    // logistics period), Miguel's requirement is that handoff_human
    // takes priority over the grace — silence the AI immediately rather
    // than waiting for the window to close. We do that by transitioning
    // the conversation to handed_off now so the next inbound hits the
    // standard post-handoff silence (instead of the grace short-circuit
    // in the guard above). Only fires for sedes with grace enabled to
    // keep other sedes' escalation flow exactly as before.
    if (conversation.leadStage === "deposit_paid" && conversation.sedeId) {
      const behaviorForEscalation = await getSedeBehavior(conversation.sedeId);
      if (behaviorForEscalation.postPurchaseGraceMinutes > 0) {
        void leadStageService
          .forceTransition({
            conversacionId: conversation.id,
            to: "handed_off",
            by: "system",
            note: "grace_window_escalation_priority",
          })
          .catch((err) =>
            log.warn({ err }, "grace-window escalation transition failed"),
          );
      }
    }
  }

  // Step 9b-2 (Colomba/GA): close_reason → tag venta_incompleta and let
  // the Respond.io workflow flip the lifecycle to LOST LEAD. The AI emits
  // this when the conversation is dead (cliente said "thanks, no", asked
  // generic info with no booking intent, bad weather refund, etc.). Per
  // IMPLEMENTATION_NOTES §3 the value is one of CLOSE_REASONS — already
  // validated in the parser.
  if (claudeResult.closeReason) {
    void respondIoClient
      .updateContactCustomFields({
        contactId: payload.contact.id,
        fields: { close_reason: claudeResult.closeReason },
      })
      .catch((err) =>
        log.warn({ err }, "respond_io update_custom_fields failed (close_reason)"),
      )
      .then(() =>
        respondIoClient.addContactTag({
          contactId: payload.contact.id,
          tag: "venta_incompleta",
        }),
      )
      .catch((err) =>
        log.warn({ err }, "respond_io add_tag failed (venta_incompleta)"),
      );
  }

  // Step 9b-3 (Colomba/GA): free-text notes from the AI. Most commonly
  // used during the async instructor_request flow (collect name + email
  // + WA, then escalate with the summary in `notes`). The note is
  // appended to the contact's profile in Respond.io via the existing
  // addContactComment helper so the assigned human sees the context.
  if (claudeResult.notes) {
    void respondIoClient
      .addContactComment({
        contactId: payload.contact.id,
        text: claudeResult.notes,
      })
      .catch((err) =>
        log.warn({ err }, "respond_io add_comment failed (ai notes)"),
      );
  }

  // Step 9c: descuento custom field. If the AI quoted (or confirmed
  // "Sin descuento" after negotiation), push the value so Miguel's Sheet
  // Logger captures it on conversation close. Anything >10% never reaches
  // here — it gets routed through escalation_reason=discount_over_10
  // instead.
  //
  // Also push `descuento_aplicado` as a boolean: true when the value is
  // anything OTHER than "Sin descuento" / "0%" / empty. Miguel flagged
  // this field empty in 5-12-feedback-round2 — it's the operations-side
  // flag for "this contact got a discount", separate from the discount
  // VALUE (descuento). Boolean encoded as the string "true"/"false"
  // because Respond.io's text custom fields don't support native bool.
  if (claudeResult.descuento) {
    const descuento = claudeResult.descuento;
    const aplicado =
      descuento.trim().length > 0 &&
      !descuento.toLowerCase().includes("sin descuento") &&
      descuento.trim() !== "0%";
    void respondIoClient
      .updateContactCustomFields({
        contactId: payload.contact.id,
        fields: {
          descuento,
          descuento_aplicado: aplicado ? "true" : "false",
        },
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
  // Step 10-pre (Colomba/GA): if the AI declared send_product_card in
  // its JSON envelope (as opposed to invoking the tool mid-turn), send
  // the cards FIRST so they land before the text per Miguel's spec
  // ("Tarjeta primero, luego texto"). Validation goes through the same
  // allowlist as the tool path. Tool_use cards (which already went out
  // mid-turn) are NOT re-sent — toolCalls includes "send_product_card"
  // then.
  if (
    claudeResult.sendProductCardIds &&
    claudeResult.sendProductCardIds.length > 0 &&
    !claudeResult.toolCalls.includes("send_product_card")
  ) {
    const validated = validateProductCardIds({
      sede_id: sede.id,
      card_id: claudeResult.sendProductCardIds,
    });
    if (validated.ok) {
      for (const id of validated.ids) {
        try {
          await respondIoClient.sendCatalogMessage({
            conversationId:
              payload.conversation?.id ?? conversation.respondIoConversationId,
            contactId: payload.contact.id,
            payload: { type: "product", product_retailer_id: id },
          });
          if (validated.ids.length > 1) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        } catch (err) {
          log.warn(
            { err: (err as Error).message, card_id: id },
            "envelope send_product_card failed; continuing with text",
          );
        }
      }
    } else {
      log.warn(
        { reason: validated.reason, rejected: validated.rejected },
        "envelope send_product_card rejected — skipping",
      );
    }
  }

  const MESSAGE_SEPARATOR = /\n\n---+\n\n/;
  const segments = claudeResult.text
    .split(MESSAGE_SEPARATOR)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  try {
    // ─── Self-assign FIRST (Tony's UX feedback 2026-06-07) ─────────────
    // The assign API call goes out BEFORE the first message so the panel's
    // websocket receives the "assignee changed" event BEFORE the message
    // arrives (better UX — no F5 required).
    //
    // CRITICAL bug fix 2026-06-07 (Miguel test): the prior implementation
    // would STEAL the conversation back from a human in an infinite loop:
    //   1. Customer messages → AI assigns to itself
    //   2. Human takes over manually in panel
    //   3. Customer messages → AI re-assigns to itself (steal!)
    //   ↺ loop
    //
    // Root cause: the `human_took_over` flag is set by the
    // `conversation.assignee.changed` webhook, which has latency
    // (webhook delivery + handler processing). Between the human
    // assigning and the next customer message, the flag may not be set
    // yet, so the AI's self-assign fires anyway.
    //
    // Bulletproof fix: GET the current assignee from Respond.io BEFORE
    // assigning. If someone (not us) already has it → leave it alone.
    // Cost: one extra GET call (~150ms). Worth it to prevent the loop.
    //
    // Skip when:
    //   • RESPOND_IO_AI_ASSIGNEE_ID env unset (no-op mode)
    //   • lead_stage is terminal/handoff
    //   • human_took_over flag is set (defensive — earlier guard returns)
    //   • current assignee is a human (the new check below)
    //
    // Multi-AI per-sede (2026-06-15): pick the AI user that matches THIS
    // sede so the panel shows the right persona as assignee instead of
    // falling back to Francisco for every conversation. Map verified
    // against the workspace users on the same date. KT (Emma) intentionally
    // absent — Miguel hasn't created the user yet; falls through to the
    // env default.
    const SEDE_TO_AI_ASSIGNEE: Readonly<Record<string, number>> = {
      "Koh Phi Phi": 440519,
      "Gili Air": 441308,
      "Gili Trawangan": 462203,
      "Nusa Penida": 464075,
    };
    const env = loadEnv();
    const aiAssigneeId =
      SEDE_TO_AI_ASSIGNEE[sede.nombre] ?? env.RESPOND_IO_AI_ASSIGNEE_ID;
    const handsOffStages: ReadonlyArray<typeof conversation.leadStage> = [
      "handed_off",
      "deposit_paid",
      "closed",
      "lost",
    ];
    const humanTookOverNow =
      (conversation.leadMetadata as LeadMetadata | null)?.human_took_over === true;
    if (
      aiAssigneeId &&
      !handsOffStages.includes(conversation.leadStage) &&
      !humanTookOverNow
    ) {
      // Fire and forget — but DO the assignee check first.
      void (async () => {
        try {
          const current = await respondIoClient.getConversationAssignee({
            contactId: payload.contact.id,
          });
          // If we can't read the current assignee → don't risk it.
          // Better to leave it Sin asignar than to steal from a human.
          if (current === null) {
            log.warn(
              { contactId: payload.contact.id },
              "ai self-assign skipped — could not read current assignee from Respond.io",
            );
            return;
          }
          // Already assigned to ANY configured AI → idempotent no-op.
          if (current.assigneeId !== null && isAiAssignee(current.assigneeId)) {
            return;
          }
          // Assigned to a non-AI human. Two sub-cases distinguished by
          // whether the AI has ever participated in this conversation:
          //
          //   • Real takeover: an operator clicked "take over" on a
          //     thread the AI was already handling. Prior AI activity
          //     exists. Mi server must respect that — never steal back
          //     (Tony rule, restored 2026-06-15 after a brief loosened
          //     attempt).
          //
          //   • Workflow setup: the bienvenida workflow assigned the
          //     thread to a human (Fabiola / Grecia) BEFORE the AI ever
          //     spoke. No prior AI activity. This isn't an operator
          //     decision; it's a workflow routing default that should
          //     match the sede AI to make GA mirror PP. Reassign to the
          //     sede AI so the panel shows the persona that's actually
          //     handling the conversation.
          //
          // The distinction matches the "lenient takeover guard" used
          // earlier in this same handler — same signal (prior AI
          // activity = real takeover; no prior activity = workflow
          // routing).
          if (current.assigneeId !== null && !isAiAssignee(current.assigneeId)) {
            const hadAiActivity = await conversationHasAiActivity();
            if (hadAiActivity) {
              log.info(
                {
                  contactId: payload.contact.id,
                  currentAssigneeId: current.assigneeId,
                  aiAssigneeId,
                },
                "ai self-assign skipped — real takeover (human owns after AI engagement)",
              );
              return;
            }
            log.info(
              {
                contactId: payload.contact.id,
                previousAssigneeId: current.assigneeId,
                newAssigneeId: aiAssigneeId,
                sede: sede.nombre,
              },
              "ai self-assigning — workflow routed to human but no prior AI activity (setup, not takeover)",
            );
            await respondIoClient.assignConversation({
              contactId: payload.contact.id,
              assignee: aiAssigneeId,
            });
            return;
          }
          // Unassigned (null) → safe to claim with this sede's AI.
          await respondIoClient.assignConversation({
            contactId: payload.contact.id,
            assignee: aiAssigneeId,
          });
        } catch (err) {
          log.warn(
            { err: (err as Error).message },
            "ai self-assign failed (non-blocking)",
          );
        }
      })();
    }

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

  } finally {
    // Release the per-conv AI lock so a queued follow-up invocation can
    // proceed. Only clear the map entry if we're still the owner — a
    // later invocation may have already overwritten it.
    releaseAiLock();
    if (convAiLock.get(conversation.id) === myAiLock) {
      convAiLock.delete(conversation.id);
    }
  }
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
 * Miguel rule 2026-06-07 (revised from 2026-06-06): log one row per
 * program to DPM_Ventas_Master via the SAME Apps Script `/exec` Miguel's
 * human-side workflow uses. AI bypasses the workflow and POSTs directly
 * with real values (no $contact.X variables). Spec lives in
 * `information/2026-06-07-miguel-sales-logger-spec.md`.
 *
 * Idempotency: each program logged once across the conversation's
 * lifetime via `leadMetadata.sale_logged_at_by_program`. A re-OCR or
 * re-validation never double-writes.
 *
 * Determining which programs to log:
 *   1. Multi-program: `leadMetadata.ref_codes_by_program` keys
 *   2. Single-program: `leadMetadata.programa` + `leadMetadata.ref_code`
 *
 * Determining per-row pax:
 *   - Single-program (1 entry): pax = leadMetadata.pax (the booking total)
 *   - Multi-program (>1 entry): pax = 1 per row (different people per
 *     program is the typical case Miguel asked about)
 *
 * Determining per-row monto (TOTAL not per-person):
 *   - per-person amount × per-row pax (kept consistent with deposit
 *     amount logic in solicitar_deposito).
 *
 * Mandatory exact-match fields (Miguel's revenue calculator returns 0
 * if these don't match his tarifario): `sede` + `programa`. Program key
 * goes through `programaDisplayName(sede, key)`; if no mapping exists
 * we SKIP the row and log a warning (writing the internal enum key
 * would silently zero out the revenue, worse than not writing).
 *
 * Failures are logged to the `errores` table so the panel can surface
 * "AI tried to log sale, write failed" — operator logs manually.
 */
async function logSaleRowsForBooking(input: {
  sede: Sede;
  conversation: { id: string; leadMetadata: unknown };
  contact: {
    id: string;
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    countryCode?: string | null;
    language?: string | null;
  };
  log: FastifyBaseLogger;
}): Promise<void> {
  const { sede, conversation, contact, log } = input;
  const meta = (conversation.leadMetadata as LeadMetadata | null) ?? {};

  // Build the per-(pax × programa) entries to log (Miguel rule 2026-06-09:
  // one row per enrollment, code repeated when one person takes multiple
  // courses). Resolution priority:
  //   1. NEW shape: meta.pax_programs (outer = pax, inner = programs) +
  //      meta.ref_codes_by_pax (1 code per pax)
  //   2. LEGACY shape: meta.ref_codes_by_program → 1 row per program,
  //      pax=1 (covers in-flight conversations from before the 06-09 split)
  //   3. SINGLE: meta.programa + meta.ref_code, repeat per pax with the
  //      same shared code (pre-2026-06-09 behavior — kept so existing
  //      pending bookings finish cleanly)
  type RowEntry = { paxIdx: number; programa: string; refCode: string };
  const entries: RowEntry[] = [];
  const paxPrograms = meta.pax_programs;
  const refCodesByPax = meta.ref_codes_by_pax;
  if (
    Array.isArray(paxPrograms) &&
    Array.isArray(refCodesByPax) &&
    paxPrograms.length > 0 &&
    refCodesByPax.length === paxPrograms.length
  ) {
    paxPrograms.forEach((programs, paxIdx) => {
      const refCode = refCodesByPax[paxIdx];
      if (!refCode) return;
      for (const programa of programs) {
        entries.push({ paxIdx, programa, refCode });
      }
    });
  } else if (
    meta.ref_codes_by_program &&
    Object.keys(meta.ref_codes_by_program).length > 0
  ) {
    // Legacy: one row per program, paxIdx=0 (no per-person tracking).
    let i = 0;
    for (const [programa, refCode] of Object.entries(meta.ref_codes_by_program)) {
      entries.push({ paxIdx: i++, programa, refCode });
    }
  } else if (meta.programa && meta.ref_code) {
    const totalPax = meta.pax ?? 1;
    for (let i = 0; i < totalPax; i++) {
      entries.push({ paxIdx: i, programa: meta.programa, refCode: meta.ref_code });
    }
  } else {
    log.warn(
      { convId: conversation.id },
      "sales_logger: skip — no programa+ref_code available in lead_metadata",
    );
    return;
  }

  const currency = meta.deposit_currency;
  if (!currency) {
    log.warn(
      { convId: conversation.id },
      "sales_logger: skip — deposit_currency missing in lead_metadata",
    );
    return;
  }
  const perPersonAmount = depositAmountFor(currency);
  // Each row = ONE person × ONE program. Pax is always 1, amount is the
  // per-person deposit. The customer's total transfer is still captured
  // elsewhere (lead_metadata.deposit_amount_total + OCR validation).
  const perRowPax = 1;

  // Resolve all sede-scoped + once-per-call values OUTSIDE the loop.
  const { firstName, lastName } = splitContactName(contact.name);
  const agenteCierre = agenteCierreFor(sede.nombre);
  const marketing = marketingAttributionFor(meta);
  const fechaVenta = formatSaleTimestamp(sede.nombre);
  if (!agenteCierre) {
    log.warn(
      { sede: sede.nombre, convId: conversation.id },
      "sales_logger: no agente_cierre registered for sede — row will log without agent marker (Miguel needs to configure)",
    );
  }

  // Idempotency key now includes pax_idx (Miguel rule 2026-06-09 —
  // multiple pax can do the same program in one booking, each is its
  // own row). Key format: `${paxIdx}:${programa}`. Legacy keys
  // (just `programa`) are still honored on first read so partial
  // pre-06-09 retries don't double-write.
  const alreadyLogged = meta.sale_logged_at_by_program ?? {};
  const newlyLogged: Record<string, string> = { ...alreadyLogged };
  const failures: Array<{
    paxIdx: number;
    programa: string;
    reason: string;
    message: string;
  }> = [];

  for (const { paxIdx, programa, refCode } of entries) {
    const idemKey = `${paxIdx}:${programa}`;
    const legacyKey = programa;
    const previouslyLoggedAt = alreadyLogged[idemKey] ?? alreadyLogged[legacyKey];
    if (previouslyLoggedAt) {
      log.info(
        {
          idemKey,
          paxIdx,
          programa,
          convId: conversation.id,
          loggedAt: previouslyLoggedAt,
        },
        "sales_logger: skip — (paxIdx, programa) already logged for this conversation",
      );
      continue;
    }

    // Resolve the Apps Script-expected display name. If we don't have a
    // mapping for this (sede, programa) pair, REFUSE to log — sending
    // the internal enum key would make Miguel's revenue calc return 0
    // for the row. Surface a failure so the operator logs manually.
    const programaForSheet = programaDisplayName(sede.nombre, programa);
    if (!programaForSheet) {
      failures.push({
        paxIdx,
        programa,
        reason: "no_program_mapping",
        message: `No display name mapping for (${sede.nombre}, ${programa}) — operator must log manually. Miguel: please add to PROGRAMA_DISPLAY_NAME table.`,
      });
      log.warn(
        { sede: sede.nombre, paxIdx, programa, convId: conversation.id },
        "sales_logger: skip row — no programa display-name mapping",
      );
      continue;
    }

    // Resolve the row's turno (Miguel's sheet wants one of AM/PM/Nocturno/
    // Confinadas — Confinadas-only programs still get a meaningful slot
    // string). We pick the FIRST boat-departure slot if any, otherwise
    // the first Confinadas slot. Multi-day programs that use both AM and
    // PM surface "AM/PM" so the office sees both.
    const requiredSlots = meta.required_slots ?? [];
    const slotsInBooking = new Set(requiredSlots.map((s) => s.slot));
    let turno = "";
    if (slotsInBooking.has("AM") && slotsInBooking.has("PM")) {
      turno = "AM/PM";
    } else if (slotsInBooking.has("AM")) {
      turno = "AM";
    } else if (slotsInBooking.has("PM")) {
      turno = "PM";
    } else if (slotsInBooking.has("Nocturno")) {
      turno = "Nocturno";
    } else if (slotsInBooking.has("Confinadas")) {
      turno = "Confinadas";
    }

    const row = {
      fecha_venta: fechaVenta,
      sede: sede.nombre, // assumed to match Miguel's tarifario verbatim
      firstName,
      lastName,
      phone: contact.phone ?? "",
      email: contact.email ?? "",
      countryCode: contact.countryCode ?? "",
      language: contact.language ?? "",
      programa: programaForSheet,
      turno,
      pax: perRowPax,
      monto: perPersonAmount * perRowPax,
      moneda: currency,
      agente_cierre: agenteCierre,
      marketing_source: marketing.marketing_source,
      marketing_campaign: marketing.marketing_campaign,
      gclid: marketing.gclid,
      precio_total_usd: "", // course full price — deferred (per-program tarifario lookup needed)
      resto_a_pagar_usd: "", // remaining balance after deposit — same dep
      descuento: "Sin descuento", // TODO: pull from leadMetadata when discount tooling lands
      codigo_referencia: refCode,
    };

    const result = await salesLoggerService.logSale(row);
    if (result.ok) {
      newlyLogged[idemKey] = new Date().toISOString();
    } else {
      failures.push({
        paxIdx,
        programa,
        reason: result.reason,
        message: result.message,
      });
      log.warn(
        {
          paxIdx,
          programa,
          refCode,
          reason: result.reason,
          message: result.message,
          convId: conversation.id,
        },
        "sales_logger row write failed",
      );
    }
  }

  // Persist whichever programs DID succeed so a partial retry doesn't
  // re-write the already-logged rows. Also log the failures to `errores`
  // so the panel surfaces "manual log needed".
  if (Object.keys(newlyLogged).length > Object.keys(alreadyLogged).length) {
    await leadStageService
      .transition({
        conversacionId: conversation.id,
        to: "deposit_paid",
        by: "system",
        note: `sales_logger wrote ${Object.keys(newlyLogged).length - Object.keys(alreadyLogged).length} row(s)`,
        metadataPatch: { sale_logged_at_by_program: newlyLogged },
      })
      .catch((err) =>
        log.warn(
          { err: (err as Error).message },
          "sale_logged_at_by_program metadata patch failed",
        ),
      );
  }
  if (failures.length > 0) {
    await getDb()
      .insert(errores)
      .values({
        source: "internal",
        conversacionId: conversation.id,
        errorType: "sales_logger_failed",
        errorMessage: `Could not write ${failures.length} sales row(s) — operator must log manually`,
        context: { failures },
      })
      .catch(() => {});
  }

  // Miguel rule 2026-06-06: when ALL programs are logged successfully
  // AND we haven't already closed this conversation, fire
  // `close_conversation("booked by ai")`. The Respond.io workflow Miguel
  // configures must SKIP the master logger for that category (close_sale
  // already wrote the rows) and KEEP firing the unassign workflow.
  //
  // Idempotent via ai_closed_at — a second pass through this code path
  // (re-OCR, manual re-validation) will see the flag and skip.
  // Idempotency key matches the per-(pax × programa) format we wrote
  // above. Every entry must be present in `newlyLogged` (either freshly
  // written this run OR carried over from `alreadyLogged`).
  const allLogged = entries.every(
    (e) => newlyLogged[`${e.paxIdx}:${e.programa}`],
  );
  const alreadyClosed = !!meta.ai_closed_at;
  if (allLogged && !alreadyClosed && failures.length === 0) {
    const closeResult = await respondIoClient.closeConversation({
      contactId: contact.id,
      category: "booked by ai",
    });
    if (closeResult.ok) {
      const closedAt = new Date().toISOString();
      await leadStageService
        .transition({
          conversacionId: conversation.id,
          to: "closed",
          by: "system",
          note: 'respond_io closeConversation("booked by ai")',
          metadataPatch: { ai_closed_at: closedAt },
        })
        .catch((err) =>
          log.warn(
            { err: (err as Error).message },
            "ai_closed_at metadata patch failed (close succeeded in Respond.io)",
          ),
        );
      log.info(
        { convId: conversation.id, programCount: entries.length },
        'conversation closed with category "booked by ai" after sales rows written',
      );
    } else {
      log.warn(
        { convId: conversation.id, closeResult },
        'closeConversation("booked by ai") failed — conversation stays open',
      );
    }
  }
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
 * Generic acknowledgment for a non-text message that arrives BEFORE the
 * conversation has entered deposit_pending. We can't run OCR (no expected
 * amount/currency stamped) but we MUST reply or the customer sees silence
 * (Bug 4 — Tony 2026-06-16 GA pilot, "se paró ahí"). Kept deliberately
 * neutral — we don't assume the file is a deposit receipt, only that it
 * was received and someone will look at it.
 */
export function pickPreDepositAttachmentAck(language: string | null): string {
  const lang = (language ?? "es").slice(0, 2).toLowerCase();
  if (lang === "en") {
    return "Got your file 🙏 Let me take a look and I'll get back to you in a moment.";
  }
  return "¡Recibí tu archivo 🙏! Lo reviso y te respondo en un momento.";
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
  return 'Gracias 🙏 ¿Puedes compartir la confirmación del banco en PDF en vez de captura? La mayoría de los bancos tienen una opción "Descargar" o "Exportar PDF" en los detalles de la transacción. Necesitamos el PDF para validar la transferencia correctamente.';
}

/**
 * Customer-facing message for unambiguous OCR mismatches. Sent ~3-5s after
 * the generic comprobante ACK so the customer sees:
 *   1. "Recibido, gracias 🙏 Déjame confirmar..."   (the ACK)
 *   2. "Acabo de revisar — veo X EUR pero el depósito es Y EUR..."   (this)
 *
 * Returns null for AMBIGUOUS mismatches (e.g. ref_code typo, amount within
 * 80-100% which could be bank fees). Those stay silent so the operator can
 * decide: confirm manually, or message the customer with the right correction.
 *
 * The thresholds are conservative on purpose. False positive (telling a
 * real-paying customer their PDF is wrong) erodes trust much faster than
 * false negative (silent rejection that operator catches later).
 *
 * Spec source: §3 of 5-12-feedback follow-up — 2026-05-12 Miguel asked
 * what the workflow should be when OCR rejects; this is the clear-case
 * subset that's safe to auto-reply to.
 */
export function pickOcrMismatchMessage(
  ocr: import("../services/ocr-comprobante.js").OcrVerdict,
  expectedAmount: number | null,
  expectedCurrency: string | null,
  language: string | null,
): string | null {
  if (!ocr.ok || ocr.validated) return null;
  const mismatches = ocr.mismatches ?? [];
  const extracted = ocr.extraction;
  const lang = (language ?? "es").slice(0, 2).toLowerCase();
  const isEn = lang === "en";

  // CASE 1: currency mismatch (e.g. paid USD when EUR expected). Unambiguous
  // — different currency means the customer transferred to the wrong account
  // OR misread the instructions. Always worth flagging.
  if (
    mismatches.includes("currency_mismatch") &&
    extracted?.currency &&
    expectedCurrency &&
    extracted.currency !== expectedCurrency
  ) {
    return isEn
      ? `Just checked the receipt 🙏 The transfer is in ${extracted.currency} but the deposit was set in ${expectedCurrency}. Could you double-check? If it was a mistake, my colleague will help sort the refund / re-quote.`
      : `Acabo de revisar el comprobante 🙏 La transferencia es en ${extracted.currency} pero el depósito quedó armado en ${expectedCurrency}. ¿Puedes revisar? Si fue un error mi compañero/a te ayuda con el reembolso o el ajuste.`;
  }

  // CASE 2: amount way too low (< 80% of expected). This is the
  // Bertrand-Klein scenario: 40 EUR PDF for an 80 EUR booking. Clear
  // under-payment, worth telling the customer immediately so they can
  // top up before the human team gets to it.
  if (
    mismatches.includes("amount_too_low") &&
    extracted?.amount !== null &&
    extracted?.amount !== undefined &&
    expectedAmount !== null &&
    expectedAmount > 0 &&
    extracted.amount < expectedAmount * 0.8
  ) {
    const ccy = expectedCurrency ?? "EUR";
    return isEn
      ? `Just checked the receipt 🙏 It shows ${extracted.amount} ${ccy} but the deposit for this booking is ${expectedAmount} ${ccy}. Could you check the transfer? You may need to send a top-up for the difference.`
      : `Acabo de revisar el comprobante 🙏 Muestra ${extracted.amount} ${ccy} pero el depósito de esta reserva es ${expectedAmount} ${ccy}. ¿Puedes revisar la transferencia? Quizá tengas que mandar la diferencia.`;
  }

  // CASE 3: amount way too high (> 130% of expected). Likely the wrong PDF
  // entirely or a duplicate payment. Worth flagging so the customer can
  // confirm vs raising a complaint later.
  if (
    mismatches.includes("amount_too_high") &&
    extracted?.amount !== null &&
    extracted?.amount !== undefined &&
    expectedAmount !== null &&
    expectedAmount > 0 &&
    extracted.amount > expectedAmount * 1.3
  ) {
    const ccy = expectedCurrency ?? "EUR";
    return isEn
      ? `Just checked the receipt 🙏 The amount is ${extracted.amount} ${ccy} but the deposit for this booking is only ${expectedAmount} ${ccy}. Did you possibly send the wrong PDF? Let me know and my colleague will help sort it.`
      : `Acabo de revisar el comprobante 🙏 El monto es ${extracted.amount} ${ccy} pero el depósito de esta reserva es solo ${expectedAmount} ${ccy}. ¿Es posible que hayas mandado el PDF equivocado? Avísame y mi compañero/a te ayuda.`;
  }

  // Everything else (ref_code mismatch alone, amount within 80-100%, etc.)
  // stays silent — operator review path. False positives here would tell a
  // real-paying customer "your PDF is wrong" which is the worst UX.
  return null;
}
