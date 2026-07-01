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
//
// Dev-mode: when DEV_MOCK_DATA=1 (and NODE_ENV !== production) every query
// returns canned data from db-queries-mock.ts so we can boot the panel for
// UI smoke tests without a real Postgres. The flag is refused in production.

import { and, desc, eq, gte, sql } from "drizzle-orm";

import {
  chatContacts,
  conversaciones,
  errores,
  followUps,
  getDb,
  kbDocuments,
  llamadasApi,
  mensajes,
  promptsVersiones,
  sedes,
} from "@dpm/db";

import {
  isMockMode,
  MOCK_SEDES,
  mockGetConversation,
  mockGetDashboardSnapshot,
  mockGetFollowUpMetrics,
  mockGetRegressionRunDetail,
  mockListConversations,
  mockListDepositPending,
  mockListFollowUps,
  mockListPrompts,
  mockListRegressionRuns,
} from "./db-queries-mock";

export async function getDashboardSnapshot(rangeHours = 24) {
  if (isMockMode()) return mockGetDashboardSnapshot();
  const db = getDb();
  const since = new Date(Date.now() - rangeHours * 60 * 60 * 1000);

  // Filter out simulator + replay traffic so the production metrics
  // dashboard isn't polluted by Miguel's panel testing or replay batch
  // runs (origin column added 2026-05-14, Phase 1 of Simulator/Replay
  // feature). The `llamadasApi` join uses conversacionId — rows
  // without a conversacionId (background jobs) keep counting as
  // production.
  const [latencyAgg] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      p50: sql<number>`COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY ${llamadasApi.latencyMs}), 0)::int`,
      p95: sql<number>`COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY ${llamadasApi.latencyMs}), 0)::int`,
      p99: sql<number>`COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY ${llamadasApi.latencyMs}), 0)::int`,
      cacheHit: sql<number>`COALESCE(AVG(CASE WHEN ${llamadasApi.cacheReadTokens} > 0 THEN 1.0 ELSE 0 END), 0)::float`,
      totalCost: sql<number>`COALESCE(SUM(${llamadasApi.totalCostUsd}), 0)::float`,
      successes: sql<number>`COUNT(*) FILTER (WHERE ${llamadasApi.status} = 'success')::int`,
      errorsCount: sql<number>`COUNT(*) FILTER (WHERE ${llamadasApi.status} != 'success')::int`,
    })
    .from(llamadasApi)
    .leftJoin(
      conversaciones,
      eq(conversaciones.id, llamadasApi.conversacionId),
    )
    .where(
      and(
        gte(llamadasApi.createdAt, since),
        // Keep rows where origin='production' OR conversacionId is null
        // (background / non-conversation calls).
        sql`(${conversaciones.origin} IS NULL OR ${conversaciones.origin} = 'production')`,
      ),
    );

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
    .from(conversaciones)
    .where(eq(conversaciones.origin, "production"));

  // Hourly volume buckets for the Hero sparkline. One bucket per hour
  // across the rangeHours window, production-only (same filter as the
  // aggregate so the chart matches what the KPI cards report). The
  // generate_series fills in zero-volume hours so the SVG has a stable
  // x-axis even when traffic is sparse.
  //
  // Miguel 2026-07-01 #5 — added p95_ms per hour so the operator can
  // see WHEN latency spiked (currently sitting at 18-19s p95) rather
  // than just the 24h aggregate. A steady climb points to prompt/KB
  // bloat; a spike points to an Anthropic brownout.
  const hourlyBuckets = (await db.execute(sql`
    WITH hours AS (
      SELECT generate_series(
        date_trunc('hour', NOW()) - (${rangeHours - 1}::int * INTERVAL '1 hour'),
        date_trunc('hour', NOW()),
        INTERVAL '1 hour'
      ) AS bucket_start
    )
    SELECT
      h.bucket_start AS bucket,
      COALESCE(COUNT(l.id) FILTER (WHERE l.status = 'success'), 0)::int AS ok_count,
      COALESCE(COUNT(l.id) FILTER (WHERE l.status != 'success'), 0)::int AS err_count,
      COALESCE(
        percentile_cont(0.95) WITHIN GROUP (
          ORDER BY l.latency_ms
        ) FILTER (WHERE l.status = 'success'),
        0
      )::int AS p95_ms
    FROM hours h
    LEFT JOIN llamadas_api l
      ON date_trunc('hour', l.created_at) = h.bucket_start
    LEFT JOIN conversaciones c
      ON c.id = l.conversacion_id
    WHERE l.id IS NULL OR (c.origin IS NULL OR c.origin = 'production')
    GROUP BY h.bucket_start
    ORDER BY h.bucket_start ASC
  `)) as unknown as Array<{
    bucket: string | Date;
    ok_count: number;
    err_count: number;
    p95_ms: number;
  }>;

  const volumeBuckets = hourlyBuckets.map((b) => ({
    bucket: typeof b.bucket === "string" ? new Date(b.bucket) : b.bucket,
    okCount: b.ok_count,
    errCount: b.err_count,
    p95Ms: b.p95_ms,
  }));

  return {
    range: { since, untilNow: new Date() },
    latency: latencyAgg ?? null,
    errors: errorList,
    conversations: activeConv ?? null,
    volumeBuckets,
  };
}

