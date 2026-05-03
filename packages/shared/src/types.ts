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
export const respondIoIncomingMessageSchema = z.object({
  event: z.string(),
  channelId: z.string().optional(),
  contact: z.object({
    id: z.union([z.string(), z.number()]).transform(String),
    phone: z.string().optional(),
    name: z.string().optional(),
    language: z.string().optional(),
    tags: z.array(z.string()).default([]),
  }),
  message: z.object({
    messageId: z.union([z.string(), z.number()]).transform(String).optional(),
    type: z.string().default("text"),
    text: z.string().optional(),
    timestamp: z.union([z.string(), z.number()]).optional(),
  }),
  conversation: z
    .object({
      id: z.union([z.string(), z.number()]).transform(String),
      assignee: z.string().optional(),
    })
    .optional(),
});

export type RespondIoIncomingMessage = z.infer<typeof respondIoIncomingMessageSchema>;

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
// server generates a unique reference code, marks the conversation as
// deposit_pending, and returns sede-specific payment instructions plus the
// reference. The AI weaves the instructions into its reply; the human team
// later matches the reference against incoming Wise / Revolut / bank
// transfers in the panel.
export const DEPOSIT_AMOUNT = 40 as const;

export const SUPPORTED_DEPOSIT_CURRENCIES = [
  "EUR",
  "USD",
  "GBP",
  "THB",
  "IDR",
] as const;
export type DepositCurrency = (typeof SUPPORTED_DEPOSIT_CURRENCIES)[number];

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
      monto: typeof DEPOSIT_AMOUNT;
      moneda: DepositCurrency;
      instrucciones: string;
      // True when this sede has an automatic gateway (Stripe) that will mark
      // the deposit paid via webhook. False means a human must confirm in the
      // panel after seeing the transfer in Wise/Revolut/bank.
      requires_human_verification: boolean;
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
