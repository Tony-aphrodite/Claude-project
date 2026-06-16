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

> **🚨 REGLA ABSOLUTA 2026-06-16 (Tony PM 2nd round):** los números
> de cuenta, IBAN, BSB, sort code, routing number y beneficiario
> exactos **YA NO ESTÁN EN ESTA KB**. La única fuente válida es la
> respuesta de la herramienta `solicitar_deposito` — que el server
> lee de `BANK_BLOCKS_BY_SEDE` (apps/server/src/services/deposit-
> instructions.ts). Si necesitás darle al cliente los datos del
> depósito, **tenés que invocar la herramienta**, no hay otra manera
> de obtenerlos.

### Monedas soportadas

| Moneda | Banco | Soportado? |
|--------|-------|------------|
| EUR | Wise Brussels | ✅ Sí |
| GBP | Wise London | ✅ Sí |
| AUD | Wise Sydney | ✅ Sí |
| USD | Cuenta corporativa de Koh Tao (CFSB NY) — silenciosa | ✅ Sí (compartida) |
| IDR | Bank Mandiri | ✅ Sí (solo desde cuentas indonesias locales) |

### Por qué removimos los números de cuenta

Caso real Tony 2026-06-16 PM: el AI tipeó IBAN + datos bancarios
directamente desde la KB SIN invocar `solicitar_deposito`. Resultado:
no se generó `ref_code` único, no transicionó `lead_stage` a
`deposit_pending`, no funcionó la OCR del PDF recibido. El cliente
recibió una línea "Referencia: [nombre del cliente] – [programa]
[fecha]" inventada, en vez del código real `DPM-GA-MMDD-XXXXXX` que
necesita el equipo de Miguel para reconciliar.

Con los números fuera de la KB, la única salida es la herramienta.

### Procedimiento correcto

1. Cliente confirma programa + fecha + pax + moneda explícitamente
2. Invocás `solicitar_deposito(sede_id, moneda_cliente, pax, programas)`
3. La herramienta devuelve `ref_code` + `instrucciones` (bloque
   bancario formateado en el idioma del cliente)
4. Copiás **literalmente** el bloque que devuelve la tool, sin
   reformatear, sin tipear datos de memoria
5. Termina con la línea `Reference: DPM-GA-MMDD-XXXXXX` (la tool ya
   la incluye en `instrucciones`)

### Nota especial USD

Cuando el cliente elige USD, la tool devuelve la cuenta corporativa
de Koh Tao (Community Federal Savings Bank, NY) — beneficiario
"Dpm Diving" (sin sufijo LLC). Si el cliente pregunta por qué el
beneficiario es "Dpm Diving" y no "DPM Diving Gili Air LLC":
*"Es nuestra cuenta corporativa para USD, todo va al mismo grupo 🤿"*.

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
