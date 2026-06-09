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
  /**
   * Per-person ref codes (Miguel rule 2026-06-09). When present and
   * length > 1, the reference line lists every code one per line so
   * each person's deposit reconciles individually. When absent or
   * length 1, falls back to the legacy single `refCode`.
   */
  refCodesByPax?: string[];
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
 * Per-person reference block (Miguel rule 2026-06-09). Each person's
 * code on its own line so the customer can include all of them in a
 * single transfer reference OR pay separately. Falls back to the
 * legacy single-line format when only one code is provided.
 */
function referenceBlock(
  refCode: string,
  refCodesByPax: string[] | undefined,
  language: string,
): string[] {
  const codes = refCodesByPax && refCodesByPax.length > 0 ? refCodesByPax : [refCode];
  if (codes.length === 1) {
    return [REFERENCE_LINE(codes[0]!)];
  }
  const isEs = language.toLowerCase().startsWith("es");
  const header = isEs
    ? "Referencias (una por persona):"
    : "References (one per person):";
  return [
    header,
    ...codes.map((c, i) => `${i + 1}. ${c}`),
  ];
}

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

  // Miguel 2026-06-07 — complete bank details (3 messages: image, THB
  // follow-up, full address + GBP BIC follow-up). See
  // `information/17-information-phi-phi/2026-06-07-phi-phi-bank-details.md`
  // for the canonical reference.
  "Koh Phi Phi": {
    EUR: [
      "Beneficiary: DPM Diving Phi Phi LLC",
      "IBAN: BE90 9050 3751 2432",
      "BIC/SWIFT: TRWIBEB1XXX",
      "Bank: Wise, Rue du Trône 100, 3rd floor, Brussels, 1050, Belgium",
    ],
    GBP: [
      "Beneficiary: DPM Diving Phi Phi LLC",
      "Account number: 29276236",
      "Sort code: 23-14-70",
      "IBAN: GB55 TRWI 2314 7029 2762 36",
      // BIC confirmed Miguel 2026-06-07 — was missing in original image,
      // sent in his follow-up message.
      "BIC/SWIFT: TRWIGB2LXXX",
      "Bank: Wise Payments Limited, 1st Floor, Worship Square, 65 Clifton Street, London, EC2A 4JE, UK",
    ],
    AUD: [
      "Beneficiary: DPM Diving Phi Phi LLC",
      "Account number: 221638707",
      "BSB: 774-001",
      // BIC confirmed Miguel 2026-06-07 — matches our pre-emptive
      // assumption (Wise Australia universal BIC).
      "BIC/SWIFT: TRWIAUS1XXX",
      "Bank: Wise Australia Pty Ltd, Suite 1, Level 11, 66 Goulburn Street, Sydney, NSW, 2000, Australia",
    ],
    USD: [
      // Personal-name account (Miguel confirmed 2026-06-07: show as-is to
      // the customer). Customer transfers to the named individual, not
      // to a corporate entity. Account type included so the customer
      // can fill US-side wire / ACH forms that ask for it.
      "Beneficiary: Francisco Jose Augier",
      "Account number: 8313706669",
      "Account type: Checking",
      "Routing number: 026073150",
      "BIC/SWIFT: CMFGUS33",
      "Bank: Community Federal Savings Bank, 89-16 Jamaica Ave, Woodhaven, NY, 11421, USA",
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
  const refLines = referenceBlock(input.refCode, input.refCodesByPax, input.language);
  return [
    head,
    "",
    ...lines,
    "",
    ...refLines,
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

// ─── Stripe (Miguel 2026-06-07 — Phi Phi only) ──────────────────────────────
//
// Stripe is an alternative payment method (credit card) offered alongside
// bank transfers. Per Miguel: charges 1,000 THB per person (same as the
// THB bank deposit). Multi-pax: customer uses the SAME link N times
// (one charge per person). No webhook integration today — operator
// manually confirms in the panel after the customer reports payment.

/**
 * Per-sede Stripe payment link. Optional alternative to bank transfer.
 * Sedes without a link return undefined from `sedeStripeLink()` — caller
 * knows not to offer Stripe.
 */
export const STRIPE_LINK_BY_SEDE: Record<string, string | undefined> = {
  "Koh Phi Phi": "https://buy.stripe.com/28E5kC8mXakL3VT3jk4AU47",
  // Other sedes deferred until they activate Stripe.
};

/** Fixed per-pax amount Miguel's Stripe link charges. Always THB. */
export const STRIPE_AMOUNT_THB_PER_PAX = 1000;

export function sedeStripeLink(sedeNombre: string): string | undefined {
  return STRIPE_LINK_BY_SEDE[sedeNombre];
}

export type BuildStripeInstructionsInput = {
  sedeNombre: string;
  language: string;
  pax: number;
};

/**
 * Build the Stripe payment instructions message. Returns null when the
 * sede has no Stripe link configured (caller should not offer Stripe).
 *
 * Multi-pax behavior: per Miguel 2026-06-07, the customer uses the SAME
 * link N times for N people (one card charge per person). The message
 * spells this out so the customer doesn't try to pay once for everyone.
 */
export function buildStripeInstructions(
  input: BuildStripeInstructionsInput,
): string | null {
  const link = sedeStripeLink(input.sedeNombre);
  if (!link) return null;
  const isEnglish = !input.language.toLowerCase().startsWith("es");
  const pax = Math.max(input.pax, 1);
  const perPax = STRIPE_AMOUNT_THB_PER_PAX.toLocaleString("en-US");
  const total = (STRIPE_AMOUNT_THB_PER_PAX * pax).toLocaleString("en-US");

  if (pax === 1) {
    return isEnglish
      ? [
          `Or you can pay ${perPax} THB by credit card via Stripe:`,
          link,
          "",
          "Share the confirmation when done 🙏",
        ].join("\n")
      : [
          `O podés pagar ${perPax} THB con tarjeta por Stripe:`,
          link,
          "",
          "Compartime la confirmación cuando lo hagas 🙏",
        ].join("\n");
  }
  return isEnglish
    ? [
        `Or by credit card via Stripe — ${perPax} THB per person (total ${total} THB for ${pax} people).`,
        `Use this link ${pax} TIMES (one charge per person):`,
        link,
        "",
        "Share each confirmation when done 🙏",
      ].join("\n")
    : [
        `O con tarjeta por Stripe — ${perPax} THB por persona (total ${total} THB para ${pax} personas).`,
        `Usá este link ${pax} VECES (un cobro por persona):`,
        link,
        "",
        "Compartime cada confirmación cuando lo hagas 🙏",
      ].join("\n");
}
