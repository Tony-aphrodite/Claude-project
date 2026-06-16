# Bank details for ALL sedes — Miguel via Tony 2026-06-16

Canonical source after the GA pilot exposed that the existing KB had personal-name Wise accounts ("Hari Rahmadiansyah") instead of the corporate LLC accounts Miguel wanted to surface to customers. Tony is forwarding Miguel's correct details for every sede so we can re-seed `BANK_BLOCKS_BY_SEDE` + each sede's KB.

Trigger: Bug 6 in [[feedback_tony_2026_06_16_ga_pilot]]. Hard-blocker before GA / NP / KT see real customers.

---

## Gili Trawangan — DPM Diving Gili T LLC

### EUR — Wise Brussels (SEPA)

- **Beneficiary:** DPM Diving Gili T LLC
- **IBAN:** BE93 9050 6891 4867
- **BIC/SWIFT:** TRWIBEB1XXX
- **Bank:** Wise, Rue du Trône 100, 3rd floor, Brussels, 1050, Belgium

### GBP — Wise Payments Ltd London

- **Beneficiary:** DPM Diving Gili T LLC
- **Account number:** 55834953
- **Sort code:** 23-08-01
- **IBAN:** GB52 TRWI 2308 0155 8349 53
- **BIC/SWIFT:** TRWIGB2LXXX
- **Bank:** Wise Payments Limited, 1st Floor, Worship Square, 65 Clifton Street, London, EC2A 4JE, United Kingdom

### USD — Wise US Inc (Wilmington, DE) ⚠️ CHANGED from previous

- **Beneficiary:** DPM Diving Gili T LLC
- **Account type:** Deposit
- **Account number:** 496290465973320
- **Routing number (wire and ACH):** 084009519
- **BIC/SWIFT:** TRWIUS35XXX
- **Bank:** Wise US Inc, 108 W 13th St, Wilmington, DE, 19801, United States

**Note:** Previous code had USD under "Dpm Diving" at Community Federal Savings Bank NY (account 822000685807). New canonical is Wise US under DPM Diving Gili T LLC. Update `BANK_BLOCKS_BY_SEDE["Gili Trawangan"].USD` to match.

### AUD — Wise Australia Sydney

- **Beneficiary:** DPM Diving Gili T LLC
- **Account number:** 222625669
- **BSB code:** 774-001
- **BIC/SWIFT:** TRWIAUS1XXX
- **Bank:** Wise Australia Pty Ltd, Suite 1, Level 11, 66 Goulburn Street, Sydney, NSW, 2000, Australia

### IDR — Bank Mandiri

- **Account holder:** PT DALAM PROFESIONAL MENYELAM
- **Bank:** Bank Mandiri
- **Bank code:** 80017
- **Account number:** 1610010570609

**Note:** Previous code had holder as "Dalam Professional Menyelam" (without PT prefix) and omitted the bank code. Update to "PT DALAM PROFESIONAL MENYELAM" + add bank code line.

---

## Koh Phi Phi — DPM Diving Phi Phi LLC

(awaiting from Tony)

## Gili Air — DPM Diving Gili Air LLC

### EUR — Wise Brussels (SEPA)

- **Beneficiary:** DPM Diving Gili Air LLC
- **IBAN:** BE26 9050 6838 7229
- **BIC/SWIFT:** TRWIBEB1XXX
- **Bank:** Wise, Rue du Trône 100, 3rd floor, Brussels, 1050, Belgium

### GBP — Wise Payments Ltd London

- **Beneficiary:** DPM Diving Gili Air LLC
- **Account number:** 59488146
- **Sort code:** 23-08-01
- **IBAN:** GB37 TRWI 2308 0159 4881 46
- **BIC/SWIFT:** TRWIGB2LXXX
- **Bank:** Wise Payments Limited, 1st Floor, Worship Square, 65 Clifton Street, London, EC2A 4JE, United Kingdom

### AUD — Wise Australia Sydney

- **Beneficiary:** DPM Diving Gili Air LLC
- **Account number:** 222597691
- **BSB code:** 774-001
- **BIC/SWIFT:** TRWIAUS1XXX
- **Bank:** Wise Australia Pty Ltd, Suite 1, Level 11, 66 Goulburn Street, Sydney, NSW, 2000, Australia

### IDR — Bank Mandiri

- **Account holder:** PT DALAM PROFESSIONAL MENYELAM
- **Bank:** Bank Mandiri
- **Account number:** 161001392624-6

### USD — uses Koh Tao's CFSB account (silent shared) — Miguel via Tony 2026-06-16

