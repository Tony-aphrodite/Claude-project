// ============================================================================
// HMAC signature verification for inbound Respond.io webhooks.
// Respond.io documents its signature as HMAC-SHA256 of the raw request body
// using the configured webhook secret, sent in the `x-respond-signature`
// header (or `x-respond-io-signature` in some accounts). We use a constant-
// time comparison to avoid timing oracles.
// ============================================================================

import { createHmac, timingSafeEqual } from "node:crypto";

export type HmacVerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing_header" | "bad_format" | "mismatch" };

const HEADER_CANDIDATES = [
  "x-respond-signature",
  "x-respond-io-signature",
  "x-webhook-signature",
];

export function pickSignatureHeader(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  for (const name of HEADER_CANDIDATES) {
    const v = headers[name];
    if (typeof v === "string" && v.length > 0) return v;
    if (Array.isArray(v) && v[0]) return v[0];
  }
  return undefined;
}

/**
 * Verify a webhook signature. The expected format is `sha256=<hex>` but we
 * also accept a bare hex digest because some Respond.io tenants ship that
 * format historically.
 */
export function verifySignature(
  rawBody: Buffer | string,
  headerValue: string | undefined,
  secret: string,
): HmacVerifyResult {
  if (!headerValue) return { ok: false, reason: "missing_header" };

  const provided = headerValue.startsWith("sha256=")
    ? headerValue.slice("sha256=".length)
    : headerValue;

  if (!/^[0-9a-fA-F]+$/.test(provided)) return { ok: false, reason: "bad_format" };

  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  const expected = createHmac("sha256", secret).update(body).digest("hex");

  if (provided.length !== expected.length) return { ok: false, reason: "mismatch" };

  const a = Buffer.from(provided.toLowerCase(), "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return { ok: false, reason: "mismatch" };
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: "mismatch" };
}
