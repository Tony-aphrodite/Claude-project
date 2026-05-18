// ============================================================================
// Cross-cutting domain types. The DB schema (packages/db) is the source of
// truth for persisted entities; types here cover the request/response shapes
// flowing between Respond.io, the server, Anthropic, and the panel.
//
// Build-cache marker (2026-05-06): Railway's Docker layer cache kept reusing
// stale compilations even after content edits to this file. Bumping this
// banner whenever the schema changes meaningfully forces a fresh build.
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
      // Respond.io serializes empty optional fields as `null`, not omitted —
      // accept null/undefined and treat both as absent. Apply to every
      // optional string field on the contact + message envelopes.
      phone: z.string().nullish().transform((v) => v ?? undefined),
      name: z.string().nullish().transform((v) => v ?? undefined),
      language: z.string().nullish().transform((v) => v ?? undefined),
      tags: z.array(z.string()).nullish().transform((v) => v ?? []),
      customFields: customFieldsBag.nullish().transform((v) => v ?? undefined),
      fields: customFieldsBag.nullish().transform((v) => v ?? undefined),
      custom_fields: customFieldsBag.nullish().transform((v) => v ?? undefined),
    })
    .passthrough(),
  message: z.object({
    messageId: z
      .union([z.string(), z.number()])
      .transform(String)
      .nullish()
      .transform((v) => v ?? undefined),
    type: z.string().nullish().transform((v) => v ?? "text"),
    text: z.string().nullish().transform((v) => v ?? undefined),
    timestamp: z
      .union([z.string(), z.number()])
      .nullish()
      .transform((v) => v ?? undefined),
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
    /**
     * Attachments forwarded by Respond.io for image / document / voice
     * messages. Shape varies by Meta channel + Respond.io version, so we
     * accept several common forms via passthrough and normalize at use
     * site (see services/respond-io-attachment.ts). The fields we look
     * for are `url` (or `link`) and `mimeType` (or `mime_type` / `type`).
     */
    attachments: z
      .array(z.object({}).passthrough())
      .nullish()
      .transform((v) => v ?? []),
    // Some Respond.io payloads bubble a single attachment up to the
    // message itself rather than nesting under `attachments`. We capture
    // both spellings and the helper picks whichever is non-empty.
    attachment: z.object({}).passthrough().nullish().transform((v) => v ?? undefined),
    // Meta Click-to-WhatsApp ad referral data, attached to the FIRST
    // inbound message when a contact reaches the business via a CTWA ad.
    // Miguel's email 2026-05-11 — to be consumed by the lead-source
    // attribution flow (see memory `project_lead_source_attribution.md`).
    // Captured here as passthrough so the shape we get from Meta /
    // Respond.io survives unchanged for the consumer; we don't act on it
    // yet (impl deferred until GT pilot stabilizes).
    referral: z.object({}).passthrough().nullish().transform((v) => v ?? undefined),
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
 * Normalize a real Respond.io v2 webhook payload into the shape our zod
 * schema + downstream code expects.
 *
 * The actual v2 envelope (observed 2026-05-10 via Developer Webhook on
 * workspace 216239 / channel 274637) differs from earlier docs in several
 * material ways. Mappings:
 *
 *   v2 key                              →  our normalized key
 *   ──────────────────────────────────────────────────────────────────────
 *   event_type                          →  event
 *   message.traffic ("incoming"/"out…") →  direction (top-level)
 *   message.message.{type,text,attach…} →  message.{type,text,attachment}
 *   sender.source ("contact"/"bot"/…)   →  message.sentBy.type
 *   contact.firstName + lastName        →  contact.name
 *   channel.id                          →  channelId (top-level, additive)
 *   message.messageId / channelMessageId→  message.messageId
 *   message.timestamp                   →  message.timestamp
 *
 * Tags + customFields are NOT in the v2 webhook payload; they must be
 * fetched via the Respond.io REST API at the call site (see
 * respondIoClient.getContact). We leave `contact.tags` as `[]` and
 * `customFields` as undefined here so the downstream pilot-gate +
 * Branch-reader can decide whether to fetch.
 *
 * Backwards-compat: if the payload already matches the legacy shape (has
 * `event` not `event_type`, text at `message.text`, etc.), we return it
 * untouched so existing fixtures and the regression harness keep working.
 */
export function normalizeRespondIoPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const r = raw as Record<string, unknown>;

  // Already legacy-shaped: has top-level `event` AND message.text at
  // single-nesting depth. Leave untouched.
  const looksLegacy =
    typeof r.event === "string" ||
    (typeof r.message === "object" &&
      r.message !== null &&
      typeof (r.message as Record<string, unknown>).text === "string");
  if (looksLegacy && r.event_type === undefined) {
    return raw;
  }

  const v2Message = (r.message ?? {}) as Record<string, unknown>;
  const inner = (v2Message.message ?? {}) as Record<string, unknown>;
  const v2Contact = (r.contact ?? {}) as Record<string, unknown>;
  const v2Channel = (r.channel ?? {}) as Record<string, unknown>;
  const v2Sender = (r.sender ?? {}) as Record<string, unknown>;

  // Direction: v2 uses message.traffic with "incoming" / "outgoing". Map
  // to our top-level `direction`. Default "incoming" when absent so the
  // legacy AI-handler bias is preserved.
  const traffic =
    typeof v2Message.traffic === "string"
      ? v2Message.traffic
      : typeof r.direction === "string"
        ? (r.direction as string)
        : "incoming";

  // Sender mapping: sender.source values we've seen are "contact" (real
  // customer), "bot" (Respond.io workflow / our own AI echo), "user" /
  // "agent" (human teammate). Our existing classifyWebhook treats these
  // as message.sentBy.type, so mirror them there.
  const senderSource =
    typeof v2Sender.source === "string" ? v2Sender.source : null;
  const senderType =
    senderSource === "contact" ||
    senderSource === "bot" ||
    senderSource === "agent" ||
    senderSource === "user" ||
    senderSource === "system"
      ? senderSource
      : undefined;

  // Compose contact.name from firstName + lastName when present. Empty
  // strings are stripped so zod's optional+nullish pipeline accepts it.
  const firstName =
    typeof v2Contact.firstName === "string" ? v2Contact.firstName : "";
  const lastName =
    typeof v2Contact.lastName === "string" ? v2Contact.lastName : "";
  const composedName = `${firstName} ${lastName}`.trim();

  // Build the normalized envelope. Pass through any extra keys the v2
  // payload carried so debugging logs stay informative.
  const normalized: Record<string, unknown> = {
    ...r,
    event: typeof r.event === "string" ? r.event : r.event_type,
    direction: traffic === "outgoing" ? "outgoing" : "incoming",
    channelId:
      typeof v2Channel.id === "string" || typeof v2Channel.id === "number"
        ? String(v2Channel.id)
        : (r.channelId as string | undefined),
    contact: {
      ...v2Contact,
      // v2 keeps `id` as number; our zod schema accepts string|number and
      // transforms — pass through.
      id: v2Contact.id,
      phone: v2Contact.phone ?? null,
      name: composedName.length > 0 ? composedName : (v2Contact.name ?? null),
      language: v2Contact.language ?? null,
      // Tags / customFields are NOT in the v2 payload — leave empty so
      // the pilot gate can decide to fetch via getContact API.
      tags: Array.isArray(v2Contact.tags) ? v2Contact.tags : [],
      customFields: v2Contact.customFields ?? null,
    },
    message: {
      messageId:
        v2Message.channelMessageId ?? v2Message.messageId ?? null,
      type: typeof inner.type === "string" ? inner.type : "text",
      text: typeof inner.text === "string" ? inner.text : null,
      timestamp: v2Message.timestamp ?? null,
      direction: traffic === "outgoing" ? "outgoing" : "incoming",
      sentBy: senderType
        ? {
            type: senderType,
            // v2 nulls collapse to undefined so zod's string|number union
            // doesn't blow up. We also accept teamId as a fallback id.
            id:
              typeof v2Sender.userId === "string" || typeof v2Sender.userId === "number"
                ? v2Sender.userId
                : typeof v2Sender.teamId === "string" ||
                    typeof v2Sender.teamId === "number"
                  ? v2Sender.teamId
                  : undefined,
            name: undefined,
          }
        : undefined,
      // Single-attachment shape: v2 nests under message.message.attachment.
      attachment:
        typeof inner.attachment === "object" && inner.attachment !== null
          ? inner.attachment
          : undefined,
      attachments: Array.isArray(inner.attachments) ? inner.attachments : [],
    },
    conversation: r.conversation,
  };
  return normalized;
}

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
  // Attachment-only messages (PDF payment receipts, photos, voice notes)
  // carry no text but MUST still reach processIncomingMessage so the OCR /
  // attachment branch can fire. We only ignore when there's nothing at
  // all — neither text nor any attachment shape.
  const hasAttachment =
    !!payload.message.attachment ||
    (Array.isArray(payload.message.attachments) && payload.message.attachments.length > 0);
  if (!text && !hasAttachment) return { kind: "ignored", reason: "non_text" };

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
//
// consultar_disponibilidad — operates on Miguel's program-aware schedule.
// The AI passes a program + start_date and the server expands which
// (date, slot) pairs need actual boat capacity, then queries the Apps
// Script and applies time-of-day bookability rules per `Lógica horaria`.
//
// Programs without a defined boat schedule (e.g. RescueDiver, DMT) fall
// back to `reason: "program_not_scheduled"` so the AI can route to a
// human instead of fabricating availability.

export const AVAILABILITY_PROGRAMS = [
  "TryScuba",
  "ScubaDiver", // 1-day cert, NOT the same as TryScuba
  "OW", // Open Water 18m — 3 days
  "OW30", // Open Water 30 (premium) — 3 days, 6 dives
  "AOW", // Advanced Adventurer — 2 days, 5 dives
  "Refresh", // Refresh + 2 fun dives — same day
  "RefreshAdv", // Refresh + Advanced combo — 2 days
  "FunDive", // single fun dive (2 dives) — client picks AM or PM
  "DeepAdvFD", // Deep Adventure + Fun Dive — client picks AM or PM
  "DeepSpecialty", // 40m Deep Specialty — derives to human for full schedule
  "RescueDiver", // GT-specific Rescue program — derives to human
  "NitroxSpecialty", // Nitrox specialty — derives to human
  "ReactRight", // Emergency First Response (theory only, no boat)
] as const;
export type AvailabilityProgram = (typeof AVAILABILITY_PROGRAMS)[number];

export const SLOT_KEYS = ["AM", "PM"] as const;
export type SlotKey = (typeof SLOT_KEYS)[number];

export const consultarDisponibilidadInputSchema = z.object({
  sede_id: z.string().uuid(),
  programa: z.enum(AVAILABILITY_PROGRAMS),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date YYYY-MM-DD"),
  // Number of divers on this booking. Required so the server can stamp
  // `pax` into lead_metadata and Respond.io custom fields, and so OCR
  // can validate the deposit against `pax × per-person amount` instead
  // of the per-person amount alone (2026-05-12 fraud-risk fix).
  pax: z.number().int().min(1).max(20),
  // Only meaningful for FunDive / DeepAdvFD where the client picks AM or PM.
  // Ignored for fixed-schedule programs.
  fundive_slot: z.enum(SLOT_KEYS).optional(),
});

export type ConsultarDisponibilidadInput = z.infer<typeof consultarDisponibilidadInputSchema>;

/** Per-slot verdict the server returns to the AI for each required slot. */
export type SlotVerdict = {
  date: string; // YYYY-MM-DD
  slot: SlotKey;
  available: boolean;
  espacios: number; // remaining seats
  /**
   * Why a slot is NOT available — only set when available=false.
   *   • full          — boat is full
   *   • past_today    — same-day boat already departed (cutoff WITA)
   *   • missing_data  — Apps Script didn't return that date
   *   • closure_day   — sede closed (Dec 25 / Jan 1, DPM_AI_LAUNCH §9)
   */
  reason?: "full" | "past_today" | "missing_data" | "closure_day";
};

export type ConsultarDisponibilidadResult =
  | {
      ok: true;
      programa: AvailabilityProgram;
      startDate: string;
      /**
       * Sede-local "now" used for today's cutoff decisions. Optional —
       * sedes whose Apps Script does not return the field (Nusa Penida,
       * Koh Tao, Koh Phi Phi as of 2026-05-06) leave this undefined and
       * the bookable-slots logic falls back to a conservative "PM only"
       * for same-day requests.
       */
      horaActualWita?: string;
      available: boolean; // true iff every required slot is available
      slots: SlotVerdict[];
      /**
       * Pre-filtered view of `slots` containing ONLY the entries with
       * `available=false`. The AI MUST quote these dates/slots literally
       * when explaining unavailability — direct filtering avoids the
       * 2026-05-11 incident where Claude misattributed which day was
       * full (cited Day 2 / 15-May when the actual conflict was Day 3 /
       * 16-May AM). Omitted when `available=true`.
       */
      failingSlots?: SlotVerdict[];
      /** Suggested earlier/later start_date when current is blocked. */
      alternativeStartDate?: string;
      /** Free-form note for the model to surface (e.g. "AM ya zarpó"). */
      notes?: string;
    }
  | {
      ok: false;
      reason:
        | "timeout"
        | "not_configured"
        | "upstream_error"
        | "program_not_scheduled";
      message: string;
    };

// ── Apps Script availability response (Miguel's schema, 2026-05-06) ─────────

export type AvailabilitySlot = {
  disponible: boolean;
  espacios: number;
  capacidad: number;
};

export type AvailabilityDay = {
  fecha: string; // YYYY-MM-DD
  disponible: boolean;
  turno_manana: AvailabilitySlot;
  turno_tarde: AvailabilitySlot;
  /**
   * Some sedes don't operate night dives (Nusa Penida) — their Apps Script
   * omits this field entirely. Treat as "no nocturno operation" rather than
   * malformed.
   */
  turno_nocturno?: AvailabilitySlot;
};

export type AvailabilityResponse = {
  /**
   * "HH:mm" 24h in the sede's local time. Field is named `wita` for legacy
   * reasons (the first sede live was Gili Trawangan in WITA). Other sedes
   * may omit it or return a different timezone; consumers should treat
   * absence as "no time-of-day cutoff data — be conservative".
   */
  hora_actual_wita?: string;
  fecha_consultada: string;
  disponible: boolean;
  primer_dia_disponible: string;
  resumen: string;
  detalle: AvailabilityDay[];
  /**
   * Multi-day course window chosen by the Apps Script (KT v2+ only).
   * Present when `curso` was a multi-day course (OW/OW30/Rescue=3 days,
   * Advanced=2 days) and the script found a valid consecutive block.
   * Older scripts and single-day courses omit this field.
   *
   * Server consumers (process-message.ts) ignore this for now and stick
   * with the per-slot verdict in `detalle`. Kept on the type so a
   * future feature (surfacing the window in the AI's response text) can
   * read it without another schema change.
   */
  ventana?: { fecha_inicio: string; fecha_fin: string };
};

// enviar_catalogo — invoked when the AI decides to send the customer a
// native WhatsApp Business product card for a specific program. The visual
// card is loaded from Respond.io's catalog (Meta-approved) and dramatically
// boosts conversion vs plain text. Use BEFORE giving a long text answer
// about a program; the prompt instructs the model to follow the card with a
// short contextual line ("éste es el indicado para tu caso, te paso el
// detalle 👆"), not to repeat the same data the card already contains.
//
// programa is the canonical product key the server resolves to a sede-
// specific Respond.io content/template ID via catalog-registry. If the
// registry has no mapping for (sede, programa), the handler returns
// reason="not_configured" and the AI degrades gracefully to text.
export const CATALOG_PROGRAMS = [
  "TryScuba",
  "OW", // Open Water
  "OW30", // Open Water 30 (3-day intensive)
  "AOW", // Advanced Open Water
  "Refresh",
  "FunDive",
  "RescueDiver",
  "DMT", // Divemaster Trainee
] as const;
export type CatalogProgram = (typeof CATALOG_PROGRAMS)[number];

export const enviarCatalogoInputSchema = z.object({
  sede_id: z.string().uuid(),
  programa: z.enum(CATALOG_PROGRAMS),
});

export type EnviarCatalogoInput = z.infer<typeof enviarCatalogoInputSchema>;

export type EnviarCatalogoResult =
  | {
      ok: true;
      sent: true;
      programa: CatalogProgram;
      // Identifier the registry mapped to (returned for audit so the panel
      // can show which catalog entry was sent).
      catalogRef: string;
    }
  | {
      ok: false;
      reason: "not_configured" | "send_failed" | "sede_unknown";
      message: string;
      programa?: CatalogProgram;
    };

// ─── send_product_card (Colomba / Gili Air) ──────────────────────────────
//
// Distinct from enviar_catalogo (John/GT): Colomba addresses Meta WhatsApp
// Business catalog products by their RAW product retailer id (e.g.
// "eb8phdq04n") and may send up to TWO cards in a single turn for
// side-by-side comparisons. Spec: 15-information/SPEC_send_product_card.md
// v1.1. The server enforces an allowlist (ALLOWED_PRODUCT_IDS_GA) so a
// hallucinated id never reaches Meta.
export const sendProductCardInputSchema = z.object({
  sede_id: z.string().uuid(),
  // Accept either a single string or a 1-2 element array. The server
  // normalises to an array internally before allowlist + per-id validation.
  card_id: z.union([
    z.string().min(1),
    z.array(z.string().min(1)).min(1).max(2),
  ]),
});
export type SendProductCardInput = z.infer<typeof sendProductCardInputSchema>;

export type SendProductCardResult =
  | {
      ok: true;
      sent: string[]; // ids actually delivered (in order)
    }
  | {
      ok: false;
      reason:
        | "not_in_allowlist"
        | "too_many_cards"
        | "send_failed"
        | "sede_unknown"
        | "channel_not_supported";
      message: string;
      rejected?: string[]; // ids that failed validation, when applicable
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
  // Number of divers on this booking. The server stamps this into
  // lead_metadata so the OCR auto-confirm step can validate the deposit
  // against `pax × per-person amount` (added 2026-05-12 after Miguel
  // demonstrated that the Bertrand-Klein 40 EUR PDF auto-validated a
  // 2-pax booking that should have required 80 EUR).
  pax: z.number().int().min(1).max(20),
});