GA does NOT have its own USD account. When a GA customer requests USD, the deposit instructions use Koh Tao's USD block silently:

- **Beneficiary:** Dpm Diving
- **Account number:** 822000685807
- **Routing number:** 026073150
- **BIC/SWIFT:** CMFGUS33
- **Bank:** Community Federal Savings Bank, 89-16 Jamaica Ave, Woodhaven, NY, 11421, United States

**Customer-facing behavior:** Colomba presents this as if it were GA's account. If the customer asks why the beneficiary is "Dpm Diving" instead of "DPM Diving Gili Air LLC", answer per the existing prompt rule: *"Es nuestra cuenta corporativa para USD, todo va al mismo grupo 🤿"*.

**Implementation note:** in `BANK_BLOCKS_BY_SEDE`, populate `["Gili Air"].USD` with the same KT lines (not a fallback — an explicit copy so the code reads sede-locally and we don't accidentally drift). Reconciliation: Miguel/team handle that off-system — the payment lands in the KT-named CFSB account and the GA office cross-references via the DPM-GA-... reference code.

---

## 🚨 KEY DISCOVERY (Tony + Miguel 2026-06-16)

**Miguel disavows the "Hari Rahmadiansyah" name entirely.** Verbatim: *"Hari Rahmadiansyah no se quien es nunca te envié esa cuenta"* — "I don't know who Hari Rahmadiansyah is, I never sent you that account."

Yet the IBAN / account numbers in the old KB (`KB02_pagos_cuentas.md`) match the new canonical exactly:

| Currency | Old KB (account #) | New canonical (account #) | Match? |
|----------|-------------------|---------------------------|--------|
| EUR | BE26 9050 6838 7229 | BE26 9050 6838 7229 | ✓ |
| GBP | 59488146 | 59488146 | ✓ |
| AUD | 222597691 | 222597691 | ✓ |
| IDR | 161001392624-6 | 161001392624-6 | ✓ |

The numbers always pointed to GA's real Wise rails. The **name "Hari Rahmadiansyah" was injected into our KB by an unknown source** (NOT Miguel — he doesn't recognize it). Best guesses for the origin:

- A previous consultant / dev who reverse-engineered from partial info;
- A stale snapshot from a name Wise used to display for the account holder before Miguel migrated to the LLC;
- A mismatch that's been there since project bootstrap and nobody ever cross-checked against Miguel.

Either way, the name is to be **purged from every file** — KB02, KB07, COLOMBA_KB_BUNDLE, FEW_SHOTS, anywhere it appears. Replace with the LLC beneficiary names from the canonical blocks above.

Fix shape:
1. Every KB stanza that mentions "Hari Rahmadiansyah" → replace with the correct LLC beneficiary (`DPM Diving Gili Air LLC` for EUR/GBP/AUD Wise; `PT DALAM PROFESSIONAL MENYELAM` for IDR).
2. `BANK_BLOCKS_BY_SEDE["Gili Air"]` populated explicitly with the 5 currency blocks (EUR, GBP, AUD, IDR with LLC name; USD = silent copy of KT's CFSB block).
3. Operational scrub: search `grep -r "Hari Rahmadiansyah" /home/ph/Client/Claude-project/` and zero out every hit.

## Nusa Penida — DPM Diving Nusa Penida LLC

### EUR — Wise Brussels (SEPA)

- **Beneficiary:** DPM Diving Nusa Penida LLC
- **IBAN:** BE57 9050 6281 0335
- **BIC/SWIFT:** TRWIBEB1XXX
- **Bank:** Wise, Rue du Trône 100, 3rd floor, Brussels, 1050, Belgium

### GBP — Wise Payments Ltd London

- **Beneficiary:** DPM Diving Nusa Penida LLC
- **Account number:** 83574365
- **Sort code:** 23-08-01
- **IBAN:** GB88 TRWI 2308 0183 5743 65
- **BIC/SWIFT:** TRWIGB2LXXX
- **Bank:** Wise Payments Limited, 1st Floor, Worship Square, 65 Clifton Street, London, EC2A 4JE, United Kingdom

### AUD — Wise Australia Sydney

- **Beneficiary:** DPM Diving Nusa Penida LLC
- **Account number:** 222430607
- **BSB code:** 774-001
- **BIC/SWIFT:** TRWIAUS1XXX
- **Bank:** Wise Australia Pty Ltd, Suite 1, Level 11, 66 Goulburn Street, Sydney, NSW, 2000, Australia

### IDR — Bank BPD Bali (Indonesia local)

- **Account holder:** PT DPM DIVING NUSA PENIDA
- **Bank:** Bank BPD Bali
- **Bank code:** 1290013
- **Account number:** 0230202084015

### USD — ❌ NOT SUPPORTED (Miguel 2026-06-16, confirmed via Tony)

Miguel explicit: *"Nusa Penida no usa cuenta en dólares"*. NP rejects USD entirely — unlike GA which silently routes USD to KT, NP simply does not accept USD as a deposit currency.

The old NP KB (`KB06_David_NusaPenida.md`) wrongly listed a shared "Community Federal Savings Bank" account 822000685807 under "Dpm Diving" — that's actually KT's USD account, never NP's.

**Implementation:** when a NP customer asks for USD, `solicitar_deposito` returns a structured rejection (`sede_currency_not_supported`) and David's prompt offers EUR / GBP / AUD / IDR as alternatives. Suggested customer-facing line:

  - 🇪🇸 ES: *"En Nusa Penida aceptamos EUR / GBP / AUD / IDR — ¿con cuál te queda más cómodo?"*
  - 🇬🇧 EN: *"At Nusa Penida we accept EUR / GBP / AUD / IDR — which one works best for you?"*

## Koh Tao — beneficiary: "Dpm Diving" (no LLC suffix)

KT uses a different legal entity pattern than the Indonesia sedes — beneficiary is just "Dpm Diving" (Thailand-based; likely a different corporate structure than the BE-resident "DPM Diving Gili T LLC" etc.).

### EUR — Wise Brussels (SEPA)

- **Beneficiary:** Dpm Diving
- **IBAN:** BE02 9674 4543 1440
- **BIC/SWIFT:** TRWIBEB1XXX
- **Bank:** Wise, Rue du Trône 100, 3rd floor, Brussels, 1050, Belgium

### GBP — Wise Payments Ltd London

- **Beneficiary:** Dpm Diving
- **Account number:** 14569568
- **Sort code:** 23-14-70
- **IBAN:** GB18 TRWI 2314 7014 5695 68
- **BIC/SWIFT:** TRWIGB2LXXX
- **Bank:** Wise Payments Limited, 1st Floor, Worship Square, 65 Clifton Street, London, EC2A 4JE, United Kingdom

### USD — Community Federal Savings Bank (NY) ⚠️ NOT Wise

- **Beneficiary:** Dpm Diving
- **Account type:** Checking
- **Account number:** 822000685807
- **Routing number (wire and ACH):** 026073150
- **BIC/SWIFT:** CMFGUS33
- **Bank:** Community Federal Savings Bank, 89-16 Jamaica Ave, Woodhaven, NY, 11421, United States

**🚨 KEY DISCOVERY:** This CFSB account is the one that was in `BANK_BLOCKS_BY_SEDE["Gili Trawangan"].USD` until today. It actually belongs to **Koh Tao**, not GT. GT now has its own dedicated Wise US account (`496290465973320` — see GT block above).

The old "all DPM sedes share CFSB USD" model is GONE. The new model is:
- GT → own Wise US (Wilmington, DE)
- KT → CFSB (NY) ← this account
- NP → no USD
- GA → no USD (per Tony 2026-06-16 — pending Miguel confirm)
- PP → own dedicated USD (awaiting confirmation; old code had "Francisco Jose Augier" personal name)

### AUD — Wise Australia Sydney

- **Beneficiary:** Dpm Diving
- **Account number:** 209258620
- **BSB code:** 774-001
- **BIC/SWIFT:** TRWIAUS1XXX
- **Bank:** Wise Australia Pty Ltd, Suite 1, Level 11, 66 Goulburn Street, Sydney, NSW, 2000, Australia

### THB — Bangkok Bank (Thailand local) + Stripe (card)

Both payment rails active simultaneously — customer picks.

**Option A — Bank transfer (Bangkok Bank):**

- **Beneficiary:** Dpm diving
- **Bank:** Bangkok Bank
- **Account number:** 7310135871

**Option B — Stripe card link (Miguel confirmed 2026-06-16 via Tony — link still active):**

- **Link:** https://buy.stripe.com/8wMdUJcMCgBZ1K8bIK
- **Amount:** 1,000 THB per person (fixed)
- **Multi-pax:** customer uses the SAME link N times (one charge per person). For 4 pax → 4 separate Stripe transactions of 1,000 THB each.

### IDR — ❌ NOT SUPPORTED (KT is Thailand)

KT is in Thailand; IDR has no meaning there. Implementation should reject IDR for KT.
