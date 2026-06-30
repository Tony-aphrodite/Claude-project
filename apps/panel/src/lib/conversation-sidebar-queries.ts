// ============================================================================
// Sidebar list query for the messenger-style /conversations redesign
// (Steve 2026-06-30). One query returns everything the sidebar needs in
// a single roundtrip:
//
//   - last `cliente` message preview + timestamp (drives the row's
//     "preview text" + "date" column, and the unread comparison)
//   - last activity timestamp (any sender) for Recents sort
//   - operator's last_seen_at from conversation_views (unread comparison)
//   - whether THIS operator starred the conversation (Starred tab filter)
//
// The query is parameterised by user_id so each operator gets their own
// unread + starred semantics. Sede scoping is applied for office users
// at the call site, same pattern as listConversations.
// ============================================================================

import { and, desc, eq, ilike, isNotNull, or, sql } from "drizzle-orm";

import {
  chatContacts,
  conversaciones,
  conversationStars,
  conversationViews,
  getDb,
  mensajes,
  sedes,
} from "@dpm/db";

export type SidebarConversationRow = {
  conversacionId: string;
  sedeId: string | null;
  sedeName: string | null;
  respondIoContactId: string;
  contactName: string | null;
  contactPhone: string | null;
  contactLanguage: string | null;
  leadStage: string;
  status: string;
  /** Last activity (any sender) — drives "Recents" sort + relative timestamp. */
  lastActivityAt: Date;
  /** Last cliente-sender message text — drives the row's preview line. */
  lastClienteText: string | null;
  /** Last cliente-sender message timestamp — drives Unread comparison. */
  lastClienteAt: Date | null;
  /** This user's last view of this conversation (null = never viewed). */
  lastSeenAt: Date | null;
  /** True iff this user starred this conversation. */
  starred: boolean;
  /** Derived: is the last cliente message newer than this user's last view? */
  isUnread: boolean;
};

export type ListSidebarConversationsOpts = {
  userId: string;
  sedeId?: string | null;
  /** Optional name/phone substring search (case-insensitive). */
  search?: string;
  /** Cap returned rows so the sidebar stays fast. */
  limit?: number;
};

/**
 * One pass over conversations, joining contacts + sedes + per-user
 * view-stamp + per-user star + a lateral last-cliente-message subquery.
 *
 * Drizzle doesn't model lateral joins cleanly, so we hand-craft the
 * "last cliente message" part via two separate subqueries that the
 * planner collapses; total query cost stays low because conversations
 * is already capped via `limit` and the join chain hits unique keys.
 */
export async function listSidebarConversations(
  opts: ListSidebarConversationsOpts,
): Promise<SidebarConversationRow[]> {
  const db = getDb();
  const limit = opts.limit ?? 200;

  // Aggregate: per conversation, the latest cliente-sender message.
  // Wrapped as a CTE-style derived table.
  const lastClienteSubq = db
    .select({
      conversacionId: mensajes.conversacionId,
      lastClienteAt: sql<Date>`MAX(${mensajes.createdAt})`.as("last_cliente_at"),
    })
    .from(mensajes)
    .where(eq(mensajes.sender, "cliente"))
    .groupBy(mensajes.conversacionId)
    .as("last_cliente");

  const lastClienteTextSubq = db
    .select({
      conversacionId: mensajes.conversacionId,
      content: mensajes.content,
      createdAt: mensajes.createdAt,
      rn: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${mensajes.conversacionId} ORDER BY ${mensajes.createdAt} DESC)`.as(
        "rn",
      ),
    })
    .from(mensajes)
    .where(eq(mensajes.sender, "cliente"))
    .as("last_cliente_text_inner");

  // Pull rows. We over-select then trim because Drizzle's typings get
  // unwieldy when we mix derived tables — easier to filter rn=1 in JS.
  const whereParts = [
    opts.sedeId ? eq(conversaciones.sedeId, opts.sedeId) : undefined,
    opts.search
      ? or(
          ilike(chatContacts.name, `%${opts.search}%`),
          ilike(chatContacts.phone, `%${opts.search}%`),
        )
      : undefined,
  ].filter(Boolean);

  const rows = await db
    .select({
      conversacionId: conversaciones.id,
      sedeId: conversaciones.sedeId,
      sedeName: sedes.nombre,
      respondIoContactId: conversaciones.respondIoContactId,
      contactName: chatContacts.name,
      contactPhone: chatContacts.phone,
      contactLanguage: chatContacts.language,
      leadStage: conversaciones.leadStage,
      status: conversaciones.status,
      updatedAt: conversaciones.updatedAt,
      lastClienteAt: lastClienteSubq.lastClienteAt,
      lastClienteText: lastClienteTextSubq.content,
      lastClienteTextRn: lastClienteTextSubq.rn,
      lastSeenAt: conversationViews.lastSeenAt,
      starredAt: conversationStars.starredAt,
    })
    .from(conversaciones)
    .leftJoin(sedes, eq(sedes.id, conversaciones.sedeId))
    .leftJoin(
      chatContacts,
      eq(chatContacts.respondIoContactId, conversaciones.respondIoContactId),
    )
    .leftJoin(
      lastClienteSubq,
      eq(lastClienteSubq.conversacionId, conversaciones.id),
    )
    .leftJoin(
      lastClienteTextSubq,
      and(
        eq(lastClienteTextSubq.conversacionId, conversaciones.id),
        eq(lastClienteTextSubq.rn, 1),
      ),
    )
    .leftJoin(
      conversationViews,
      and(
        eq(conversationViews.conversacionId, conversaciones.id),
        eq(conversationViews.userId, opts.userId),
      ),
    )
    .leftJoin(
      conversationStars,
      and(
        eq(conversationStars.conversacionId, conversaciones.id),
        eq(conversationStars.userId, opts.userId),
      ),
    )
    .where(whereParts.length > 0 ? and(...whereParts) : undefined)
    .orderBy(desc(conversaciones.updatedAt))
    .limit(limit);

  return rows.map((r) => {
    const lastClienteAt = r.lastClienteAt ?? null;
    const lastSeenAt = r.lastSeenAt ?? null;
    const isUnread =
      lastClienteAt !== null &&
      (lastSeenAt === null || lastClienteAt > lastSeenAt);
    return {
      conversacionId: r.conversacionId,
      sedeId: r.sedeId,
      sedeName: r.sedeName,
      respondIoContactId: r.respondIoContactId,
      contactName: r.contactName,
      contactPhone: r.contactPhone,
      contactLanguage: r.contactLanguage,
      leadStage: r.leadStage,
      status: r.status,
      lastActivityAt: r.updatedAt,
      lastClienteText: r.lastClienteText ?? null,
      lastClienteAt,
      lastSeenAt,
      starred: r.starredAt !== null,
      isUnread,
    };
  });
}
