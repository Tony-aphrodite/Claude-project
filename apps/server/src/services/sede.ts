// Sede identification. The webhook tells us which Respond.io tags a contact
// has; we translate the `sede:*` tag into a sede row. If a contact has no
// sede tag (e.g. brand-new lead), we fall back to the pilot sede (Gili
// Trawangan) so the AI doesn't refuse to answer.

import { eq } from "drizzle-orm";

import { getDb, sedes, type Sede } from "@dpm/db";
import { PILOT_SEDE } from "@dpm/shared";

const SEDE_TAG_PREFIX = "sede:";

export class SedeService {
  // Tiny in-memory cache. Sedes change at most weekly; staleness is fine.
  private cache = new Map<string, { sede: Sede; expiresAt: number }>();
  private readonly TTL_MS = 60_000;

  async findByTags(tags: string[]): Promise<Sede | null> {
    const tag = tags.find((t) => t.startsWith(SEDE_TAG_PREFIX));
    if (!tag) return null;

    const cached = this.cache.get(tag);
    if (cached && cached.expiresAt > Date.now()) return cached.sede;

    const db = getDb();
    const [row] = await db.select().from(sedes).where(eq(sedes.respondIoTag, tag)).limit(1);
    if (!row) return null;
    this.cache.set(tag, { sede: row, expiresAt: Date.now() + this.TTL_MS });
    return row;
  }

  /**
   * Resolve the sede for an incoming message. If no `sede:*` tag is present
   * we fall back to the pilot sede so the AI can still respond — but we log
   * a warning so ops can fix the tag at the Respond.io side.
   */
  async resolveOrPilot(tags: string[]): Promise<{ sede: Sede; usedFallback: boolean }> {
    const found = await this.findByTags(tags);
    if (found) return { sede: found, usedFallback: false };

    const db = getDb();
    const [pilot] = await db
      .select()
      .from(sedes)
      .where(eq(sedes.nombre, PILOT_SEDE))
      .limit(1);
    if (!pilot) {
      throw new Error(
        `Pilot sede "${PILOT_SEDE}" missing from database — run db:migrate seed`,
      );
    }
    return { sede: pilot, usedFallback: true };
  }
}

export const sedeService = new SedeService();
