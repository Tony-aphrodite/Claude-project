# KB-03 — Pagos y Depósitos — Gili Trawangan

> Fuente: `DPM_AI_LAUNCH_GT_DOCUMENTO_COMPLETO4.md` §3 (2026-05-07).
> Reemplaza la versión anterior. Corrige el bug "40 IDR" del prompt
> v1 — el monto IDR es 700.000.

**Sede:** Gili Trawangan
**Tipo de depósito:** obligatorio, no reembolsable, transferible
**NO HAY STRIPE EN GILI TRAWANGAN.** Nunca enviar link de Stripe.
Para clientes USD se usa la cuenta de Koh Tao prestada (ver §
cuenta-usd).

---

## Política de depósito {#politica-deposito}

- **NO REEMBOLSABLE** bajo ninguna circunstancia
- **SÍ TRANSFERIBLE** — el cliente puede mover su reserva a otra
  fecha o a otra sede DPM (Koh Tao, Phi Phi, Gili Air, Nusa Penida)
  sin cargo adicional
- **Plazo de rebooking:** hasta 6 meses después de la fecha original
- **Mal clima:** se reprograma sin cargo
- Se descuenta del precio total del programa

### Frases clave para el cliente {#politica-frases}

Sobre la transferibilidad (cuando el cliente pregunta "¿y si me
cambian las fechas?"):

- 🇪🇸 ES: "El depósito no se reembolsa, pero podés cambiar la fecha
  o trasladarlo a cualquier sede DPM sin cargo, hasta 6 meses 😊"
- 🇬🇧 EN: "The deposit isn't refundable, but you can change the date
  or transfer to any DPM location at no extra charge, up to 6 months 😊"

### Si no puede pagar online {#politica-no-online}

Para clientes que no tienen Wise / Revolut / banco con
transferencias internacionales:
- Derivar a humano. NO inventar alternativas (no aceptar PayPal,
  Western Union, ni link de pago alternativo sin que el equipo lo
  apruebe).

---

## Pago del resto en el centro {#pago-resto}

El saldo se paga al llegar al centro:
- **IDR cash:** sin recargo
- **Tarjeta:** +3 % de cargo
- **Otra moneda extranjera cash:** consultar tipo de cambio en
  oficina

---

## Detección de moneda por prefijo telefónico {#deteccion-moneda}

| Prefijo | Moneda |
|---|---|
| +49, +43, +41, +33, +34, +39, +31, +32, +351 | EUR |
| +44 | GBP |
| +61 | AUD |
| +1 | USD |
| +62 | IDR |
| Otro / no detectable | preguntar al cliente las 5 opciones |

El servidor detecta el prefijo y le pasa una sugerencia a John en el
bloque dinámico. John usa la moneda sugerida al invocar
`solicitar_deposito`, salvo que el cliente pida explícitamente otra.

---

## Montos del depósito {#montos-deposito}

| Moneda | Monto |
|---|---|
| EUR | 40 EUR por persona |
| GBP | 40 GBP por persona |
| AUD | 40 AUD por persona |
| USD | 40 USD por persona (cuenta Koh Tao) |
| IDR | **700.000 IDR** por persona (solo desde banco indonesio local) |

⚠️ **IDR es 700.000, NO 40.** El prompt v1 tenía "40 unidades de
moneda local" que se traducía a 40 IDR (esencialmente cero). Bug
corregido.

---

## Cuentas bancarias por moneda {#cuentas-bancarias}

### Cuenta EUR — DPM Diving Gili T LLC {#cuenta-eur}

```
Beneficiario: DPM Diving Gili T LLC
IBAN: BE93 9050 6891 4867
BIC/SWIFT: TRWIBEB1XXX
Banco: Wise
Dirección banco: Rue du Trône 100, 3rd floor, Brussels, 1050, Belgium
```

- Para SEPA: usar IBAN directamente
- Para internacional fuera SEPA: usar IBAN + BIC

### Cuenta GBP — DPM Diving Gili T LLC {#cuenta-gbp}

```
Beneficiario: DPM Diving Gili T LLC
Número de cuenta: 55834953
Sort code: 23-08-01
IBAN: GB52 TRWI 2308 0155 8349 53
BIC/SWIFT: TRWIGB2LXXX
Banco: Wise Payments Limited
Dirección banco: 65 Clifton Street, London EC2A 4JE, UK
```

- Desde UK: número de cuenta + sort code
- Internacional: IBAN + BIC

### Cuenta AUD — DPM Diving Gili T LLC {#cuenta-aud}

```
Beneficiario: DPM Diving Gili T LLC
Número de cuenta: 222625669
BSB: 774-001
BIC/SWIFT: TRWIAUS1XXX
Banco: Wise Australia Pty Ltd
Dirección banco: Suite 1, Level 11, 66 Goulburn Street, Sydney NSW 2000, Australia
```

- Desde Australia: número de cuenta + BSB
- Internacional: BIC

### Cuenta USD — Dpm Diving (cuenta Koh Tao prestada) {#cuenta-usd}

> ⚠️ Nota interna (NO comunicar al cliente): No tenemos cuenta USD
> propia para las Gilis. Para clientes USD usar esta cuenta de Koh
> Tao. El cliente nunca necesita saberlo.

```
Beneficiario: Dpm Diving
Tipo de cuenta: Checking
Número de cuenta: 822000685807
Routing number (wire y ACH): 026073150
BIC/SWIFT: CMFGUS33
Banco: Community Federal Savings Bank
Dirección banco: 89-16 Jamaica Ave, Woodhaven, NY 11421, USA
```

- Desde USA: número de cuenta + routing number
- Internacional: BIC

### Cuenta IDR — Dalam Professional Menyelam {#cuenta-idr}

```
Beneficiario: Dalam Professional Menyelam
Banco: Bank Mandiri
Número de cuenta: 1610010570609
```

- Solo para clientes que paguen desde banco local indonesio
- NO usar para clientes desde el extranjero (caro y lento)

---

## Bloques de pago listos para copiar {#bloques-pago}

> Renderizados por el servidor (`deposit-instructions.ts`) con el
> código de referencia generado al activar `solicitar_deposito`.
> Texto en inglés siempre — los datos bancarios son neutros al
> idioma. La frase de encabezado y la de cierre se traducen al
> idioma del cliente.

### Bloque EUR {#bloque-eur}

```
Here are the EUR bank details for your deposit of 40 EUR 🙏

Beneficiary: DPM Diving Gili T LLC
IBAN: BE93 9050 6891 4867
BIC/SWIFT: TRWIBEB1XXX
Bank: Wise, Brussels, Belgium

Reference: DPM-GT-MMDD-XXXXXX

Once sent, please download and share the payment confirmation PDF 🙏
```

### Bloque GBP {#bloque-gbp}

Estructura idéntica al EUR — sustituir IBAN/sort code/BIC por los
datos GBP. Texto en inglés siempre.

### Bloque AUD {#bloque-aud}

Idéntico — datos AUD (account number + BSB + BIC).

### Bloque USD {#bloque-usd}

Idéntico — datos USD (account + routing + BIC + Community Federal
Savings Bank).

### Bloque IDR {#bloque-idr}

```
Here are the IDR bank details for your deposit of 700,000 IDR 🙏

Beneficiary: Dalam Professional Menyelam
Bank: Bank Mandiri
Account: 1610010570609

Reference: DPM-GT-MMDD-XXXXXX

Once sent, please share the payment confirmation 🙏
```

⚠️ Nota: el cierre del bloque IDR NO menciona "PDF" porque las apps
de banca móvil indonesia no exportan PDF fácil — se acepta
screenshot.

---

## Reglas de pago {#reglas-pago}

- Si el cliente tiene Wise o Revolut → sugerí EUR (más rápido)
- Wise con problemas de SEPA: "Try selecting international SEPA
  transfer — the account is based in Belgium"
- **Bizum: NUNCA aceptar.** Ver KB-04 §objecion-bizum.
- Comprobante: PDF del banco para EUR/GBP/AUD/USD; PDF o screenshot
  para IDR. NO fotos de pantalla del celular.
- Tarjeta en el centro: +3 % cargo. Solo efectivo IDR o transferencia
  sin recargo.

---

## Alerta IBAN — CRÍTICO {#alerta-iban}

El IBAN de Gili Trawangan es **DIFERENTE** al de Nusa Penida y al
de Gili Air. Si el cliente viene de una de esas dos sedes con un
IBAN antiguo cargado, John aclara SIEMPRE:

- 🇬🇧 EN: "Just to confirm — the Gili Trawangan account is different
  from Nusa Penida and Gili Air. Here are the correct details:"
- 🇪🇸 ES: "Solo para confirmar — los datos de Gili Trawangan son
  diferentes a los de Nusa Penida y Gili Air. Acá van los datos
  correctos:"

---

## Código de referencia {#codigo-referencia}

Formato: **`DPM-GT-MMDD-XXXXXX`**

- `DPM` = empresa
- `GT` = código de sede (Gili Trawangan)
- `MMDD` = mes y día (Asia/Makassar)
- `XXXXXX` = 6 alfanuméricos aleatorios (sin caracteres ambiguos
  0/O/1/I/L)

El servidor lo genera automáticamente al invocar `solicitar_deposito`
y lo escribe en dos lugares:
1. **Supabase** — `lead_metadata.ref_code` (auditoría del servidor)
2. **Respond.io** — campo custom de contacto `codigo_referencia`
   (para que el Logger del Sheet lo levante)

El cliente lo pone en el campo "concepto" / "referencia" / "memo"
de la transferencia bancaria.

---

## Validación del comprobante {#validacion-comprobante}

| Moneda | Formato aceptado |
|---|---|
| EUR / GBP / AUD / USD | PDF obligatorio (rechazar screenshots) |
| IDR | PDF o screenshot aceptados |

### Si el cliente manda screenshot en moneda extranjera

- 🇪🇸 ES: "Gracias 🙏 ¿Podés compartir la confirmación del banco en
  PDF en vez de captura? La mayoría de los bancos tienen una opción
  'Descargar' o 'Exportar PDF' en los detalles de la transacción.
  Necesitamos el PDF para validar la transferencia correctamente."
- 🇬🇧 EN: "Thanks 🙏 Could you share the bank confirmation as a PDF
  instead of a screenshot? Most banks have a 'Download' or
  'Export PDF' option in the transaction details. We need the PDF
  to validate the transfer properly."

### Validación automática del AI {#validacion-auto}

El AI valida el comprobante con OCR vía Anthropic Vision:
- Lee monto, moneda, código de referencia, beneficiario, fecha
- Compara con lo esperado para esa reserva

Confirma automáticamente cuando:
- ✅ Monto dentro del rango: monto esperado **−2 % a +10 %**
- ✅ Moneda coincide exactamente
- ✅ Código de referencia coincide (case-insensitive, sin espacios)

Escala a humano cuando:
- ❌ Monto < monto esperado − 2 % (`amount_too_low`)
- ❌ Monto > monto esperado + 10 % (`amount_too_high`, posible
  pago duplicado o error)
- ❌ Código de referencia distinto o ausente
- ❌ Moneda distinta a la esperada
- ❌ PDF ilegible o no parece comprobante válido
- ❌ Screenshot enviado en moneda extranjera (rechazo automático)

---

## Flujo de confirmación de reserva {#flujo-confirmacion}

1. AI invoca `solicitar_deposito` → genera código + envía bloque
   bancario
2. Cliente transfiere
3. **En paralelo:**
   - 📧 Wise envía notificación automática a `gilit@dpmdiving.com`
   - 📱 Cliente envía PDF al chat de WhatsApp
4. AI valida el PDF con OCR
5. Si OCR validado → AI auto-confirma:
   - Lead pasa a `deposit_paid`
   - Se envía mensaje de confirmación al cliente (programa, fecha,
     pedido de talles, link de Maps, hora de llegada)
   - Lead pasa a `handed_off`
   - Se notifica al equipo de GT (workflow de Respond.io disparado
     por el tag `deposit_paid`)
6. Si OCR no validado → escala a humano:
   - Lead se queda en `deposit_pending` con `ocr_result.mismatches`
     en metadata
   - Operador revisa en el panel y decide manualmente
