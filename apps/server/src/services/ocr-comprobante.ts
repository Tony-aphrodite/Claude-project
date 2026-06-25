// ============================================================================
// Comprobante OCR via Anthropic Vision. Owner spec
// reference/INSTRUCCIONES_PAGO_GiliTrawangansteve.md §5.
//
// Runs when a non-text message lands while the lead is in deposit_pending.
// Steps:
//   1. Fetch the attachment URL (Respond.io serves the file from a
//      pre-signed CDN — we just download the bytes).
//   2. Send it to Claude Sonnet vision with a tight extraction prompt.
//   3. Parse the structured JSON response.
//   4. Compare against expected (refCode, currency, amount ±0.50).
//   5. Return a verdict the panel + caller can persist into lead_metadata.
//
// On any failure (timeout, fetch error, malformed model output) we return
// `{ ok: false, reason: ... }`. The caller still acknowledges the customer
// (§7 mensaje-comprobante-recibido) and the operator does manual
// verification — degraded but never broken.
// ============================================================================

import Anthropic from "@anthropic-ai/sdk";

import {
  TIMEOUTS,
  type DepositCurrency,
} from "@dpm/shared";

import { loadEnv } from "../env.js";
import { getLogger } from "../logger.js";
import { fetchAttachmentAsBase64 } from "./respond-io-attachment.js";

let _client: Anthropic | undefined;
function claude(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: loadEnv().ANTHROPIC_API_KEY,
      timeout: TIMEOUTS.CLAUDE_API_MS,
      maxRetries: 1,
    });
  }
  return _client;
}

export type OcrExtraction = {
  amount: number | null;
  currency: string | null;
  beneficiary: string | null;
  refCode: string | null;
  date: string | null; // ISO yyyy-mm-dd if recognizable
};

export type OcrVerdict =
  | {
      ok: true;
      extraction: OcrExtraction;
      mismatches: string[]; // empty array == fully validated
      validated: boolean; // mismatches.length === 0 && all required fields present
      attachmentMime: string | null;
      attachmentScreenshotRejected?: undefined;
    }
  | {
      ok: false;
      reason:
        | "fetch_failed"
        | "model_failed"
        | "no_anthropic_key"
        | "screenshot_rejected"
        | "missing_attachment_url";
      attachmentMime?: string | null;
      message?: string;
    };

export type ExpectedDeposit = {
  refCode: string;
  currency: DepositCurrency;
  amount: number;
};

const EXTRACTION_PROMPT = `Estás analizando un comprobante de transferencia bancaria. Extraé EXACTAMENTE estos campos del documento o imagen, en formato JSON puro (sin markdown, sin explicaciones).

Campos:
{
  "amount": <número con decimales, sin símbolo ni texto, o null si no se ve claro>,
  "currency": <"EUR" | "GBP" | "AUD" | "USD" | "IDR" | null si no se identifica>,
  "beneficiary": <nombre del beneficiario tal como aparece, o null>,
  "refCode": <código de referencia / concepto / asunto / "Reference" — si ves "DPM-XXXXXX" devolvelo tal cual>,
  "date": <fecha de la transferencia en formato YYYY-MM-DD, o null>
}

Si no podés leer un campo con confianza, devolvé null para ese campo. NO inventes datos. Devolvé solamente el JSON, sin texto antes ni después.`;

function parseExtraction(raw: string): OcrExtraction | null {
  // The model usually returns clean JSON, but it sometimes wraps it in
  // markdown fences. Strip those defensively before parsing.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  try {
    const obj = JSON.parse(cleaned) as Record<string, unknown>;
    return {
      amount: typeof obj.amount === "number" ? obj.amount : null,
      currency: typeof obj.currency === "string" ? obj.currency.toUpperCase() : null,
      beneficiary: typeof obj.beneficiary === "string" ? obj.beneficiary : null,
      refCode: typeof obj.refCode === "string" ? obj.refCode : null,
      date: typeof obj.date === "string" ? obj.date : null,
    };
  } catch {
    return null;
  }
}

const FOREIGN_CURRENCIES = new Set<DepositCurrency>(["EUR", "GBP", "AUD", "USD"]);

