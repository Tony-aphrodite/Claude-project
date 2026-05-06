// ============================================================================
// Cross-cutting domain types. The DB schema (packages/db) is the source of
// truth for persisted entities; types here cover the request/response shapes
// flowing between Respond.io, the server, Anthropic, and the panel.
// ============================================================================

import { z } from "zod";

// ── Respond.io webhook payload ──────────────────────────────────────────────
// We accept a permissive shape and validate the fields we actually use, since
// Respond.io's webhook envelope evolves and we want to fail open on unknown
// optional fields rather than rejecting valid messages.
//
// Sede identification (owner-confirmed 2026-05-04): Respond.io does NOT use
// tags for the diving school — it uses a contact custom field named "Branch"
// populated by the welcome workflow (values: "Gili Trawangan", "Gili Air",
// "Nusa Penida", "Koh Tao", "Koh Phi Phi", or empty). We accept the field
// under a few candidate paths because Respond.io serializes custom fields
// inconsistently across event types; the sede service normalizes them.
const customFieldsBag = z.record(z.unknown());

// `direction` and `message.sentBy` are filled when Respond.io fires the same
// `message.created` event for OUTGOING messages (replies sent by the human
// team or by a bot). The espía path uses these to capture human-agent replies
// and store them with sender="agente_humano".
const sentByTypeSchema = z.enum(["agent", "bot", "contact", "user", "system"]);

export const respondIoIncomingMessageSchema = z.object({
  // Respond.io's "Send Test" UI fires a sample payload that omits `event`,
  // and we want that test to return 200 so the operator can activate the
  // webhook from the dashboard. The route layer treats a missing event as
  // `ignored: "missing_event"` and returns 200 — real production events
  // always carry the field.
  event: z.string().optional(),
  channelId: z.string().optional(),
  // "incoming" — client→DPM. "outgoing" — DPM→client (agent or bot reply).
  // Older payloads omit this; we treat absence as "incoming" to preserve the
  // original AI-handler behavior.
  direction: z.enum(["incoming", "outgoing"]).optional(),
  contact: z
    .object({
      id: z.union([z.string(), z.number()]).transform(String),
      phone: z.string().optional(),
      name: z.string().optional(),
      language: z.string().optional(),
      tags: z.array(z.string()).default([]),
      // Respond.io variants we have seen across event payloads. Order of
      // preference inside the resolver is: customFields → fields → custom_fields.
      customFields: customFieldsBag.optional(),
      fields: customFieldsBag.optional(),
      custom_fields: customFieldsBag.optional(),
    })
    .passthrough(),
  message: z.object({
    messageId: z.union([z.string(), z.number()]).transform(String).optional(),
    type: z.string().default("text"),
    text: z.string().optional(),
    timestamp: z.union([z.string(), z.number()]).optional(),
    // For outgoing messages, identifies who sent the reply. We accept several
    // shapes Respond.io has been observed to use.
    direction: z.enum(["incoming", "outgoing"]).optional(),
    sentBy: z
      .object({
        id: z.union([z.string(), z.number()]).transform(String).optional(),
        type: sentByTypeSchema.optional(),
        name: z.string().optional(),
      })
      .passthrough()
      .optional(),
    sender: z
      .object({
        id: z.union([z.string(), z.number()]).transform(String).optional(),
        type: sentByTypeSchema.optional(),
        name: z.string().optional(),
      })
      .passthrough()
      .optional(),
  }),
  conversation: z
    .object({
      id: z.union([z.string(), z.number()]).transform(String),
      assignee: z.string().optional(),
    })
    .optional(),
});

export type RespondIoIncomingMessage = z.infer<typeof respondIoIncomingMessageSchema>;

/**
 * Read the canonical Branch value from any of the known custom-field paths.
 * Returns null when the field is missing or empty (which during the pilot
 * means "not Gili Trawangan, leave to humans").
 */
export function readBranchField(
  contact: RespondIoIncomingMessage["contact"],
): string | null {
  const candidates = [contact.customFields, contact.fields, contact.custom_fields];
  for (const bag of candidates) {
    if (!bag) continue;
    // Field names we honor (capitalization varies in real payloads).
    for (const key of ["Branch", "branch", "BRANCH"]) {
      const v = bag[key];
      if (typeof v === "string" && v.trim().length > 0) return v.trim();
    }
  }
  return null;
}

