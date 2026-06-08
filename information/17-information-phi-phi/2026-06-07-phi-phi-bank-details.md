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

### EUR
- Beneficiary: DPM Diving Phi Phi LLC
- IBAN: BE90 9050 3751 2432
- BIC: TRWIBEB1XXX
- Bank: Wise, Rue du Trône 100, Brussels

### AUD
- Beneficiary: DPM Diving Phi Phi LLC
- BSB: 774001
- Account: 221638707
- BIC: PENDING (image doesn't show one)

### GBP
- Beneficiary: DPM Diving Phi Phi LLC
- IBAN: GB55 TRWI 2314 7029 2762 36
- Sort: 23-14-70
- Cta: 29276236
- Bank: Wise, London

### USD
- Beneficiary: **"Francisco Jose Augier"** (personal name — confirmed by
  Miguel 2026-06-07 to show as-is to customer, option A)
- Cta: 8313706669
- Routing: 026073150
- BIC: CMFGUS33
- Bank: Community Federal Savings Bank, NY

### THB (confirmed 2026-06-07 follow-up)
- Bank: SCB (Siam Commercial Bank)
- Account Holder: Dpm diving koh phiphi
- Account Number: 5722989108
- BIC: SICOTHBKXXX

### Stripe
- Link: https://buy.stripe.com/28E5kC8mXakL3VT3jk4AU47
- Prices: 1 persona = 40 / 2 personas = 80 / 3 personas = 120 (USD)
- Note: link explicitly only shows 1/2/3 pax — 4+ behavior undefined

## Open questions for Miguel (REMAINING — 2)

✅ ~~THB amount per person~~ → **1,000 THB confirmed** 2026-06-07
✅ ~~USD beneficiary name~~ → **"Francisco Jose Augier" as-is** confirmed 2026-06-07

3. **AUD BIC** — still pending. Image doesn't show one for Phi Phi AUD.
   Pre-emptive ASSUMPTION used in code: `TRWIAUS1XXX` (Wise Australia
   universal BIC — same one GT uses, both accounts are at Wise based
   on BSB 774001 pattern). Miguel can correct if wrong. Safe default.

4. **Stripe logic** — still pending. Until Miguel confirms, the AI will
   NOT offer Stripe — only bank transfers via the 5 supported currencies
   (EUR/GBP/AUD/USD/THB). Stripe support deferred to a separate piece
   of work once we know: which currency, behavior for 4+ pax, manual or
   webhook confirmation.

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
