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
//
// 2026-05-12 owner test (Miguel): drag-drop of `virement-de-bertrand-klein.pdf`
// in WhatsApp Web sent a text message containing the literal file URL.
// franc-min processed the whole string (Spanish lead-in + long path with
// `virement` French token) and picked `por` (Portuguese) as the closest
// match in our {spa,eng,por} whitelist. The AI then replied "Obrigado
// pelo comprovante!" — a sudden language switch the customer flagged as
// alarming. Mitigation: scrub URLs, file paths, and standalone filenames
// from the input before franc sees it; then re-check the length gate
// against the scrubbed text so a path-dominated message falls back to
// "undefined" and Claude infers language from history instead.

import { franc } from "franc-min";

/**
 * Remove tokens that aren't part of the customer's natural-language
 * message before language detection. franc-min is tri-gram-based and
 * happily counts URL/path characters as if they were prose, which gives
 * single non-Latin tokens disproportionate weight.
 */
function scrubNonConversational(text: string): string {
  return (
    text
      // `http://...`, `https://...`, `file://...` URLs
      .replace(/\b(?:https?|file|ftp|s?ftp):\/\/\S+/gi, " ")
      // Windows paths `C:\Users\...` or `\\server\share`
      .replace(/(?:[A-Z]:\\|\\\\)[\S\\:]+/g, " ")
      // Unix paths `/home/...`, `/var/...`, `/tmp/...`, `/Users/...`
      .replace(/(?:^|\s)\/(?:home|var|tmp|Users|usr|etc|opt|root)\/\S+/g, " ")
      // Bare filenames with common attachment extensions
      .replace(/\b\S+\.(?:pdf|jpe?g|png|gif|webp|mp4|mov|mp3|docx?|xlsx?|csv|zip)\b/gi, " ")
      // Collapse the whitespace we just inserted
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

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
  // Strip URLs/paths/filenames first so franc only sees prose (see the
  // 2026-05-12 Bertrand-Klein PDF incident in the file header).
  const cleaned = scrubNonConversational(text);
  if (cleaned.length < 60) return undefined;
  const code = franc(cleaned, { only: Object.keys(ISO3_TO_LABEL) });
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
