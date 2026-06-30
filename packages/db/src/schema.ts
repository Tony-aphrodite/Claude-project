// ============================================================================
// Supabase / PostgreSQL schema for the DPM Diving × Claude integration.
// Mirrors guide §8 1:1. Row Level Security policies are declared in the
// migrations layer (raw SQL) since Drizzle does not yet model RLS natively.
// ============================================================================

import { sql } from "drizzle-orm";
import {
  boolean,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ── brands ─────────────────────────────────────────────────────────────────
// Multi-tenancy boundary. The pilot has a single brand (DPM Diving) but the
// schema is brand-aware from day 1 so adding a second brand later is config,
// not a migration (guide §9 Opción A).
export const brands = pgTable("brands", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  whatsappNumberId: text("whatsapp_number_id"),
  config: jsonb("config"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── sedes ──────────────────────────────────────────────────────────────────
// One row per physical school. respond_io_tag is the join key from incoming
// webhooks (guide §6 step 2).
export const sedes = pgTable(
  "sedes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    nombre: text("nombre").notNull(),
    pais: text("pais").notNull(),
    timezone: text("timezone").notNull(), // IANA, e.g. "Asia/Makassar"
    currencyCode: text("currency_code").notNull(),
    currencySymbol: text("currency_symbol").notNull(),
    languagesSupported: text("languages_supported")
      .array()
      .notNull()
      .default(sql`ARRAY['en']::text[]`),
    minAgeCertification: integer("min_age_certification").notNull().default(10),
    rosterSource: text("roster_source").notNull(), // "apps_script_url" | "supabase_table" | "api_externa"
    rosterConfig: jsonb("roster_config"),
    // Per-sede behavior overrides (follow-up cadence, post-purchase grace
    // window, etc). Shape defined as `SedeBehaviorConfig` in @dpm/shared.
    // Empty/absent → fall back to global defaults.
    behaviorConfig: jsonb("behavior_config")
      .notNull()
      .default(sql`'{}'::jsonb`),
    kbDocumentId: uuid("kb_document_id"), // FK added below to break circular ref
    promptOverrideId: uuid("prompt_override_id"),
    respondIoTag: text("respond_io_tag").notNull(),
    brandId: uuid("brand_id").references(() => brands.id),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    respondIoTagUnique: uniqueIndex("sedes_respond_io_tag_unique").on(t.respondIoTag),
    brandIdx: index("sedes_brand_idx").on(t.brandId),
  }),
);

// ── chat_contacts ──────────────────────────────────────────────────────────
// Synchronization mirror of Respond.io contacts. The PRIMARY KEY is the
// Respond.io contact_id verbatim (text, not a UUID) by explicit decision: the
// owner runs a separate operational system (payments registry) that joins on
// the same external key, so any UUID surrogate would force a future refactor.
//
// Rules (do not violate):
//   • This is the ONLY place that stores per-person identity in the system.
//   • Conversations, mensajes, follow_ups, llamadas_api MUST reference
//     respond_io_contact_id, not phone/name/email embedded.
//   • PII redaction (12-month retention or on request) happens HERE.
export const chatContacts = pgTable(
  "chat_contacts",
  {
    respondIoContactId: text("respond_io_contact_id").primaryKey(),
    phone: text("phone"),
    name: text("name"),
    language: text("language"),
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
    sedeId: uuid("sede_id").references(() => sedes.id),
    // Optional foreign-key into the owner's external payments / CRM system.
    // Filled in lazily once that integration exists; null until then.
    externalCustomerId: text("external_customer_id"),
    metadata: jsonb("metadata"),
    piiDeletionRequested: boolean("pii_deletion_requested").notNull().default(false),
    piiRetentionUntil: timestamp("pii_retention_until", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sedeIdx: index("chat_contacts_sede_idx").on(t.sedeId),
    phoneIdx: index("chat_contacts_phone_idx").on(t.phone),
    externalIdx: index("chat_contacts_external_idx").on(t.externalCustomerId),
  }),
);

// ── kb_documents ───────────────────────────────────────────────────────────
// Pointer to KB blobs in Supabase Storage. We version them; only one row per
// sede may have active=true at a time (enforced at app layer).
export const kbDocuments = pgTable(
  "kb_documents",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sedeId: uuid("sede_id")
      .notNull()
      .references(() => sedes.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull(),
    version: integer("version").notNull(),
    active: boolean("active").notNull().default(false),
    uploadedBy: text("uploaded_by"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sedeIdx: index("kb_documents_sede_idx").on(t.sedeId),
  }),
);

// ── prompts_versiones ──────────────────────────────────────────────────────
// Versioned prompt store. type ∈ {system, kb, follow_up, judge}. sede_id is
// nullable: NULL means the row is the global default for that type.
export const promptsVersiones = pgTable(
  "prompts_versiones",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    versionNumber: integer("version_number").notNull(),
    type: text("type").notNull(),
    sedeId: uuid("sede_id").references(() => sedes.id),
    content: text("content").notNull(),
    active: boolean("active").notNull().default(false),
    createdBy: text("created_by"),
    regressionSuitePassed: boolean("regression_suite_passed").notNull().default(false),
    regressionReportId: uuid("regression_report_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    typeSedeIdx: index("prompts_versiones_type_sede_idx").on(t.type, t.sedeId),
    activeIdx: index("prompts_versiones_active_idx").on(t.active),
  }),
);

