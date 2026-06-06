// ============================================================================
// Per-sede Google Apps Script sales logger.
//
// Miguel feedback 2026-06-06: when a sale is confirmed (deposit auto-
// confirmed by OCR), the AI must write ONE row PER PROGRAM into the
// existing DPM_Ventas_Master sheet — the SAME sheet humans write to —
// so there is a single source of truth for reconciliation. Each row
// carries its own ref code, agent="Francisco" (so master can filter
// AI-vs-human), and the program's specific values.
//
// Architecture mirrors `apps-script.ts` (roster fetcher). Per-sede URL
// lives in `sede.roster_config.sales_logger_url` JSONB — same column
// already holds `url` (roster) and `default_capacity` (capacity overrides).
// Miguel owns the Apps Script behind that URL, so the column mapping is
// his responsibility, not ours.
//
// Failure model: per-row idempotency tracked via
// `lead_metadata.sale_logged_at_by_program`. Server retries on transient
// network errors with exponential backoff. Hard failures (no URL,
// upstream 4xx) surface as `reason` so the panel can show "AI tried to
// log sale, write failed — please log manually". We DO NOT swallow these
// silently because the master sheet is the operator's only billing
// view.
//
// Tested contract (Apps Script side):
//   POST <url>
//   Content-Type: application/json
//   Body: { row: {...} }
//   Response 200: { ok: true, rowId?: string }
//   Response 4xx/5xx: row not written, server should NOT retry on 4xx
// ============================================================================

import type { Sede } from "@dpm/db";

import { loadEnv } from "../env.js";
import { getLogger } from "../logger.js";

const TIMEOUT_MS = 5000; // Sheet writes can be slow — 2s (roster default) is too tight.
const MAX_RETRIES = 2; // Total 3 attempts.

export type SalesLoggerRow = {
  /** Program-specific ref code (DPM-PP-MMDD-XXXXXX). */
  ref_code: string;
  /** CatalogProgram key (e.g. "OW", "AOW", "TryScuba"). */
  programa: string;
  /** "AM" | "PM" | "AM/PM" | "Nocturno" — derived from program-schedule. */
  turno?: string | null;
  /** Pax for THIS row only (not the booking total when multi-program). */
  pax: number;
  /** Total deposit for this row = per-person × pax. */
  monto: number;
  moneda: string;
  sede: string;
  start_date: string;
  cliente_nombre?: string | null;
  cliente_telefono?: string | null;
  /** Discount label ("Sin descuento" / "5%" / "10%"). */
  descuento?: string | null;
  /** Always "Francisco" when written by AI. */
  agent: string;
  /** Tagged true so the master sheet can filter AI rows. */
  closed_by_ai: boolean;
  /** ISO timestamp of when the AI logged this sale. */
  logged_at: string;
};

export type LogSaleResult =
  | { ok: true; rowId?: string }
  | {
      ok: false;
      reason: "no_logger_url" | "upstream_error" | "timeout" | "client_error";
      message: string;
      httpStatus?: number;
    };

export class SalesLoggerService {
  /**
   * POST one row to the sede's sales logger. Idempotency is the CALLER's
   * responsibility (track logged programas in lead_metadata) — this
   * service is dumb-pipe.
   *
   * Network/5xx errors retry up to MAX_RETRIES with linear backoff.
   * 4xx errors return immediately (caller's responsibility to fix the
   * payload).
   */
  async logSale(sede: Sede, row: SalesLoggerRow): Promise<LogSaleResult> {
    const log = getLogger();
    const env = loadEnv();
    const url = (sede.rosterConfig as { sales_logger_url?: string } | null)
      ?.sales_logger_url;

    // Override path for tests / local dev. Env var beats DB config so a
    // developer can swap in a webhook.site URL without touching DB rows.
    const effectiveUrl = env.SALES_LOGGER_URL_OVERRIDE || url;
    if (!effectiveUrl) {
      return {
        ok: false,
        reason: "no_logger_url",
        message: `Sede ${sede.nombre} has no sales_logger_url in roster_config — operator must log this sale manually.`,
      };
    }

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
          body: JSON.stringify({ row }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.status >= 200 && res.status < 300) {
          const body = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            rowId?: string;
          };
          if (body.ok === false) {
            return {
              ok: false,
              reason: "upstream_error",
              message: "Apps Script returned ok=false in the response body",
              httpStatus: res.status,
            };
          }
          log.info(
            { sede: sede.nombre, refCode: row.ref_code, attempt, rowId: body.rowId },
            "sales_logger row written",
          );
          return { ok: true, rowId: body.rowId };
        }

        // 4xx → client problem, don't retry.
        if (res.status >= 400 && res.status < 500) {
          const body = await res.text().catch(() => "");
          return {
            ok: false,
            reason: "client_error",
            message: `Apps Script rejected payload (${res.status}): ${body.slice(0, 200)}`,
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
