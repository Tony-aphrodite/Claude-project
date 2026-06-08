// ============================================================================
// Deposit payment instruction blocks — per sede + per currency.
//
// Sources of truth:
//   • Gili Trawangan: information/KB03_payments.md (Miguel mayo 2026)
//   • Koh Phi Phi:    information/17-information-phi-phi/2026-06-07-phi-phi-bank-details.md
//                     (Miguel 2026-06-07 — image + follow-up THB details)
//   • Other sedes:    deferred until their AI activates
//
// Critical rules:
//   • Only the block for the chosen currency is sent — never multiple.
//   • Bank details ALWAYS in a separate message from price and from the
//     close-question (the prompt builder enforces this on the AI side).
//   • PER-SEDE accounts (Miguel rule 2026-06-07): Phi Phi customers MUST
//     receive Phi Phi accounts, NOT Gili Trawangan. Before this refactor
//     the AI was sending GT bank details to every sede — meaning money
//     would have gone to the wrong account. CRITICAL bug fix.
//   • Fallback: sedes without explicit blocks fall through to GT defaults
//     (preserves legacy behavior for sedes not yet on the AI).
//   • IDR amount is 700,000 (Indonesia local only — Gili sedes).
//   • THB amount is 1,000 (Thailand local — Phi Phi). Confirmed Miguel 2026-06-07.
//   • Stripe is NOT yet wired in code — deferred until Miguel confirms the
//     flow logic (which currency, 4+ pax behavior, webhook vs manual).
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
  /**
   * Number of divers on the booking. Used to compute the TOTAL the
   * customer should transfer (pax × per-person). Until 2026-05-12 the
   * bank block always quoted the per-person amount, which led customers
   * to under-pay for multi-pax bookings and OCR auto-confirm to accept
   * the under-payment. Defaults to 1 only as a safety net — callers
   * SHOULD always pass the real pax captured from `solicitar_deposito`.
   */
  pax?: number;
};

const HEAD_EN = (amt: string, ccy: string) =>
  `Here are the ${ccy} bank details for your deposit of ${amt} ${ccy} 🙏`;
const HEAD_ES = (amt: string, ccy: string) =>
  `Acá los datos bancarios en ${ccy} para tu depósito de ${amt} ${ccy} 🙏`;

// Foreign currencies (EUR/GBP/AUD/USD) require a PDF receipt — Indonesian
// mobile banking apps don't easily produce PDFs, so for IDR we accept a
// screenshot (owner spec, INSTRUCCIONES_PAGO §1 + §4 bloque-idr).
const TAIL_PDF_EN = "Once sent, please download and share the payment confirmation PDF 🙏";
const TAIL_PDF_ES = "Cuando lo envíes, descargá y compartí el comprobante de pago en PDF 🙏";
const TAIL_ANY_EN = "Once sent, please share the payment confirmation 🙏";
const TAIL_ANY_ES = "Cuando lo envíes, compartí el comprobante de pago 🙏";

const REFERENCE_LINE = (refCode: string) => `Reference: ${refCode}`;

/**
 * Per-sede bank blocks. Key = sede name (matches `sedes.nombre`).
 * Value = currency → English-language line list rendered into the WhatsApp
 * message.
 *
 * Sedes without an entry fall back to `Gili Trawangan` (legacy default —
 * preserves behavior for sedes not yet on the AI).
 *
 * Currencies missing from a sede's block fall back to the same currency
 * in Gili Trawangan. This is intentional for IDR (Gili-only — Phi Phi
 * shouldn't offer IDR, but if a customer insists, the fallback still
 * works). Use `sedeSupportsCurrency()` to gate offer-time decisions.
 */
type SedeBankBlocks = Partial<Record<DepositCurrency, string[]>>;

