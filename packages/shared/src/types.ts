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

/**
 * Customer-pickable dive slots. Used for `fundive_slot` in the AI tool
 * input (Fun Dive customers can pick AM or PM). Excludes Nocturno
 * (operator-decided) and Confinadas (pool training; never customer-pickable).
 */
export const SLOT_KEYS = ["AM", "PM"] as const;
export type SlotKey = (typeof SLOT_KEYS)[number];

/**
 * Roster slot buckets — the full set of "where each program-day consumes
 * capacity". Includes:
 *   - "AM" / "PM" / "Nocturno": boat departures
 *   - "Confinadas": pool / confined-water training (no boat, but takes
 *     instructor capacity). Added Miguel rule 2026-06-07 — before this,
 *     pool days were INVISIBLE in the roster which caused overbooking risk
 *     ("no se descontaban espacio" / "sin excusas").
 *
 * Distinct from SlotKey because the AI's `fundive_slot` input must NOT
 * include Confinadas or Nocturno (those are never customer choices for
 * fun dives). Program schedules and roster reservations use TurnoKey;
 * AI tool input uses SlotKey.
 */
// "Confinadas" kept for backwards compat with pre-split data, but new
// flows use ConfinadasAM/PM (Miguel 2026-06-07 PM split). The validator
// treats a "Confinadas" requirement as "pick AM session preferred, fall
// back to PM if AM is full".
export const TURNO_KEYS = [
  "AM",
  "PM",
  "Nocturno",
  "ConfinadasAM",
  "ConfinadasPM",
  "Confinadas", // deprecated alias
] as const;
export type TurnoKey = (typeof TURNO_KEYS)[number];

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

/** Per-slot verdict the server returns to the AI for each required slot.
 *  Uses TurnoKey (not SlotKey) so a confined-water requirement of a
 *  program shows up explicitly when the AI asks for availability — Miguel
 *  rule 2026-06-07: "el roster no debe tener nada implícito". */
