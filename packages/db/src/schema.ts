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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    convCreatedIdx: index("mensajes_conversacion_created_idx").on(
      t.conversacionId,
      t.createdAt,
    ),
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