export type SolicitarDepositoInput = z.infer<typeof solicitarDepositoInputSchema>;

export type SolicitarDepositoResult =
  | {
      ok: true;
      ref_code: string;
      /** Per-person amount (e.g. 40 EUR). */
      monto: number;
      /** Total the customer should transfer = monto × pax. */
      monto_total: number;
      pax: number;
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
  /** Per-person deposit amount (e.g. 40 EUR). */
  deposit_amount?: number;
  /**
   * Total amount the customer should transfer = pax × deposit_amount.
   * This is the value OCR validates against — comparing PDF amount to
   * per-person would let a multi-pax booking auto-confirm on a 1-pax PDF
   * (incident 2026-05-12: Bertrand Klein 40 EUR PDF auto-validated a
   * 2-pax 80 EUR booking).
   */
  deposit_amount_total?: number;
  /** Number of divers on this booking. Captured from solicitar_deposito. */
  pax?: number;
  deposit_currency?: DepositCurrency;
  payment_instructions_snapshot?: string;
  requires_human_verification?: boolean;
  /**
   * Booking detail captured the last time the AI committed to a specific
   * (program, start_date) via consultar_disponibilidad. Used by the panel
   * deposit-confirmation handoff to fill [PROGRAMA] / [FECHA] in the spec
   * message (INSTRUCCIONES_PAGO §7 mensaje-deposito-confirmado). Optional —
   * the panel falls back to a shorter message when these are missing.
   */
  programa?: string;
  start_date?: string;
  /**
   * Latest OCR verdict from comprobante-comprobante.ts (INSTRUCCIONES_PAGO
   * §5). Surfaces in the panel's payments page so the operator can see at a
   * glance what the AI extracted before clicking Confirm.
   */
  ocr_result?: {
    at: string; // ISO timestamp
    ok: boolean;
    validated?: boolean;
    mismatches?: string[];
    extraction?: {
      amount: number | null;
      currency: string | null;
      beneficiary: string | null;
      refCode: string | null;
      date: string | null;
    };
    reason?: string;
    attachmentMime?: string | null;
  };
  // Free-form audit trail of the last 10 transitions: { from, to, at, by }.
  history?: Array<{
    from: LeadStage;
    to: LeadStage;
    at: string; // ISO timestamp
    by: "ai" | "human" | "system" | "negative_intent";
    note?: string;
  }>;
};

// Roster types removed 2026-05-06 — Miguel's actual Apps Script returns a
// per-slot (AM/PM/Night) shape rather than per-course. The new shape is
// `AvailabilityResponse` defined above. Use that.

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
