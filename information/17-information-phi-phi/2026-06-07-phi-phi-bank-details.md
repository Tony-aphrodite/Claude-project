# Phi Phi bank details for deposits — Miguel 2026-06-07

Source: Image of "4. DEPÓSITO PARA RESERVA" section sent by Miguel +
follow-up THB details message.

## Status

**NOT YET WIRED INTO CODE.** Today the AI uses Gili Trawangan bank
details for EVERY sede including Phi Phi → if a Phi Phi customer pays,
the money goes to the wrong account. Critical gap to fix before any
real Phi Phi venta.

Waiting on 4 final clarifications before coding (see "Open questions"
below).

## Deposit amount

- EUR / GBP / AUD / USD: **40 per person** (same as Gili Trawangan)
- IDR: N/A (Phi Phi is Thailand, not Indonesia)
- THB: **1,000 per person** (confirmed Miguel 2026-06-07 follow-up)
- Stripe: 40 USD / pax (fixed prices in the link for 1/2/3 pax)

## Bank accounts

### EUR (full details Miguel 2026-06-07)
- Beneficiary: DPM Diving Phi Phi LLC
- IBAN: BE90 9050 3751 2432
- Swift/BIC: TRWIBEB1XXX
- Bank: Wise, Rue du Trône 100, 3rd floor, Brussels, 1050, Belgium

### GBP (BIC + full address added Miguel 2026-06-07)
- Beneficiary: DPM Diving Phi Phi LLC
- Account number: 29276236
- Sort code: 23-14-70
- IBAN: GB55 TRWI 2314 7029 2762 36
- **Swift/BIC: TRWIGB2LXXX** (was missing in original image)
- Bank: Wise Payments Limited, 1st Floor, Worship Square, 65 Clifton Street, London, EC2A 4JE, United Kingdom

### AUD (BIC confirmed Miguel 2026-06-07)
- Beneficiary: DPM Diving Phi Phi LLC
- Account number: 221638707
- BSB code: 774-001 (with hyphen)
- **Swift/BIC: TRWIAUS1XXX** (confirmed — same as our pre-emptive assumption)
- Bank: Wise Australia Pty Ltd, Suite 1, Level 11, 66 Goulburn Street, Sydney, NSW, 2000, Australia

### USD (account type + full address added Miguel 2026-06-07)
- Beneficiary: **"Francisco Jose Augier"** (personal name — show as-is, option A)
- Account number: 8313706669
- **Account type: Checking**
- Routing number (wire and ACH): 026073150
- Swift/BIC: CMFGUS33
- Bank: Community Federal Savings Bank, 89-16 Jamaica Ave, Woodhaven, NY, 11421, United States

### THB (Miguel 2026-06-07 first follow-up)
- Bank: SCB (Siam Commercial Bank)
- Account Holder: Dpm diving koh phiphi
- Account Number: 5722989108
- BIC: SICOTHBKXXX

### Stripe (Miguel 2026-06-07 confirmed logic)
- **Link**: https://buy.stripe.com/28E5kC8mXakL3VT3jk4AU47
- **Amount**: **1,000 THB per person** (fixed — note: charges in THB, not USD)
- **Multi-pax behavior**: customer uses the SAME link N times (one charge per
  person). For 4 pax → 4 separate Stripe transactions of 1,000 THB each.
- Note: this is the SAME amount as the THB bank deposit (1,000 THB/pax),
  so the customer's total deposit cost is identical regardless of method.

## Open questions for Miguel — ALL ANSWERED ✅

✅ ~~THB amount per person~~ → **1,000 THB** confirmed 2026-06-07
✅ ~~USD beneficiary name~~ → **"Francisco Jose Augier"** as-is, option A
✅ ~~AUD BIC~~ → **TRWIAUS1XXX** confirmed (matches our pre-emptive assumption)
✅ ~~Stripe logic~~ → **1,000 THB per pax, link reused N times for N pax**

Remaining UX detail (NOT blocking, can ask later):
- Stripe webhook integration for auto-confirmation? Today the AI sends
  the Stripe link and the operator manually confirms the payment in
  the panel. If Miguel sets up a Stripe webhook → our server could
  receive payment_succeeded events and auto-mark deposit_paid. Defer.

## What to implement when answers arrive

Refactor `apps/server/src/services/deposit-instructions.ts`:

- Change `BANK_BLOCKS_EN` from `Record<DepositCurrency, string[]>` to
  `Record<SedeKey, Record<DepositCurrency, string[]>>`
- Add `BANK_BLOCKS_BY_SEDE["Koh Phi Phi"]` populated from this file
- `buildPaymentInstructions(input)` gains `sedeKey: SedeKey` parameter
  → looks up `BANK_BLOCKS_BY_SEDE[sedeKey][currency]` first, falls back
  to GT if sede has no block configured (legacy safety net)
- If THB confirmed: add "THB" to `SUPPORTED_DEPOSIT_CURRENCIES` enum
  + `DEPOSIT_AMOUNTS.THB = <amount>` in shared/types.ts
- If Stripe confirmed: separate flow — likely a new `OutboundStripeLink`
  type alongside the bank-block flow

Update `process-message.ts solicitarDepositoHandler`:
- Pass `sede.nombre` (cast as SedeKey) to `buildPaymentInstructions`

Tests:
- Per-sede bank block selection (Phi Phi USD ≠ GT USD)
- Fallback to GT when sede not configured
- THB enum + amount (when activated)

Estimated effort once Miguel confirms: ~1 hour incl. tests.