// ── conversaciones ─────────────────────────────────────────────────────────
// Lifecycle of a single client thread inside Respond.io. follow_up_state is
// a small JSON describing where in the 5-level state machine we are
// (guide §11). Personally-identifying client metadata lives in chat_contacts;
// this row only holds thread-level state.
//
// lead_stage drives the sales pipeline view ("espía-monitoreo") and dictates
// when the AI hands off to a human:
//   new          — conversation just opened
//   qualified    — AI assessed real interest (heuristic: 3+ exchanges)
//   proposed     — AI proposed dates / course (consultar_disponibilidad ok)
//   deposit_pending — AI invoked solicitar_deposito; waiting human verification
//   deposit_paid — human confirmed payment in panel
//   handed_off   — AI silenced; sede team owns the thread
//   closed       — booked, end-state
//   lost         — explicit decline / negative intent / dead lead
//
// lead_metadata holds per-stage data (reference codes, deposit amount,
// currency, assigned agent name). Free-form jsonb so we can iterate without
// migrations.
export const conversaciones = pgTable(
  "conversaciones",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    respondIoConversationId: text("respond_io_conversation_id").notNull(),
    respondIoContactId: text("respond_io_contact_id")
      .notNull()
      .references(() => chatContacts.respondIoContactId, { onDelete: "cascade" }),
    sedeId: uuid("sede_id")
      .notNull()
      .references(() => sedes.id),
    status: text("status").notNull().default("active"),
    leadStage: text("lead_stage").notNull().default("new"),
    leadStageChangedAt: timestamp("lead_stage_changed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    leadMetadata: jsonb("lead_metadata"),
    assignedAgent: text("assigned_agent"),
    followUpState: jsonb("follow_up_state"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    /**
     * Marks the conversation's source — keeps Miguel's simulator + replay
     * traffic isolated from real-customer conversations on the dashboard
     * + metrics + lifecycle webhooks.
     *
     *   "production"  — real customer chat (default; the only value
     *                   present in rows created before 2026-05-14).
     *   "simulator"   — Miguel chatting with John as a fake client from
     *                   the panel /simulator page. No outbound calls to
     *                   Respond.io, no metric contribution.
     *   "replay"      — an automated re-run of a real conversation against
     *                   a different prompt version. Stored alongside the
     *                   original for side-by-side comparison.
     */
    origin: text("origin").notNull().default("production"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    respondIoConversationIdUnique: uniqueIndex("conversaciones_rio_id_unique").on(
      t.respondIoConversationId,
    ),
    sedeIdx: index("conversaciones_sede_idx").on(t.sedeId),
    statusIdx: index("conversaciones_status_idx").on(t.status),
    contactIdx: index("conversaciones_contact_idx").on(t.respondIoContactId),
    leadStageIdx: index("conversaciones_lead_stage_idx").on(t.leadStage, t.leadStageChangedAt),
    originIdx: index("conversaciones_origin_idx").on(t.origin),
  }),
);

// ── mensajes ───────────────────────────────────────────────────────────────
// Append-only message log. sender is one of: "cliente" | "ai" | "agente_humano".
// `fuentes` records, for AI messages only, the citations the model emitted
// (e.g. ["kb:ow-course", "history:m12"]). Used by the panel for auditability
// and by the regression suite to detect uncited factual claims.
export const mensajes = pgTable(
  "mensajes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    conversacionId: uuid("conversacion_id")
      .notNull()
      .references(() => conversaciones.id, { onDelete: "cascade" }),
    sender: text("sender").notNull(),
    agenteName: text("agente_name"),
    content: text("content").notNull(),
    fuentes: jsonb("fuentes"), // string[] — null for non-AI messages
    metadata: jsonb("metadata"),
    /**
     * Mirrored from `conversaciones.origin` so the cost/latency
     * dashboard can filter at the message level without a join. Default
     * is "production" for backfill compatibility.
     */
    origin: text("origin").notNull().default("production"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    convCreatedIdx: index("mensajes_conversacion_created_idx").on(
      t.conversacionId,
      t.createdAt,
    ),
    originIdx: index("mensajes_origin_idx").on(t.origin),
  }),
);

// ── simulator_sessions ─────────────────────────────────────────────────────
// Named snapshots of a simulator conversation Miguel wants to replay later.
// Phase 1.5 of the Simulator feature: when operator clicks "Save session"
// in /simulator, we capture the current conversacion_id (which already
// has origin='simulator'), the prompt version that was active, and a
// user-supplied label. Loading a session re-points the panel page to that
// conversation row.
//
// We don't COPY the messages — they live on the original conversaciones/
// mensajes rows with origin='simulator'. The session row is just a
// labelled bookmark + the prompt version pin for reproducibility.
export const simulatorSessions = pgTable(
  "simulator_sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    conversacionId: uuid("conversacion_id")
      .notNull()
      .references(() => conversaciones.id, { onDelete: "cascade" }),
    promptVersionId: uuid("prompt_version_id"),
    createdBy: text("created_by"), // operator email from Supabase auth
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    nameIdx: index("simulator_sessions_name_idx").on(t.name),
    createdAtIdx: index("simulator_sessions_created_at_idx").on(t.createdAt),
  }),
);

