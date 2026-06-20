// ============================================================================
// Deposit payment instruction blocks — per sede + per currency.
//
// Sources of truth:
//   • Gili Trawangan: prompts/gili-trawangan/KB03_payments.md (Miguel mayo 2026)
//   • Koh Phi Phi:    reference/koh-phi-phi-2026-06-07-phi-phi-bank-details.md
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
 * preserves behavior for sedes not yet on the AI). Updated 2026-06-16
 * (post-audit): silent fallback to GT is gone — `lookupBankBlock`
 * throws when a sede × currency combo isn't seeded. Callers MUST gate
 * with `sedeSupportsCurrency()` before invoking `solicitar_deposito`,
 * and reject upstream with a customer-facing currency list if the
 * combination isn't supported.
 */
type SedeBankBlocks = Partial<Record<DepositCurrency, string[]>>;

// Shared KT USD block — re-used by Gili Air (Miguel 2026-06-16) and
// Nusa Penida (Miguel 2026-06-20, reverses an earlier "NP no USD"
// rule). The customer-facing beneficiary stays as "Dpm Diving" with
// no LLC suffix; if the customer questions it the sede AI responds
// per the prompt rule ("nuestra cuenta corporativa para USD").
const KT_USD_BLOCK: string[] = [
  "Beneficiary: Dpm Diving",
  "Account type: Checking",
  "Account number: 822000685807",
  "Routing number: 026073150",
  "BIC/SWIFT: CMFGUS33",
  "Bank: Community Federal Savings Bank, 89-16 Jamaica Ave, Woodhaven, NY, 11421, USA",
];

