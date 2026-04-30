// Read-only queries for the panel. We use the service-role connection (DB
// only — no Supabase auth surface) and apply our own filters because the
// panel is gated by Supabase Auth at the route layer.
//
// All queries are exposed through Server Components / Server Actions only;
// none of them are reachable from the browser directly.
//
// Identity (phone, name, language) lives on chat_contacts; conversations only
// hold thread state. Every conversation-facing query in this file joins
// chat_contacts so the UI can display the client without a second hop.

import { and, desc, eq, gte, sql } from "drizzle-orm";

import {
  chatContacts,
  conversaciones,
  errores,
  followUps,
  getDb,
  llamadasApi,
  mensajes,
  promptsVersiones,
  sedes,
} from "@dpm/db";

export async function getDashboardSnapshot(rangeHours = 24) {
  const db = getDb();
  const since = new Date(Date.now() - rangeHours * 60 * 60 * 1000);

  const [latencyAgg] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      p50: sql<number>`COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms), 0)::int`,
      p95: sql<number>`COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms), 0)::int`,
      p99: sql<number>`COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms), 0)::int`,
      cacheHit: sql<number>`COALESCE(AVG(CASE WHEN cache_read_tokens > 0 THEN 1.0 ELSE 0 END), 0)::float`,
      totalCost: sql<number>`COALESCE(SUM(total_cost_usd), 0)::float`,
      successes: sql<number>`COUNT(*) FILTER (WHERE status = 'success')::int`,
      errorsCount: sql<number>`COUNT(*) FILTER (WHERE status != 'success')::int`,
    })
    .from(llamadasApi)
    .where(gte(llamadasApi.createdAt, since));

  const errorList = await db
    .select()
    .from(errores)
    .where(gte(errores.createdAt, since))
    .orderBy(desc(errores.createdAt))
    .limit(20);

  const [activeConv] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      activeNow: sql<number>`COUNT(*) FILTER (WHERE status = 'active')::int`,
    })
    .from(conversaciones);

  return {
    range: { since, untilNow: new Date() },
    latency: latencyAgg ?? null,
    errors: errorList,
    conversations: activeConv ?? null,
  };
}

export async function listConversations(opts: {
  sedeId?: string;
  status?: string;
  limit?: number;
}) {
  const db = getDb();
  const where = and(
    opts.sedeId ? eq(conversaciones.sedeId, opts.sedeId) : undefined,
    opts.status ? eq(conversaciones.status, opts.status) : undefined,
  );
  return db
    .select({
      conv: conversaciones,
      contact: chatContacts,
      sedeName: sedes.nombre,
    })
    .from(conversaciones)
    .leftJoin(sedes, eq(sedes.id, conversaciones.sedeId))
    .leftJoin(
      chatContacts,
      eq(chatContacts.respondIoContactId, conversaciones.respondIoContactId),
    )
    .where(where)
    .orderBy(desc(conversaciones.updatedAt))
    .limit(opts.limit ?? 50);
}

export async function getConversation(id: string) {
  const db = getDb();
  const [conv] = await db
    .select({
      conv: conversaciones,
      contact: chatContacts,
      sedeName: sedes.nombre,
    })
    .from(conversaciones)
    .leftJoin(sedes, eq(sedes.id, conversaciones.sedeId))
    .leftJoin(
      chatContacts,
      eq(chatContacts.respondIoContactId, conversaciones.respondIoContactId),
    )
    .where(eq(conversaciones.id, id))
    .limit(1);
  if (!conv) return null;
  const messages = await db
    .select()
    .from(mensajes)
    .where(eq(mensajes.conversacionId, id))
    .orderBy(mensajes.createdAt);
  return { ...conv, messages };
}

export async function listPrompts(type: string) {
  const db = getDb();
  return db
    .select()
    .from(promptsVersiones)
    .where(eq(promptsVersiones.type, type))
    .orderBy(desc(promptsVersiones.versionNumber));
}

export async function getActivePrompt(type: string, sedeId?: string | null) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(promptsVersiones)
    .where(
      and(
        eq(promptsVersiones.type, type),
        eq(promptsVersiones.active, true),
        sedeId === undefined ? undefined : sedeId === null ? sql`sede_id IS NULL` : eq(promptsVersiones.sedeId, sedeId),
      ),
    )
    .orderBy(desc(promptsVersiones.versionNumber))
    .limit(1);
  return row ?? null;
}

export async function listFollowUps(opts: { status?: "pending" | "sent" | "cancelled" }) {
  const db = getDb();
  let where;
  if (opts.status === "pending") {
    where = and(sql`sent_at IS NULL`, sql`cancelled_at IS NULL`);
  } else if (opts.status === "sent") {
    where = sql`sent_at IS NOT NULL`;
  } else if (opts.status === "cancelled") {
    where = sql`cancelled_at IS NOT NULL`;
  }
  const rows = await db
    .select()
    .from(followUps)
    .where(where)
    .orderBy(desc(followUps.createdAt))
    .limit(100);
  return rows;
}

export async function getFollowUpMetrics() {
  const db = getDb();
  const [agg] = await db
    .select({
      pending: sql<number>`COUNT(*) FILTER (WHERE sent_at IS NULL AND cancelled_at IS NULL)::int`,
      sent: sql<number>`COUNT(*) FILTER (WHERE sent_at IS NOT NULL)::int`,
      cancelled: sql<number>`COUNT(*) FILTER (WHERE cancelled_at IS NOT NULL)::int`,
      responded: sql<number>`COUNT(*) FILTER (WHERE client_responded = TRUE)::int`,
      sales: sql<number>`COUNT(*) FILTER (WHERE resulted_in_sale = TRUE)::int`,
      recoveredUsd: sql<number>`COALESCE(SUM(sale_amount_usd) FILTER (WHERE resulted_in_sale = TRUE), 0)::float`,
    })
    .from(followUps);
  return agg ?? null;
}

export async function listRegressionRuns() {
  const db = getDb();
  return db.execute<{
    id: string;
    prompt_version_id: string | null;
    finished_at: string;
    pass_rate: string;
    avg_overall: string;
    review_queue_size: number;
    total_cases: number;
  }>(sql`
    SELECT id::text, prompt_version_id::text, finished_at::text,
           pass_rate::text, avg_overall::text, review_queue_size, total_cases
      FROM regression_runs
     ORDER BY finished_at DESC
     LIMIT 50
  `);
}

export async function getRegressionRunDetail(runId: string) {
  const db = getDb();
  const runRows = await db.execute<Record<string, unknown>>(sql`
    SELECT * FROM regression_runs WHERE id = ${runId}::uuid LIMIT 1
  `);
  const cases = await db.execute<Record<string, unknown>>(sql`
    SELECT * FROM regression_case_results WHERE run_id = ${runId}::uuid ORDER BY case_id
  `);
  return {
    run: (runRows as unknown as Record<string, unknown>[])[0] ?? null,
    cases: cases as unknown as Record<string, unknown>[],
  };
}

export async function listSedes() {
  const db = getDb();
  return db.select().from(sedes).orderBy(sedes.nombre);
}
