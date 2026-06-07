// ============================================================================
// Sales logger — POSTs one row per program to Miguel's existing Apps
// Script (DPM_Ventas_Master sheet).
//
// Miguel rule 2026-06-07: the AI uses the SAME `/exec` endpoint humans use
// via the "DPM Ventas Master Logger" workflow. The only difference is the
// caller — humans go through the workflow (which auto-fills $contact.X
// variables), the AI POSTs directly with the real values. That keeps a
// SINGLE writer per sale and avoids double-writing when "booked by ai" is
// a label-only category with no workflow behind it.
//
// Full spec: information/2026-06-07-miguel-sales-logger-spec.md
//
// Authentication: a shared token is sent in the JSON body (not header)
// and verified by Miguel's Apps Script.
//
// Failure model: per-row idempotency tracked by the CALLER via
// `lead_metadata.sale_logged_at_by_program`. We retry on 5xx with linear
// backoff; 4xx errors return immediately (caller's payload problem).
// Hard failures bubble up so the panel can show "manual log needed".
// ============================================================================

import { loadEnv } from "../env.js";
import { getLogger } from "../logger.js";

const TIMEOUT_MS = 5000; // Sheet writes can be slow — 2s (roster default) is too tight.
const MAX_RETRIES = 2; // Total 3 attempts.

/**
 * Row payload Miguel's Apps Script expects. Field names + casing match
 * his spec EXACTLY — the script maps them to sheet columns by name, so
 * misnaming a field silently drops that column.
 */
export type SalesLoggerRow = {
  /** Shared secret token. Sent in body (not header). */
  token: string;
  /** "YYYY-MM-DD HH:MM:SS" in the sede's local timezone — NOT ISO 8601. */
  fecha_venta: string;
  /** Sede display name as it appears in Miguel's tarifario.
   *  Must match EXACTLY or his revenue calculator returns 0. */
  sede: string;
  /** Customer first name (split from full name). Empty string OK. */
  firstName: string;
  /** Customer last name (split from full name). Empty string OK. */
  lastName: string;
  /** Customer phone with + prefix. Empty string OK. */
  phone: string;
  /** Customer email. Empty string OK. */
  email: string;
  /** ISO country code (e.g. "GB", "US", "AR"). Empty string OK. */
  countryCode: string;
  /** ISO 639-1 language code (e.g. "en", "es"). Empty string OK. */
  language: string;
  /** Program display name from Miguel's tarifario (e.g. "OW 18", not "OW").
   *  Must match EXACTLY per sede or revenue is 0. */
  programa: string;
  /** "AM" | "PM" | "Nocturno" | "Confinadas" — derived from program-schedule. */
  turno: string;
  /** Pax for this row (multi-program splits: 1 per row; single-program: total). */
  pax: number;
  /** TOTAL amount (pax × per-person), in the chosen currency. NOT per-person. */
  monto: number;
  /** ISO currency code (EUR / GBP / AUD / USD / IDR / THB). */
  moneda: string;
  /** Closer-agent name as registered in Miguel's Config tab.
   *  For Phi Phi AI: "Francisco Emilio" (exact). */
  agente_cierre: string;
  /** Meta CTWA attribution source (e.g. "web", "fb_ads"). Empty OK. */
  marketing_source: string;
  /** Meta CTWA campaign name. Empty OK. */
  marketing_campaign: string;
  /** Google click id (CTWA via search ads). Empty OK. */
  gclid: string;
  /** Full course price in USD if known. Empty string OK. */
  precio_total_usd: string;
  /** Remaining balance after deposit, in USD. Empty string OK. */
  resto_a_pagar_usd: string;
  /** Discount label ("Sin descuento" / "5%" / "10%"). */
  descuento: string;
  /** Unique per-row ref code (one per program in multi-program bookings). */
  codigo_referencia: string;
};

export type LogSaleResult =
  | { ok: true; rowId?: string }
  | {
      ok: false;
      reason:
        | "no_logger_url"
        | "no_logger_token"
        | "upstream_error"
        | "timeout"
        | "client_error";
      message: string;
      httpStatus?: number;
    };