const BANK_BLOCKS_BY_SEDE: Record<string, SedeBankBlocks> = {
  // Miguel 2026-06-16 (re-confirmed) — GT now has its OWN Wise US
  // account for USD (Wilmington DE under DPM Diving Gili T LLC).
  // Previously code shared the CFSB account with KT — that account
  // actually belongs to KT, not GT. IDR holder updated to "PT DALAM
  // PROFESIONAL MENYELAM" (corporate legal name, matches Mandiri
  // record) with bank code 80017.
  "Gili Trawangan": {
    EUR: [
      "Beneficiary: DPM Diving Gili T LLC",
      "IBAN: BE93 9050 6891 4867",
      "BIC/SWIFT: TRWIBEB1XXX",
      "Bank: Wise, Rue du Trône 100, 3rd floor, Brussels, 1050, Belgium",
    ],
    GBP: [
      "Beneficiary: DPM Diving Gili T LLC",
      "Account number: 55834953",
      "Sort code: 23-08-01",
      "IBAN: GB52 TRWI 2308 0155 8349 53",
      "BIC/SWIFT: TRWIGB2LXXX",
      "Bank: Wise Payments Limited, 1st Floor, Worship Square, 65 Clifton Street, London, EC2A 4JE, UK",
    ],
    AUD: [
      "Beneficiary: DPM Diving Gili T LLC",
      "Account number: 222625669",
      "BSB: 774-001",
      "BIC/SWIFT: TRWIAUS1XXX",
      "Bank: Wise Australia Pty Ltd, Suite 1, Level 11, 66 Goulburn Street, Sydney, NSW, 2000, Australia",
    ],
    USD: [
      "Beneficiary: DPM Diving Gili T LLC",
      "Account type: Deposit",
      "Account number: 496290465973320",
      "Routing number: 084009519",
      "BIC/SWIFT: TRWIUS35XXX",
      "Bank: Wise US Inc, 108 W 13th St, Wilmington, DE, 19801, USA",
    ],
    IDR: [
      "Beneficiary: PT DALAM PROFESIONAL MENYELAM",
      "Bank: Bank Mandiri",
      "Bank code: 80017",
      "Account number: 1610010570609",
    ],
  },

  // Miguel 2026-06-16 — full GA block. KB previously listed accounts
  // under "Hari Rahmadiansyah" personal name (origin: original
  // colombagiliairparajunjun.zip 2026-05-15); Miguel disavowed that
  // name 2026-06-16 — likely the prior Wise account holder before
  // migration to the LLC. Same IBAN/account numbers, new beneficiary.
  // USD: silently uses KT's CFSB account (see KT_USD_BLOCK).
  "Gili Air": {
    EUR: [
      "Beneficiary: DPM Diving Gili Air LLC",
      "IBAN: BE26 9050 6838 7229",
      "BIC/SWIFT: TRWIBEB1XXX",
      "Bank: Wise, Rue du Trône 100, 3rd floor, Brussels, 1050, Belgium",
    ],
    GBP: [
      "Beneficiary: DPM Diving Gili Air LLC",
      "Account number: 59488146",
      "Sort code: 23-08-01",
      "IBAN: GB37 TRWI 2308 0159 4881 46",
      "BIC/SWIFT: TRWIGB2LXXX",
      "Bank: Wise Payments Limited, 1st Floor, Worship Square, 65 Clifton Street, London, EC2A 4JE, UK",
    ],
    AUD: [
      "Beneficiary: DPM Diving Gili Air LLC",
      "Account number: 222597691",
      "BSB: 774-001",
      "BIC/SWIFT: TRWIAUS1XXX",
      "Bank: Wise Australia Pty Ltd, Suite 1, Level 11, 66 Goulburn Street, Sydney, NSW, 2000, Australia",
    ],
    USD: KT_USD_BLOCK, // silent share with KT (Miguel rule 2026-06-16)
    IDR: [
      "Beneficiary: PT DALAM PROFESSIONAL MENYELAM",
      "Bank: Bank Mandiri",
      "Account number: 161001392624-6",
    ],
  },

  // Miguel 2026-06-16 → 2026-06-20 — NP block. USD now SUPPORTED via
  // the same silent-share with KT that GA uses (Miguel's 2026-06-20
  // bank-info dump confirmed account 822000685807 / CFSB for NP USD,
  // which is exactly the KT_USD_BLOCK). The earlier "NP no USD" rule
  // (2026-06-16) is reversed. EUR / GBP / AUD / IDR unchanged from
  // the original NP delivery.
  "Nusa Penida": {
    EUR: [
      "Beneficiary: DPM Diving Nusa Penida LLC",
      "IBAN: BE57 9050 6281 0335",
      "BIC/SWIFT: TRWIBEB1XXX",
      "Bank: Wise, Rue du Trône 100, 3rd floor, Brussels, 1050, Belgium",
    ],
    GBP: [
      "Beneficiary: DPM Diving Nusa Penida LLC",
      "Account number: 83574365",
      "Sort code: 23-08-01",
      "IBAN: GB88 TRWI 2308 0183 5743 65",
      "BIC/SWIFT: TRWIGB2LXXX",
      "Bank: Wise Payments Limited, 1st Floor, Worship Square, 65 Clifton Street, London, EC2A 4JE, UK",
    ],
    AUD: [
      "Beneficiary: DPM Diving Nusa Penida LLC",
      "Account number: 222430607",
      "BSB: 774-001",
      "BIC/SWIFT: TRWIAUS1XXX",
      "Bank: Wise Australia Pty Ltd, Suite 1, Level 11, 66 Goulburn Street, Sydney, NSW, 2000, Australia",
    ],
    USD: KT_USD_BLOCK, // silent share with KT (Miguel 2026-06-20, reverses 2026-06-16 "no USD")
    IDR: [
      "Beneficiary: PT DPM DIVING NUSA PENIDA",
      "Bank: Bank BPD Bali",
      "Bank code: 1290013",
      "Account number: 0230202084015",
    ],
  },

  // Miguel 2026-06-16 — KT block. Beneficiary is plain "Dpm Diving"
  // (Thailand entity, not the BE-resident LLC pattern of the Indo
  // sedes). Stripe THB link still active in parallel with Bangkok
  // Bank — see sedeStripeLink() below.
  "Koh Tao": {
    EUR: [
      "Beneficiary: Dpm Diving",
      "IBAN: BE02 9674 4543 1440",
      "BIC/SWIFT: TRWIBEB1XXX",
      "Bank: Wise, Rue du Trône 100, 3rd floor, Brussels, 1050, Belgium",
    ],
    GBP: [
      "Beneficiary: Dpm Diving",
      "Account number: 14569568",
      "Sort code: 23-14-70",
      "IBAN: GB18 TRWI 2314 7014 5695 68",
      "BIC/SWIFT: TRWIGB2LXXX",
      "Bank: Wise Payments Limited, 1st Floor, Worship Square, 65 Clifton Street, London, EC2A 4JE, UK",
    ],
    AUD: [
      "Beneficiary: Dpm Diving",
      "Account number: 209258620",
      "BSB: 774-001",
      "BIC/SWIFT: TRWIAUS1XXX",
      "Bank: Wise Australia Pty Ltd, Suite 1, Level 11, 66 Goulburn Street, Sydney, NSW, 2000, Australia",
    ],
    USD: KT_USD_BLOCK,
    THB: [
      "Beneficiary: Dpm diving",
      "Bank: Bangkok Bank",
      "Account number: 7310135871",
    ],
    // IDR intentionally omitted — KT is Thailand.
  },

  // Miguel 2026-06-07 — complete bank details (3 messages: image, THB
  // follow-up, full address + GBP BIC follow-up). See
  // `reference/koh-phi-phi-2026-06-07-phi-phi-bank-details.md`
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

/**
 * Whether (sede, currency) has a configured bank block. Use this BEFORE
 * invoking `solicitar_deposito` to decide whether to accept the
 * customer's currency choice or push back with the supported list.
 * Per the 2026-06-16 audit (Tony GA pilot, Miguel confirmations), the
 * support matrix is:
 *
 *   • GT: EUR / GBP / AUD / USD / IDR
 *   • GA: EUR / GBP / AUD / USD (silently shared with KT) / IDR
 *   • NP: EUR / GBP / AUD / IDR     ← NO USD (Miguel explicit)
 *   • KT: EUR / GBP / AUD / USD / THB   ← NO IDR (Thailand)
 *   • PP: EUR / GBP / AUD / USD / THB
 */
export function sedeSupportsCurrency(
  sedeNombre: string,
  currency: DepositCurrency,
): boolean {
  return BANK_BLOCKS_BY_SEDE[sedeNombre]?.[currency] !== undefined;
}

/** Currencies supported by a sede. Used to compose the customer-facing
 *  rejection message ("la sede acepta X, Y, Z"). */
export function supportedCurrenciesForSede(
  sedeNombre: string,
): DepositCurrency[] {
  const blocks = BANK_BLOCKS_BY_SEDE[sedeNombre];
  if (!blocks) return [];
  return Object.keys(blocks) as DepositCurrency[];
}

/**
 * Resolve the bank block lines for (sede, currency). Throws when the
 * sede × currency combination isn't configured — callers must gate
 * with `sedeSupportsCurrency()` first. The old behavior of falling
 * back to Gili Trawangan silently caused the 2026-06-16 GA pilot
 * incident: GA's customers were receiving GT's bank details for any
 * currency GA hadn't seeded, including the wrong corporate entity on
 * the beneficiary line. Loud failure is the right default — quiet
 * fallback hides bugs that move money to the wrong account.
 */
function lookupBankBlock(
  sedeNombre: string,
  currency: DepositCurrency,
): string[] {
  const sedeBlocks = BANK_BLOCKS_BY_SEDE[sedeNombre];
  if (sedeBlocks?.[currency]) return sedeBlocks[currency]!;
  throw new Error(
    `bank_block_not_configured: sede="${sedeNombre}" currency="${currency}". ` +
      `Either add an explicit block to BANK_BLOCKS_BY_SEDE or reject the ` +
      `currency upstream via sedeSupportsCurrency().`,
  );
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