// Shared page-size options for list pages. Office staff with smaller
// screens get the 10/25 options; admins triaging a busy queue use 100.
// Anything outside this whitelist is rejected back to the default.
export const LIST_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const LIST_PAGE_SIZE_DEFAULT = 50;

export function normalizePageSize(raw: string | number | undefined): number {
  const n = typeof raw === "number" ? raw : Number.parseInt(raw ?? "", 10);
  return (LIST_PAGE_SIZE_OPTIONS as readonly number[]).includes(n)
    ? n
    : LIST_PAGE_SIZE_DEFAULT;
}

export async function listConversations(opts: {
  sedeId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const pageSize = normalizePageSize(opts.pageSize);
  const page = Math.max(1, opts.page ?? 1);

  if (isMockMode()) {
    let rows = mockListConversations();
    if (opts.sedeId) rows = rows.filter((r) => r.conv.sedeId === opts.sedeId);
    if (opts.status) rows = rows.filter((r) => r.conv.status === opts.status);
    const total = rows.length;
    const start = (page - 1) * pageSize;
    return { rows: rows.slice(start, start + pageSize), total, page, pageSize };
  }

  const db = getDb();
  const where = and(
    opts.sedeId ? eq(conversaciones.sedeId, opts.sedeId) : undefined,
    opts.status ? eq(conversaciones.status, opts.status) : undefined,
  );

  // Page + total in parallel — same shape as listFollowUps so the page
  // component can render a generic pagination footer.
  const [rows, [{ total }]] = await Promise.all([
    db
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
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(conversaciones)
      .where(where) as unknown as Promise<[{ total: number }]>,
  ]);

  return { rows, total, page, pageSize };
}

export async function getConversation(id: string) {
  if (isMockMode()) return mockGetConversation(id);
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
  if (isMockMode()) return mockListPrompts().filter((p) => p.type === type);
  const db = getDb();
  const rows = await db
    .select({
      id: promptsVersiones.id,
      versionNumber: promptsVersiones.versionNumber,
      sedeId: promptsVersiones.sedeId,
      active: promptsVersiones.active,
      createdAt: promptsVersiones.createdAt,
      createdBy: promptsVersiones.createdBy,
      regressionSuitePassed: promptsVersiones.regressionSuitePassed,
      type: promptsVersiones.type,
      content: promptsVersiones.content,
      sedeNombre: sedes.nombre,
    })
    .from(promptsVersiones)
    .leftJoin(sedes, eq(sedes.id, promptsVersiones.sedeId))
    .where(eq(promptsVersiones.type, type))
    .orderBy(
      desc(promptsVersiones.active),
      desc(promptsVersiones.versionNumber),
    );
  return rows;
}

export async function getActivePrompt(type: string, sedeId?: string | null) {
  if (isMockMode()) {
    return (
      mockListPrompts().find(
        (p) => p.type === type && (sedeId === undefined || p.sedeId === sedeId) && p.active,
      ) ?? null
    );
  }
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

// ── KB documents ────────────────────────────────────────────────────────────
// One row per (sede, version). The active row's content is the source of
// truth for the AI; older rows are kept so we can rollback. Content lives
// in Supabase Storage at the path stored on the row; we lazy-load it from
// the panel only when an editor actually opens a version.

export async function listKbVersions(sedeId?: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: kbDocuments.id,
      sedeId: kbDocuments.sedeId,
      sedeName: sedes.nombre,
      version: kbDocuments.version,
      storagePath: kbDocuments.storagePath,
      active: kbDocuments.active,
      uploadedBy: kbDocuments.uploadedBy,
      uploadedAt: kbDocuments.uploadedAt,
    })
    .from(kbDocuments)
    .leftJoin(sedes, eq(sedes.id, kbDocuments.sedeId))
    .where(sedeId ? eq(kbDocuments.sedeId, sedeId) : sql`TRUE`)
    .orderBy(desc(kbDocuments.uploadedAt));
  return rows;
}

