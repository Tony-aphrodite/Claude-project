// ============================================================================
// Phone-prefix → deposit currency mapping. Owner spec
// (reference/INSTRUCCIONES_PAGO_GiliTrawangansteve.md §3):
//
//   +49 +43 +41 +33 +34 +39 +31 +32 +351   →  EUR
//   +44                                    →  GBP
//   +61                                    →  AUD
//   +1                                     →  USD
//   +62                                    →  IDR
//   anything else                          →  null (AI must ask client)
//
// We do this server-side rather than relying on the model so the choice is
// deterministic and auditable. The AI still receives the suggestion in the
// dynamic block so it can respect or override it (e.g. if the client
// explicitly says "I'll pay in USD" even though their phone is German).
// ============================================================================

import type { DepositCurrency } from "@dpm/shared";

const PREFIX_TO_CURRENCY: ReadonlyArray<readonly [string, DepositCurrency]> = [
  // Order matters: longer prefixes must come before shorter ones that are
  // their substring (e.g. +351 before +35x — though +35 is not in our table,
  // we keep the discipline so future additions don't shadow each other).
  ["+351", "EUR"], // Portugal
  ["+49", "EUR"], // Germany
  ["+43", "EUR"], // Austria
  ["+41", "EUR"], // Switzerland (CHF country, but uses EUR for our purposes)
  ["+33", "EUR"], // France
  ["+34", "EUR"], // Spain
  ["+39", "EUR"], // Italy
  ["+31", "EUR"], // Netherlands
  ["+32", "EUR"], // Belgium
  ["+44", "GBP"], // UK
  ["+62", "IDR"], // Indonesia
  ["+61", "AUD"], // Australia
  ["+1", "USD"], // US/Canada (must be last among the +1-shadowed prefixes)
];

/**
 * Resolve a phone number (E.164 with leading "+") to a deposit currency.
 * Returns null when the prefix is not in the owner-defined table — the AI
 * must then prompt the client to pick from the 5 available currencies.
 */
export function detectCurrencyFromPhone(
  phone: string | null | undefined,
): DepositCurrency | null {
  if (!phone) return null;
  const normalized = phone.startsWith("+") ? phone : `+${phone}`;
  for (const [prefix, currency] of PREFIX_TO_CURRENCY) {
    if (normalized.startsWith(prefix)) return currency;
  }
  return null;
}