/**
 * Cross-check extracted fields against what we know the deposit should be.
 *
 * Owner spec DPM_AI_LAUNCH §3.4 (2026-05-07) originally required THREE
 * things to validate: ref code match, currency match, amount within ±2 %.
 * That gate was retuned on 2026-05-13 (Miguel feedback after real-customer
 * chat review, see 5-13-feedback-deposit-autoconfirm-spec.md):
 *
 *   1. Ref code is INFORMATIONAL, not a gate.
 *      Miguel observed in real chats that >50 % of clients never copy
 *      the DPM-GT-MMDD-XXXXXX code into the bank's Concept / Libellé /
 *      Reference field. Gating on ref code made the AI flip almost
 *      every legitimate transfer back to deposit_pending for human
 *      Confirmar — bad UX. We still EXTRACT and PERSIST the ref code
 *      in `ocr_result.refCode` so an auditor can spot anomalies, but
 *      mismatch / missing never affects `validated`.
 *
 *   2. Currency + amount remain hard gates.
 *      Currency wrong → almost certainly the wrong receipt.
 *      Amount outside band → underpayment or duplicate transfer.
 *
 *   3. Amount tolerance widened to ±5 %.
 *      Photo / screenshot OCR is noisier than parseable-PDF OCR
 *      (decimals can read as commas, currency-symbol bleed, etc.).
 *      ±5 % keeps obvious mismatches out without trapping legitimate
 *      transfers with small OCR jitter. The +10 % upper-fraud bound
 *      (`amount_too_high`) is unchanged — that's a duplicate-transfer
 *      / wrong-amount guard, not a precision concern.
 *
 *   4. Safety net is the auto-confirm dashboard (Phase B, separate
 *      commit). Operators cross-reference auto-confirmed rows against
 *      the Wise / Mandiri / BCA bank emails landing in
 *      gilit@dpmdiving.com (ground truth of cash actually received)
 *      and flag any drift. This trades hard upfront blocking for
 *      faster customer onboarding + downstream reconciliation.
 *
 * The previous "beneficiary soft match" path is removed: it was a
 * partial mitigation for the ref-code-gate problem that this change
 * solves directly. Beneficiary is still extracted for audit but no
 * longer special-cased in the verdict.
 */
export function reconcile(
  extraction: OcrExtraction,
  expected: ExpectedDeposit,
  _expectedBeneficiary?: string,
): { mismatches: string[]; validated: boolean; softMatch?: string } {
  // The third parameter is retained in the signature for backwards
  // compatibility with existing call sites (process-message passes it),
  // but with the ref-code gate gone the beneficiary fallback is
  // redundant. Silenced with `_` so lint doesn't complain.
  void _expectedBeneficiary;
  const mismatches: string[] = [];

  // Ref code — extract for audit, never gate. Push an informational
  // mismatch if it's wrong/missing so the operator can see it in the
  // panel diff, but do NOT count it against `validated`.
  if (extraction.refCode == null) {
    mismatches.push("ref_code_missing");
  } else {
    const extNorm = extraction.refCode.replace(/\s+/g, "").toUpperCase();
    const expNorm = expected.refCode.replace(/\s+/g, "").toUpperCase();
    if (extNorm !== expNorm && !extNorm.includes(expNorm)) {
      mismatches.push("ref_code_mismatch");
    }
  }

  let currencyOk = false;
  if (extraction.currency == null) {
    mismatches.push("currency_missing");
  } else if (extraction.currency !== expected.currency) {
    mismatches.push("currency_mismatch");
  } else {
    currencyOk = true;
  }

  let amountOk = false;
  if (extraction.amount == null) {
    mismatches.push("amount_missing");
  } else {
    const lowerBound = expected.amount * 0.95; // -5% tolerance (was -2%)
    const overpaymentBound = expected.amount * 1.1; // >+10% looks suspicious
    if (extraction.amount < lowerBound) {
      mismatches.push("amount_too_low");
    } else if (extraction.amount > overpaymentBound) {
      mismatches.push("amount_too_high");
    } else {
      amountOk = true;
    }
  }

  // Validated when currency + amount both pass. Ref code is purely
  // informational from here on — the only way to fail validation is to
  // fail one of these two hard gates (or be missing them).
  if (currencyOk && amountOk) {
    return { mismatches, validated: true };
  }

  return { mismatches, validated: false };
}

