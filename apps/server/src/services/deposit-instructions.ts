// ============================================================================
// Deposit payment instruction blocks for Gili Trawangan.
//
// Source of truth: information/KB03_payments.md (owner-authored, mayo 2026).
// Five currency blocks reproduced verbatim with `{{REFERENCE_CODE}}` and
// `{{AMOUNT}}` placeholders substituted at render time.
//
// Critical rules from the KB:
//   • Only the block for the chosen currency is sent — never multiple.
//   • Bank details ALWAYS in a separate message from price and from the
//     close-question (the prompt builder enforces this on the AI side).
//   • Stripe is NOT enabled in Gili Trawangan — every block requires human
//     verification from the panel after the client transfers.
//   • IDR amount is 700,000 (not 40); applies only when client has an
//     Indonesian local bank account.
//   • USD account is technically a Koh Tao account (we use it for GT clients
//     who pay in USD); the client never needs to know.
// ============================================================================

import {
  depositAmountFor,
  type DepositCurrency,
} from "@dpm/shared";

export type SedeKey =
  | "Koh Tao"
  | "Koh Phi Phi"
  | "Gili Trawangan"
  | "Gili Air"
  | "Nusa Penida";

/** Whether this sede has an automatic gateway (Stripe) confirming via webhook. */
export function sedeHasAutomaticGateway(sede: SedeKey): boolean {
  // Owner-confirmed: Stripe is NOT enabled for any sede in the pilot.
  // Koh Tao would technically support it, but the owner deferred its
  // activation to post-pilot.
  return false;
}

export type BuildInstructionsInput = {
  sedeNombre: string;
  language: string;
  currency: DepositCurrency;
  refCode: string;
};

const HEAD_EN = (amt: string, ccy: string) =>
  `Here are the ${ccy} bank details for your deposit of ${amt} ${ccy} 🙏`;
const HEAD_ES = (amt: string, ccy: string) =>
  `Acá los datos bancarios en ${ccy} para tu depósito de ${amt} ${ccy} 🙏`;

const TAIL_EN = "Once sent, please download and share the payment confirmation PDF 🙏";
const TAIL_ES = "Cuando lo envíes, descargá y compartí el comprobante de pago en PDF 🙏";

const REFERENCE_LINE = (refCode: string) => `Reference: ${refCode}`;

const BANK_BLOCKS_EN: Record<DepositCurrency, string[]> = {
  EUR: [
    "Beneficiary: DPM Diving Gili T LLC",
    "IBAN: BE93 9050 6891 4867",
    "BIC/SWIFT: TRWIBEB1XXX",
    "Bank: Wise, Brussels, Belgium",
  ],
  GBP: [
    "Beneficiary: DPM Diving Gili T LLC",
    "Account number: 55834953",
    "Sort code: 23-08-01",
    "IBAN: GB52 TRWI 2308 0155 8349 53",
    "BIC/SWIFT: TRWIGB2LXXX",
    "Bank: Wise Payments Limited, London, UK",
  ],
  AUD: [
    "Beneficiary: DPM Diving Gili T LLC",
    "Account number: 222625669",
    "BSB: 774-001",
    "BIC/SWIFT: TRWIAUS1XXX",
    "Bank: Wise Australia, Sydney",
  ],
  USD: [
    "Beneficiary: Dpm Diving",
    "Account number: 822000685807",
    "Routing number: 026073150",
    "BIC/SWIFT: CMFGUS33",
    "Bank: Community Federal Savings Bank, New York, USA",
  ],
  IDR: [
    "Beneficiary: Dalam Professional Menyelam",
    "Bank: Bank Mandiri",
    "Account: 1610010570609",
  ],
};

function formatAmount(currency: DepositCurrency): string {
  const amt = depositAmountFor(currency);
  // IDR uses thousand separators (700,000); the others stay as plain "40".
  return currency === "IDR" ? amt.toLocaleString("en-US") : String(amt);
}

/**
 * Render the bank block for a given currency in the client's language.
 * Falls back to English when the language is anything other than Spanish.
 * The block is meant to be sent ALONE in its own outbound message — the
 * prompt builder instructs the AI to keep price, bank, and close-question
 * in three separate messages.
 */
export function buildPaymentInstructions(input: BuildInstructionsInput): string {
  const isEnglish = !input.language.toLowerCase().startsWith("es");
  const amt = formatAmount(input.currency);
  const head = isEnglish ? HEAD_EN(amt, input.currency) : HEAD_ES(amt, input.currency);
  const lines = BANK_BLOCKS_EN[input.currency];
  const tail = isEnglish ? TAIL_EN : TAIL_ES;
  return [head, ...lines, REFERENCE_LINE(input.refCode), tail].join("\n");
}

/**
 * Variant of the IBAN-mismatch warning used when a client transferred from
 * Nusa Penida or Gili Air (which have different IBANs) — the AI prepends
 * this to the EUR/GBP block to avoid the recurring confusion documented in
 * KB-03 §alerta-iban.
 */
export function buildIbanMismatchWarning(language: string): string {
  return language.toLowerCase().startsWith("es")
    ? "Solo para confirmar — los datos de Gili Trawangan son diferentes a los de Nusa Penida y Gili Air. Acá van los datos correctos:"
    : "Just to confirm — the Gili Trawangan account is different from Nusa Penida and Gili Air. Here are the correct details:";
}