export type WebhookDispatch =
  | { kind: "client_inbound" }
  | { kind: "agent_outbound"; agentName: string | null }
  | { kind: "bot_outbound" }
  | { kind: "ignored"; reason: "non_text" };

/**
 * Decide whether a payload is a client message (run AI), a human-agent reply
 * (run espía capture), or a bot/system echo (drop — we already wrote it
 * ourselves). Centralized so the route layer and the regression harness see
 * the same dispatch logic.
 */
export function classifyWebhook(payload: RespondIoIncomingMessage): WebhookDispatch {
  const text = (payload.message.text ?? "").trim();
  if (!text) return { kind: "ignored", reason: "non_text" };

  const direction = payload.direction ?? payload.message.direction ?? "incoming";
  const sentBy = payload.message.sentBy ?? payload.message.sender ?? null;
  const senderType = sentBy?.type ?? null;

  if (direction === "outgoing") {
    if (senderType === "agent" || senderType === "user") {
      return { kind: "agent_outbound", agentName: sentBy?.name ?? null };
    }
    // Default outgoing → assume bot/system. We never want to re-process our
    // own replies as human traffic.
    return { kind: "bot_outbound" };
  }

  return { kind: "client_inbound" };
}

// ── Anthropic prompt block descriptors ──────────────────────────────────────
// We model the 4-block structure from guide §7 explicitly so the prompt
// builder is unit-testable and the cache_control invariants (max 4 markers,
// last marker is "no cache") are encoded in types, not comments.
export type CachedTextBlock = {
  text: string;
  cache: true;
  ttl: "5m" | "1h";
};

export type FreshTextBlock = {
  text: string;
  cache: false;
};

export type PromptBlock = CachedTextBlock | FreshTextBlock;

export type FourBlockPrompt = {
  systemBase: CachedTextBlock; // Bloque 1: system + sales playbook + few-shots
  sedeKb: CachedTextBlock; // Bloque 2: per-sede knowledge base
  history: CachedTextBlock; // Bloque 3: sliding window history
  dynamic: FreshTextBlock; // Bloque 4: time + roster + incoming message
};

// ── Tool use ────────────────────────────────────────────────────────────────
export const consultarDisponibilidadInputSchema = z.object({
  sede_id: z.string().uuid(),
  curso: z.enum([
    "TryScuba",
    "OW", // Open Water
    "AOW", // Advanced Open Water
    "RescueDiver",
    "DMT", // Divemaster Trainee
    "FunDive",
    "NightDive",
    "Otro",
  ]),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date YYYY-MM-DD"),
  horario: z.enum(["AM", "PM", "Night"]).optional(),
});

export type ConsultarDisponibilidadInput = z.infer<typeof consultarDisponibilidadInputSchema>;

export type ConsultarDisponibilidadResult =
  | {
      ok: true;
      available: boolean;
      slotsRemaining: number | null;
      instructorName: string | null;
      notes: string | null;
    }
  | {
      ok: false;
      reason: "timeout" | "not_configured" | "upstream_error";
      message: string;
    };

// solicitar_deposito — invoked when the AI detects clear booking intent. The
// server generates a unique reference code (or reuses the conversation's
// existing one), marks the conversation as deposit_pending, and returns
// sede-specific payment instructions plus the reference.
//
// Currency matrix (owner-confirmed 2026-05-04): EUR/GBP/AUD/USD/IDR.
//   - 40 units of foreign currency for EUR/GBP/AUD/USD
//   - 700,000 IDR (special — only when the client has an Indonesian bank
//     account; the rupiah equivalent of 40 EUR is far higher than 40 IDR
//     would be, so the symbolic "40-unit" rule does not apply)
//   - THB is NOT used for Gili Trawangan (the only sede in the pilot lives
//     in Indonesia).
export const SUPPORTED_DEPOSIT_CURRENCIES = [
  "EUR",
  "GBP",
  "AUD",
  "USD",
  "IDR",
] as const;
export type DepositCurrency = (typeof SUPPORTED_DEPOSIT_CURRENCIES)[number];

