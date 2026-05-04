# KB-03 — Pagos y Depósitos — Gili Trawangan

**Sede:** Gili Trawangan
**Tipo de depósito:** obligatorio, no reembolsable
**Importante:** **NO HAY STRIPE EN GILI TRAWANGAN.** Nunca enviar link de Stripe.

---

## Política de depósito {#politica-deposito}

- **Monto:** 40 EUR / 40 GBP / 40 AUD / 40 USD por persona
- **IDR:** 700,000 IDR por persona, **solo si el cliente tiene cuenta bancaria local indonesia**
- **Reembolso:** no reembolsable
- **Cambios:** el cliente puede cambiar fecha o sede DPM sin cargo adicional
- **Resto del pago:** se hace al llegar al centro de buceo

### Frases clave para el cliente {#politica-frases}

- ES: "Recordá que no podemos bloquear tu lugar sin el depósito"
- ES: "Solo un depósito, el resto lo pagás en el centro al llegar"
- EN: "Just a deposit — the rest is paid at the center when you arrive"

### Si no puede pagar online {#politica-no-online}

- EN: "You're welcome to come by the school directly, but we can't hold your spot without the deposit 😊"
- ES: "Sos bienvenido a pasar directo por la escuela, pero no podemos guardarte el lugar sin el depósito 😊"

---

## Pago del resto en el centro {#pago-resto}

- **Efectivo IDR:** sin cargo adicional
- **Tarjeta de crédito o débito:** +3% (informar al cliente antes)

---

## Detección de moneda por prefijo telefónico {#deteccion-moneda}

| Prefijo | Moneda |
|---|---|
| +49, +43, +41, +33, +34, +39, +31, +32, +351 | EUR |
| +44 | GBP |
| +61 | AUD |
| +1 | USD (cuenta Koh Tao) |
| +62 | IDR |

Sin prefijo claro → preguntar moneda antes de enviar datos.

Frase para confirmar moneda detectada:
- EN: "I can see you're calling from [país] — would you like to pay in [moneda]?"
- ES: "Veo que escribís desde [país] — ¿te gustaría pagar en [moneda]?"

---

## Cuentas bancarias por moneda {#cuentas-bancarias}

> **Regla crítica:** enviar SOLO el bloque de la moneda del cliente. **Nunca todos juntos.** Los datos bancarios van SIEMPRE en un mensaje separado, después del precio y antes de la pregunta de cierre.

### Cuenta EUR {#cuenta-eur}

```
Beneficiary: DPM Diving Gili T LLC
IBAN: BE93 9050 6891 4867
BIC/SWIFT: TRWIBEB1XXX
Bank: Wise, Brussels, Belgium
```

- Transferencia SEPA: usar IBAN directamente
- Transferencia internacional (fuera SEPA): usar IBAN + BIC

### Cuenta GBP {#cuenta-gbp}

```
Beneficiary: DPM Diving Gili T LLC
Account number: 55834953
Sort code: 23-08-01
IBAN: GB52 TRWI 2308 0155 8349 53
BIC/SWIFT: TRWIGB2LXXX
Bank: Wise Payments Limited, London, UK
```

- Transferencia UK: usar Account number + Sort code
- Transferencia internacional: usar IBAN + BIC

### Cuenta AUD {#cuenta-aud}

```
Beneficiary: DPM Diving Gili T LLC
Account number: 222625669
BSB: 774-001
BIC/SWIFT: TRWIAUS1XXX
Bank: Wise Australia, Sydney
```

- Transferencia Australia: usar Account + BSB
- Transferencia internacional: usar BIC

### Cuenta USD — IMPORTANTE {#cuenta-usd}

> **Esta cuenta es de Koh Tao**, no de Gili Trawangan. La usamos para clientes USD de GT porque no tenemos cuenta USD propia en las Gilis. El cliente final no necesita saber esto.

```
Beneficiary: Dpm Diving
Account number: 822000685807
Routing number: 026073150
BIC/SWIFT: CMFGUS33
Bank: Community Federal Savings Bank, New York, USA
```

- Transferencia USA: usar Account + Routing number
- Transferencia internacional: usar BIC

### Cuenta IDR (solo banco local indonesio) {#cuenta-idr}

```
Beneficiary: Dalam Professional Menyelam
Bank: Bank Mandiri
Account: 1610010570609
```