// ── replay_runs + replay_messages ──────────────────────────────────────────
// Phase 2: take a real customer conversation and replay the client-side
// messages against a different prompt version, recording what the new
// version of John would have replied. Stored separately from `mensajes`
// so a replay never pollutes the original audit trail (`mensajes.origin`
// stays "production" for the real conversation).
//
// Lifecycle of a run:
//   1. POST /admin/replay/start  -> inserts replay_runs row with
//      status='pending'
//   2. Worker iterates client messages from the source conversation in
//      order. For each, it calls inference against the NEW prompt with
//      the NEW assistant history (NOT the original v_orig assistant
//      messages — otherwise we'd measure "how does new prompt react to
//      old context", which is not what we want).
//   3. Each generated assistant reply lands as a replay_messages row.
//      Original client messages are also copied so the side-by-side UI
//      can render without re-querying mensajes.
//   4. status -> 'done' (or 'failed' on error, with errorMessage).
export const replayRuns = pgTable(
  "replay_runs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sourceConversacionId: uuid("source_conversacion_id")
      .notNull()
      .references(() => conversaciones.id, { onDelete: "cascade" }),
    promptVersionId: uuid("prompt_version_id").notNull(),
    promptVersionLabel: text("prompt_version_label"),
    createdBy: text("created_by"), // operator email
    status: text("status").notNull().default("pending"), // pending | running | done | failed
    costUsdTotal: text("cost_usd_total"), // numeric stored as text to avoid float drift
    messageCount: text("message_count"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sourceIdx: index("replay_runs_source_idx").on(t.sourceConversacionId),
    statusIdx: index("replay_runs_status_idx").on(t.status),
  }),
);

export const replayMessages = pgTable(
  "replay_messages",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    replayRunId: uuid("replay_run_id")
      .notNull()
      .references(() => replayRuns.id, { onDelete: "cascade" }),
    idx: text("idx").notNull(), // ordering within the run (00001, 00002, ...)
    role: text("role").notNull(), // "cliente" | "ai"
    content: text("content").notNull(),
    fuentes: jsonb("fuentes"), // string[] for AI rows
    toolCalls: jsonb("tool_calls"), // array of {name, input, output?} for AI rows
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    runIdxIdx: index("replay_messages_run_idx").on(t.replayRunId, t.idx),
  }),
);

// ── llamadas_api ───────────────────────────────────────────────────────────
// One row per Anthropic call. Powers the cost + latency dashboard.
export const llamadasApi = pgTable(
  "llamadas_api",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    conversacionId: uuid("conversacion_id").references(() => conversaciones.id, {
      onDelete: "set null",
    }),
    sedeId: uuid("sede_id").references(() => sedes.id),
    model: text("model").notNull(),
    promptVersionId: uuid("prompt_version_id").references(() => promptsVersiones.id),
    inputTokens: integer("input_tokens"),
    cacheReadTokens: integer("cache_read_tokens"),
    cacheWriteTokens: integer("cache_write_tokens"),
    outputTokens: integer("output_tokens"),
    totalCostUsd: decimal("total_cost_usd", { precision: 10, scale: 6 }),
    latencyMs: integer("latency_ms"),
    cacheHit: boolean("cache_hit"),
    toolUseCalled: text("tool_use_called").array(),
    status: text("status"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sedeDateIdx: index("llamadas_sede_date_idx").on(t.sedeId, t.createdAt),
    statusIdx: index("llamadas_status_idx").on(t.status),
  }),
);

// ── errores ────────────────────────────────────────────────────────────────
// Operational error log. source ∈ {anthropic, supabase, respond_io, apps_script, internal}.
export const errores = pgTable(
  "errores",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    source: text("source").notNull(),
    conversacionId: uuid("conversacion_id").references(() => conversaciones.id, {
      onDelete: "set null",
    }),
    errorType: text("error_type"),
    errorMessage: text("error_message"),
    stackTrace: text("stack_trace"),
    context: jsonb("context"),
    resolved: boolean("resolved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sourceIdx: index("errores_source_idx").on(t.source),
    resolvedIdx: index("errores_resolved_idx").on(t.resolved),
  }),
);

// ── follow_ups ─────────────────────────────────────────────────────────────
// State machine row per scheduled follow-up. The partial index on
// (scheduled_at) WHERE sent_at IS NULL AND cancelled_at IS NULL is what makes
// the 15-min scanner fast.
export const followUps = pgTable(
  "follow_ups",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    conversacionId: uuid("conversacion_id")
      .notNull()
      .references(() => conversaciones.id, { onDelete: "cascade" }),
    level: integer("level").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),
    messageSent: text("message_sent"),
    clientResponded: boolean("client_responded").notNull().default(false),
    resultedInSale: boolean("resulted_in_sale"),
    saleAmountUsd: decimal("sale_amount_usd", { precision: 10, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    convIdx: index("follow_ups_conv_idx").on(t.conversacionId),
    // Partial index — see migration 0001 raw SQL for the WHERE clause.
    scheduledIdx: index("follow_ups_scheduled_idx").on(t.scheduledAt),
  }),
);

// ── pii_retention_policy ───────────────────────────────────────────────────
// Single-row config table. Cron job reads this to decide what to purge.
export const piiRetentionPolicy = pgTable("pii_retention_policy", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  retentionDays: integer("retention_days").notNull().default(365),
  autoDeleteEnabled: boolean("auto_delete_enabled").notNull().default(true),
  appliesTo: text("applies_to").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── roster_cache ───────────────────────────────────────────────────────────
// Apps Script roster snapshots cached for CACHE_TTL.ROSTER_SECONDS (guide §10).
// Not in §8 explicitly but called out in the cache strategy block.
export const rosterCache = pgTable(
  "roster_cache",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sedeId: uuid("sede_id")
      .notNull()
      .references(() => sedes.id, { onDelete: "cascade" }),
    snapshot: jsonb("snapshot").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sedeFreshIdx: index("roster_cache_sede_expires_idx").on(t.sedeId, t.expiresAt),
  }),
);

