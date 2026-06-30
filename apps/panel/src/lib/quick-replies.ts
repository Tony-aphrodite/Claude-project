// ============================================================================
// Quick-reply data layer — Miguel 2026-06-12 resilience layer #6.
//
// "Panel de respuestas rápidas y recursos (dentro de la bandeja)…
//  estos recursos salen de las mismas fuentes que ya usa la AI."
//
// Today this surface only includes saved_responses (the library
// operators curate via the per-AI-bubble #7 save button). Future
// extensions:
//
//   - sede-specific bank blocks  (from KB)
//   - sede-specific maps         (from KB / sede config)
//   - sede-specific ferry tables (from KB)
//   - sede-specific hotels       (from KB)
//   - catalog photos             (from RESPOND_IO_CATALOG_* env vars)
//
// The function shape (`listQuickRepliesForSede`) is the stable API the
// panel sidebar reads from; the implementation here can grow to merge
// any of those sources without changing the caller.
//
// Per-sede + general scope:
//   - sede-scoped saved_responses ONLY appear for matching sede.
//   - general (sede_id NULL) saved_responses appear for every sede.
//   Operator selects scope at save time (#7 form), so the curated
//   library naturally sorts itself.
// ============================================================================

import { and, desc, eq, isNull, or, sql } from "drizzle-orm";

import { getDb, savedResponses } from "@dpm/db";

export type QuickReplyItem = {
  id: string;
  name: string;
  responseText: string;
  promptText: string | null;
  tags: string[];
  scope: "general" | "sede";
  /** "es" | "en" | … — for badge display + future language pre-filter. */
  language: string;
  timesUsed: number;
  /** Reserved for future "popular" sort. */
  lastUsedAt: Date | null;
};

export async function listQuickRepliesForSede(input: {
  sedeId: string;
  limit?: number;
}): Promise<QuickReplyItem[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: savedResponses.id,
      sedeId: savedResponses.sedeId,
      name: savedResponses.name,
      responseText: savedResponses.responseText,
      promptText: savedResponses.promptText,
      tags: savedResponses.tags,
      language: savedResponses.language,
      timesUsed: savedResponses.timesUsed,
      lastUsedAt: savedResponses.lastUsedAt,
    })
    .from(savedResponses)
    .where(
      and(
        // General responses (sede_id IS NULL) OR exactly THIS sede.
        or(
          isNull(savedResponses.sedeId),
          eq(savedResponses.sedeId, input.sedeId),
        ),
        // Exclude archived rows — the operator soft-deleted them.
        isNull(savedResponses.archivedAt),
      ),
    )
    // Most-used first, then most-recent. The future quick-reply panel
    // will let the operator pin / unpin, but the basic ordering is
    // "what's actually useful day-to-day".
    .orderBy(desc(savedResponses.timesUsed), desc(savedResponses.createdAt))
    .limit(input.limit ?? 200);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    responseText: r.responseText,
    promptText: r.promptText,
    tags: r.tags,
    scope: r.sedeId === null ? "general" : "sede",
    language: r.language,
    timesUsed: r.timesUsed,
    lastUsedAt: r.lastUsedAt,
  }));
}

/**
 * Increment usage counters after the operator actually used a reply.
 * Called from the panel after the composer's send succeeded (so we
 * don't bump usage for "previewed but not sent" cases).
 */
export async function bumpQuickReplyUsage(id: string): Promise<void> {
  const db = getDb();
  await db
    .update(savedResponses)
    .set({
      timesUsed: sql`${savedResponses.timesUsed} + 1`,
      lastUsedAt: new Date(),
    })
    .where(eq(savedResponses.id, id));
}
