// ============================================================================
// Google Apps Script roster fetcher.
//
// Apps Script lives outside our control and historically can spike to 10s+.
// Our policy:
//   1. Hard 2s AbortController timeout per call.
//   2. 10-minute Supabase-backed cache (roster_cache table).
//   3. On timeout/error, return null and let Claude know via tool_result that
//      availability is unverified. We NEVER block the user response on a slow
//      Apps Script call.
// ============================================================================

import { and, desc, eq, gt } from "drizzle-orm";

import { getDb, rosterCache, type Sede } from "@dpm/db";
import { CACHE_TTL, type RosterSnapshot } from "@dpm/shared";

import { loadEnv } from "../env.js";
import { getLogger } from "../logger.js";

export class AppsScriptService {
  async getRoster(sede: Sede): Promise<RosterSnapshot | null> {
    const cached = await this.readCache(sede.id);
    if (cached) return cached;

    const fresh = await this.fetchFresh(sede);
    if (fresh) await this.writeCache(sede.id, fresh);
    return fresh;
  }

  private async readCache(sedeId: string): Promise<RosterSnapshot | null> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(rosterCache)
      .where(and(eq(rosterCache.sedeId, sedeId), gt(rosterCache.expiresAt, new Date())))
      .orderBy(desc(rosterCache.createdAt))
      .limit(1);
    return (row?.snapshot as RosterSnapshot | undefined) ?? null;
  }

  private async writeCache(sedeId: string, snapshot: RosterSnapshot): Promise<void> {
    const db = getDb();
    const expiresAt = new Date(Date.now() + CACHE_TTL.ROSTER_SECONDS * 1000);
    await db.insert(rosterCache).values({
      sedeId,
      snapshot: snapshot as unknown as Record<string, unknown>,
      expiresAt,
    });
  }

  private async fetchFresh(sede: Sede): Promise<RosterSnapshot | null> {
    const url = (sede.rosterConfig as { url?: string } | null)?.url;
    if (!url) return null;

    const env = loadEnv();
    const log = getLogger();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.APPS_SCRIPT_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        log.warn(
          { sede: sede.nombre, status: res.status },
          "apps_script returned non-2xx",
        );
        return null;
      }
      const json = (await res.json()) as Partial<RosterSnapshot> & { days?: unknown };
      if (!Array.isArray(json.days)) {
        log.warn({ sede: sede.nombre }, "apps_script returned malformed roster");
        return null;
      }
      return {
        sedeId: sede.id,
        generatedAt: json.generatedAt ?? new Date().toISOString(),
        days: json.days as RosterSnapshot["days"],
      };
    } catch (err) {
      const aborted = (err as { name?: string }).name === "AbortError";
      log.warn(
        { sede: sede.nombre, aborted, err: aborted ? "timeout" : err },
        "apps_script fetch failed",
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

export const appsScriptService = new AppsScriptService();
