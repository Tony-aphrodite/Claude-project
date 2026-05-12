// ============================================================================
// HMAC signature verification for inbound Respond.io webhooks.
//
// Respond.io's webhook signature is HMAC-SHA256 of the raw request body using
// the configured webhook secret. The signature is sent as **base64** in the
// `x-respond-signature` header. The configured secret is itself base64 (the
// "Clave de firma" Respond.io shows in the UI ends with `=`), so we treat it
// as either a base64 blob (preferred — matches how Respond.io signs) or a
// raw string fallback.
//
// Legacy tenants (and our older test fixtures) used hex signatures with an
// optional `sha256=` prefix; we keep accepting that form so smoke tests via
// curl + openssl don't break.
//
// All comparisons go through timingSafeEqual to avoid timing oracles.
// ============================================================================

import { createHmac, timingSafeEqual } from "node:crypto";

export type HmacVerifyResult =
  | { ok: true; matched: "respond-io-base64" | "hex" }
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

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const HEX_RE = /^[0-9a-fA-F]+$/;

/**
 * Verify a webhook signature.
 *
 * Order of attempts (each runs constant-time inside its branch):
 *   1. Respond.io style — header is base64, secret is base64-decoded into
 *      the HMAC key, body signed, expected output also base64.
 *   2. Legacy hex — `sha256=<hex>` or bare hex digest, secret used as a
 *      string (no base64 decode), expected output in hex.
 *
 * Both attempts use the same body buffer so the comparison cost is O(body).
 * We return the first form that matches; mismatch on both forms returns
 * `mismatch` so the route layer can log + 401.
 */
export function verifySignature(
  rawBody: Buffer | string,
  headerValue: string | undefined,
  secret: string,
): HmacVerifyResult {
  if (!headerValue) return { ok: false, reason: "missing_header" };

  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;

  // Strip optional "sha256=" prefix that some senders prepend.
  const stripped = headerValue.startsWith("sha256=")
    ? headerValue.slice("sha256=".length)
    : headerValue;

  // ── Attempt 1: Respond.io base64 ──────────────────────────────────────────
  // The secret can be supplied either as base64 (preferred) or as a raw
  // string. We try both keying strategies because Respond.io's docs are
  // ambiguous and tenants self-rotate over time.
  if (BASE64_RE.test(stripped)) {
    const providedB64 = stripped;
    const keyVariants: Buffer[] = [];
    // Variant A: secret is base64-encoded, decode to bytes.
    try {
      const decoded = Buffer.from(secret, "base64");
      // sanity: round-trip must produce the same string (modulo padding) so
      // we don't decode a non-base64 string as base64 silently.
      if (decoded.length > 0) keyVariants.push(decoded);
    } catch {
      // ignore — fall through to raw string variant
    }
    // Variant B: secret is a raw string used as the HMAC key directly.
    keyVariants.push(Buffer.from(secret, "utf8"));

    for (const key of keyVariants) {
      const expectedB64 = createHmac("sha256", key).update(body).digest("base64");
      if (timingSafeStringEqual(providedB64, expectedB64)) {
        return { ok: true, matched: "respond-io-base64" };
      }
    }
  }

  // ── Attempt 2: legacy hex ────────────────────────────────────────────────
  if (HEX_RE.test(stripped)) {
    const expectedHex = createHmac("sha256", secret).update(body).digest("hex");
    if (timingSafeStringEqual(stripped.toLowerCase(), expectedHex)) {
      return { ok: true, matched: "hex" };
    }
  }

  // Header didn't match either format we recognize, OR it matched a format
  // but the digest didn't line up. We can't tell those apart safely without
  // leaking timing, so we collapse to a single "mismatch" verdict — except
  // when we never even saw a recognizable encoding, in which case
  // `bad_format` is informative for debugging.
  if (!BASE64_RE.test(stripped) && !HEX_RE.test(stripped)) {
    return { ok: false, reason: "bad_format" };
  }
  return { ok: false, reason: "mismatch" };
}

