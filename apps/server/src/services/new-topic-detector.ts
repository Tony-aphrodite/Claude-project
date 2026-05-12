// ============================================================================
// Detect when a customer's message after a `handed_off` (or `deposit_paid`
// / `closed`) transition is a NEW topic that the AI should engage with
// again. Without this, every post-handoff message is silenced and a
// customer who books OW and then asks "btw, do you also do night dives?"
// gets no reply — which Miguel flagged on 2026-05-12 (5-12-feedback §1).
//
// Approach: deterministic heuristic, no extra Claude call. False positive
// (AI re-engages on a thank-you) is mildly awkward but recoverable;
// false negative (AI silent on a real new question) is what we're trying
// to fix. Tilt slightly toward false positive.
// ============================================================================

const NEW_INTENT_KEYWORDS_ES = [
  "quiero",
  "quería",
  "queria",
  "quisiera",
  "info",
  "información",
  "informacion",
  "cuánto",
  "cuanto",
  "precio",
  "cuesta",
  "sale",
  "tengo",
  "puedo",
  "podría",
  "podria",
  "otra",
  "otro",
  "ofrecen",
  "hacen",
  "tienen",
  "hay",
  "consulta",
  "pregunta",
  "duda",
  "también",
  "tambien",
  "además",
  "ademas",
  "aparte",
  // dive-program names — strong signal the customer is asking about a service
  "night",
  "nocturno",
  "advanced",
  "rescue",
  "deep",
  "fun dive",
  "specialty",
  "refresh",
  "scuba diver",
  "open water",
];

const NEW_INTENT_KEYWORDS_EN = [
  "want",
  "would like",
  "info",
  "information",
  "how much",
  "price",
  "cost",
  "do you",
  "are you",
  "another",
  "different",
  "also",
  "what about",
  "question",
  "wondering",
  "thinking about",
  "interested in",
  "any chance",
  "i need",
  "can i",
  "could you",
  // programs
  "night dive",
  "advanced",
  "rescue",
  "deep",
  "fun dive",
  "specialty",
  "refresh",
  "scuba diver",
  "open water",
];

const POST_HANDOFF_REENGAGE_MIN_CHARS = 25;
const POST_HANDOFF_REENGAGE_MIN_GAP_MIN = 15;

/**
 * Returns true when a post-handoff message looks like a NEW inquiry that
 * deserves an AI reply. Defaults to FALSE — we err on the side of staying
 * silent unless multiple positive signals line up.
 *
 * Signals that count (all must hold):
 *   1. Message is at least POST_HANDOFF_REENGAGE_MIN_CHARS chars long
 *      (skips "ok", "gracias", "👍", "thanks").
 *   2. At least one of the NEW_INTENT_KEYWORDS appears in the message
 *      (case-insensitive substring).
 *   3. At least POST_HANDOFF_REENGAGE_MIN_GAP_MIN minutes have passed
 *      since the last lead_stage change. Prevents a "thanks!" 30 sec
 *      after deposit_paid from re-engaging.
 *
 * Note on language: we don't run franc here — we just check both ES + EN
 * keyword lists. A message in mixed language still matches.
 */
export function isNewTopicAfterHandoff(input: {
  text: string;
  leadStageChangedAt: Date | null;
  now?: Date;
}): boolean {
  const text = input.text.trim();
  if (text.length < POST_HANDOFF_REENGAGE_MIN_CHARS) return false;

  if (input.leadStageChangedAt) {
    const now = input.now ?? new Date();
    const ageMin =
      (now.getTime() - input.leadStageChangedAt.getTime()) / (60 * 1000);
    if (ageMin < POST_HANDOFF_REENGAGE_MIN_GAP_MIN) return false;
  }

  const lower = text.toLowerCase();
  for (const kw of NEW_INTENT_KEYWORDS_ES) {
    if (lower.includes(kw)) return true;
  }
  for (const kw of NEW_INTENT_KEYWORDS_EN) {
    if (lower.includes(kw)) return true;
  }
  return false;
}