// ── roster_capacity_overrides ──────────────────────────────────────────────
// Per-day per-turno overrides for capacity AND manual block state. When no
// row exists for a (sede, fecha, turno), the system applies the default
// capacity (DEFAULT_CAPACITY_PER_TURNO in services/roster-db.ts; today: 22)
// and treats the slot as not-manually-blocked.
//
// Two ORTHOGONAL states this table tracks (Miguel feedback 2026-06-05):
//   • capacity   — explicit per-(sede, fecha, turno) seat count override.
//                  Used for "AM has 18 instead of 22 today, fewer tanks".
//   • blocked    — manual block flag (weather, charter, no boat, festivo).
//                  Independent of capacity — toggling block on/off must
//                  preserve the underlying capacity number so that
//                  unblocking restores the slot to its previous state.
//
// Why this isn't "capacity=0 means blocked":
//   The prior design used capacity=0 to mark blocks. Miguel pointed out the
//   bug: setting capacity=0 OVERWRITES the real capacity, so when you
//   unblock you've lost the original number — and the row shows nonsense
//   like "reserved=22 / capacity=0" (negative remaining). The flag-based
//   design keeps capacity intact and lets blocks toggle cleanly.
//
// Full-by-bookings (reserved >= capacity) is a SEPARATE state, computed by
// services/roster-db.ts at read time. The system surfaces it on its own —
// no row in this table is required to represent it.
//
// Added 2026-06-04 — Phase 2 of the "roster lives in the AI" architecture
// (Miguel feedback). Schema refined 2026-06-05 with blocked + block_reason
// columns after Miguel's review.
export const rosterCapacityOverrides = pgTable(
  "roster_capacity_overrides",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sedeId: uuid("sede_id")
      .notNull()
      .references(() => sedes.id, { onDelete: "cascade" }),
    // YYYY-MM-DD; stored as text to match the rest of the codebase (avoids
    // pgdate timezone surprises — Apps Script returns ISO strings too).
    fecha: text("fecha").notNull(),
    // "AM" | "PM" | "Nocturno" — same enum the AI tool uses.
    turno: text("turno").notNull(),
    // Explicit capacity for this slot. ALWAYS the real seat count (even
    // when blocked=true). Read-time logic clamps available to 0 when
    // blocked, but the underlying number is preserved so unblocking
    // restores the slot.
    capacity: integer("capacity").notNull(),
    // Manual block flag — true when an operator has marked the slot
    // unavailable for reasons external to bookings (weather, charter,
    // festivo, no boat).
    blocked: boolean("blocked").notNull().default(false),
    // Free-form reason for the manual block (shown to operators in panel).
    blockReason: text("block_reason"),
    // Free-form note for capacity override (e.g. "fewer tanks today").
    reason: text("reason"),
    // Operator email or "api" / "ai" when programmatic.
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // One row per (sede, fecha, turno). Upserts use this.
    uniqueSedeFechaTurno: uniqueIndex("roster_cap_overrides_sede_fecha_turno_idx").on(
      t.sedeId,
      t.fecha,
      t.turno,
    ),
  }),
);

// ── roster_bookings ────────────────────────────────────────────────────────
// Atomic source of truth for confirmed bookings. One row per (lead, turno).
// pax is denormalized so AI availability checks are a single SUM query:
//   capacity - SUM(pax WHERE status='confirmed')  =  available spaces
//
// Status lifecycle:
//   pending    — hold created by solicitar_deposito (Miguel rule 2026-06-09).
//                Reserves capacity for 4 hours while the customer pays.
//                Auto-expires to `expired` if no OCR confirms in time.
//   confirmed  — deposit OCR-validated. Transitions from `pending` (or direct
//                insert in pre-2026-06-09 conversations).
//   expired    — pending hold that timed out (Miguel TTL 4h). Capacity is
//                released (availability queries ignore `expired` rows). Row
//                is kept for audit + so the office can chase the customer.
//   cancelled  — Patrick/Tony cancelled (frees the space).
//   no_show    — customer didn't show up; tracked for ops analytics but
//                does NOT auto-free the space (it was held that day).
//
// Availability math (capacity − reserved):
//   reserved = SUM(pax WHERE status IN ('pending', 'confirmed'))
// Pending counts as taken so concurrent customers don't all see the same
// availability while the first one is mid-payment.
//
// Inserted atomically by services/roster-db.ts inside a SERIALIZABLE
// transaction that re-checks capacity. Prevents race-condition overbooking
// the read-only Apps Script integration couldn't catch.
//
// Added 2026-06-04 — Phase 2 roster. See companion rosterCapacityOverrides.
// Pending/expired states added 2026-06-09 — Miguel hold-on-request rule.
export const rosterBookings = pgTable(
  "roster_bookings",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sedeId: uuid("sede_id")
      .notNull()
      .references(() => sedes.id, { onDelete: "cascade" }),
    fecha: text("fecha").notNull(),
    turno: text("turno").notNull(),
    // CatalogProgram key (TryScuba / OW / AOW / ...). Not FK-constrained
    // because the enum lives in TS and rarely changes; storing as text is
    // the same approach as conversaciones.leadStage.
    programa: text("programa").notNull(),
    pax: integer("pax").notNull().default(1),
    // Conversation that produced this booking. NULL after conversation
    // deletion (set on cascade); the booking still counts toward capacity.
    conversacionId: uuid("conversacion_id").references(() => conversaciones.id, {
      onDelete: "set null",
    }),
    // Respond.io contact id (not FK; the chat_contacts table is keyed on
    // respond_io_contact_id but the relationship is informational only).
    contactId: text("contact_id"),
    // Lifecycle status — "confirmed" | "cancelled" | "no_show". Default
    // confirmed since the only insert path is post-OCR-validation today.
    status: text("status").notNull().default("confirmed"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: text("cancelled_by"),
    cancelReason: text("cancel_reason"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // Primary lookup pattern: "how many pax confirmed for this (sede, fecha, turno)?"
    sedeFechaTurnoIdx: index("roster_bookings_sede_fecha_turno_idx").on(
      t.sedeId,
      t.fecha,
      t.turno,
    ),
    // For panel views filtered by status (e.g. "show only confirmed").
    statusIdx: index("roster_bookings_status_idx").on(t.status),
    // For "which booking did THIS conversation produce" lookups.
    conversacionIdx: index("roster_bookings_conv_idx").on(t.conversacionId),
  }),
);

