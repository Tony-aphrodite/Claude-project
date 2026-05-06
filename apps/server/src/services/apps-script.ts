// ============================================================================
// Google Apps Script availability fetcher. Owner spec (Miguel, 2026-05-06):
//
//   GET <url>?date=YYYY-MM-DD&days=N   →  AvailabilityResponse
//
// Response includes a fresh `hora_actual_wita` ("HH:mm" 24h in Asia/Makassar)
// that we MUST NOT cache — the time-of-day cutoff logic in
// `bookable-slots.ts` depends on it being accurate to the minute.
//
// Hard 2s AbortController timeout per call. On timeout / non-2xx /
// malformed body we return null and let the AI surface a "no pude
// verificar disponibilidad ahora" note rather than fabricating slots.
//
// Cache policy: we keep a very short Supabase-backed cache (≤30 s) so
// rapid-fire AI calls within the same conversation turn don't flood Apps
// Script, but anything older than 30 s is refetched. Setting the cache
// row uses the SAME (date, days) tuple as cache key so different windows
// don't collide.
//
// Multi-day fan-out (workaround for current Apps Script behavior, 2026-05-06):
// Miguel's deployed Apps Script ignores the `days` parameter and always
// returns a single day in `detalle`. We compensate by issuing one call per
// missing date in parallel and merging. When Miguel ships the fix that
// returns the full window in one call, the first response will already
// cover all dates and the per-day fan-out becomes a no-op.
// ============================================================================

import { and, desc, eq, gt, sql } from "drizzle-orm";

import { getDb, rosterCache, type Sede } from "@dpm/db";
import type { AvailabilityResponse } from "@dpm/shared";

import { loadEnv } from "../env.js";
import { getLogger } from "../logger.js";
import { addDays } from "./program-schedule.js";

const FRESHNESS_MS = 30_000; // 30 seconds — short enough that hora_actual_wita stays accurate.

export class AppsScriptService {
  /**
   * Fetch availability for `days` consecutive dates starting at `date`.
   * Returns null on any failure (timeout, non-2xx, malformed body, no URL
   * configured). The caller must degrade gracefully.
   */
  async fetchAvailability(
    sede: Sede,
    opts: { date: string; days: number },
  ): Promise<AvailabilityResponse | null> {
    const cacheKey = `${opts.date}|${opts.days}`;
    const cached = await this.readCache(sede.id, cacheKey);
    if (cached) return cached;

    const fresh = await this.fetchFresh(sede, opts);
    if (fresh) await this.writeCache(sede.id, cacheKey, fresh);
    return fresh;
  }

  private async readCache(
    sedeId: string,
    cacheKey: string,
  ): Promise<AvailabilityResponse | null> {
    const db = getDb();
    const cutoff = new Date(Date.now() - FRESHNESS_MS);
    const [row] = await db
      .select()
      .from(rosterCache)
      .where(
        and(
          eq(rosterCache.sedeId, sedeId),
          gt(rosterCache.createdAt, cutoff),
          sql`${rosterCache.snapshot}->>'_cacheKey' = ${cacheKey}`,
        ),
      )
      .orderBy(desc(rosterCache.createdAt))
      .limit(1);
    if (!row) return null;
    const snap = row.snapshot as Record<string, unknown>;
    if (typeof snap !== "object" || snap === null) return null;
    // Strip the synthetic `_cacheKey` we added before returning.
    const { _cacheKey: _omit, ...rest } = snap as { _cacheKey?: string };
    return rest as unknown as AvailabilityResponse;
  }

  private async writeCache(
    sedeId: string,
    cacheKey: string,
    snapshot: AvailabilityResponse,
  ): Promise<void> {
    const db = getDb();
    const expiresAt = new Date(Date.now() + FRESHNESS_MS);
    await db.insert(rosterCache).values({
      sedeId,
      // Embed the cache key inside the JSONB so the same row type can hold
      // multiple windows; readCache filters on it.
      snapshot: { ...snapshot, _cacheKey: cacheKey } as unknown as Record<
        string,
        unknown
      >,
      expiresAt,
    });
  }

  private async fetchFresh(
    sede: Sede,
    opts: { date: string; days: number },
  ): Promise<AvailabilityResponse | null> {
    const url = (sede.rosterConfig as { url?: string } | null)?.url;
    if (!url) return null;

    // Always start with a single call for the requested window. If Miguel's
    // Apps Script returns the full window we're done; otherwise we fan out.
    const first = await this.fetchOne(sede, url, opts.date, opts.days);
    if (!first) return null;

    if (opts.days <= 1) return first;

    const have = new Set(first.detalle.map((d) => d.fecha));
    const missing: string[] = [];
    for (let i = 0; i < opts.days; i++) {
      const d = addDays(opts.date, i);
      if (!have.has(d)) missing.push(d);
    }
    if (missing.length === 0) return first;

    // Fan out one call per missing date. Each call still asks days=1 — the
    // Apps Script returns just that day. We then merge into a single response.
    const log = getLogger();
    log.info(
      { sede: sede.nombre, requested: opts.days, returned: first.detalle.length, missing: missing.length },
      "apps_script returned partial window — filling in per-day",
    );

    const extras = await Promise.all(missing.map((d) => this.fetchOne(sede, url, d, 1)));
    const merged = [...first.detalle];
    for (const r of extras) {
      if (r && Array.isArray(r.detalle)) merged.push(...r.detalle);
    }
    merged.sort((a, b) => a.fecha.localeCompare(b.fecha));

    const firstAvailable = merged.find((d) => d.disponible);
    return {
      ...first,
      detalle: merged,
      disponible: merged.some((d) => d.disponible),
      primer_dia_disponible: firstAvailable?.fecha ?? first.primer_dia_disponible,
    };
  }

  /**
   * One Apps Script call. Returns the parsed body or null on any failure
   * (timeout / non-2xx / malformed). Owns its own AbortController so
   * concurrent fan-out calls each get their own deadline.
   */
  private async fetchOne(
    sede: Sede,
    url: string,
    date: string,
    days: number,
  ): Promise<AvailabilityResponse | null> {
    const env = loadEnv();
    const log = getLogger();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.APPS_SCRIPT_TIMEOUT_MS);
    const fullUrl = `${url}?date=${encodeURIComponent(date)}&days=${days}`;

    try {
      const res = await fetch(fullUrl, {
        method: "GET",
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        log.warn(
          { sede: sede.nombre, status: res.status, date, days },
          "apps_script returned non-2xx",
        );
        return null;
      }
      const json = (await res.json()) as Partial<AvailabilityResponse>;
      if (
        typeof json !== "object" ||
        json === null ||
        typeof json.hora_actual_wita !== "string" ||
        typeof json.fecha_consultada !== "string" ||
        !Array.isArray(json.detalle)
      ) {
        log.warn(
          { sede: sede.nombre, date },
          "apps_script returned malformed availability",
        );
        return null;
      }
      return json as AvailabilityResponse;
    } catch (err) {
      const aborted = (err as { name?: string }).name === "AbortError";
      log.warn(
        { sede: sede.nombre, aborted, err: aborted ? "timeout" : err, date },
        "apps_script fetch failed",
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

export const appsScriptService = new AppsScriptService();