export async function runOcrOnAttachment(input: {
  attachmentUrl: string;
  attachmentMime: string | null;
  expected: ExpectedDeposit;
  /** Optional beneficiary string from the bank instructions (KB-03 per
   *  currency). When provided, the reconciler falls back to a strong
   *  beneficiary+amount+currency match in case the ref code is missing
   *  or wasn't typed in the bank's Libellé/Concept field. */
  expectedBeneficiary?: string;
  /**
   * Pre-fetched attachment bytes. When provided, skip the URL fetch step
   * and send these straight to Vision. Used by the simulator OCR endpoint
   * (operator uploads the image to the panel — there is no Respond.io
   * CDN URL to download from). The `attachmentUrl` is still required as
   * an identifier for logs but won't be hit.
   */
  prefetchedBytes?: { base64: string; mimeType: string };
}): Promise<OcrVerdict> {
  const log = getLogger();

  // Retuned 2026-05-13 (Miguel feedback, see
  // 5-13-feedback-deposit-autoconfirm-spec.md change #2): we used to
  // hard-reject `image/*` MIMEs for foreign currencies (EUR/GBP/AUD/USD)
  // up-front. The rationale was that international bank PDFs are higher
  // fidelity than mobile screenshots. Reality is the opposite for our
  // funnel: many European customers pay from mobile banking apps that
  // only export an image, and IDR customers always ship Mandiri/BCA
  // screenshots. Auto-rejecting forced those flows back to manual
  // Confirmar — friction that loses sales.
  //
  // The vision model (Claude Sonnet 4.x) reads both PDFs and images
  // equally well (see the media-block branch below — `image` vs
  // `document`), and the validation gate is now amount + currency only
  // (ref code informational), so we let images through for all
  // currencies and let `reconcile()` decide. The `screenshot_rejected`
  // verdict is retained as a possible return shape so call sites'
  // exhaustiveness checks keep working — it just isn't produced
  // anymore.
  void FOREIGN_CURRENCIES;

  let env;
  try {
    env = loadEnv();
  } catch {
    return { ok: false, reason: "no_anthropic_key" };
  }
  if (!env.ANTHROPIC_API_KEY) {
    return { ok: false, reason: "no_anthropic_key" };
  }

  let bytes: string;
  let mimeType: string;
  if (input.prefetchedBytes) {
    bytes = input.prefetchedBytes.base64;
    mimeType = input.prefetchedBytes.mimeType;
  } else {
    try {
      const fetched = await fetchAttachmentAsBase64(input.attachmentUrl);
      bytes = fetched.bytes;
      mimeType = fetched.mimeType;
    } catch (err) {
      log.warn({ err: (err as Error).message }, "ocr_comprobante: attachment fetch failed");
      return {
        ok: false,
        reason: "fetch_failed",
        message: (err as Error).message,
        attachmentMime: input.attachmentMime,
      };
    }
  }

  // Anthropic accepts two media-block flavors:
  //   • `image` block for image/jpeg, image/png, image/gif, image/webp
  //   • `document` block for application/pdf (multi-page; the model parses
  //     each page natively, no rasterization needed on our side)
  // Both go through claude-sonnet-4-x; the model picks the right decoder.
  // 2026-05-11 owner test (Miguel) confirmed real Wise transfers ship the
  // receipt as PDF — without document-block support every real deposit
  // would skip OCR auto-confirm and fall through to manual verification.
  const normalizedMime = mimeType.toLowerCase();
  const supportedImageMimes = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
  const isImage = (supportedImageMimes as readonly string[]).includes(normalizedMime);
  const isPdf = normalizedMime === "application/pdf";
  if (!isImage && !isPdf) {
    return {
      ok: false,
      reason: "fetch_failed",
      message: `unsupported_mime:${mimeType}`,
      attachmentMime: mimeType,
    };
  }

  let modelOut: string;
  try {
    type ImageMime = (typeof supportedImageMimes)[number];
    const mediaBlock: Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam = isPdf
      ? {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: bytes,
          },
        }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: normalizedMime as ImageMime,
            data: bytes,
          },
        };
    const res = await claude().messages.create({
      model: env.ANTHROPIC_MODEL_PRIMARY,
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: [mediaBlock, { type: "text", text: EXTRACTION_PROMPT }],
        },
      ],
    });
    const textBlock = res.content.find((b) => b.type === "text");
    modelOut = textBlock && "text" in textBlock ? textBlock.text : "";
  } catch (err) {
    log.warn(
      { err: (err as Error).message, mimeType: normalizedMime },
      "ocr_comprobante: vision call failed",
    );
    return {
      ok: false,
      reason: "model_failed",
      message: (err as Error).message,
      attachmentMime: normalizedMime,
    };
  }

  const extraction = parseExtraction(modelOut);
  if (!extraction) {
    return {
      ok: false,
      reason: "model_failed",
      message: "could_not_parse_json",
      attachmentMime: mimeType,
    };
  }

  const { mismatches, validated } = reconcile(
    extraction,
    input.expected,
    input.expectedBeneficiary,
  );
  return {
    ok: true,
    extraction,
    mismatches,
    validated,
    attachmentMime: mimeType,
  };
}