// ── roster_bookings_sandbox ───────────────────────────────────────────────
// Sandbox mirror of `roster_bookings`. Used ONLY by the /admin/simulator
// surface so Miguel can run end-to-end test conversations (consultar →
// solicitar_deposito → OCR confirm) without ever touching production
// capacity. Schema is identical column-for-column so the same drizzle
// queries can target either table by switching the `from` clause.
//
// Why a separate table and not a `sandbox` discriminator column on
// `roster_bookings`: with a column, every legacy query that forgets to
// filter would mix sandbox holds into real availability. A separate
// table makes the isolation compile-time enforced — the production
// path imports `rosterBookings`, the simulator imports
// `rosterBookingsSandbox`, and there is no shared accidental access.
// (Miguel rule 2026-06-09 PM: "no hace falta que toque el roster real
// que tenga una copia con eso estamos bien.")
export const rosterBookingsSandbox = pgTable(
  "roster_bookings_sandbox",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sedeId: uuid("sede_id")
      .notNull()
      .references(() => sedes.id, { onDelete: "cascade" }),
    fecha: text("fecha").notNull(),
    turno: text("turno").notNull(),
    programa: text("programa").notNull(),
    pax: integer("pax").notNull().default(1),
    conversacionId: uuid("conversacion_id").references(() => conversaciones.id, {
      onDelete: "set null",
    }),
    contactId: text("contact_id"),
    status: text("status").notNull().default("confirmed"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: text("cancelled_by"),
    cancelReason: text("cancel_reason"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sedeFechaTurnoIdx: index("roster_bookings_sandbox_sede_fecha_turno_idx").on(
      t.sedeId,
      t.fecha,
      t.turno,
    ),
    statusIdx: index("roster_bookings_sandbox_status_idx").on(t.status),
    conversacionIdx: index("roster_bookings_sandbox_conv_idx").on(t.conversacionId),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// ── INTELLIGENT ROSTER ENGINE (Miguel 2026-06-24 spec) ──────────────────────
// Added 2026-06-24 to replace the boat-capacity-counter model with the
// instructor-grouping engine described in Miguel's v2.1 spec.
//
// Four new tables:
//   • instructors                — master list per sede
//   • instructor_availability    — per-day staffing per sede
//   • roster_divers              — one row per diver per dive-day
//   • roster_groups              — engine output, one row per group
//
// See `docs/roster-engine-architecture.md` for the full implementation
// guide. See `reference/roster-engine-spec-2026-06-24.md` for Miguel's
// canonical spec (English).
//
// Coexistence with the existing `roster_bookings` and
// `roster_bookings_sandbox` tables: kept side-by-side during the
// shadow-mode rollout (spec §9). Once the engine drives sales, the
// per-pax detail moves to `roster_divers` and `roster_bookings` becomes
// a legacy/audit surface.
// ────────────────────────────────────────────────────────────────────────────

export const instructors = pgTable(
  "instructors",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sedeId: uuid("sede_id")
      .notNull()
      .references(() => sedes.id, { onDelete: "cascade" }),
    // The short name as it appears in Miguel's Sheet (MIGUE, BILLY, ESTE,
    // YOUNNES, TUTU, ARI, KIELE, Freelance1-3). This is the display label
    // and primary lookup key from the office side.
    nombre: text("nombre").notNull(),
    // Full legal name — used for payroll / SSI paperwork. Optional.
    nombreLegal: text("nombre_legal"),
    // ISO-639-1 codes the instructor can teach in. Office uses this for
    // language-driven group reassignment (spec §6.3 — "language swap").
    // Engine itself is language-blind; assignment is round-robin first.
    languages: text("languages").array(),
    // Miguel v2.2 addendum §1 (2026-06-27): role distinction.
    //   'instructor' — full instructor, can lead courses (BD/OW/AOW/SP/RES)
    //                  AND fun dives. Default for backward compat.
    //   'divemaster' — DM, can ONLY guide fun dives (FD, REF phase 2).
    //                  Matching engine rejects courses gated to DMs.
    // Stored as text so adding 'assistant_instructor' or similar later
    // doesn't need a migration.
    role: text("role").notNull().default("instructor"),
    // Soft delete — false = no longer with DPM, never auto-assigned. Kept
    // for historical bookings that reference this instructor.
    active: boolean("active").notNull().default(true),
    // Free-form notes ("no deep dives", "prefers AM", etc.).
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // Unique (sede, nombre) so MIGUE@KT ≠ MIGUE@PP would still be allowed
    // by table-level constraint but each sede sees one MIGUE.
    sedeNombreUnique: uniqueIndex("instructors_sede_nombre_unique").on(
      t.sedeId,
      t.nombre,
    ),
    sedeActiveIdx: index("instructors_sede_active_idx").on(t.sedeId, t.active),
    // Matching engine query: "give me every instructor of role X
    // available at sede Y" — used by the DM-first packing in §1.
    sedeRoleIdx: index("instructors_sede_role_idx").on(t.sedeId, t.role),
  }),
);

export const instructorAvailability = pgTable(
  "instructor_availability",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sedeId: uuid("sede_id")
      .notNull()
      .references(() => sedes.id, { onDelete: "cascade" }),
    fecha: text("fecha").notNull(),
    instructorId: uuid("instructor_id")
      .notNull()
      .references(() => instructors.id, { onDelete: "cascade" }),
    // Which slots the instructor is available for that day. Subset of
    // ['AM','PM','POOL','NIGHT']. Empty = off (caller should DELETE the
    // row instead of writing []).
    slots: text("slots").array().notNull(),
    // How this row got created. 'default' = derived from a weekly recurring
    // schedule (Phase 4 admin). 'manual' = office override for this day.
    source: text("source").notNull().default("manual"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // One availability row per (sede, fecha, instructor). Office overrides
    // mutate the same row instead of inserting duplicates.
    sedeFechaInstructorUnique: uniqueIndex("instructor_availability_sfi_unique").on(
      t.sedeId,
      t.fecha,
      t.instructorId,
    ),
    // Engine's primary lookup pattern: "which instructors are available
    // on sede X for date Y?".
    sedeFechaIdx: index("instructor_availability_sede_fecha_idx").on(
      t.sedeId,
      t.fecha,
    ),
  }),
);

