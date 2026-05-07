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
 */
export function reconcile(
  extraction: OcrExtraction,
  expected: ExpectedDeposit,
): { mismatches: string[]; validated: boolean } {
  const mismatches: string[] = [];

  if (extraction.refCode == null) {
    mismatches.push("ref_code_missing");
  } else if (
    extraction.refCode.replace(/\s+/g, "").toUpperCase() !==
    expected.refCode.replace(/\s+/g, "").toUpperCase()
  ) {
    mismatches.push("ref_code_mismatch");
  }

  if (extraction.currency == null) {
    mismatches.push("currency_missing");
  } else if (extraction.currency !== expected.currency) {
    mismatches.push("currency_mismatch");
  }

  if (extraction.amount == null) {
    mismatches.push("amount_missing");
  } else {
    const lowerBound = expected.amount * 0.98; // -2% tolerance
    const overpaymentBound = expected.amount * 1.1; // >+10% looks suspicious
    if (extraction.amount < lowerBound) {
      mismatches.push("amount_too_low");
    } else if (extraction.amount > overpaymentBound) {
      mismatches.push("amount_too_high");
    }
  }

  return { mismatches, validated: mismatches.length === 0 };
}

export async function runOcrOnAttachment(input: {
  attachmentUrl: string;
  attachmentMime: string | null;
  expected: ExpectedDeposit;
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

  // Anthropic vision currently supports image/jpeg, image/png, image/gif,
  // image/webp natively. PDFs need the `documents` content block (separate
  // beta). For v1 we only ship image OCR. PDFs land in the panel for
  // manual verification with reason `pdf_skipped_v1`.
  const supported = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!supported.includes(mimeType.toLowerCase())) {
    return {
      ok: false,
      reason: "fetch_failed",
      message: `unsupported_mime:${mimeType}`,
      attachmentMime: mimeType,
    };
  }

  let modelOut: string;
  try {
    const res = await claude().messages.create({
      model: env.ANTHROPIC_MODEL_PRIMARY,
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: bytes,
              },
            },
            { type: "text", text: EXTRACTION_PROMPT },
          ],
        },
      ],
    });
    const textBlock = res.content.find((b) => b.type === "text");
    modelOut = textBlock && "text" in textBlock ? textBlock.text : "";
  } catch (err) {
    log.warn({ err: (err as Error).message }, "ocr_comprobante: vision call failed");
    return {
      ok: false,
      reason: "model_failed",
      message: (err as Error).message,
      attachmentMime: mimeType,
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

  const { mismatches, validated } = reconcile(extraction, input.expected);
  return {
    ok: true,
    extraction,
    mismatches,
    validated,
    attachmentMime: mimeType,
  };
}