export type SlotVerdict = {
  date: string; // YYYY-MM-DD
  slot: TurnoKey;
  available: boolean;
  espacios: number; // remaining seats
  /**
   * The pax count the validator compared against `espacios`. Echoed back
   * verbatim so the AI's reply can quote the exact comparison ("para 4
   * pax pero quedan 2") without re-deriving it from input.
   *
   * Added 2026-06-10 (Miguel "partial-occupancy overbook" feedback): when
   * a slot was at 20/22 and the group of 4 confirmed, the AI's mental
   * math failed silently. Echoing the comparison numbers makes the gap
   * unmissable. Always present on validator-emitted verdicts; legacy
   * call sites that built SlotVerdict by hand may leave it undefined.
   */
  paxRequested?: number;
  /**
   * `paxRequested - espacios` when the slot fails because of capacity
   * shortage. Always undefined when `available=true`. Lets the AI say
   * "faltan 2 lugares para este día" without doing arithmetic. Miguel
   * 2026-06-10: "lo más robusto sería que la tool reciba la cantidad de
   * pax y devuelva, por día/turno, los lugares que quedan + si el grupo
   * entra (sí / no / faltan N)".
   */
  shortBy?: number;
  /**
   * Why a slot is NOT available — only set when available=false.
   *   • full          — boat is full (espacios=0 OR espacios < paxRequested)
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
      /** Suggested earlier/later start_date when current is blocked.
       * Legacy field — sourced from the Apps Script's `primer_dia_disponible`.
       * For the verified-by-our-server alternatives (Miguel rule 2026-06-05),
       * use `verifiedAlternativeStartDates` instead. */
      alternativeStartDate?: string;
      /**
       * Server-verified list of start dates that the AI MAY propose as
       * alternatives when the requested start_date fails. Each date in this
       * array has passed the same all-required-slots check as the primary
       * `available` verdict — meaning if the AI proposes any of these, the
       * subsequent `solicitar_deposito` call WILL clear the same validation
       * (modulo races between the consult and the booking, which are caught
       * server-side by the solicitar_deposito guard).
       *
       * Empty array = no viable alternative within the scan window.
       * Miguel rule 2026-06-05 (incident: OW June 22→23 hallucination):
       * the AI is PROHIBITED from proposing any start_date not in this list.
       */
      verifiedAlternativeStartDates?: string[];
      /**
       * How many days the v2 Apps Script auto-shifted forward to find a
       * fit. `0` (or omitted) = no shift, the requested date worked.
       * `>0` = the AI should say "el día que pediste no entraba, pero N
       * días después sí". Surfaced from Miguel's v2 .gs `offset_dias`.
       */
      offsetDias?: number;
      /**
       * Out-of-scope handoff. Set when the .gs detected the course is
       * not bookable through availability (Divemaster / Instructor at
       * any sede). When present the AI MUST NOT confirm or quote — it
       * must follow the prompt's escalation path for that sede:
       *   • `capturar_numero_y_derivar` (KT/NP/PP/GA) → ask the
       *     customer for their phone, give `oficinaTel`, escalate.
       *   • `derivar_a_sede` (GT only) → redirect to the named sede
       *     (always "Gili Air" in current data).
       * `proximamente: true` flags Instructor as "coming soon" so the
       * AI can frame it accordingly instead of treating it as "not
       * offered at all".
       */
      outOfScope?: {
        accion: "capturar_numero_y_derivar" | "derivar_a_sede";
        oficinaTel?: string;
        derivarASede?: string;
        proximamente?: boolean;
      };
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
  /**
   * Pool / confined-water slots — split into AM and PM sessions
   * (Miguel rule 2026-06-07 PM follow-up: "tiene que estar separado
   * así la AI puede armar el itinerario sin error"). Default capacity
   * is 30 per session = 60/day total. Tracked separately from boat
   * slots because pool capacity is instructor-based, not boat-seat
   * based. Apps Script doesn't populate these fields — only the
   * DB-backed roster does. When absent, slot-validator treats pool
   * as ALWAYS AVAILABLE (Miguel's stated policy: pool scheduling is
   * managed internally by the office, the AI doesn't need to verify
   * it for legacy sedes).
   */
  turno_confinadas_am?: AvailabilitySlot;
  turno_confinadas_pm?: AvailabilitySlot;
  /**
   * @deprecated Pre-split aggregate Confinadas bucket (kept for
   * backwards compat with rows persisted before the AM/PM split).
   * New code paths use turno_confinadas_am / turno_confinadas_pm.
   */
  turno_confinadas?: AvailabilitySlot;
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
   * Array of every YYYY-MM-DD in the consecutive block — Miguel's v2
   * script returns 3 entries for OW/OW30/Rescue and 2 entries for
   * Advanced. Single-day courses (TryScuba/ScubaDiver/Refresh) get a
   * 1-entry array. Older scripts omit this field entirely.
   *
   * Verified shape from a 2026-05-18 probe:
   *   `"ventana":["2026-05-21","2026-05-22","2026-05-23"]`
   *
   * Server consumers (process-message.ts) ignore this for now and stick
   * with the per-slot verdict in `detalle`. Kept on the type so future
   * code that wants to surface the window in the AI's reply can read it
   * without another schema change.
   */
  ventana?: string[];
  /**
   * KT v2 echoes back the resolved curso + pax + days_needed so callers
   * can sanity-check that the script understood the params. Optional
   * because older scripts don't return them.
   */
  curso?: string;
  pax?: number;
  dias_necesarios?: number;
  /**
   * Number of days the script had to walk forward from `fecha_consultada`
   * to find a valid window. `0` means the requested date fit; `>0` means
   * the script auto-shifted (up to 14 days). The AI can use this to say
   * "el día que pediste no entraba pero 2 días después sí". Field added
   * in Miguel's 2026-05-19 4-sede v2 rollout — see
   * information/ROSTER_SCRIPT_v2_FULL_ROLLOUT.md.
   */
  offset_dias?: number;
  /**
   * Set when the script could NOT find any window in the 14-day search
   * horizon. Each entry describes one slot that failed and why
   * (no_boat / under_pax / curso_not_allowed / past_cutoff / etc.).
   * Surfaced to the AI so it can compose a specific refusal instead of
   * a generic "no hay lugar".
   */
  failingSlots?: Array<{
    fecha: string;
    slot: "AM" | "PM" | "NOC";
    motivo: string;
    espacios?: number;
  }>;
  /**
   * Out-of-scope handoff payload from Miguel's v3/v4 .gs scripts. Set
   * when the AI invoked `consultar_disponibilidad` with a course the
   * sede doesn't sell directly (Divemaster / Instructor).
   *
   *   • KT / NP / PP / GA: `accion = "capturar_numero_y_derivar"` →
   *     AI must capture the customer's phone and forward to `oficina_tel`.
   *   • GT: `accion = "derivar_a_sede"` → AI must redirect the
   *     customer to `derivar_a_sede` (e.g. "Gili Air") because GT
   *     doesn't teach DM/Instructor at all.
   *
   * When `out_of_scope` is true, `detalle` may be absent or empty —
   * the response is a structured handoff, not an availability report.
   * `proximamente: true` signals the course is "coming soon" (currently
   * Instructor at KT/NP/PP/GA). See MIGUEL_FEEDBACK_LOG entries #1-#5
   * for the prompt-side counterpart of this rule.
   */
  out_of_scope?: boolean;
  accion?: "capturar_numero_y_derivar" | "derivar_a_sede";
  oficina_tel?: string;
  proximamente?: boolean;
  derivar_a_sede?: string;
  sede?: string;
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
  "ScubaDiver", // SSI entry-level cert (limited depth, fewer dives than OW)
  "OW", // Open Water
  "OW30", // Open Water 30 (3-day intensive)
  "AOW", // Advanced Open Water
  "Adventures", // SSI Adventure Diver (2 specialty dives, pre-AOW)
  "OWAOWCombo", // Open Water + Advanced bundled
  "OWDeepCombo", // Open Water + Deep Specialty bundled
  "DeepSpecialty",
  "NitroxSpecialty",
  "Refresh",
  "FunDive",
  "RescueDiver", // PADI / SSI Rescue Diver — keep legacy key
  "StressRescue", // SSI's branded name for the rescue course
  "ReactRight", // SSI first aid / EFR equivalent
  "DMT", // Divemaster Trainee
  // KT-only marine-biology specialties (Miguel uploaded Cloudinary cards
  // 2026-06-15 — only sede running them today; keys are sede-agnostic
  // so PP/GA can adopt them later without an enum change).
  "CoralEcology",
  "FishEcology",
  "MarineEcology",
  "BlueOceans",
  "SeaTurtleEcology",
  "SharkEcology",
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
      // 2026-06-04: dedup variant. Returned when the same `programa` was
      // already sent in this conversation (tracked in lead_metadata.
      // catalogsSent). The AI must use this signal to AVOID re-asserting
      // "te paso la info 👆" in the next reply — it should reference the
      // earlier card with text only ("ya te pasé la info del Try Scuba
      // 👆, ¿avanzamos con [fecha/deposit]?"). Prevents the 3x-same-card
      // regression observed 2026-06-04 e2e test.
      ok: true;
      sent: false;
      alreadySent: true;
      programa: CatalogProgram;
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
// Currency matrix (owner-confirmed):
//   - 40 units of foreign currency for EUR/GBP/AUD/USD (2026-05-04)
//   - 700,000 IDR (Gili sedes — Indonesian local) (2026-05-04)
//   - 1,000 THB (Phi Phi local Thai customers) (2026-06-07 — Miguel)
// THB was added when Phi Phi went live; uses the SCB account configured
// per-sede in deposit-instructions.ts.
export const SUPPORTED_DEPOSIT_CURRENCIES = [
  "EUR",
  "GBP",
  "AUD",
  "USD",
  "IDR",
  "THB",
] as const;
export type DepositCurrency = (typeof SUPPORTED_DEPOSIT_CURRENCIES)[number];

const DEPOSIT_AMOUNTS: Record<DepositCurrency, number> = {
  EUR: 40,
  GBP: 40,
  AUD: 40,
  USD: 40,
  IDR: 700_000,
  THB: 1_000,
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
  /**
   * Legacy field — list of programs across the whole booking.
   * @deprecated 2026-06-09 (Miguel rule): use `pax_programs` instead.
   * Kept temporarily so the AI's previous tool-use shape doesn't break
   * mid-conversation; new code paths should always pass `pax_programs`.
   */
  programas: z.array(z.string()).min(1).max(10).optional(),
  /**
   * Per-person program assignment (Miguel rule 2026-06-09).
   * Outer index = person (length must equal `pax`).
   * Inner array = programs that specific person is enrolled in.
   *
   * The server generates ONE ref code PER PERSON (length = pax codes total).
   * Each person's code is repeated across all their enrollments in the
   * master sheet — one row per (person × program).
   *
   * Examples:
   *   - "2 people, both doing OW"      → [["OW"], ["OW"]]                 → 2 codes
   *   - "1 person doing OW + AOW"      → [["OW","AOW"]]                   → 1 code
   *   - "2 people, 1 OW + 1 AOW"       → [["OW"], ["AOW"]]                → 2 codes
   *   - "3 people all doing OW + AOW"  → [["OW","AOW"]×3]                 → 3 codes
   *
   * If omitted, the server falls back to assuming each person does ALL
   * programs in `programas` (or the singular `leadMetadata.programa`).
   */
  pax_programs: z
    .array(z.array(z.string()).min(1).max(5))
    .min(1)
    .max(20)
    .optional(),
});