**Solo para clientes que paguen desde cuenta bancaria local indonesia. Monto: 700,000 IDR por persona.**

---

## Bloques de pago listos para copiar {#bloques-pago}

> **Regla crítica:** copiar el bloque exacto, sin agregar nada.

### Bloque EUR {#bloque-eur}

```
Here are the EUR bank details for your deposit of 40 EUR 🙏
Beneficiary: DPM Diving Gili T LLC
IBAN: BE93 9050 6891 4867
BIC/SWIFT: TRWIBEB1XXX
Bank: Wise, Brussels, Belgium
Reference: [nombre cliente] + [fecha] + [programa]
Once sent, please download and share the payment confirmation PDF 🙏
```

### Bloque GBP {#bloque-gbp}

```
Here are the GBP bank details for your deposit of 40 GBP 🙏
Beneficiary: DPM Diving Gili T LLC
Account number: 55834953
Sort code: 23-08-01
IBAN: GB52 TRWI 2308 0155 8349 53
BIC/SWIFT: TRWIGB2LXXX
Bank: Wise Payments Limited, London, UK
Reference: [nombre cliente] + [fecha] + [programa]
Once sent, please download and share the payment confirmation PDF 🙏
```

### Bloque AUD {#bloque-aud}

```
Here are the AUD bank details for your deposit of 40 AUD 🙏
Beneficiary: DPM Diving Gili T LLC
Account number: 222625669
BSB: 774-001
BIC/SWIFT: TRWIAUS1XXX
Bank: Wise Australia, Sydney
Reference: [nombre cliente] + [fecha] + [programa]
Once sent, please download and share the payment confirmation PDF 🙏
```

### Bloque USD {#bloque-usd}

```
Here are the USD bank details for your deposit of 40 USD 🙏
Beneficiary: Dpm Diving
Account number: 822000685807
Routing number: 026073150
BIC/SWIFT: CMFGUS33
Bank: Community Federal Savings Bank, New York, USA
Reference: [nombre cliente] + [fecha] + [programa]
Once sent, please download and share the payment confirmation PDF 🙏
```

### Bloque IDR {#bloque-idr}

```
Here are the IDR bank details for your deposit of 700,000 IDR 🙏
Beneficiary: Dalam Professional Menyelam
Bank: Bank Mandiri
Account: 1610010570609
Reference: [nombre cliente] + [fecha] + [programa]
Once sent, please download and share the payment confirmation PDF 🙏
```

---

## Reglas de pago {#reglas-pago}

- Si el cliente tiene Wise o Revolut → sugerí EUR
- Wise con problemas: "Try selecting international SEPA transfer — the account is based in Belgium"
- **Bizum: NUNCA aceptar.** Ver `KB-04_sales_patterns.md#objecion-bizum`.
- Comprobante: PDF o captura del banco. **No fotos de pantalla del celular.**
- Tarjeta en el centro: +3% cargo. Solo efectivo IDR o transferencia sin recargo.

---

## Alerta IBAN — CRÍTICO {#alerta-iban}

El IBAN de Gili Trawangan es **DIFERENTE** al de Nusa Penida y al de Gili Air. Si el cliente viene de Nusa Penida o Gili Air → aclarar SIEMPRE:

- EN: "Just to confirm — the Gili Trawangan account is different from Nusa Penida and Gili Air. Here are the correct details:"
- ES: "Solo para confirmar — los datos de Gili Trawangan son diferentes a los de Nusa Penida y Gili Air. Acá van los datos correctos:"

---

## Flujo de confirmación de reserva {#flujo-confirmacion}

1. Cliente confirma programa, fecha y número de personas
2. John detecta moneda por prefijo telefónico o pregunta al cliente
3. John envía bloque bancario correspondiente — **SOLO ese bloque, nada más**
4. Cliente transfiere el depósito y envía comprobante PDF
5. John verifica monto y confirma reserva
6. John envía información post-reserva: pedir nombre completo, talla de camiseta (XS a 4XL), talla de calzado europeo. Enviar link de la escuela y pedir que pasen el día anterior entre 8am y 6pm para registro.

**Siempre pedir comprobante PDF antes de confirmar. No aceptar capturas de pantalla del celular.**

**Referencia de pago:** siempre `nombre + fecha + programa`.