const DEPOSIT_AMOUNTS: Record<DepositCurrency, number> = {
  EUR: 40,
  GBP: 40,
  AUD: 40,
  USD: 40,
  IDR: 700_000,
};

export function depositAmountFor(currency: DepositCurrency): number {
  return DEPOSIT_AMOUNTS[currency];
}

/** @deprecated Use depositAmountFor(currency) — kept only for legacy imports. */
export const DEPOSIT_AMOUNT = 40 as const;

export const solicitarDepositoInputSchema = z.object({
  sede_id: z.string().uuid(),
  cliente_idioma: z.string().min(2).max(10),
  moneda_cliente: z.enum(SUPPORTED_DEPOSIT_CURRENCIES),
});

export type SolicitarDepositoInput = z.infer<typeof solicitarDepositoInputSchema>;

export type SolicitarDepositoResult =
  | {
      ok: true;
      ref_code: string;
      monto: number;
      moneda: DepositCurrency;
      instrucciones: string;
      // True when this sede has an automatic gateway (Stripe) that will mark
      // the deposit paid via webhook. False means a human must confirm in the
      // panel after seeing the transfer in Wise/Revolut/bank.
      requires_human_verification: boolean;
      // True when the same code was already issued for this conversation and
      // we are returning the existing one (per owner spec — never mint twice).
      reused_existing: boolean;
    }
  | {
      ok: false;
      reason: "sede_unknown" | "currency_unsupported" | "internal_error";
      message: string;
    };

// ── Lead pipeline ───────────────────────────────────────────────────────────
// State machine for the sales pipeline view. Transitions are validated by
// the server; humans can override from the panel.
export const LEAD_STAGES = [
  "new",
  "qualified",
  "proposed",
  "deposit_pending",
  "deposit_paid",
  "handed_off",
  "closed",
  "lost",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

// Allowed forward transitions. "lost" is reachable from anywhere (negative
// intent / explicit decline). Backward moves require a human override path.
export const LEAD_STAGE_TRANSITIONS: Record<LeadStage, LeadStage[]> = {
  new: ["qualified", "proposed", "deposit_pending", "lost"],
  qualified: ["proposed", "deposit_pending", "lost"],
  proposed: ["deposit_pending", "lost"],
  deposit_pending: ["deposit_paid", "lost"],
  deposit_paid: ["handed_off", "lost"],
  handed_off: ["closed", "lost"],
  closed: [],
  lost: [],
};

export type LeadMetadata = {
  ref_code?: string;
  deposit_amount?: number;
  deposit_currency?: DepositCurrency;
  payment_instructions_snapshot?: string;
  requires_human_verification?: boolean;
  // Free-form audit trail of the last 10 transitions: { from, to, at, by }.
  history?: Array<{
    from: LeadStage;
    to: LeadStage;
    at: string; // ISO timestamp
    by: "ai" | "human" | "system" | "negative_intent";
    note?: string;
  }>;
};

// ── Roster (Apps Script response shape) ─────────────────────────────────────
export type RosterDay = {
  date: string; // YYYY-MM-DD in sede TZ
  weekday: string;
  courses: Array<{
    code: string;
    am: { capacity: number; booked: number } | null;
    pm: { capacity: number; booked: number } | null;
    night: { capacity: number; booked: number } | null;
  }>;
};

export type RosterSnapshot = {
  sedeId: string;
  generatedAt: string; // ISO
  days: RosterDay[];
};

// ── Outbound message to Respond.io ─────────────────────────────────────────
export type OutboundTextMessage = {
  conversationId: string;
  text: string;
  // True when we are inside the WhatsApp 24h free-form window. Outside it,
  // we must fall back to a Meta-approved template (guide §16 #1).
  withinFreeFormWindow: boolean;
};

// ── Cost estimate (logged per Claude call) ──────────────────────────────────
export type CostBreakdown = {
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  totalUsd: number;
  cacheHitRate: number; // 0..1, computed: cacheRead / (cacheRead + input)
};