/**
 * Constant-time comparison of two strings (interpreted as UTF-8 bytes).
 * Returns false fast on length mismatch, otherwise uses crypto.timingSafeEqual
 * over equal-length buffers.
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// ── Token-based fallback auth ───────────────────────────────────────────────
// Some webhook callers can't compute a body-dependent HMAC (e.g. Respond.io's
// generic HTTP-Request workflow step, which only allows static headers). For
// those callers we accept a shared bearer token via x-workflow-token. The
// token is opaque to the body, so it offers no integrity guarantee — only
// authentication. We use it ONLY for trusted internal callers and require it
// to be at least 16 chars (validated upstream in env.ts).
//
// Order of attempts in authenticateWebhook:
//   1. If x-workflow-token is present AND configured token is non-empty AND
//      they match constant-time → accept (matched: "workflow-token").
//   2. Otherwise fall back to HMAC verification of the body against
//      x-respond-signature (existing path).
//
// If neither matches, the verdict from HMAC is returned so callers can log
// the original reason ("missing_header" / "mismatch" / "bad_format").

const WORKFLOW_TOKEN_HEADER = "x-workflow-token";

export type AuthVerifyResult =
  | { ok: true; matched: "workflow-token" | "respond-io-base64" | "hex" }
  | { ok: false; reason: "missing_header" | "bad_format" | "mismatch" };

export function pickWorkflowTokenHeader(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  const v = headers[WORKFLOW_TOKEN_HEADER];
  if (typeof v === "string" && v.length > 0) return v;
  if (Array.isArray(v) && v[0]) return v[0];
  return undefined;
}

/**
 * Authenticate a webhook request. Tries the bearer-token path first (if a
 * non-empty token is configured), then falls back to HMAC of the body.
 *
 * Multi-secret support (2026-05-12): Respond.io generates an independent
 * `Clave de firma` per webhook and won't let operators edit them after
 * creation. A single workspace can therefore have multiple valid secrets
 * — one for the message webhook, one each for lifecycle/assignee/tag sync.
 * Pass them in via `hmacSecretsExtra`. We try the primary `hmacSecret`
 * first (hot path = inbound customer messages) then each extra. Any match
 * accepts; we collapse to the primary's verdict on full miss so the log
 * line stays uniform.
 */
export function authenticateWebhook(args: {
  rawBody: Buffer | string;
  signatureHeader: string | undefined;
  tokenHeader: string | undefined;
  hmacSecret: string;
  /** Additional accepted HMAC secrets (e.g. per-webhook keys for sync
   *  webhooks that can't be re-keyed to match the message webhook). */
  hmacSecretsExtra?: readonly string[];
  workflowToken?: string | undefined;
}): AuthVerifyResult {
  const {
    rawBody,
    signatureHeader,
    tokenHeader,
    hmacSecret,
    hmacSecretsExtra,
    workflowToken,
  } = args;

  if (workflowToken && workflowToken.length > 0 && tokenHeader) {
    if (timingSafeStringEqual(tokenHeader, workflowToken)) {
      return { ok: true, matched: "workflow-token" };
    }
    // token presented but didn't match — keep going through HMAC, since a
    // legitimate Respond.io webhook may still carry the right signature.
  }

  const primary = verifySignature(rawBody, signatureHeader, hmacSecret);
  if (primary.ok) return primary;

  // Only try extras when the primary failed *because the digest didn't
  // line up*. `missing_header` / `bad_format` won't be fixed by trying
  // another key, so we short-circuit those.
  if (primary.reason !== "mismatch" || !hmacSecretsExtra?.length) {
    return primary;
  }

  for (const extra of hmacSecretsExtra) {
    if (!extra || extra.length === 0) continue;
    const v = verifySignature(rawBody, signatureHeader, extra);
    if (v.ok) return v;
  }
  return primary;
}