// Activity codes match the Activity enum in @dpm/shared. Stored as text
// here so adding a code in TS doesn't require a migration.
//   BD_CONFINADA / BD_BARCO / OW1 / OW2 / OW3 / FD / AA / AA2 /
//   ADV / SP / RES / REF_FASE1 / REF_FASE2
//
// nivel_certificacion: BEG / OW / AA / RES / DM / INS
//
// slot: AM / PM / POOL / NIGHT
//
// origen: AI / Manual
//
// estado_pago: pending / deposit_paid / full_paid / cancelled
export const rosterDivers = pgTable(
  "roster_divers",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sedeId: uuid("sede_id")
      .notNull()
      .references(() => sedes.id, { onDelete: "cascade" }),
    fecha: text("fecha").notNull(),
    slot: text("slot").notNull(),
    // The AI's ref_code (DPM-XX-MMDD-XXXXXX). Same value spans multiple
    // rows when a program covers multiple days (OW = 3 rows, one per
    // diver-day) — that's intentional.
    codigoBuceador: text("codigo_buceador").notNull(),
    nombre: text("nombre").notNull(),
    nivelCertificacion: text("nivel_certificacion").notNull(),
    activity: text("activity").notNull(),
    // SP / ADV subtype: 'nitrox', 'deep', 'wreck', 'night', 'buoyancy',
    // 'navigation', 'fish_id' — used to keep dedicated_sp groups truly
    // dedicated per subtype.
    activityDetail: text("activity_detail"),
    // Computed depth ceiling: 5 (BD-pool), 12 (BD-boat / OW2), 18 (OW3 /
    // FD@OW), 30 (FD@AA / profunda), 40 (Deep Specialty). Stored
    // (not derived at read time) so queries can filter by depth fast.
    perfilProfundidad: integer("perfil_profundidad").notNull(),
    acceptsCap: boolean("accepts_cap").notNull().default(false),
    origen: text("origen").notNull(),
    estadoPago: text("estado_pago").notNull().default("pending"),
    conversacionId: uuid("conversacion_id").references(() => conversaciones.id, {
      onDelete: "set null",
    }),
    // Set by the engine on the grouping pass. NULL during the "candidate"
    // phase before the sale closes or during sim-only runs.
    instructorId: uuid("instructor_id").references(() => instructors.id, {
      onDelete: "set null",
    }),
    groupId: uuid("group_id"),
    // 1-based position within the group — matches the Sheet's "Ratio" column.
    groupOrder: integer("group_order"),
    notes: text("notes"),
    // Miguel v2.2 addendum §3 (2026-06-27): soft delete. A walk-in that
    // gets removed leaves the row in place with deletedAt stamped, so
    // capacity recomputes ignore it but the row stays auditable. Every
    // availability / motor query MUST filter `deletedAt IS NULL`.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // Engine's main query: every diver in a slot.
    sedeFechaSlotIdx: index("roster_divers_sede_fecha_slot_idx").on(
      t.sedeId,
      t.fecha,
      t.slot,
    ),
    // Reverse lookup: which divers does this conversation own?
    conversacionIdx: index("roster_divers_conv_idx").on(t.conversacionId),
    // Ref code lookup.
    codigoIdx: index("roster_divers_codigo_idx").on(t.codigoBuceador),
    // Instructor's daily load: "how many divers is ARI carrying today?".
    instructorFechaIdx: index("roster_divers_instructor_fecha_idx").on(
      t.instructorId,
      t.fecha,
    ),
    // Live-set scan (Miguel v2.2 §3) — the partial index in 0006 covers
    // `WHERE deleted_at IS NULL`. Listed here for completeness; Drizzle's
    // schema doesn't model partial indexes, so it lives in the SQL.
  }),
);

