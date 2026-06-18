// ============================================================================
// Google Apps Script availability fetcher.
//
// Owner spec (Miguel, 2026-05-06, revised 2026-05-18):
//
//   GET <url>?date=YYYY-MM-DD&days=N[&pax=N][&curso=NAME][&mode=single|range]
//     → AvailabilityResponse
//
// The pax / curso / mode params were added in Miguel's Koh Tao v2 roster
// script (see reference/koh-tao-ROSTER_SCRIPT_v2_NOTES.md).
// They let the script filter slots that wouldn't actually fit the
// customer's request — pre-v2 the script ignored these even when sent,
// and Emma confirmed bookings on full / wrong-slot boats. Other sedes'
// scripts (GT/GA/PP/NP) currently ignore unknown query params (Apps
// Script's e.parameter just doesn't see them), so it's safe to send the
// new params to every sede — pre-v2 scripts behave exactly as before.
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
// Script, but anything older than 30 s is refetched. Cache key includes
// pax + curso + mode so two requests for different group sizes don't
// share a cached response with the wrong filters applied.
//
// Multi-day fan-out (workaround for pre-v2 Apps Script behavior):
// Older deployments ignored the `days` parameter and always returned a
// single day in `detalle`. We compensate by issuing one call per missing
// date in parallel and merging. With Miguel's v2 KT script (and any future
// script that respects `days`) the first response already covers all dates
// and the per-day fan-out becomes a no-op.
// ============================================================================

import { and, desc, eq, gt, sql } from "drizzle-orm";

import { getDb, rosterCache, type Sede } from "@dpm/db";
import type { AvailabilityResponse } from "@dpm/shared";

import { loadEnv } from "../env.js";
import { getLogger } from "../logger.js";
import { addDays } from "./program-schedule.js";

const FRESHNESS_MS = 30_000; // 30 seconds — short enough that hora_actual_wita stays accurate.

/**
 * Our `programa` enum (consultar-disponibilidad tool input) is a smaller
 * historical set than Miguel's per-sede CURSOS dictionaries in his v2
 * Apps Scripts. This table translates the names that DIFFER on the way
 * out so each sede's .gs can apply its slot/pax filters.
 *
 * The 4-sede v2 rollout (Miguel 2026-05-19) confirmed the canonical
 * keys — see reference/ROSTER_SCRIPT_v2_FULL_ROLLOUT.md for the full
 * per-sede vocabulary tables.
 *
 * Anything not in this table passes through unchanged (TryScuba,
 * ScubaDiver, OW, OW30, Refresh, DeepSpecialty, ReactRight,
 * NitroxSpecialty all match verbatim). If a value isn't in the target
 * sede's CURSOS table the script silently falls through to "no curso
 * filter" — equivalent to legacy behavior, safe degradation.
 */
const PROGRAMA_TO_CURSO: Record<string, string> = {
  AOW: "Advanced",
  RescueDiver: "Rescue",
  RefreshAdv: "RefreshAdvanced",
  FunDive: "FunDives",
  DeepAdvFD: "DeepAdventure",
};

/**
 * Per-call options for the Apps Script roster endpoint. `pax` / `curso`
 * / `mode` are forwarded as query params; the Koh Tao v2 script uses
 * them to filter slots, older scripts ignore them harmlessly.
 */
export type FetchAvailabilityOpts = {
  date: string;
  days: number;
  pax?: number;
  curso?: string;
  mode?: "single" | "range";
};

