// ============================================================================
// Layer 1: deterministic rule checks. Cheap, binary, fast. Run on every case.
//
// We split rules into:
//   - GLOBAL: apply to every case (anti-hallucination, no-absolutes, currency
//     formatting whenever a number appears, no other-sede leakage).
//   - PER-CASE: shipped on the case (mustInclude / mustExclude regex).
// ============================================================================

import type { DeterministicVerdict, RegressionCase } from "../types.js";

// Match the stem so "garantizamos / garantizo / garantizada" are all caught.
const FORBIDDEN_ABSOLUTES = [
  /\bgarantiz(o|a|as|amos|an|ado|ada|ados|adas)\b/i,
  /\b100%\s+(seguro|disponible|garantiz)/i,
  /\bguaranteed\b/i,
  /\bdefinitely\s+available\b/i,
  /\baseguram?os\b/i,
];

const SEDE_KEYWORD_BY_TAG: Record<string, string[]> = {
  "Koh Tao": ["koh tao", "kh tao", "ko tao"],
  "Phi Phi": ["phi phi", "ko phi"],
  "Gili Trawangan": ["gili trawangan", "trawangan"],
  "Gili Air": ["gili air"],
  "Nusa Penida": ["nusa penida", "penida"],
};

const PRICE_PATTERN = /\b\d{2,3}(?:[.,]\d{3})*\s?(THB|IDR|USD|EUR|฿|Rp|\$|€)/;
const NUMERIC_NO_CURRENCY = /\b\d{2,4}\s?(?!\s?(THB|IDR|USD|EUR|฿|Rp|\$|€|years|años|days|días|hours|horas|min|m|km|kg|°|m²|m\b)\w?)/;

export function checkDeterministic(
  caseDef: RegressionCase,
  response: string,
): DeterministicVerdict {
  const failures: DeterministicVerdict["failures"] = [];

  for (const re of FORBIDDEN_ABSOLUTES) {
    if (re.test(response)) {
      failures.push({
        rule: "no_absolutes",
        detail: `Response contains forbidden absolute promise (${re.source})`,
      });
    }
  }

  // Other-sede leakage: response mentions another sede's name verbatim.
  for (const [sedeName, keywords] of Object.entries(SEDE_KEYWORD_BY_TAG)) {
    if (sedeName === caseDef.sedeName) continue;
    for (const kw of keywords) {
      const re = new RegExp(`\\b${escapeRegExp(kw)}\\b`, "i");
      if (re.test(response)) {
        failures.push({
          rule: "no_other_sede_leak",
          detail: `Response mentions sede "${sedeName}" but case is for "${caseDef.sedeName}"`,
        });
        break;
      }
    }
  }

  // If there's a price-shaped number, it must include a currency unit.
  if (NUMERIC_NO_CURRENCY.test(response) && !PRICE_PATTERN.test(response)) {
    // This rule has historical false positives on years and counts. We keep it
    // as a soft check only — a single offence won't fail the case alone unless
    // pattern looks unambiguously like a price.
    if (/\b(precio|cuesta|costs|price|tarifa)\b/i.test(response)) {
      failures.push({
        rule: "currency_required_when_pricing",
        detail: "Response talks about price but a number appears without a currency suffix",
      });
    }
  }

  for (const re of caseDef.expected.mustInclude ?? []) {
    if (!re.test(response)) {
      failures.push({
        rule: "must_include",
        detail: `Response missing required pattern: ${re.source}`,
      });
    }
  }

  for (const re of caseDef.expected.mustExclude ?? []) {
    if (re.test(response)) {
      failures.push({
        rule: "must_exclude",
        detail: `Response contains forbidden pattern: ${re.source}`,
      });
    }
  }

  return { passed: failures.length === 0, failures };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