// ── roster_audit_log ────────────────────────────────────────────────────
// Miguel v2.2 addendum §3 + §6 (2026-06-27). Every panel mutation that
// touches a diver, an instructor's assignment, or a group leaves an audit
// row here. Append-only — never UPDATE or DELETE through the app. The
// table also doubles as the substrate for §6 "every action re-runs motor
// validation" by recording the validation result alongside the action.
export const rosterAuditLog = pgTable(
  "roster_audit_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sedeId: uuid("sede_id")
      .notNull()
      .references(() => sedes.id, { onDelete: "cascade" }),
    // Action codes (TS enum-compatible — keep the source of truth here):
    //   create_walk_in / update_walk_in / delete_walk_in
    //   reassign_instructor_this_day / reassign_instructor_all_program
    //   instructor_swap_group_leader
    //   revalidate_motor
    action: text("action").notNull(),
    // Subject diver (nullable — instructor-swap on a whole group lists
    // the diver ids inside `payload` instead of pinning to one row).
    diverId: uuid("diver_id").references(() => rosterDivers.id, {
      onDelete: "set null",
    }),
    fecha: text("fecha"),
    slot: text("slot"),
    actorUserId: uuid("actor_user_id"),
    actorLabel: text("actor_label"),
    // Free-form snapshot:
    //   create — { row: {...} }
    //   update — { before: {...}, after: {...}, fields: [...] }
    //   delete — { row: {...} }
    //   reassign — { fromInstructor, toInstructor, days: [...] }
    //   revalidate_motor — { ok: bool, failingSlots?: [...] }
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sedeCreatedIdx: index("roster_audit_log_sede_created_idx").on(
      t.sedeId,
      t.createdAt,
    ),
    diverIdx: index("roster_audit_log_diver_idx").on(t.diverId),
    sedeFechaIdx: index("roster_audit_log_sede_fecha_idx").on(
      t.sedeId,
      t.fecha,
    ),
  }),
);

// grupo_actividad values:
//   pool_inicial / mar_12m / ow_18m / fundive_18m / fundive_30m /
//   fundive_40m / profunda / dedicado_sp / dedicado_res
export const rosterGroups = pgTable(
  "roster_groups",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sedeId: uuid("sede_id")
      .notNull()
      .references(() => sedes.id, { onDelete: "cascade" }),
    fecha: text("fecha").notNull(),
    slot: text("slot").notNull(),
    // NULL when the engine couldn't assign (capacity short). Diver rows
    // still point at this group via `group_id` so the office sees the
    // unassigned bundle and can fix it.
    instructorId: uuid("instructor_id").references(() => instructors.id, {
      onDelete: "set null",
    }),
    grupoActividad: text("grupo_actividad").notNull(),
    perfilProfundidad: integer("perfil_profundidad").notNull(),
    ratioMax: integer("ratio_max").notNull(),
    site1: text("site_1"),
    site2: text("site_2"),
    diversCount: integer("divers_count").notNull().default(0),
    // All groups generated in the same engine run share this id — lets
    // the panel show "here's the engine's view of the day, vs Miguel's
    // sheet" coherently. Also used for shadow-mode comparisons.
    engineRunId: uuid("engine_run_id"),
    // 'live' = drives operations / sales. 'shadow' = engine ran but not
    // authoritative. During the shadow rollout (spec §9), groups are
    // written with source='shadow' first.
    source: text("source").notNull().default("shadow"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sedeFechaSlotIdx: index("roster_groups_sede_fecha_slot_idx").on(
      t.sedeId,
      t.fecha,
      t.slot,
    ),
    engineRunIdx: index("roster_groups_engine_run_idx").on(t.engineRunId),
    sourceIdx: index("roster_groups_source_idx").on(t.source),
  }),
);

// ── webhook_debug_log ──────────────────────────────────────────────────────
// Forensic capture of every inbound webhook payload. Added 2026-06-03 to
// root-cause "first customer message for a new lead doesn't reach the
// message-processing path even though the webhook is Active". Pino logs
// would have the answer but require Railway Deploy Logs access; this
// captures to DB so the data is queryable from outside Railway.
export const webhookDebugLog = pgTable("webhook_debug_log", {
  id: integer("id").primaryKey(),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  eventField: text("event_field"),
  eventType: text("event_type"),
  contactId: text("contact_id"),
  textLen: integer("text_len"),
  hasAttachment: boolean("has_attachment"),
  direction: text("direction"),
  senderType: text("sender_type"),
  classifiedAs: text("classified_as"),
  body: jsonb("body"),
});

