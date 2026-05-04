// Loads the active system prompt and per-sede KB for prompt building.
//
// Resolution order for the system prompt:
//   1. Active version with sede_id = sede.id (per-sede override)
//   2. Active version with sede_id = NULL (global default)
//
// KB:
//   1. Active KB document linked to the sede; we fetch the file from
//      Supabase Storage. Cached in-memory for 60s to absorb chat bursts.
//
// Both lookups are tolerant: if the DB has no active row yet (e.g. day-1
// before content team uploads), we return a placeholder so end-to-end tests
// can still run.

import { and, desc, eq, isNull, or } from "drizzle-orm";

import {
  getDb,
  kbDocuments,
  promptsVersiones,
  type KbDocument,
  type PromptVersion,
  type Sede,
} from "@dpm/db";

import { loadEnv } from "../env.js";
import { getLogger } from "../logger.js";

const PROMPT_PLACEHOLDER = `
Sos un asistente comercial de DPM Diving. Hablás con calidez y profesionalismo.
NOTA: el system prompt aún no está cargado en la base de datos. Respondé de
forma genérica y mencioná que el equipo te contactará pronto.
`.trim();

const KB_PLACEHOLDER = `
(KB de la sede aún no cargada. Pedí al cliente sus datos básicos — nombre,
fechas de viaje, certificación previa — y avisá que un instructor humano
confirmará disponibilidad y precios.)
`.trim();

type PromptCacheEntry = { value: PromptVersion; expiresAt: number };
type KbCacheEntry = { content: string; expiresAt: number };

const PROMPT_CACHE_TTL_MS = 60_000;
const KB_CACHE_TTL_MS = 60_000;

export class PromptsService {
  private promptCache = new Map<string, PromptCacheEntry>();
  private kbCache = new Map<string, KbCacheEntry>();

  /** Resolve the active system prompt for a sede, falling back to global. */
  async loadSystemPrompt(sede: Sede): Promise<{
    content: string;
    version: PromptVersion | null;
  }> {
    const cacheKey = `system:${sede.id}`;
    const cached = this.promptCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { content: cached.value.content, version: cached.value };
    }

    const db = getDb();
    const rows = await db
      .select()
      .from(promptsVersiones)
      .where(
        and(
          eq(promptsVersiones.type, "system"),
          eq(promptsVersiones.active, true),
          or(eq(promptsVersiones.sedeId, sede.id), isNull(promptsVersiones.sedeId)),
        ),
      )
      .orderBy(desc(promptsVersiones.sedeId), desc(promptsVersiones.versionNumber))
      .limit(1);

    const row = rows[0];
    if (!row) {
      getLogger().warn(
        { sede: sede.nombre },
        "no active system prompt — using placeholder",
      );
      return { content: PROMPT_PLACEHOLDER, version: null };
    }
    this.promptCache.set(cacheKey, {
      value: row,
      expiresAt: Date.now() + PROMPT_CACHE_TTL_MS,
    });
    return { content: row.content, version: row };
  }

  /** Load the active KB blob for a sede. Returns placeholder if missing. */
  async loadSedeKb(sede: Sede): Promise<string> {
    const cacheKey = sede.id;
    const cached = this.kbCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.content;

    const db = getDb();
    const [row] = await db
      .select()
      .from(kbDocuments)
      .where(and(eq(kbDocuments.sedeId, sede.id), eq(kbDocuments.active, true)))
      .orderBy(desc(kbDocuments.version))
      .limit(1);

    if (!row) {
      getLogger().warn(
        { sede: sede.nombre },
        "no active KB document — using placeholder",
      );
      return KB_PLACEHOLDER;
    }

    const content = await this.fetchKbBlob(row);
    this.kbCache.set(cacheKey, {
      content,
      expiresAt: Date.now() + KB_CACHE_TTL_MS,
    });
    return content;
  }

  invalidate(sedeId: string): void {
    this.promptCache.delete(`system:${sedeId}`);
    this.kbCache.delete(sedeId);
  }

  private async fetchKbBlob(doc: KbDocument): Promise<string> {
    const env = loadEnv();
    // Supabase Storage REST API — service-role key bypasses bucket RLS.
    // Sends BOTH `authorization: Bearer` (legacy JWT path) and `apikey`
    // (new sb_secret_* path) so the same call works regardless of which
    // key format the operator pasted into env. Mirrors the seeder in
    // packages/db/src/seed-content.ts.
    const url = `${env.SUPABASE_URL}/storage/v1/object/${doc.storagePath}`;
    const res = await fetch(url, {
      headers: {
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      },
    });
    if (!res.ok) {
      getLogger().error(
        { status: res.status, path: doc.storagePath },
        "failed to fetch KB blob",
      );
      return KB_PLACEHOLDER;
    }
    return await res.text();
  }
}

export const promptsService = new PromptsService();
