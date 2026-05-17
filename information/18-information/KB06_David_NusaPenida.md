# KB-06 | PAYMENTS AND DEPOSITS — DPM DIVING NUSA PENIDA

---

## DEPOSIT RULES

- **Deposit amount:** 40 EUR / USD / GBP / AUD per diver — OR — 500,000 IDR cash per diver (only at office)
- **Deposits are NON-REFUNDABLE**
- Reservations can be moved to different dates or any other DPM branch at no extra cost
- **Group of 2+ people:** ONE single transfer for the total (e.g., 2 people = 80 EUR)
- **PDF receipt is PREFERRED** (downloaded from payment app)
- **Screenshot is ACCEPTABLE** as fallback if the customer cannot send PDF — verify on screen that the image shows: amount, date, beneficiary name (DPM Diving Nusa Penida), and transfer status (completed/successful). The office will double-check on their end.
- If deposit doesn't arrive within 24h, the office contacts the customer directly
- Rest of payment: cash IDR or same transfer method at the dive center on arrival

---

## CRITICAL: NO CARD TERMINAL IN NUSA PENIDA

**There is NO credit/debit card terminal in Nusa Penida.** Unlike Koh Tao (Stripe) or other branches, Nusa Penida does not accept card payments — not for deposit, not for balance.

When a client asks for card:
- EN: "Unfortunately we don't have a card terminal in Nusa Penida 🙏 But Wise and Revolut have zero fees. The deposit is just 40 EUR/USD and the rest you pay in cash IDR when you arrive. Which currency works best for you?"
- ES: "Lamentablemente no tenemos terminal de tarjeta en Nusa Penida 🙏 Pero por Wise y Revolut no hay ningún cargo. El depósito son solo 40 EUR/USD y el resto en efectivo IDR al llegar. ¿Qué moneda prefieres?"

---

## CUSTOMER CANNOT PAY DEPOSIT IN ADVANCE — FALLBACK

If the customer says they cannot pay the deposit before arriving (no Wise, no Revolut, no friend to send for them):
- David does NOT confirm boat space
- Offer this option:
  - EN: "If you can't process the deposit right now, you're welcome to stop by our office when you arrive — but I can't guarantee we'll have space on the boat that day 🙏 The safest is to contact the office directly at +62 812-3769-3299 to coordinate."
  - ES: "Si no podés procesar el depósito ahora, podés pasar por nuestra oficina al llegar — pero no te puedo garantizar lugar en el barco ese día 🙏 Lo más seguro es contactar la oficina directamente al +62 812-3769-3299 para coordinar."
- Pass office phone +62 812-3769-3299
- Internal note: "Cliente no puede pagar depósito — derivado a oficina, sin garantía de espacio"
- Lifecycle stays at "New Lead"

---

## STEP 1 — DETECT CURRENCY BY PHONE PREFIX

| Prefix | Currency |
|---|---|
| +34 Spain, +33 France, +49 Germany, +39 Italy, +31 Netherlands, +32 Belgium, +41 Switzerland, +43 Austria, +351 Portugal, +45 Denmark, +46 Sweden, +47 Norway, +358 Finland, +353 Ireland, +30 Greece, +48 Poland, +420 Czech, +36 Hungary, +40 Romania | **EUR** |
| +44 UK | **GBP** |
| +61 Australia | **AUD** |
| +1 USA/Canada, +52 Mexico, +55 Brazil, +57 Colombia, +58 Venezuela, +54 Argentina, +56 Chile, +51 Peru | **USD** |
| +62 Indonesia, or client already in Bali/Penida | **IDR cash** (500K/diver at office) |

When unsure or client doesn't have any of the above:
- EN: "What currency would you prefer for the deposit? EUR, USD, GBP or AUD? 😊"
- ES: "¿En qué moneda preferís pagar el depósito? EUR, USD, GBP o AUD? 😊"

---

## STEP 2 — SEND CORRECT PAYMENT BLOCK

Always preface with: *"Please download the PDF receipt and share it with us once the deposit is processed 🙏"* / *"Por favor descargá el comprobante en PDF y compartilo con nosotros una vez procesado el depósito 🙏"*

### 💶 EUR — Wise Brussels (most used)

"Here are the EUR payment details for DPM Diving Nusa Penida:

Account holder: DPM Diving Nusa Penida LLC
IBAN: BE57 9050 6281 0335
BIC: TRWIBEB1XXX
Bank: Wise — Rue du Trône 100, 3rd floor, Brussels 1050, Belgium

Amount: 40 EUR per person

Please download the PDF confirmation and share it with us 🙏"

**Quantity:** 1p=40 | 2p=80 | 3p=120 | 4p=160 EUR

Snippet: `NPEur`

---

### 💷 GBP — Wise London

"Here are the GBP payment details:

Account holder: DPM Diving Nusa Penida LLC
Account number: 83574365
Sort code: 23-08-01
IBAN: GB88 TRWI 2308 0183 5743 65
SWIFT/BIC: TRWIGB2LXXX
Bank: Wise Payments Limited, 1st Floor, Worship Square, 65 Clifton Street, London EC2A 4JE, UK

Amount: 40 GBP per person

Please download the PDF and share it with us 🙏"

Snippet: `NPGbp`

---

### 🇦🇺 AUD — Wise Australia

"Here are the AUD payment details:

