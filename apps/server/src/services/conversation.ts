// Conversation lifecycle + sliding-window history loader.
//
// Two responsibilities:
//   1. upsert: ensure a `conversaciones` row exists for the inbound webhook.
//   2. recentMessages: load the sliding window for Bloque 3 of the prompt.
//
// Per-person identity (phone, name, language) is owned by chat_contacts; this
// service only deals with thread state. Callers must resolve the contact
// first via `chatContactsService.upsertFromWebhook` and pass the
// respond_io_contact_id here.
//
// We cap by both message count (HISTORY_WINDOW.MAX_MESSAGES) and a rough
// token budget so that very long conversations don't blow the prompt size
// even if they happen to be short messages.

import { and, desc, eq, sql } from "drizzle-orm";

import {
  conversaciones,
  getDb,
  mensajes,
  type Conversacion,
  type Mensaje,
} from "@dpm/db";
import { HISTORY_WINDOW } from "@dpm/shared";

export type IncomingMessageMeta = {
  respondIoConversationId: string;
  respondIoContactId: string;
  sedeId: string;
};

export type AppendAiMessageMeta = {
  fuentes?: string[] | undefined;
  model?: string | undefined;
  latencyMs?: number | undefined;
  cacheHitRate?: number | undefined;
  costUsd?: number | undefined;
  toolCalls?: string[] | undefined;
  [k: string]: unknown;
};

export class ConversationService {
  async upsertOnInbound(meta: IncomingMessageMeta): Promise<Conversacion> {
    const db = getDb();
    const [existing] = await db
      .select()
      .from(conversaciones)
      .where(eq(conversaciones.respondIoConversationId, meta.respondIoConversationId))
      .limit(1);
    if (existing) return existing;

    const [row] = await db
      .insert(conversaciones)
      .values({
        respondIoConversationId: meta.respondIoConversationId,
        respondIoContactId: meta.respondIoContactId,
        sedeId: meta.sedeId,
        status: "active",
      })
      .returning();
    if (!row) throw new Error("conversation insert returned no row");
    return row;
  }

  async appendInboundMessage(
    conversacionId: string,
    text: string,
    metadata?: Record<string, unknown>,
  ): Promise<Mensaje> {
    const db = getDb();
    const [row] = await db
      .insert(mensajes)
      .values({
        conversacionId,
        sender: "cliente",
        content: text,
        metadata: metadata ?? null,
      })
      .returning();
    if (!row) throw new Error("inbound message insert returned no row");
    return row;
  }

  /**
   * Espía path: store a reply sent by a human agent (Patrick, Giovanni,
   * Grecia, etc.). Used so the panel + regression suite can reason about how
   * the team actually closes deals, and so handed-off conversations show the
   * full timeline. We never call Claude in response — the human owns the
   * thread once they have replied.
   */
  async appendAgentMessage(
    conversacionId: string,
    text: string,
    agentName: string | null,
    metadata?: Record<string, unknown>,
  ): Promise<Mensaje> {
    const db = getDb();
    const [row] = await db
      .insert(mensajes)
      .values({
        conversacionId,
        sender: "agente_humano",
        agenteName: agentName,
        content: text,
        metadata: metadata ?? null,
      })
      .returning();
    if (!row) throw new Error("agent message insert returned no row");
    return row;
  }

  async appendAiMessage(
    conversacionId: string,
    text: string,
    meta?: AppendAiMessageMeta,
  ): Promise<Mensaje> {
    const db = getDb();
    const { fuentes, ...rest } = meta ?? {};
    const db_metadata = Object.keys(rest).length > 0 ? rest : null;
    const [row] = await db
      .insert(mensajes)
      .values({
        conversacionId,
        sender: "ai",
        content: text,
        fuentes: fuentes && fuentes.length > 0 ? fuentes : null,
        metadata: db_metadata,
      })
      .returning();
    if (!row) throw new Error("ai message insert returned no row");
    return row;
  }

  /**
   * Load the most recent messages for the prompt history block in
   * chronological order. We over-fetch, then trim by a rough token estimate
   * so that 30 short messages or 5 long ones both fit the budget.
   */
  async recentMessages(conversacionId: string): Promise<Mensaje[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(mensajes)
      .where(eq(mensajes.conversacionId, conversacionId))
      .orderBy(desc(mensajes.createdAt))
      .limit(HISTORY_WINDOW.MAX_MESSAGES);

    rows.reverse(); // chronological for prompt

    const trimmed = trimByTokenBudget(rows, HISTORY_WINDOW.MAX_TOKENS);
    return trimmed;
  }

  async findByRespondIoId(respondIoConversationId: string) {
    const db = getDb();
    const [row] = await db
      .select()
      .from(conversaciones)
      .where(eq(conversaciones.respondIoConversationId, respondIoConversationId))
      .limit(1);
    return row ?? null;
  }

  /**
   * Idempotency lookup. Respond.io retries delivery on any 5xx, and a network
   * blip during our reply path can cause a second delivery of the same
   * message. Without this check we would call Claude twice (real money) and
   * post a second reply to the client. Scoped to the conversation so the
   * sequential scan is cheap (<100 rows in practice).
   */
  async findByRespondIoMessageId(
    conversacionId: string,
    respondIoMessageId: string,
  ): Promise<Mensaje | null> {
    if (!respondIoMessageId) return null;
    const db = getDb();
    const [row] = await db
      .select()
      .from(mensajes)
      .where(
        and(
          eq(mensajes.conversacionId, conversacionId),
          sql`${mensajes.metadata}->>'respondIoMessageId' = ${respondIoMessageId}`,
        ),
      )
      .limit(1);
    return row ?? null;
  }
}

export const conversationService = new ConversationService();

// Rough token estimator: 1 token ≈ 4 chars for English/Spanish prose.
// This is conservative for code/JSON snippets but those don't appear in chat
// history so we accept the imprecision.
function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function trimByTokenBudget(rows: Mensaje[], budget: number): Mensaje[] {
  let used = 0;
  const kept: Mensaje[] = [];
  // Walk from newest to oldest, keeping as many as fit, then re-sort asc.
  for (let i = rows.length - 1; i >= 0; i--) {
    const m = rows[i]!;
    const cost = approxTokens(m.content);
    if (used + cost > budget) break;
    used += cost;
    kept.push(m);
  }
  kept.reverse();
  return kept;
}
