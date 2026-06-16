# KB-02 — Pagos, Cuentas Bancarias y Depósito

**Sede:** Gili Air
**Última actualización:** 2026-05-15
**Versión:** v1.0

---

## Regla fundamental {#regla-fundamental}

**Sin depósito = sin reserva.** No se puede garantizar un lugar en el barco hasta recibir confirmación de pago.

Decirlo siempre:
- 🇬🇧 EN: "Kindly remember that we won't be able to lock your space until we receive the payment confirmation."
- 🇪🇸 ES: "Recuerda que no podremos bloquear tu plaza hasta que recibamos la confirmación del pago."

---

## Métodos de pago para depósito {#metodos}

- **Wise, Revolut, N26** o transferencia bancaria en: EUR, GBP, AUD, USD
- **IDR:** solo desde cuenta bancaria indonesia local. No se acepta IDR desde el extranjero.
- **NO hay Stripe** en Indonesia (Gili Air, Gili T, Nusa Penida)

---

## Monto del depósito {#monto}

| Moneda | Depósito por persona |
|--------|----------------------|
| EUR | 40 EUR |
| GBP | 40 GBP |
| AUD | 40 AUD |
| USD | 40 USD (usar cuenta USD de Koh Tao — silencioso, confirmar con oficina) |
| IDR | 700,000 IDR (solo desde banco indonesio local) |

---

## Cuentas bancarias DPM Gili Air {#cuentas}

> **Nota interna 2026-06-16 (Miguel via Tony):** Estos datos son SOLO
> referencia interna — Colomba NUNCA debe tipearlos directamente al
> cliente. El cliente recibe únicamente lo que devuelve la herramienta
> `solicitar_deposito` (que lee de `BANK_BLOCKS_BY_SEDE` en código).
> Anteriormente la KB listaba estas cuentas a nombre de "Hari
> Rahmadiansyah" (titular anterior); Miguel migró a la LLC y los
> nombres corporativos son los que figuran abajo.

### EUR — Wise

- **Beneficiario:** DPM Diving Gili Air LLC
- **IBAN:** BE26 9050 6838 7229
- **BIC/SWIFT:** TRWIBEB1XXX
- **Banco:** Wise, Rue du Trône 100, 3rd floor, Brussels, 1050, Belgium

### GBP — Wise (London)

- **Beneficiario:** DPM Diving Gili Air LLC
- **Account number:** 59488146
- **Sort code:** 23-08-01
- **IBAN:** GB37 TRWI 2308 0159 4881 46
- **BIC/SWIFT:** TRWIGB2LXXX
- **Banco:** Wise Payments Limited, 1st Floor, Worship Square, 65 Clifton Street, London EC2A 4JE, United Kingdom

### AUD — Wise (Sydney)

- **Beneficiario:** DPM Diving Gili Air LLC
- **Account number:** 222597691
- **BSB:** 774-001
- **BIC/SWIFT:** TRWIAUS1XXX
- **Banco:** Wise Australia Pty Ltd, Suite 1, Level 11, 66 Goulburn Street, Sydney, NSW, 2000, Australia

### IDR — Bank Mandiri

- **Beneficiario:** PT DALAM PROFESSIONAL MENYELAM
- **Banco:** Bank Mandiri
- **Account number:** 161001392624-6
- **Solo aceptado desde cuentas indonesias locales**

### USD — cuenta corporativa de Koh Tao (silenciosa)

- Se usa la cuenta USD del centro de Koh Tao (Community Federal Savings Bank, NY)
- Beneficiario en la transferencia: "Dpm Diving" (sin sufijo LLC — es la entidad de Koh Tao)
- Si el cliente pregunta por qué el beneficiario es "Dpm Diving" en vez de "DPM Diving Gili Air LLC": *"Es nuestra cuenta corporativa para USD, todo va al mismo grupo 🤿"*
- El número de cuenta lo devuelve la herramienta — NO lo memorices ni inventes

---

## Pago al llegar (saldo restante) {#saldo}

- **Efectivo en IDR** – sin cargo adicional ✓ (preferido)
- **Transferencia bancaria** (EUR/GBP/AUD/USD) – cargo del 3%
- **Tarjeta de crédito/débito** – cargo del 3%
- Se acepta pago con tarjeta en el centro. Sin Stripe.

---

## Sugerencia de moneda por prefijo telefónico {#prefijos}

| Prefijo | Moneda sugerida |
|---------|-----------------|
| +33, +34, +39, +49, +31, +32, +46, +47, +45, +358, +351, +30, +43, +41, +420 | EUR |
| +44 | GBP |
| +61 | AUD |
| +1 | USD |
| +62 | IDR |

**Importante:** Esta sugerencia es solo un HINT. El cliente confirma la moneda antes de que Colomba invoque `solicitar_deposito`. Un cliente +62 puede preferir EUR/USD igual que un +34 puede preferir IDR desde un banco local.

---

## Comprobantes {#comprobantes}

- **EUR / GBP / AUD / USD:** solo PDF descargado del banco (Wise, Revolut, N26 generan PDF oficial)
- **IDR:** screenshot del banco indonesio aceptado (Mandiri, BCA, BRI, BNI)
- **Capturas borrosas o sin datos visibles:** pedir nueva con datos completos visibles (beneficiario, monto, fecha, referencia)
- **El cliente debe usar el código de referencia** generado por `solicitar_deposito` (formato `DPM-GA-MMDD-XXXXXX`)

---

## Política de cancelación y reembolso {#cancelacion}

- **Los depósitos NO son reembolsables** bajo ninguna circunstancia
- Siempre se puede **cambiar la reserva a otra fecha o sede DPM** sin cargo adicional
- Si el cliente cancela por razones médicas (food poisoning, lesión, enfermedad): el depósito se mueve a otra fecha o sede

**Frase oficial:**
- 🇬🇧 EN: "While deposits are non-refundable, you can always change your reservation to a different date or another DPM location at no additional charge."
- 🇪🇸 ES: "Si bien el depósito no es reembolsable, siempre puedes cambiar tu reserva a otra fecha u otra sede DPM sin cargo adicional."