Account holder: DPM Diving Nusa Penida LLC
BSB code: 774001
Account number: 222430607
Bank: Wise Australia

Amount: 40 AUD per person

Please download the PDF and share it with us 🙏"

Snippet: (use direct data — no specific QR assigned)

---

### 💵 USD — Community Federal Savings Bank (shared with all DPM branches)

"Here are the USD payment details:

Name: Dpm Diving
Account number: 822000685807
Account type: Checking
Routing number (Wire and ACH): 026073150
SWIFT/BIC: CMFGUS33
Bank: Community Federal Savings Bank, 89-16 Jamaica Ave, Woodhaven, NY 11421, USA

Amount: 40 USD per person

Please download the PDF and share it with us 🙏"

Snippet: `GENENUSDAccount` / `GENESUSDAccount`

---

### 🇮🇩 IDR LOCAL — BPD Bali (for clients in Indonesia or paying locally)

"Para pagos locales en Indonesia:

Titular: PT DPM DIVING NUSA PENIDA
Banco: BPD Bali
Número de cuenta: 0230202084015

Monto: 500,000 IDR por buceador

Por favor descargá el comprobante y compartilo con nosotros 🙏"

**Use only for clients already in Indonesia or paying from an Indonesian bank.**

---

### Cash IDR walk-in (in-office)

For clients arriving in person at the dive center:
- 500,000 IDR per diver cash deposit
- Paid directly at the office
- No PDF needed — receipt issued by office
- Walk-in workflow: David confirms boat space → client arrives → office processes cash + paperwork

---

## STEP 3 — VERIFY PROOF OF PAYMENT (PDF OR SCREENSHOT)

When proof arrives:

- **PDF preferred** — full details visible, less risk of issues
- **Screenshot acceptable** as fallback — verify ON SCREEN that the image shows:
  - Amount matches (40 × pax, or 500K IDR × pax for cash)
  - Date is recent (same day or day before)
  - Beneficiary shows "DPM Diving" or "DPM Diving Nusa Penida LLC"
  - Transfer status shows "completed" / "successful" / "paid" / "sent"

If all 4 items are visible → confirm booking, update lifecycle to **Payment + Customer**. Office will rechequear on their end.

If any item is missing or unclear:
- EN: "Could you send a clearer image (or the PDF if you have it)? I want to make sure I get all the details right before confirming 🙏"
- ES: "¿Me podés mandar una foto más clara o el PDF si lo tenés? Quiero confirmar todos los detalles antes de cerrar la reserva 🙏"

**Incorrect amount:**
- EN: "Received [X]. The deposit for [N] divers is [total] — could you send the remaining [difference]? 🙏"
- ES: "Recibí [X]. El depósito para [N] buceadores es [total] — ¿podés enviar el restante [diferencia]? 🙏"

If deposit doesn't arrive in DPM accounts within 24h after booking confirmed, office contacts the customer directly.

---

## STEP 4 — REMAINING BALANCE AT THE DIVE CENTER (on arrival)

Accepted on-site at the dive center:

- **Cash IDR** (preferred — no surcharge)
- **Cash USD/EUR/GBP/AUD** (currency exchange shops nearby)
- **Bank transfer** (same accounts as deposit) — **+3% surcharge** for processing

**NOT accepted on-site in Nusa Penida:**
- Credit/debit card (no terminal)
- PayPal
- Western Union
- Cryptocurrency

### About the 3% surcharge:
- Only applies to remaining balance paid by bank transfer on arrival
- Wise/Revolut/cash IDR → no surcharge
- For large bookings (6+ dives or groups 4+) → consult office to potentially waive the 3%

---

## PAYMENT FAQ — QUICK ANSWERS

| Question | Answer |
|---|---|
| Can I pay everything by Wise upfront? | Yes — total in EUR/USD/GBP/AUD by Wise, no surcharge |
| Can I pay the deposit with someone else's account? | Yes — what matters is the proof of payment matches |
| Can I use Revolut / N26? | Yes — same accounts as Wise, no surcharge |
| Is the deposit deducted from the final price? | Yes, the deposit goes toward your total |
| What if the bank rejects the transfer? | Switch to Wise (most reliable). If Wise fails, escalate to office |
| Can I pay everything in cash IDR? | Yes — deposit 500K/diver cash at office, balance also cash on arrival |
| Do I get a refund if I cancel? | No — deposit is non-refundable, but transferable to other dates/branches |
| Can I split the payment between 2 people? | One transfer for the total preferred — but doable, just send 2 PDFs |

---

## SAMPLE PAYMENT FLOW — STANDARD CASE

1. Client confirms program + date → David sends "What currency for the deposit?"
2. Client says "EUR" → David sends EUR account block + asks for PDF
3. Client sends PDF (or clear screenshot) → David verifies the 4 items (amount, date, beneficiary, status)
4. David confirms booking → moves lifecycle to Payment + Customer
5. David sends post-deposit sequence (6 separate messages as in KB-05)
6. Office verifies on their end within 24h (parallel process)

---

## CROSS-BRANCH PAYMENT NOTES

- A reservation can be moved to any other DPM branch (Koh Tao / Phi Phi / Gili Air / Gili T)
- If the client paid Nusa Penida's EUR account but wants to switch to Koh Tao, the deposit is recognized internally — no need to re-pay
- For new bookings at other branches, use that branch's bank accounts (each branch has its own)
