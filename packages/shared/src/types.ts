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
