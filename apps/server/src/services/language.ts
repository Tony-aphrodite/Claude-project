// Cheap language detection. franc returns ISO 639-3 codes; we map the
// handful we care about to ISO 639-1 for human-readable logging.
//
// ──────────────────────────────────────────────────────────────────────────
// 2026-05-19 incident — ES→PT cognate drift across all sedes
// ──────────────────────────────────────────────────────────────────────────
//
// Miguel reported (Entry #12 in MIGUEL_FEEDBACK_LOG) that the AI was
// flipping to Portuguese in conversations with Spanish-speaking
// customers in "casi todas las sedes". Two root causes:
//
//   1. franc-min false-positives for Spanish-without-accents as
//      Portuguese (cognate languages, tri-gram detector). A single
//      misclassified turn was enough to flip the conversation.
//   2. The previous detection path used contact.language (Respond.io
//      custom field) as a fallback for short messages. Once franc had
//      written "pt" to a contact, every subsequent <60-char message
//      ("sí", "ok", "gracias") inherited "pt" as a HARD anchor → the
//      AI stayed in PT for the rest of the conversation.
//
// Two-layer fix:
//
//   A. PT-grapheme cross-check inside detectLanguage(). franc may say
//      "por" but we only accept it when the text also contains a
//      PT-only morpheme/grapheme (`ã/õ/ç`, `mergulh`, `obrigad[ao]`,
//      `-ção`, etc.). Real Portuguese customers nearly always use
//      these; Spanish-misclassified-as-PT never does. When franc says
//      "por" without these markers, we return undefined and let the
//      prompt-builder use the soft anchor (AI uses conversation
//      history for language continuity).
//
//   B. Removed the contact.language fallback in process-message.ts.
//      The AI has the full conversation history in its prompt (Bloque
//      3); it doesn't need an external sticky variable to maintain
//      language. We still WRITE contact.language for Respond.io
//      operator visibility, just don't READ it as a runtime anchor.
//
// PT_ONLY_PATTERNS lives in this file as the canonical source of truth.
// services/anthropic.ts imports the same set for its reply-side guard
// (catches AI drift in the OUTBOUND reply, complementing this inbound
// detection-side guard).
//
// ──────────────────────────────────────────────────────────────────────────
// Prior incidents kept for context
// ──────────────────────────────────────────────────────────────────────────
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
//      that is Spanish or English.
//
// Mitigations: min length 60, whitelist trimmed to {spa, eng, por}.
//
// 2026-05-12 owner test (Miguel): drag-drop of `virement-de-bertrand-klein.pdf`
// in WhatsApp Web sent a text message containing the literal file URL.
// franc-min picked `por` (Portuguese) as the closest match in our
// {spa,eng,por} whitelist because of `virement` (French) in the path.
// Mitigation: scrub URLs/paths/filenames from input before franc sees it.

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

/**
 * PT-only morphemes and graphemes. Used both here (to validate franc's
 * "por" verdict on inbound messages) and in services/anthropic.ts (to
 * catch AI drift in OUTBOUND replies). Single source of truth.
 *
 * Real Portuguese speakers almost always include at least one of these
 * in any substantive (60+ char) message — `não`, `também`, `mergulhar`,
 * `obrigado`, `instrutor`, words ending in `-ção`, etc. Spanish
 * misclassified as PT by franc-min essentially never matches any of
 * these (Spanish uses `instructor`, `gracias`, `bucear`, `también`
 * without the `ã`, words ending in `-ción`, etc.).
 */
export const PT_ONLY_PATTERNS: RegExp[] = [
  /\bmergulh/i, // mergulhar / mergulho (ES: bucear / buceo)
  /\bentendo\b/i, // PT 1st-person; ES is "entiendo" with an i
  /\bfazendo\b/i, // PT; ES is "haciendo"
  /\binstrutor\b/i, // PT spelling; ES is "instructor"
  /\bobrigad[ao]\b/i, // PT thanks; ES is "gracias"
  /ç[ãa]o\b/i, // PT "-ção" ending (atenção, opção); ES uses "-ción"
  // Catch-all on PT-only graphemes. JS regex `\b` doesn't treat
  // diacritic chars as word boundaries (ASCII-only), which made the
  // word-boundary version of vocês / você miss in tests. The bare
  // grapheme set is the most robust check — these letters don't appear
  // in any Spanish word.
  /[ãõê]/,
];

export function looksLikePortuguese(text: string): boolean {
  return PT_ONLY_PATTERNS.some((p) => p.test(text));
}

export function detectLanguage(text: string): string | undefined {
  // Strip URLs/paths/filenames first so franc only sees prose (see the
  // 2026-05-12 Bertrand-Klein PDF incident in the file header).
  const cleaned = scrubNonConversational(text);
  if (cleaned.length < 60) return undefined;
  const code = franc(cleaned, { only: Object.keys(ISO3_TO_LABEL) });
  if (code === "und") return undefined;

  // ES→PT cognate-drift guard (2026-05-19, Entry #12). franc has a
  // known false-positive rate for accent-less Spanish being
  // classified as Portuguese. Reject the "por" verdict unless the
  // text also has PT-specific markers; otherwise return undefined and
  // let the prompt-builder fall through to the soft anchor (the AI
  // uses conversation history for continuity).
  if (code === "por" && !looksLikePortuguese(cleaned)) {
    return undefined;
  }

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