export class SalesLoggerService {
  /**
   * POST one row to Miguel's Apps Script. Idempotency is the CALLER's
   * responsibility (track logged programas in lead_metadata). This
   * service is a dumb pipe with auth + retry.
   *
   * URL resolution order (first hit wins):
   *   1. `SALES_LOGGER_URL_OVERRIDE` env (dev/test escape hatch)
   *   2. `SALES_LOGGER_URL` env (production)
   *
   * Caller MUST NOT set `row.token` — this service injects it from env
   * so callers don't have to know the secret. If the env var is unset
   * we fail with `no_logger_token`.
   */
  async logSale(
    row: Omit<SalesLoggerRow, "token">,
  ): Promise<LogSaleResult> {
    const log = getLogger();
    const env = loadEnv();
    const effectiveUrl = env.SALES_LOGGER_URL_OVERRIDE || env.SALES_LOGGER_URL;
    const token = env.SALES_LOGGER_TOKEN;

    if (!effectiveUrl) {
      return {
        ok: false,
        reason: "no_logger_url",
        message:
          "SALES_LOGGER_URL is not configured — operator must log this sale manually.",
      };
    }
    if (!token) {
      return {
        ok: false,
        reason: "no_logger_token",
        message:
          "SALES_LOGGER_TOKEN is not configured — Miguel's script will reject the row.",
      };
    }

    const body: SalesLoggerRow = { ...row, token };

    let attempt = 0;
    type RetryErr = {
      reason: "upstream_error" | "timeout";
      message: string;
      httpStatus?: number;
    };
    let lastErr: RetryErr | null = null;
    while (attempt <= MAX_RETRIES) {
      attempt += 1;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
        const res = await fetch(effectiveUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.status >= 200 && res.status < 300) {
          // Miguel's Apps Script response shape (verified 2026-06-07
          // smoke test): { ok: true, row: <number>, tab: <string> } on
          // success, { ok: false, error: <string> } on rejection. We
          // accept both `row` and `rowId` for forward-compat.
          const respBody = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            row?: number | string;
            rowId?: string;
            tab?: string;
            error?: string;
          };
          if (respBody.ok === false) {
            return {
              ok: false,
              reason: "upstream_error",
              message:
                respBody.error ??
                "Apps Script returned ok=false in the response body",
              httpStatus: res.status,
            };
          }
          const rowId =
            respBody.rowId ??
            (respBody.row !== undefined ? String(respBody.row) : undefined);
          log.info(
            {
              sede: row.sede,
              codigo_referencia: row.codigo_referencia,
              programa: row.programa,
              attempt,
              rowId,
              tab: respBody.tab,
            },
            "sales_logger row written",
          );
          return { ok: true, rowId };
        }

        // 4xx → client problem, don't retry.
        if (res.status >= 400 && res.status < 500) {
          const txt = await res.text().catch(() => "");
          return {
            ok: false,
            reason: "client_error",
            message: `Apps Script rejected payload (${res.status}): ${txt.slice(0, 200)}`,
            httpStatus: res.status,
          };
        }

        // 5xx → retry
        lastErr = {
          reason: "upstream_error",
          message: `Apps Script returned ${res.status}`,
          httpStatus: res.status,
        };
      } catch (err) {
        const isAbort = (err as Error).name === "AbortError";
        lastErr = isAbort
          ? { reason: "timeout", message: `Apps Script did not respond within ${TIMEOUT_MS}ms` }
          : { reason: "upstream_error", message: (err as Error).message };
      }
      if (attempt <= MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
    return {
      ok: false,
      reason: lastErr?.reason ?? "upstream_error",
      message: lastErr?.message ?? "sales_logger exhausted retries",
      ...(lastErr?.httpStatus !== undefined ? { httpStatus: lastErr.httpStatus } : {}),
    };
  }
}

export const salesLoggerService = new SalesLoggerService();