export class AppsScriptService {
  /**
   * Fetch availability for `days` consecutive dates starting at `date`.
   * Returns null on any failure (timeout, non-2xx, malformed body, no URL
   * configured). The caller must degrade gracefully.
   */
  async fetchAvailability(
    sede: Sede,
    opts: FetchAvailabilityOpts,
  ): Promise<AvailabilityResponse | null> {
    // Cache key must include every param that changes the response — a
    // pax=2 vs pax=30 request returns different slot verdicts, so they
    // mustn't share a cached row.
    const cacheKey = [
      opts.date,
      opts.days,
      opts.pax ?? "",
      opts.curso ?? "",
      opts.mode ?? "",
    ].join("|");
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
    opts: FetchAvailabilityOpts,
  ): Promise<AvailabilityResponse | null> {
    const url = (sede.rosterConfig as { url?: string } | null)?.url;
    if (!url) return null;

    // Always start with a single call for the requested window. If Miguel's
    // Apps Script returns the full window we're done; otherwise we fan out.
    const first = await this.fetchOne(sede, url, opts, opts.date, opts.days);
    if (!first) return null;

    // Out-of-scope responses are a structured handoff, not an availability
    // report. No fan-out makes sense — every per-day call would return the
    // same out_of_scope payload. Return immediately.
    if (first.out_of_scope === true) return first;

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
    // pax/curso/mode are NOT propagated to the fan-out calls because they
    // only make sense across the full window (e.g. a 3-day-consecutive
    // OW check). Per-day fan-out is the legacy fallback path; the v2 KT
    // script returns the full window in one call so this loop is a no-op
    // for KT and we can keep the legacy fan-out simple.
    const log = getLogger();
    log.info(
      { sede: sede.nombre, requested: opts.days, returned: first.detalle.length, missing: missing.length },
      "apps_script returned partial window — filling in per-day",
    );

    const extras = await Promise.all(
      missing.map((d) => this.fetchOne(sede, url, { date: d, days: 1 }, d, 1)),
    );
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
    opts: FetchAvailabilityOpts,
    date: string,
    days: number,
  ): Promise<AvailabilityResponse | null> {
    const env = loadEnv();
    const log = getLogger();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.APPS_SCRIPT_TIMEOUT_MS);
    // Build query string. date + days always; pax / curso / mode only when
    // the caller supplied them. Older Apps Script versions (pre-v2 KT, and
    // every other sede until they upgrade) silently ignore unknown params,
    // so this is safe to send across the board.
    const params = new URLSearchParams({ date, days: String(days) });
    if (opts.pax !== undefined) params.set("pax", String(opts.pax));
    if (opts.curso !== undefined && opts.curso !== "") {
      // Translate our programa enum to Miguel's CURSOS keys when they
      // differ (AOW → Advanced, RescueDiver → Rescue). Pass-through for
      // values that already match.
      const curso = PROGRAMA_TO_CURSO[opts.curso] ?? opts.curso;
      params.set("curso", curso);
    }
    if (opts.mode !== undefined) params.set("mode", opts.mode);
    const fullUrl = `${url}?${params.toString()}`;

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
      if (typeof json !== "object" || json === null) {
        log.warn(
          { sede: sede.nombre, date },
          "apps_script returned malformed availability",
        );
        return null;
      }
      // Out-of-scope handoff path (Miguel v3/v4 .gs): when curso is
      // Divemaster/Instructor the script returns out_of_scope:true with
      // an accion/oficina_tel/derivar_a_sede/proximamente payload and
      // no detalle. Accept that shape — downstream code that iterates
      // detalle gets an empty array so it can't trip.
      if (json.out_of_scope === true) {
        if (!Array.isArray(json.detalle)) {
          (json as { detalle: unknown }).detalle = [];
        }
        return json as AvailabilityResponse;
      }
      if (
        typeof json.fecha_consultada !== "string" ||
        !Array.isArray(json.detalle)
      ) {
        log.warn(
          { sede: sede.nombre, date },
          "apps_script returned malformed availability",
        );
        return null;
      }
      // hora_actual_wita is optional — sedes outside WITA (Koh Tao,
      // Koh Phi Phi) and Nusa Penida currently omit it. Coerce non-strings
      // (null) to undefined so downstream type-narrowing works.
      if (typeof json.hora_actual_wita !== "string") {
        json.hora_actual_wita = undefined;
      }
      // 2026-05-12: Miguel's GT Apps Script (FOLDER_ID 1AlY3LFHVecVYJpqUzzWU0Y-Ll646ZNmh)
      // returns turno_nocturno = {disponible: true, espacios: 20} on every
      // date even though Gili Trawangan doesn't operate night dives. Until
      // Miguel hardcodes the script-side fix, this defensive belt forces
      // every nocturno slot to disponible:false so the model can't surface
      // a night option to the customer. KB-05 §programas-no-ofrece is the
      // canonical source — when GT eventually does run night dives, remove
      // this filter (or scope it to the SEDE_NIGHT_DIVES_DISABLED env list).
      if (sede.nombre === "Gili Trawangan") {
        for (const day of json.detalle) {
          if (day && day.turno_nocturno) {
            day.turno_nocturno = {
              disponible: false,
              espacios: 0,
              capacidad: 0,
            };
          }
        }
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
