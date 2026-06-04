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
// Per-day per-turno capacity override. When no row exists for a (sede, fecha,
// turno), the system applies the default capacity (DEFAULT_CAPACITY_PER_TURNO
// in services/roster-db.ts; today: 22). A row with capacity=0 marks the slot
// as BLOCKED (weather, maintenance, festivo). A row with capacity=N reduces
// or extends the slot.
//
// Added 2026-06-04 — Phase 2 of the "roster lives in the AI" architecture
// (Miguel feedback). The legacy Apps Script → Google Sheet path is read
// only and remains live in `consultar-disponibilidad` until cutover; this
// table is for the new DB-backed source of truth.
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
    // 0 = blocked; positive = explicit capacity for that slot.
    capacity: integer("capacity").notNull(),
    // Free-form text — "weather", "maintenance", "festivo", custom.
    reason: text("reason"),
    // Operator email or "api" / "ai" when programmatic.
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // One override per (sede, fecha, turno). Upserts use this.
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
//   confirmed  — booked + deposit OCR-validated (default after insert)
//   cancelled  — Patrick/Tony cancelled (frees the space)
//   no_show    — customer didn't show up; tracked for ops analytics but
//                does NOT auto-free the space (it was held that day)
//
// Inserted atomically by services/roster-db.ts confirmBooking() inside a
// SERIALIZABLE transaction that re-checks capacity. Prevents the race-condition
// overbooking scenario that the read-only Apps Script integration couldn't.
//
// Added 2026-06-04 — Phase 2 roster. See companion rosterCapacityOverrides.
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
export type SimulatorSession = typeof simulatorSessions.$inferSelect;
export type NewSimulatorSession = typeof simulatorSessions.$inferInsert;
export type ReplayRun = typeof replayRuns.$inferSelect;
export type NewReplayRun = typeof replayRuns.$inferInsert;
export type ReplayMessage = typeof replayMessages.$inferSelect;
export type NewReplayMessage = typeof replayMessages.$inferInsert;
