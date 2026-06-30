// ============================================================================
// Conversation view + star tracking (Steve 2026-06-30 messenger redesign).
//
// Two tiny actions powering the new sidebar's Unread + Starred tabs:
//
//   • markConversationSeen — upserts the (user, conversation) row in
//     conversation_views with last_seen_at = now. Called whenever the
//     operator opens the conversation detail page. Quiet — never throws
//     into the UI; failure just leaves the conversation looking unread.
//
//   • toggleConversationStar — adds or removes the (user, conversation)
//     row in conversation_stars. Returns the resulting state so the
//     client can flip the star icon without a refetch.
//
// Both operate per-(user, conversation) — Miguel's stars are independent
// of Tony's. Composite PK + ON CONFLICT keeps upserts cheap and idempotent.
// ============================================================================

"use server";

import { and, eq, sql } from "drizzle-orm";

import {
  conversationStars,
  conversationViews,
  getDb,
} from "@dpm/db";

import { requireUserContext } from "~/lib/auth-context";

export type StarToggleResult =
  | { ok: true; starred: boolean }
  | { ok: false; error: string };

/**
 * Stamp the current user as having just viewed `conversacionId`.
 * Best-effort: never surfaces an error to the UI; the worst case is
 * the conversation continues to show as unread until the next view.
 */
export async function markConversationSeen(
  conversacionId: string,
): Promise<void> {
  if (!conversacionId) return;
  try {
    const user = await requireUserContext();
    const db = getDb();
    await db
      .insert(conversationViews)
      .values({
        userId: user.userId,
        conversacionId,
      })
      .onConflictDoUpdate({
        target: [conversationViews.userId, conversationViews.conversacionId],
        set: { lastSeenAt: sql`now()` },
      });
  } catch {
    // Quiet — view tracking is decorative, not load-bearing.
  }
}

/**
 * Toggle star for current user × conversation. Returns the new starred
 * state so the client can flip the icon without re-querying.
 */
export async function toggleConversationStar(
  formData: FormData,
): Promise<StarToggleResult> {
  try {
    const conversacionId = String(formData.get("conversacionId") ?? "").trim();
    if (!conversacionId) {
      return { ok: false, error: "conversacionId requerido" };
    }
    const user = await requireUserContext();
    const db = getDb();

    const existing = await db
      .select({ userId: conversationStars.userId })
      .from(conversationStars)
      .where(
        and(
          eq(conversationStars.userId, user.userId),
          eq(conversationStars.conversacionId, conversacionId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .delete(conversationStars)
        .where(
          and(
            eq(conversationStars.userId, user.userId),
            eq(conversationStars.conversacionId, conversacionId),
          ),
        );
      return { ok: true, starred: false };
    }
    await db.insert(conversationStars).values({
      userId: user.userId,
      conversacionId,
    });
    return { ok: true, starred: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}