// ── Type exports ────────────────────────────────────────────────────────────
export type Brand = typeof brands.$inferSelect;
export type NewBrand = typeof brands.$inferInsert;
export type Sede = typeof sedes.$inferSelect;
export type NewSede = typeof sedes.$inferInsert;
export type ChatContact = typeof chatContacts.$inferSelect;
export type NewChatContact = typeof chatContacts.$inferInsert;
export type KbDocument = typeof kbDocuments.$inferSelect;
export type PromptVersion = typeof promptsVersiones.$inferSelect;
export type NewPromptVersion = typeof promptsVersiones.$inferInsert;
export type Conversacion = typeof conversaciones.$inferSelect;
export type NewConversacion = typeof conversaciones.$inferInsert;
export type Mensaje = typeof mensajes.$inferSelect;
export type NewMensaje = typeof mensajes.$inferInsert;
export type LlamadaApi = typeof llamadasApi.$inferSelect;
export type NewLlamadaApi = typeof llamadasApi.$inferInsert;
export type Error_ = typeof errores.$inferSelect;
export type FollowUp = typeof followUps.$inferSelect;
export type NewFollowUp = typeof followUps.$inferInsert;
export type RosterCacheRow = typeof rosterCache.$inferSelect;
export type RosterCapacityOverride = typeof rosterCapacityOverrides.$inferSelect;
export type NewRosterCapacityOverride = typeof rosterCapacityOverrides.$inferInsert;
export type RosterBooking = typeof rosterBookings.$inferSelect;
export type NewRosterBooking = typeof rosterBookings.$inferInsert;
export type RosterBookingSandbox = typeof rosterBookingsSandbox.$inferSelect;
export type NewRosterBookingSandbox = typeof rosterBookingsSandbox.$inferInsert;
export type SimulatorSession = typeof simulatorSessions.$inferSelect;
export type NewSimulatorSession = typeof simulatorSessions.$inferInsert;
export type ReplayRun = typeof replayRuns.$inferSelect;
export type NewReplayRun = typeof replayRuns.$inferInsert;
export type ReplayMessage = typeof replayMessages.$inferSelect;
export type NewReplayMessage = typeof replayMessages.$inferInsert;
export type Instructor = typeof instructors.$inferSelect;
export type NewInstructor = typeof instructors.$inferInsert;
export type InstructorAvailability = typeof instructorAvailability.$inferSelect;
export type NewInstructorAvailability = typeof instructorAvailability.$inferInsert;
export type RosterDiver = typeof rosterDivers.$inferSelect;
export type NewRosterDiver = typeof rosterDivers.$inferInsert;
export type RosterGroup = typeof rosterGroups.$inferSelect;
export type NewRosterGroup = typeof rosterGroups.$inferInsert;
export type RosterAuditLog = typeof rosterAuditLog.$inferSelect;
export type NewRosterAuditLog = typeof rosterAuditLog.$inferInsert;

// ── saved_responses ─────────────────────────────────────────────────────
// Miguel 2026-06-12 resilience layer #7 ("Botón Guardar respuesta").
// Operator clicks "Guardar" on an AI reply that turned out well; that
// text lands here and becomes available to the future quick-reply panel
// (#6). The schema deliberately captures BOTH the AI's reply AND the
// customer's prompt-question that triggered it so the library reads as
// "question → good answer" pairs, not isolated text blobs.
//
// Sede scoping:
//   sede_id = NULL  → general response, available to every sede.
//   sede_id = <uuid> → only surfaced inside that sede's panel.
//
// Soft-delete via archived_at (same pattern as roster_divers). Hard
// delete is reserved for compliance ("forget this conversation") only.
export const savedResponses = pgTable(
  "saved_responses",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sedeId: uuid("sede_id").references(() => sedes.id, {
      onDelete: "set null",
    }),
    /** Short label the operator picks — appears in the quick-reply picker. */
    name: text("name").notNull(),
    /** The AI text the operator wants to reuse. */
    responseText: text("response_text").notNull(),
    /** Optional customer question that produced this reply. */
    promptText: text("prompt_text"),
    /** Comma-grouped operator tags ("objecion_precio", "curso_ow", etc.). */
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
    /** ISO 639-1 language of the response — drives the language filter. */
    language: text("language").notNull().default("es"),
    /** Supabase user.id of the saving operator. */
    createdByUserId: uuid("created_by_user_id"),
    /** Email of the saving operator — for at-a-glance display. */
    createdByLabel: text("created_by_label"),
    /** Conversation the response came from — set NULL on conv delete. */
    sourceConversacionId: uuid("source_conversacion_id").references(
      () => conversaciones.id,
      { onDelete: "set null" },
    ),
    /** Message row the response came from — set NULL on row delete. */
    sourceMensajeId: uuid("source_mensaje_id").references(() => mensajes.id, {
      onDelete: "set null",
    }),
    /** Count of times the operator used this from the quick-reply panel. */
    timesUsed: integer("times_used").notNull().default(0),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    /** Soft delete — non-null means archived. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    // Quick-reply panel reads "available responses for THIS sede" —
    // a `(sede_id, archived_at)` index makes that a single scan.
    sedeArchivedIdx: index("saved_responses_sede_archived_idx").on(
      t.sedeId,
      t.archivedAt,
    ),
    // Language filter: panel often pre-filters to the customer's language.
    languageIdx: index("saved_responses_language_idx").on(t.language),
    // Tags array search — kept simple; gin index added in SQL migration
    // because Drizzle doesn't model `USING GIN` indexes directly.
  }),
);

export type SavedResponse = typeof savedResponses.$inferSelect;
export type NewSavedResponse = typeof savedResponses.$inferInsert;