const BANK_BLOCKS_BY_SEDE: Record<string, SedeBankBlocks> = {
  "Gili Trawangan": {
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
  },

  // Miguel 2026-06-07 — image + follow-up THB details.
  // See `information/17-information-phi-phi/2026-06-07-phi-phi-bank-details.md`.
  "Koh Phi Phi": {
    EUR: [
      "Beneficiary: DPM Diving Phi Phi LLC",
      "IBAN: BE90 9050 3751 2432",
      "BIC/SWIFT: TRWIBEB1XXX",
      "Bank: Wise, Rue du Trône 100, Brussels",
    ],
    GBP: [
      "Beneficiary: DPM Diving Phi Phi LLC",
      "IBAN: GB55 TRWI 2314 7029 2762 36",
      "Sort code: 23-14-70",
      "Account number: 29276236",
      "Bank: Wise, London",
    ],
    AUD: [
      "Beneficiary: DPM Diving Phi Phi LLC",
      "Account number: 221638707",
      "BSB: 774001",
      // BIC pending Miguel confirmation — using Wise Australia universal
      // BIC (same one Gili Trawangan uses since both accounts are at
      // Wise based on BSB 774001 pattern). Safe assumption; Miguel can
      // correct via a 1-line edit if wrong.
      "BIC/SWIFT: TRWIAUS1XXX",
      "Bank: Wise Australia",
    ],
    USD: [
      // Personal-name account (Miguel confirmed 2026-06-07: show as-is to
      // the customer). The customer transfers to the named individual,
      // not to a corporate entity.
      "Beneficiary: Francisco Jose Augier",
      "Account number: 8313706669",
      "Routing number: 026073150",
      "BIC/SWIFT: CMFGUS33",
      "Bank: Community Federal Savings Bank, New York, USA",
    ],
    THB: [
      "Beneficiary: Dpm diving koh phiphi",
      "Account number: 5722989108",
      "BIC/SWIFT: SICOTHBKXXX",
      "Bank: SCB (Siam Commercial Bank), Thailand",
    ],
    // IDR omitted intentionally — Phi Phi is Thailand, not Indonesia.
    // If a customer requests IDR for some reason, falls back to GT block
    // (defensive — shouldn't happen in practice).
  },
};

const DEFAULT_SEDE_FOR_FALLBACK = "Gili Trawangan" as const;

/**
 * Resolve the bank block lines for (sede, currency). Falls back to the
 * default sede (Gili Trawangan) if the sede doesn't have explicit
 * configuration OR if the sede has no block for that currency.
 */
function lookupBankBlock(
  sedeNombre: string,
  currency: DepositCurrency,
): string[] {
  const sedeBlocks = BANK_BLOCKS_BY_SEDE[sedeNombre];
  if (sedeBlocks?.[currency]) return sedeBlocks[currency]!;
  // Fall back to default sede's block.
  return BANK_BLOCKS_BY_SEDE[DEFAULT_SEDE_FOR_FALLBACK]![currency] ?? [];
}

function formatAmount(currency: DepositCurrency, pax: number = 1): string {
  const amt = depositAmountFor(currency) * Math.max(pax, 1);
  // Currencies with naturally large amounts use thousand separators for
  // readability (700,000 / 1,000 / 2,000); foreign currencies (EUR/GBP/AUD/USD)
  // stay as plain "40".
  if (currency === "IDR" || currency === "THB") {
    return amt.toLocaleString("en-US");
  }
  return String(amt);
}

/**
 * Render the bank block for a given currency in the client's language.
 * Falls back to English when the language is anything other than Spanish.
 * The block is meant to be sent ALONE in its own outbound message — the
 * prompt builder instructs the AI to keep price, bank, and close-question
 * in three separate messages.
 *
 * Layout matches owner spec INSTRUCCIONES_PAGO §4: blank lines between the
 * head, the bank lines, the reference line, and the tail so the message
 * reads cleanly inside WhatsApp.
 */
export function buildPaymentInstructions(input: BuildInstructionsInput): string {
  const isEnglish = !input.language.toLowerCase().startsWith("es");
  const amt = formatAmount(input.currency, input.pax ?? 1);
  const head = isEnglish ? HEAD_EN(amt, input.currency) : HEAD_ES(amt, input.currency);
  // Per-sede lookup (Miguel rule 2026-06-07) — falls back to GT when
  // sede has no explicit block. Critical for Phi Phi, where the wrong
  // bank account = money lost.
  const lines = lookupBankBlock(input.sedeNombre, input.currency);
  // IDR + THB use local-banking apps (Indonesia / Thailand) where
  // screenshots are more common than PDFs. Foreign currencies require
  // a PDF confirmation (Wise / international banks emit PDF receipts).
  const requiresPdf = input.currency !== "IDR" && input.currency !== "THB";
  const tail = isEnglish
    ? requiresPdf ? TAIL_PDF_EN : TAIL_ANY_EN
    : requiresPdf ? TAIL_PDF_ES : TAIL_ANY_ES;
  return [
    head,
    "",
    ...lines,
    "",
    REFERENCE_LINE(input.refCode),
    "",
    tail,
  ].join("\n");
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
