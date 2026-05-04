// ============================================================================
// Sede identification.
//
// Owner-confirmed mechanism (2026-05-04): Respond.io populates a contact
// custom field named "Branch" via the welcome workflow. Possible values are
// the five sede names verbatim ("Gili Trawangan", "Gili Air", "Nusa Penida",
// "Koh Tao", "Koh Phi Phi") or empty.
//
// During Pieza 1 (pilot) ONLY "Gili Trawangan" is processed by this system.
// Any other Branch value (or empty) means the message belongs to the human
// flow and the webhook returns 200 with `ignored: true` — never falls back.
//
// Legacy support: if no Branch field is present (older test fixtures, manual
// curl probes), we still try the original `sede:*` tag scheme. This is opt-in
// via env flag SEDE_TAG_FALLBACK=1 so production never silently drifts.
// ============================================================================

import { eq } from "drizzle-orm";

import { getDb, sedes, type Sede } from "@dpm/db";
import { readBranchField, type RespondIoIncomingMessage } from "@dpm/shared";

const SEDE_TAG_PREFIX = "sede:";
const PILOT_SEDE_NAME = "Gili Trawangan" as const;

export type SedeResolution =
  | { ok: true; sede: Sede; via: "branch" | "tag" }
  | {
      ok: false;
      reason: "branch_other_sede" | "branch_empty" | "sede_not_seeded";
      branchValue: string | null;
    };

export class SedeService {
  // Tiny in-memory cache. Sedes change at most weekly; staleness is fine.
  private cache = new Map<string, { sede: Sede; expiresAt: number }>();
  private readonly TTL_MS = 60_000;

  async findByName(nombre: string): Promise<Sede | null> {
    const cacheKey = `name:${nombre}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.sede;

    const db = getDb();
    const [row] = await db
      .select()
      .from(sedes)
      .where(eq(sedes.nombre, nombre))
      .limit(1);
    if (!row) return null;
    this.cache.set(cacheKey, { sede: row, expiresAt: Date.now() + this.TTL_MS });
    return row;
  }

  async findByTag(tag: string): Promise<Sede | null> {
    const cacheKey = `tag:${tag}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.sede;

    const db = getDb();
    const [row] = await db
      .select()
      .from(sedes)
      .where(eq(sedes.respondIoTag, tag))
      .limit(1);
    if (!row) return null;
    this.cache.set(cacheKey, { sede: row, expiresAt: Date.now() + this.TTL_MS });
    return row;
  }

  /**
   * Resolve sede from the inbound webhook contact, applying the pilot gate.
   *
   * Returns ok=true only when the contact's Branch field equals the pilot
   * sede ("Gili Trawangan"). Any other value (other sede / empty) returns
   * ok=false with a reason the handler uses to short-circuit with HTTP 200
   * `ignored`.
   */
  async resolveForPilot(
    contact: RespondIoIncomingMessage["contact"],
  ): Promise<SedeResolution> {
    const branch = readBranchField(contact);

    // Primary path: Branch contact field.
    if (branch) {
      if (branch !== PILOT_SEDE_NAME) {
        return { ok: false, reason: "branch_other_sede", branchValue: branch };
      }
      const sede = await this.findByName(PILOT_SEDE_NAME);
      if (!sede) {
        return {
          ok: false,
          reason: "sede_not_seeded",
          branchValue: branch,
        };
      }
      return { ok: true, sede, via: "branch" };
    }

    // Legacy fallback (off by default): tag-based identification.
    if (process.env.SEDE_TAG_FALLBACK === "1") {
      const tag = contact.tags?.find((t) => t.startsWith(SEDE_TAG_PREFIX));
      if (tag) {
        const sede = await this.findByTag(tag);
        if (sede && sede.nombre === PILOT_SEDE_NAME) {
          return { ok: true, sede, via: "tag" };
        }
        if (sede) {
          return {
            ok: false,
            reason: "branch_other_sede",
            branchValue: sede.nombre,
          };
        }
      }
    }

    return { ok: false, reason: "branch_empty", branchValue: null };
  }
}

export const sedeService = new SedeService();

export const PILOT_SEDE_NAME_CONST = PILOT_SEDE_NAME;
