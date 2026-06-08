// ============================================================================
// Mappings + helpers used to build the sales-logger payload (Miguel spec
// 2026-06-07). Lives in its own file so the test suite can pin each
// mapping independently and so adding a new sede / program is a
// one-table edit, not a search-and-replace across handlers.
// ============================================================================

import type { LeadMetadata } from "@dpm/shared";

/**
 * Sede name → AI agent name as registered in Miguel's Config tab of the
 * DPM_Ventas_Master sheet. The `agente_cierre` field MUST match this
 * exactly (capitalization, spacing) or Miguel's reporting can't filter
 * AI vs human rows.
 *
 * Phi Phi is the only confirmed name today (Miguel 2026-06-07). Other
 * sedes' AI personas need to be confirmed before they go to production.
 */
export const SEDE_AI_AGENTE_CIERRE: Record<string, string> = {
  "Koh Phi Phi": "Francisco Emilio",
  // Pending Miguel: Koh Tao, Gili Trawangan, Gili Air, Nusa Penida.
};

/**
 * Resolve the agente_cierre name for a sede. Returns empty string when
 * the sede has no AI persona registered yet — the row still gets logged
 * but is indistinguishable from manual rows. Caller should warn so
 * Miguel can register the persona.
 */
export function agenteCierreFor(sedeNombre: string): string {
  return SEDE_AI_AGENTE_CIERRE[sedeNombre] ?? "";
}

/**
 * Map our internal `CatalogProgram` enum value to the display name in
 * Miguel's per-sede tarifario. Required because his revenue calculator
 * does an EXACT string match against the tarifario — "OW" returns 0,
 * "OW 18" returns the configured price.
 *
 * Per-sede because different sedes use different display names. Mapping
 * is partial — incomplete entries return null and the caller surfaces a
 * warning so the operator logs that program manually.
 *
 * Phi Phi entries below come from Miguel's official Phi Phi tarifario
 * (2026-06-07). See `information/17-information-phi-phi/2026-06-07-tarifario-phi-phi.md`
 * for the full list including prices + gaps analysis.
 */
export const PROGRAMA_DISPLAY_NAME: Record<string, Record<string, string>> = {
  "Koh Phi Phi": {
    // ALL entries below from Miguel's tarifario 2026-06-07. DO NOT
    // edit casing / spacing / punctuation — his revenue calc compares
    // verbatim. Any future change must come from Miguel directly.
    TryScuba: "DSD / Try Scuba", // 3,600 THB
    ScubaDiver: "Scuba Diver", // 8,500 THB
    OW: "OW 18", // 12,900 THB
    OW30: "OW 30", // 18,900 THB
    AOW: "Advanced (AOW)", // 10,400 THB
    FunDive: "Fun Dive", // 2,700 THB
    Refresh: "Refresh", // 3,400 THB
    DeepAdvFD: "Deep Adventure + Fun Dive", // 3,700 THB
    ReactRight: "React Right", // 4,500 THB
    RescueDiver: "Rescue", // 12,500 THB
    NitroxSpecialty: "Nitrox Specialty", // 9,000 THB
    // DeepSpecialty has two variants in Miguel's tarifario depending on
    // the customer's existing certification:
    //   "Deep Specialty (OW cert)"        — 8,900 THB
    //   "Deep Specialty (Advanced cert)"  — 7,900 THB
    // Our enum has a single `DeepSpecialty` value — default to the
    // OW-cert variant (more common case). When the AI knows the
    // customer is Advanced-certified, future work would route to the
    // other variant via a new enum value or context flag.
    DeepSpecialty: "Deep Specialty (OW cert)",
    // Programs in our enum without a tarifario line (see the tarifario
    // memo for the gap analysis): RefreshAdv, Adventures, OWAOWCombo,
    // OWDeepCombo, StressRescue, DMT. These will SKIP the row with a
    // warning until Miguel adds them.
  },
  // Other sedes' mappings deferred until those sedes activate.
};

/**
 * Resolve the program display name for a sede. Returns null when the
 * mapping is missing — caller should NOT post a row with a mismatched
 * `programa` field (Miguel's revenue calculator would silently drop it
 * to zero); instead surface a warning so Miguel can confirm the name.
 */
export function programaDisplayName(
  sedeNombre: string,
  programaKey: string,
): string | null {
  return PROGRAMA_DISPLAY_NAME[sedeNombre]?.[programaKey] ?? null;
}

/**
 * Format a Date as "YYYY-MM-DD HH:MM:SS" in the sede's local timezone.
 * Miguel's spec is explicit that this is NOT ISO 8601 — no `T`
 * separator, no timezone suffix, plain local clock.
 *
 * Sede timezone resolution mirrors `solicitar-deposito.ts`. Falls back
 * to Asia/Makassar (Gili-side default) on unknown sede.
 */
const SEDE_TZ: Record<string, string> = {
  "Koh Phi Phi": "Asia/Bangkok",
  "Koh Tao": "Asia/Bangkok",
  "Gili Trawangan": "Asia/Makassar",
  "Gili Air": "Asia/Makassar",
  "Nusa Penida": "Asia/Makassar",
};

export function formatSaleTimestamp(
  sedeNombre: string,
  at: Date = new Date(),
): string {
  const tz = SEDE_TZ[sedeNombre] ?? "Asia/Makassar";
  // en-CA gives YYYY-MM-DD natively + 24h hourCycle.
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(at);
  // en-GB occasionally returns "24:00:00" at midnight; normalise.
  const normalisedTime = time.startsWith("24:") ? "00:" + time.slice(3) : time;
  return `${date} ${normalisedTime}`;
}

/**
 * Split a contact's full name into firstName + lastName.
 * Conservative heuristic: split on the LAST space — multi-word first
 * names (e.g. "Maria Jose") stay together, multi-word last names get
 * truncated to the final token. Most international names are well
 * served by this; the rare "John Smith Jr" type drops "Jr" into
 * lastName.
 *
 * Empty / whitespace input returns empty strings (both fields are
 * optional in the Apps Script).
 */
export function splitContactName(
  fullName: string | null | undefined,
): { firstName: string; lastName: string } {
  if (!fullName) return { firstName: "", lastName: "" };
  const trimmed = fullName.trim().replace(/\s+/g, " ");
  if (!trimmed) return { firstName: "", lastName: "" };
  const lastSpace = trimmed.lastIndexOf(" ");
  if (lastSpace === -1) {
    return { firstName: trimmed, lastName: "" };
  }
  return {
    firstName: trimmed.slice(0, lastSpace),
    lastName: trimmed.slice(lastSpace + 1),
  };
}

/**
 * Pull marketing attribution fields off `LeadMetadata` if they were
 * captured at contact-creation time. Returns empty-string placeholders
 * (Miguel's spec: empty strings are OK, doesn't break the row) when
 * attribution isn't present.
 *
 * NOTE: the Meta CTWA capture path is deferred per
 * `project_lead_source_attribution` memory — when it activates, this
 * function picks up the values automatically.
 */
export type MarketingAttribution = {
  marketing_source: string;
  marketing_campaign: string;
  gclid: string;
};

export function marketingAttributionFor(
  meta: LeadMetadata | null | undefined,
): MarketingAttribution {
  const attribution = meta?.lead_source_attribution;
  return {
    marketing_source: attribution?.source ?? "",
    marketing_campaign: attribution?.campaign ?? "",
    gclid: attribution?.gclid ?? "",
  };
}
