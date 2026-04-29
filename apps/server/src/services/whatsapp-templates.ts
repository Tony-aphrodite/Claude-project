// ============================================================================
// WhatsApp 24h-window guard + Meta-approved template fallback.
//
// WhatsApp Business policy: outside the 24h "service window" (24h since the
// last inbound client message), free-form text is rejected. Only Meta-
// approved templates with placeholders (no marketing variables filled in
// arbitrarily) are allowed.
//
// We register templates in code; the actual approval happens in Meta's
// Business Manager and Miguel toggles them on respectively. The `name` field
// MUST match the approved template name on the Meta side.
// ============================================================================

export type TemplateRegistryEntry = {
  name: string;
  language: string; // e.g. "es", "en"
  // Variable count Meta requires; rendering replaces {{1}}, {{2}}, ...
  variableCount: number;
  // Best-fit follow-up level (1..5) — picked when we need to send outside 24h
  followUpLevel: 3 | 4 | 5;
  // Human-readable summary; not sent.
  description: string;
  // Default body for engineers to read. The real text is registered with Meta
  // and may differ slightly; placeholder substitution must produce the same
  // count and order.
  bodyPreview: string;
};

export const TEMPLATE_REGISTRY: TemplateRegistryEntry[] = [
  {
    name: "dpm_followup_48h_es",
    language: "es",
    variableCount: 1,
    followUpLevel: 3,
    description: "48h follow-up reminder (Spanish)",
    bodyPreview:
      "Hola {{1}}, te escribo desde DPM Diving. Quería ver si todavía te interesa nuestro curso. " +
      "Si tenés cualquier duda, escribime y la resolvemos.",
  },
  {
    name: "dpm_followup_48h_en",
    language: "en",
    variableCount: 1,
    followUpLevel: 3,
    description: "48h follow-up reminder (English)",
    bodyPreview:
      "Hi {{1}}, this is DPM Diving following up. Just checking if you're still interested in the course. " +
      "Reply with any questions and we'll help out.",
  },
  {
    name: "dpm_followup_7d_es",
    language: "es",
    variableCount: 1,
    followUpLevel: 4,
    description: "7-day check-in (Spanish)",
    bodyPreview:
      "Hola {{1}}, ¿pudiste decidir las fechas de viaje? " +
      "Tenemos plazas que se llenan rápido en temporada. Avisame cuando tengas claridad.",
  },
  {
    name: "dpm_followup_7d_en",
    language: "en",
    variableCount: 1,
    followUpLevel: 4,
    description: "7-day check-in (English)",
    bodyPreview:
      "Hi {{1}}, have you locked in your travel dates? " +
      "Spots fill up fast in season. Ping me when you know.",
  },
  {
    name: "dpm_followup_30d_es",
    language: "es",
    variableCount: 1,
    followUpLevel: 5,
    description: "30-day final check-in (Spanish)",
    bodyPreview:
      "Hola {{1}}, último mensaje de mi parte: si seguís pensando en venir a bucear con nosotros, " +
      "estamos acá. Si no, te deseamos lo mejor en tu viaje.",
  },
  {
    name: "dpm_followup_30d_en",
    language: "en",
    variableCount: 1,
    followUpLevel: 5,
    description: "30-day final check-in (English)",
    bodyPreview:
      "Hi {{1}}, last message from us: if you're still considering DPM Diving, we're here. " +
      "If not, safe travels.",
  },
];

/**
 * Pick the best-matching approved template for a given level + language.
 * Falls back to English if the requested language has no template approved.
 */
export function pickTemplate(
  level: 3 | 4 | 5,
  language: string | null,
): TemplateRegistryEntry | null {
  const lang = (language ?? "en").slice(0, 2).toLowerCase();
  return (
    TEMPLATE_REGISTRY.find(
      (t) => t.followUpLevel === level && t.language === lang,
    ) ??
    TEMPLATE_REGISTRY.find((t) => t.followUpLevel === level && t.language === "en") ??
    null
  );
}

/**
 * Decide whether the WhatsApp 24h free-form window is open.
 * lastClientMessageAt = timestamp of the most recent INBOUND message from the
 * client. If null/undefined, treat as outside the window.
 */
export function isWithin24hWindow(lastClientMessageAt: Date | null | undefined): boolean {
  if (!lastClientMessageAt) return false;
  const elapsed = Date.now() - lastClientMessageAt.getTime();
  return elapsed < 24 * 60 * 60 * 1000;
}