export type SolicitarDepositoInput = z.infer<typeof solicitarDepositoInputSchema>;

export type SolicitarDepositoResult =
  | {
      ok: true;
      /**
       * Primary ref code. The FIRST person's code, kept for backwards
       * compatibility with single-pax callers that expect a string.
       */
      ref_code: string;
      /**
       * Per-person ref codes (Miguel rule 2026-06-09 — one code per
       * person, repeated across that person's enrollments). Length
       * equals `pax`. Index N = person N+1's code. The AI MUST surface
       * ALL codes to the customer — one per line — so each pax can
       * pay individually OR pay together with all codes in the
       * transfer reference.
       */
      ref_codes_by_pax: string[];
      /**
       * @deprecated Pre-2026-06-09 multi-program mapping. Kept on the
       * response shape so downstream consumers that haven't migrated
       * yet keep compiling. New code paths should read `ref_codes_by_pax`.
       * For backwards compat: this map flattens the per-pax codes
       * across the union of programs (first pax doing that program
       * wins the code slot).
       */
      ref_codes_by_program?: Record<string, string>;
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
      reason:
        | "sede_unknown"
        | "currency_unsupported"
        | "sede_currency_not_supported" // Miguel 2026-06-16: per-sede currency matrix (e.g. NP has no USD)
        | "internal_error"
        | "booking_not_finalized" // programa / start_date never stamped by consultar_disponibilidad
        | "slot_unavailable"; // a required slot is no longer available — re-check roster
      message: string;
      /**
       * When `reason === "slot_unavailable"`, the specific (date, slot) pairs
       * that failed re-validation. The AI must surface these to the customer
       * and call `consultar_disponibilidad` again to get fresh alternatives.
       */
      failingSlots?: SlotVerdict[];
      /**
       * Verified alternative start dates the AI may propose immediately
       * without re-calling consultar_disponibilidad (Miguel rule 2026-06-05).
       * Empty array means the AI must escalate or ask the customer for
       * a different program / pax count.
       */
      verifiedAlternativeStartDates?: string[];
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
  /**
   * Primary reference code for the booking. When a multi-program booking
   * generates more than one code (Miguel rule 2026-06-06 — one code per
   * program), `ref_code` is the FIRST code generated and
   * `ref_codes_by_program` carries the full mapping. Single-program
   * bookings have `ref_code` only.
   */
  ref_code?: string;
  /**
   * Per-person ref codes (Miguel rule 2026-06-09). Length equals
   * `pax`. Each person's code is reused across all their program
   * enrollments — so person 1's code appears in every master-sheet
   * row for person 1, regardless of how many programs they booked.
   */
  ref_codes_by_pax?: string[];
  /**
   * Per-person program assignment (Miguel rule 2026-06-09). Outer
   * length equals `pax`. Inner array = the programs that specific
   * person is enrolled in. Used by sales-logger to write one row
   * per (person × program) pairing, each row carrying that person's
   * code from `ref_codes_by_pax[index]`.
   */
  pax_programs?: string[][];
  /**
   * @deprecated Pre-2026-06-09 multi-program mapping. Old conversations
   * still in flight may carry this — readers should prefer the
   * pax-based fields above when present.
   */
  ref_codes_by_program?: Record<string, string>;
  /**
   * Idempotency map for the close_sale auto-fire path (Miguel rule
   * 2026-06-06, updated 2026-06-09 to be per-(pax_idx, program)).
   * Key = `${pax_idx}:${program}`, value = ISO timestamp of when that
   * row was written to DPM_Ventas_Master. Set by the OCR-validated →
   * deposit_paid hook. A re-OCR re-runs the hook but skips any
   * (person × program) already in this map.
   */
  sale_logged_at_by_program?: Record<string, string>;
  /**
   * ISO timestamp of when the AI closed the conversation with category
   * "booked by ai" (Miguel rule 2026-06-06). Set after all close_sale
   * rows are written. Presence here means the conversation is in the
   * "AI-booked, awaiting unassign workflow" terminal state.
   */
  ai_closed_at?: string;
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
  /**
   * The boat-capacity slots this program needs, relative to `start_date`.
   * Stamped by the consultar_disponibilidad handler when it commits to a
   * specific (programa, start_date) so the deposit-OCR-success path can
   * write the corresponding roster_bookings rows without re-deriving from
   * the program schedule. dayOffset 0 = start_date, 1 = next day, …
   *
   * Added 2026-06-04 (Phase 2 roster) — see services/roster-db.ts.
   */
  required_slots?: Array<{ dayOffset: number; slot: TurnoKey }>;
  /**
   * UUIDs of the roster_bookings rows inserted by the OCR-validation path.
   * Used as an idempotency key: if this array is non-empty, the OCR hook
   * has already written bookings for this conversation and re-runs become
   * no-ops. (Re-OCR happens on legitimate operator re-validation flows and
   * we don't want duplicate roster rows consuming double capacity.)
   *
   * Added 2026-06-04 (Phase 2 roster).
   */
  roster_booking_ids?: string[];
  /**
   * Set true when a human operator manually claims the conversation in
   * Respond.io (POST /conversation/assignee fires the
   * `conversation.assignee.changed` webhook). Once set, the AI must stay
   * silent for the rest of the conversation lifecycle — including bypassing
   * the `isNewTopicAfterHandoff` heuristic that normally re-engages on
   * fresh-inquiry-shaped messages after a post-handoff stage. Miguel's
   * explicit rule (2026-06-05): "si un agente humano hace take over, no
   * volver a interferir."
   *
   * Cleared only when an operator unassigns (assignee = null) OR reassigns
   * back to the AI bot user — that signals "give it back to the AI". The
   * lead_stage rollback already handled by lifecycle/tag events continues
   * to govern stage transitions; this flag is the silence master switch.
   */
  human_took_over?: boolean;
  /** ISO timestamp of the most recent human takeover, for diagnostics. */
  human_took_over_at?: string;
  /**
   * Meta CTWA (Click-to-WhatsApp) ad attribution captured at contact
   * creation time when the lead-source-attribution path is active. Read
   * by the sales-logger to populate `marketing_source` / `marketing_campaign`
   * / `gclid` in the master sheet. See `project_lead_source_attribution`
   * memory — capture is deferred; the field is typed here so the eventual
   * implementation has a contract to write to.
   */
  lead_source_attribution?: {
    source?: string; // e.g. "fb_ads", "web", "google_ads"
    campaign?: string; // human-readable campaign name
    gclid?: string; // Google click id
  };
  /** Respond.io userId of the human who claimed it, for diagnostics. */
  human_took_over_by?: string;
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