export async function getKbVersionRow(id: string) {
  const db = getDb();
  const [row] = await db
    .select({
      id: kbDocuments.id,
      sedeId: kbDocuments.sedeId,
      sedeName: sedes.nombre,
      version: kbDocuments.version,
      storagePath: kbDocuments.storagePath,
      active: kbDocuments.active,
      uploadedBy: kbDocuments.uploadedBy,
      uploadedAt: kbDocuments.uploadedAt,
    })
    .from(kbDocuments)
    .leftJoin(sedes, eq(sedes.id, kbDocuments.sedeId))
    .where(eq(kbDocuments.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Look up the currently-active KB row for a sede. Used to compute the diff
 * baseline when a draft is opened.
 */
export async function getActiveKbForSede(sedeId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(kbDocuments)
    .where(and(eq(kbDocuments.sedeId, sedeId), eq(kbDocuments.active, true)))
    .orderBy(desc(kbDocuments.version))
    .limit(1);
  return row ?? null;
}

export const FOLLOW_UPS_PAGE_SIZE = 50;

export async function listFollowUps(opts: {
  status?: "pending" | "sent" | "cancelled";
  page?: number;
  pageSize?: number;
  // Free-text search. Currently matches against the conversacionId UUID
  // (substring, case-insensitive) and the cancellation_reason. Wired
  // through to a single ILIKE — Postgres handles this fine at our row
  // counts without needing a trigram or full-text index.
  q?: string;
  // Optional sede scope. Joins through `conversaciones` to filter by the
  // sede that owns the conversation. Set this for office users so they
  // only see follow-ups for their own sede; leave undefined for admins.
  sedeId?: string;
}) {
  const pageSize = opts.pageSize ?? FOLLOW_UPS_PAGE_SIZE;
  const page = Math.max(1, opts.page ?? 1);
  const q = (opts.q ?? "").trim();

  if (isMockMode()) {
    let rows = mockListFollowUps();
    if (opts.status === "pending") rows = rows.filter((r) => !r.sentAt && !r.cancelledAt);
    else if (opts.status === "sent") rows = rows.filter((r) => r.sentAt);
    else if (opts.status === "cancelled") rows = rows.filter((r) => r.cancelledAt);
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter((r) =>
        r.conversacionId.toLowerCase().includes(needle) ||
        (r.cancellationReason ?? "").toLowerCase().includes(needle),
      );
    }
    // The mock dataset doesn't carry sedeId on follow-up rows so when an
    // office user is sede-scoped in mock mode we just return an empty
    // list — the panel still renders cleanly without leaking another
    // sede's mock data.
    if (opts.sedeId) rows = [];
    const total = rows.length;
    const start = (page - 1) * pageSize;
    return { rows: rows.slice(start, start + pageSize), total, page, pageSize };
  }

  const db = getDb();
  // Build a status filter and (optionally) a search filter, then
  // combine with AND. Drizzle's `and()` tolerates undefined entries so
  // we can mix the two conditions cleanly.
  let statusFilter;
  if (opts.status === "pending") {
    statusFilter = and(sql`${followUps.sentAt} IS NULL`, sql`${followUps.cancelledAt} IS NULL`);
  } else if (opts.status === "sent") {
    statusFilter = sql`${followUps.sentAt} IS NOT NULL`;
  } else if (opts.status === "cancelled") {
    statusFilter = sql`${followUps.cancelledAt} IS NOT NULL`;
  }

  // Match against the conversacionId text (UUIDs cast to text via ::text)
  // and the cancellation reason. ILIKE is case-insensitive so users can
  // paste a prefix like "0958099f" or a partial reason like "no answer".
  const searchFilter = q
    ? sql`(${followUps.conversacionId}::text ILIKE ${"%" + q + "%"} OR ${followUps.cancellationReason} ILIKE ${"%" + q + "%"})`
    : undefined;

  const sedeFilter = opts.sedeId
    ? eq(conversaciones.sedeId, opts.sedeId)
    : undefined;

  const where = and(statusFilter, searchFilter, sedeFilter);

  // Fetch one page + the total in parallel. Postgres COUNT(*) is cheap
  // at follow-ups volume (~400 rows in the screenshot Miguel sent) so
  // we don't need to bother with windowed estimates.
  //
  // When sedeId is set we join to conversaciones; otherwise we don't —
  // keeps the admin path unchanged.
  const baseRows = db
    .select({
      id: followUps.id,
      conversacionId: followUps.conversacionId,
      level: followUps.level,
      scheduledAt: followUps.scheduledAt,
      sentAt: followUps.sentAt,
      cancelledAt: followUps.cancelledAt,
      cancellationReason: followUps.cancellationReason,
      messageSent: followUps.messageSent,
      clientResponded: followUps.clientResponded,
      resultedInSale: followUps.resultedInSale,
      saleAmountUsd: followUps.saleAmountUsd,
      createdAt: followUps.createdAt,
    })
    .from(followUps);

  const baseCount = db
    .select({ total: sql<number>`COUNT(*)::int` })
    .from(followUps);

  const [rows, [{ total }]] = await Promise.all([
    (opts.sedeId
      ? baseRows.innerJoin(
          conversaciones,
          eq(conversaciones.id, followUps.conversacionId),
        )
      : baseRows
    )
      .where(where)
      .orderBy(desc(followUps.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    (opts.sedeId
      ? baseCount.innerJoin(
          conversaciones,
          eq(conversaciones.id, followUps.conversacionId),
        )
      : baseCount
    ).where(where) as unknown as Promise<[{ total: number }]>,
  ]);

  return { rows, total, page, pageSize };
}

export async function getFollowUpMetrics(opts: { sedeId?: string } = {}) {
  if (isMockMode()) {
    // Mock dataset has no sede on follow-ups; return zeros when scoped so
    // the office view doesn't show another sede's mock numbers.
    if (opts.sedeId) {
      return { pending: 0, sent: 0, cancelled: 0, responded: 0, sales: 0, recoveredUsd: 0 };
    }
    return mockGetFollowUpMetrics();
  }
  const db = getDb();

  const baseAgg = db
    .select({
      pending: sql<number>`COUNT(*) FILTER (WHERE ${followUps.sentAt} IS NULL AND ${followUps.cancelledAt} IS NULL)::int`,
      sent: sql<number>`COUNT(*) FILTER (WHERE ${followUps.sentAt} IS NOT NULL)::int`,
      cancelled: sql<number>`COUNT(*) FILTER (WHERE ${followUps.cancelledAt} IS NOT NULL)::int`,
      responded: sql<number>`COUNT(*) FILTER (WHERE ${followUps.clientResponded} = TRUE)::int`,
      sales: sql<number>`COUNT(*) FILTER (WHERE ${followUps.resultedInSale} = TRUE)::int`,
      recoveredUsd: sql<number>`COALESCE(SUM(${followUps.saleAmountUsd}) FILTER (WHERE ${followUps.resultedInSale} = TRUE), 0)::float`,
    })
    .from(followUps);

  const [agg] = await (opts.sedeId
    ? baseAgg
        .innerJoin(
          conversaciones,
          eq(conversaciones.id, followUps.conversacionId),
        )
        .where(eq(conversaciones.sedeId, opts.sedeId))
    : baseAgg);
  return agg ?? null;
}

export async function listRegressionRuns() {
  if (isMockMode()) return mockListRegressionRuns();
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
  if (isMockMode()) return mockGetRegressionRunDetail();
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
  if (isMockMode()) return MOCK_SEDES;
  const db = getDb();
  return db.select().from(sedes).orderBy(sedes.nombre);
}

/**
 * Conversations where the AI auto-confirmed the deposit via OCR (Phase A,
 * 2026-05-13). Powers the /depositos-auto safety-net dashboard: the sede
 * team cross-references this list against the Wise/Mandiri/BCA emails
 * landing in gilit@dpmdiving.com and flags any row where the bank email
 * doesn't agree (Phase B per Miguel's 2026-05-13 spec).
 *
 * "Auto-confirmed" = `lead_metadata.ocr_result.validated === true` AND
 * `lead_metadata.history` contains an entry with `note = "ocr_auto_confirmed"`.
 * Filtering on history is the precise signal — `validated` alone would
 * include manually-confirmed rows where the operator clicked Confirmar.
 *
 * Time scope:
 *   • "today"   — auto-confirm happened on or after midnight Asia/Makassar
 *                 (Gili Trawangan timezone, the only currently-piloted sede).
 *   • "7d"      — last 7 days
 *   • "all"     — every auto-confirm we've ever seen
 *
 * `flagged` flag is computed from the `errores` table: when the operator
 * clicks Flag on a row we insert `errorType = "auto_confirm_review_requested"`
 * (and Unflag inserts `errorType = "auto_confirm_review_resolved"`). The
 * row counts as flagged when the latest of those two entries for that
 * conversation is `_requested`.
 *
 * Returns the same shape as listDepositPending plus `flaggedAt`,
 * `flaggedBy`, and `autoConfirmedAt` so the page can render without
 * a second hop.
 */
export type AutoConfirmedScope = "today" | "7d" | "all";

export type AutoConfirmedRow = {
  conv: typeof conversaciones.$inferSelect;
  contact: typeof chatContacts.$inferSelect | null;
  sedeName: string | null;
  autoConfirmedAt: string | null;
  /** "unflagged" — never had a flag attached.
   *  "flagged"   — most recent flag-action row is 'requested'.
   *  "resolved"  — most recent flag-action row is 'resolved'. */
  flagState: "unflagged" | "flagged" | "resolved";
  flaggedAt: Date | null;
  flaggedBy: string | null;
};

export async function listAutoConfirmedDeposits(
  opts: { scope?: AutoConfirmedScope; showResolved?: boolean; sedeId?: string } = {},
): Promise<AutoConfirmedRow[]> {
  const scope = opts.scope ?? "today";
  const showResolved = opts.showResolved ?? false;
  if (isMockMode()) return [];
  const db = getDb();

  // Cutoff for the time scope. Gili Trawangan is UTC+8 (Asia/Makassar).
  // We compute "midnight in Makassar today" relative to the request time
  // so the dashboard's "Hoy" stays consistent for the sede team regardless
  // of where the operator opens the panel from.
  const cutoffIso = (() => {
    if (scope === "all") return null;
    const now = new Date();
    if (scope === "7d") {
      return new Date(now.getTime() - 7 * 86_400_000).toISOString();
    }
    // "today" — start of day in Asia/Makassar
    // Asia/Makassar is fixed UTC+8 (no DST), so we can compute without
    // pulling a TZ database: format the current Makassar wall-clock day,
    // then assume midnight local = (00:00 + 08:00) UTC the day before.
    const makassarMs = now.getTime() + 8 * 3600_000;
    const md = new Date(makassarMs);
    const y = md.getUTCFullYear();
    const m = md.getUTCMonth();
    const d = md.getUTCDate();
    // Midnight UTC for that Makassar day, then -8h to get the UTC instant
    return new Date(Date.UTC(y, m, d, -8, 0, 0)).toISOString();
  })();

  // Rows where the OCR auto-confirmed (validated=true AND most-recent
  // history entry note='ocr_auto_confirmed'). We pull the timestamp of
  // that history entry as autoConfirmedAt for the column. JSONB array
  // navigation in postgres: use jsonb_path_query_first to grab the most
  // recent matching entry.
  //
  // Note: we filter ocr_result.validated = true first (cheap index-less
  // scan via the JSONB operator), then in JS filter to the history.note
  // match. For pilot volumes (<50 auto-confirms/day) this is fine; if it
  // grows we add a materialized view.
  // Sede scoping (Miguel 2026-05-18): office users get filtered to their
  // own sede; admins pass `sedeId` undefined and see the global list.
  const sedeFilter = opts.sedeId
    ? sql`AND ${conversaciones.sedeId} = ${opts.sedeId}`
    : sql``;

  const baseRows = await db
    .select({
      conv: conversaciones,
      contact: chatContacts,
      sedeName: sedes.nombre,
    })
    .from(conversaciones)
    .leftJoin(
      chatContacts,
      eq(chatContacts.respondIoContactId, conversaciones.respondIoContactId),
    )
    .leftJoin(sedes, eq(sedes.id, conversaciones.sedeId))
    .where(
      sql`(${conversaciones.leadMetadata} -> 'ocr_result' ->> 'validated') = 'true' ${sedeFilter}`,
    )
    .orderBy(desc(conversaciones.leadStageChangedAt))
    .limit(200);

  // Filter to actual auto-confirms (history entry with the canonical
  // note) and resolve flag status.
  const out: AutoConfirmedRow[] = [];

  for (const r of baseRows) {
    const meta = (r.conv.leadMetadata ?? {}) as {
      history?: Array<{ at?: string; note?: string }>;
    };
    const autoEntry = (meta.history ?? [])
      .filter((h) => h?.note === "ocr_auto_confirmed")
      .sort((a, b) =>
        (b.at ?? "").localeCompare(a.at ?? ""),
      )[0];
    if (!autoEntry) continue;
    if (cutoffIso && (autoEntry.at ?? "") < cutoffIso) continue;

    // Flag status: most-recent error_type in {requested, resolved} for
    // this conversation determines current state.
    const flagRows = await db
      .select()
      .from(errores)
      .where(
        and(
          eq(errores.conversacionId, r.conv.id),
          sql`${errores.errorType} in ('auto_confirm_review_requested','auto_confirm_review_resolved')`,
        ),
      )
      .orderBy(desc(errores.createdAt))
      .limit(1);
    const latestFlag = flagRows[0];
    let flagState: AutoConfirmedRow["flagState"] = "unflagged";
    if (latestFlag?.errorType === "auto_confirm_review_requested") {
      flagState = "flagged";
    } else if (latestFlag?.errorType === "auto_confirm_review_resolved") {
      flagState = "resolved";
    }

    // Default view hides resolved rows — they've been triaged. Audit
    // trail is visible with ?showResolved=1.
    if (flagState === "resolved" && !showResolved) continue;

    out.push({
      conv: r.conv,
      contact: r.contact,
      sedeName: r.sedeName,
      autoConfirmedAt: autoEntry.at ?? null,
      flagState,
      flaggedAt:
        latestFlag && flagState !== "unflagged"
          ? latestFlag.createdAt
          : null,
      flaggedBy:
        latestFlag &&
        flagState !== "unflagged" &&
        latestFlag.context &&
        typeof latestFlag.context === "object"
          ? ((latestFlag.context as Record<string, unknown>).flaggedBy as string) ??
            ((latestFlag.context as Record<string, unknown>).resolvedBy as string) ??
            null
          : null,
    });
  }
  return out;
}

/**
 * Conversations awaiting human deposit verification (panel /payments).
 * Joined with chat_contacts so the operator sees the client name + phone
 * without a second hop.
 */
export async function listDepositPending(opts: { sedeId?: string } = {}) {
  if (isMockMode()) {
    const rows = mockListDepositPending();
    return opts.sedeId
      ? rows.filter((r) => r.conv.sedeId === opts.sedeId)
      : rows;
  }
  const db = getDb();
  const where = and(
    eq(conversaciones.leadStage, "deposit_pending"),
    opts.sedeId ? eq(conversaciones.sedeId, opts.sedeId) : undefined,
  );
  return db
    .select({
      conv: conversaciones,
      contact: chatContacts,
      sedeName: sedes.nombre,
    })
    .from(conversaciones)
    .leftJoin(
      chatContacts,
      eq(chatContacts.respondIoContactId, conversaciones.respondIoContactId),
    )
    .leftJoin(sedes, eq(sedes.id, conversaciones.sedeId))
    .where(where)
    .orderBy(conversaciones.leadStageChangedAt);
}

/**
 * All conversations grouped by lead_stage (panel /pipeline kanban).
 * The kanban view filters in-memory; the query returns up to 200 rows so
 * we never exhaust the page on a busy day.
 */
export async function listConversationsForPipeline(opts: { sedeId?: string }) {
  if (isMockMode()) {
    let rows = mockListConversations();
    if (opts.sedeId) rows = rows.filter((r) => r.conv.sedeId === opts.sedeId);
    return rows;
  }
  const db = getDb();
  return db
    .select({
      conv: conversaciones,
      contact: chatContacts,
      sedeName: sedes.nombre,
    })
    .from(conversaciones)
    .leftJoin(
      chatContacts,
      eq(chatContacts.respondIoContactId, conversaciones.respondIoContactId),
    )
    .leftJoin(sedes, eq(sedes.id, conversaciones.sedeId))
    .where(opts.sedeId ? eq(conversaciones.sedeId, opts.sedeId) : undefined)
    .orderBy(desc(conversaciones.leadStageChangedAt))
    .limit(200);
}
