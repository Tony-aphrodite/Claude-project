// Cheap language detection. franc returns ISO 639-3 codes; we map the
// handful we care about to ISO 639-1 for human-readable logging.
//
// 2026-05-11 owner test (Miguel): "Hola soy nuevo, no bucee nunca" (30
// chars, no accents) was classified as Italian by franc-min and the AI
// dutifully replied in Italian. Root cause is two-fold:
//
//   1. franc-min is unreliable below ~60 chars — Latin languages with
//      similar vowel distributions (Spanish, Italian, Portuguese) look
//      identical to a tri-gram counter once the customer drops the
//      tildes/accents that disambiguate them.
//   2. Including Italian/French/German/Dutch/Russian in the `only`
//      whitelist invites false positives for the ~95% of DPM traffic
//      that is Spanish or English. A customer who writes Italian
//      will be re-detected by Claude itself anyway — we don't lose
//      coverage by removing them here.
//
// Mitigations:
//   • Minimum length lifted to 60 chars (was 30) so short greetings stop
//     getting forced-classified.
//   • `only` whitelist trimmed to {spa, eng, por} — three languages
//     DPM staff have actually seen in production traffic.
//   • Returning undefined lets the prompt-builder emit no "IDIOMA
//     DETECTADO" line at all, and Claude infers language from message
//     content (much more reliable than franc on short text).

import { franc } from "franc-min";

const ISO3_TO_LABEL: Record<string, string> = {
  spa: "español",
  eng: "english",
  por: "português",
};

const LABEL_TO_ISO2: Record<string, string> = {
  español: "es",
  english: "en",
  português: "pt",
};

export function detectLanguage(text: string): string | undefined {
  if (text.trim().length < 60) return undefined;
  const code = franc(text, { only: Object.keys(ISO3_TO_LABEL) });
  if (code === "und") return undefined;
  return ISO3_TO_LABEL[code] ?? code;
}

/**
 * Map our human-readable language label ("español", "english", …) to the
 * ISO-639-1 two-letter code Respond.io's contact.language field expects.
 * Returns null when the label is unrecognized so callers can decide whether
 * to skip the push.
 */
export function languageLabelToIso2(label: string | null | undefined): string | null {
  if (!label) return null;
  return LABEL_TO_ISO2[label.toLowerCase()] ?? null;
}
