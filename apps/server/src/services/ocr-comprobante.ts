// ============================================================================
// Comprobante OCR via Anthropic Vision. Owner spec
// information/INSTRUCCIONES_PAGO_GiliTrawangansteve.md §5.
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

const FETCH_TIMEOUT_MS = 8_000;
const MAX_BYTES = 6 * 1024 * 1024; // 6 MB — Anthropic image payload cap (5MB) with headroom

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

async function fetchAttachmentAsBase64(
  url: string,
): Promise<{ bytes: string; mimeType: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`attachment fetch ${res.status}`);
    }
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) {
      throw new Error(`attachment too large (${buf.length} bytes > ${MAX_BYTES})`);
    }
    return { bytes: buf.toString("base64"), mimeType: contentType.split(";")[0]!.trim() };
  } finally {
    clearTimeout(timer);
  }
}

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
 * Owner spec DPM_AI_LAUNCH §3.4 (2026-05-07):
 *   - Amount tolerance: ±2 % to absorb bank fees on international SWIFT.
 *   - Amount must NOT be > expected + 10 % (catches duplicate / wrong-amount
 *     transfers that need human review).
 *   - Ref code must match exactly (case-insensitive, whitespace-stripped).
 *   - Currency must match exactly.
 *
 * 2026-05-11 real-world learning (Miguel's BoursoBank test): European
 * banks like BoursoBank let the sender type any free-form text in the
 * "Libellé" / "Concept" / "Reference" field — and many senders forget
 * (or refuse) to copy the DPM-GT-MMDD-XXXXXX code there. To keep
 * legitimate transfers from getting stuck in deposit_pending we add
 * TWO relaxations:
 *
 *   1. Substring match — if the extracted refCode CONTAINS the expected
 *      one (after normalization), treat as match. Customers often write
 *      "Pago DPM-GT-0511-W3M8C3 Open Water" — the code is in there even
 *      if surrounded by other text.
 *
 *   2. Beneficiary fallback — when refCode is missing or doesn't match
 *      BUT (amount, currency, beneficiary name) all match strongly,
 *      accept the transfer as validated and stamp the verdict with
 *      `softMatch: "no_refcode_beneficiary_ok"` so an operator can
 *      review in audit. Risk of false-positive is low because the
 *      beneficiary name + the exact amount in the exact currency are
 *      already three strong signals.
 */
export function reconcile(
  extraction: OcrExtraction,
  expected: ExpectedDeposit,
  expectedBeneficiary?: string,
): { mismatches: string[]; validated: boolean; softMatch?: string } {
  const mismatches: string[] = [];

  let refCodeOk = false;
  if (extraction.refCode == null) {
    mismatches.push("ref_code_missing");
  } else {
    const extNorm = extraction.refCode.replace(/\s+/g, "").toUpperCase();
    const expNorm = expected.refCode.replace(/\s+/g, "").toUpperCase();
    if (extNorm === expNorm || extNorm.includes(expNorm)) {
      refCodeOk = true;
    } else {
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
    const lowerBound = expected.amount * 0.98; // -2% tolerance
    const overpaymentBound = expected.amount * 1.1; // >+10% looks suspicious
    if (extraction.amount < lowerBound) {
      mismatches.push("amount_too_low");
    } else if (extraction.amount > overpaymentBound) {
      mismatches.push("amount_too_high");
    } else {
      amountOk = true;
    }
  }

  if (mismatches.length === 0) {
    return { mismatches: [], validated: true };
  }

  // Beneficiary "soft match" — when the ONLY problem is the ref code,
  // but amount + currency match AND the extracted beneficiary maps to a
  // DPM legal name, we used to AUTO-CONFIRM. That was retired 2026-05-12
  // after Miguel showed that ANY prior DPM PDF (e.g. Bertrand Klein's
  // 40 EUR Wise transfer from a different booking) would auto-validate
  // a new conversation as long as amount + beneficiary matched. Real
  // customers can mis-type the ref code, so we still SURFACE the soft
  // match to the panel for human review — but `validated: false` keeps
  // the lead in `deposit_pending` until an operator clicks Confirm.
  const onlyRefCodeIssue =
    refCodeOk === false &&
    amountOk &&
    currencyOk &&
    mismatches.every((m) => m === "ref_code_missing" || m === "ref_code_mismatch");
  if (onlyRefCodeIssue && expectedBeneficiary && extraction.beneficiary) {
    const extBenef = extraction.beneficiary.replace(/\s+/g, "").toUpperCase();
    const expBenef = expectedBeneficiary.replace(/\s+/g, "").toUpperCase();
    if (extBenef.includes(expBenef) || expBenef.includes(extBenef)) {
      return {
        mismatches,
        validated: false,
        softMatch: "no_refcode_beneficiary_ok",
      };
    }
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
}): Promise<OcrVerdict> {
  const log = getLogger();

  // Owner spec §5 §validacion-reglas: PDF obligatorio para EUR/GBP/AUD/USD;
  // IDR acepta PDF o screenshot. We screen this BEFORE calling vision so we
  // don't burn tokens on a doomed-to-be-rejected payload.
  if (FOREIGN_CURRENCIES.has(input.expected.currency)) {
    if (input.attachmentMime && input.attachmentMime.toLowerCase().startsWith("image/")) {
      return {
        ok: false,
        reason: "screenshot_rejected",
        attachmentMime: input.attachmentMime,
      };
    }
  }

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
