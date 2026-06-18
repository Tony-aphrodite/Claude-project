# Knowledge Base 03 — Pagos y Reservas
# DPM Diving Koh Phi Phi

---

## DEPÓSITO

**Monto:** 40 EUR / GBP / AUD / USD **por persona** (o equivalente vía Stripe THB — pendiente confirmar monto exacto con oficina).

**Sin depósito NO hay reserva.**

**Pasos:**
1. Confirmar programa + fecha + cantidad de personas
2. Preguntar moneda preferida (o detectar por prefijo del teléfono — ver tabla más abajo)
3. Enviar **inmediatamente** el bloque bancario correspondiente (no esperar a que confirme fecha)
4. Pedir comprobante — **PDF preferido**, screenshot aceptable como fallback (con verificación)

---

## DETECCIÓN AUTOMÁTICA DE MONEDA POR PREFIJO

Si conocés el número de teléfono del cliente, sugerí la moneda según el prefijo:

| Prefijo | País | Moneda sugerida |
|---|---|---|
| +34 | España | EUR |
| +33 | Francia | EUR |
| +49 | Alemania | EUR |
| +39 | Italia | EUR |
| +31 | Países Bajos | EUR |
| +32 | Bélgica | EUR |
| +41 | Suiza | EUR |
| +43 | Austria | EUR |
| +351 | Portugal | EUR |
| +45 | Dinamarca | EUR |
| +46 | Suecia | EUR |
| +47 | Noruega | EUR |
| +358 | Finlandia | EUR |
| +353 | Irlanda | EUR |
| +30 | Grecia | EUR |
| +48 | Polonia | EUR |
| +420 | Rep. Checa | EUR |
| +36 | Hungría | EUR |
| +40 | Rumania | EUR |
| +44 | Reino Unido | GBP |
| +61 | Australia | AUD |
| +1 | USA / Canadá | Stripe THB |
| +52 | México | Stripe THB |
| +55 | Brasil | Stripe THB |
| +63 | Filipinas | Stripe THB |
| Otros / sin prefijo claro | — | Preguntar |

**Frase de detección automática:**
- EN: "Looks like you might be in [country] — would EUR/GBP/AUD work for the deposit, or prefer card? 😊"
- ES: "Veo que estás en [país] — ¿te queda mejor pagar el depósito en [moneda] o con tarjeta? 😊"

Si no podés detectar:
- EN: "What currency would you prefer for the deposit? EUR, GBP, AUD, or card payment? 😊"
- ES: "¿Qué moneda preferís para el depósito? EUR, GBP, AUD o tarjeta? 😊"

---

## CUENTAS BANCARIAS

### 💶 EUR

```
Bank: Wise (TransferWise)
Name: DPM Diving Phi Phi LLC
IBAN: BE90 9050 3751 2432
Swift/BIC: TRWIBEB1XXX
Address: Wise, Rue du Trône 100, 3rd floor, Brussels, 1050, Belgium
```

Amount: 40 EUR per person | 2p = 80 | 3p = 120 | 4p = 160

### 💷 GBP

```
Bank: Wise Payments Limited
Name: DPM Diving Phi Phi LLC
Account number: 29276236
Sort code: 23-14-70
IBAN: GB55 TRWI 2314 7029 2762 36
Swift/BIC: TRWIGB2LXXX
Address: 56 Shoreditch High Street, London E1 6JJ
```

### 💵 USD

```
Bank: Community Federal Savings Bank
Name: Francisco Jose Augier
Account number: 8313706669
Account type: Checking
Routing number (wire & ACH): 026073150
Swift/BIC: CMFGUS33
Address: 89-16 Jamaica Ave, Woodhaven NY 11421
```

### 🇦🇺 AUD

```
Bank: Wise Australia Pty Ltd
Name: DPM Diving Phi Phi LLC
Account number: 221638707
BSB code: 774-001
Swift/BIC: TRWIAUS1XXX
Address: Suite 1, Level 11, 66 Goulburn Street, Sydney
```

### 🇹🇭 THB (cash o transferencia local)

```
Bank: SCB (Siam Commercial Bank)
Account holder: Dpm diving koh phiphi
Account number: 5722989108
BIC: SICOTHBKXXX
```

### 💳 Tarjeta (Stripe — débito o crédito)

```
Link: https://buy.stripe.com/00w7sK8mXdwX8c91bc4AU3J
```

Se puede usar el link más de una vez si paga por más de una persona.

---

## COMPROBANTE — REGLAS ACTUALIZADAS

### Preferimos PDF, aceptamos screenshot como fallback

**PDF preferido** porque muestra todos los detalles con menos riesgo de manipulación.

**Screenshot aceptable** si el cliente no puede mandar PDF, **siempre que se verifique visualmente** que el screenshot muestra:
1. **Monto correcto** (40 × N personas, en la moneda enviada)
2. **Fecha reciente** (mismo día o día anterior)
3. **Beneficiario** que coincida con la cuenta enviada (DPM Diving Phi Phi LLC / Francisco Jose Augier según moneda)
4. **Estado de la transferencia**: "completado", "successful", "paid", "ejecutado"

Si los 4 datos están claros → confirmar reserva, cambiar a Payment+Customer.
La oficina rechequea de su lado. Si el depósito no aparece en 24h, la oficina contacta al cliente directamente.

**Frase para aceptar screenshot:**
- EN: "We prefer PDF but a clear screenshot is fine — I'll verify the details and confirm the booking. The office will double-check on their end 🙏"
- ES: "Preferimos PDF, pero si solo podés mandar foto está bien — verifico los datos y confirmo la reserva. La oficina hace el rechequeo 🙏"

**Si la foto no es clara:**
- EN: "Could you send a clearer image (or the PDF if you have it)? I want to make sure I get all the details right before confirming 🙏"
- ES: "¿Me podés mandar una foto más clara o el PDF si lo tenés? Quiero asegurarme de los datos antes de confirmar 🙏"

**Si el monto está incorrecto:**
- EN: "Received [X]. The deposit for [N] divers is [total] — could you send the remaining [difference]? 🙏"
- ES: "Recibí [X]. El depósito para [N] buzos es [total] — ¿me mandás los [diferencia] restantes? 🙏"

---

## PROTOCOLO — CLIENTE NO PUEDE PAGAR DEPÓSITO EN ADVANCE

Si el cliente declara explícitamente que no puede hacer depósito antes de llegar (no tiene tarjeta, no tiene acceso a transferencia, etc.):

**Pasos:**
1. **NO confirmar boat space**
2. **NO cambiar el lifecycle a Payment** — queda en New Lead
3. Ofrecer la opción de coordinar al llegar:

**Frase:**
- EN: "If you can't process the deposit right now, you're welcome to stop by our office when you arrive — but I can't guarantee we'll have space on the boat that day 🙏 The safest is to contact the office directly at +66 91 764 2151 to coordinate."
- ES: "Si no podés procesar el depósito ahora, podés pasar por nuestra oficina cuando llegues — pero no te puedo garantizar lugar en el barco ese día 🙏 Lo más seguro es contactar la oficina directamente al +66 91 764 2151 para coordinar."

4. Agregar nota interna: `Cliente no puede pagar depósito — derivado a oficina, sin garantía de espacio`
5. Marcar `[AGENTE REQUERIDO: cliente sin medios de pago]` para que la oficina haga seguimiento

---

## NOTAS INTERNAS POST-COMPROBANTE

Al recibir el PDF (o screenshot verificado), actualizar las Notes del contacto con este formato exacto:

```
Programa | Turno | Fecha | Monto + Moneda | Personas | Cliente: nombre | Transferencia a nombre de: nombre en recibo | Tallas pendientes de confirmar
```

**Ejemplos:**

```
Try Scuba | Tarde | 2026-04-02 | 40 EUR | 1 persona | Cliente: Miguel | Transferencia: Miguel Villar | Tallas pendientes
```

```
Open Water | AM | 2026-05-15 | 80 GBP | 2 personas | Cliente: Sarah | Transferencia: Sarah Johnson + James Reid | Tallas pendientes
```

```
Advanced | AM+PM | 2026-06-10 | 1300 THB Stripe | 1 persona | Cliente: Tom | Transferencia: Tom Henderson (Stripe) | Tallas pendientes
```

**Tags adicionales según contexto:**
- `MEDICO:[condición]` — cliente mencionó condición médica
- `B2B:[nombre empresa]` — venta corporativa o agencia
- `INDECISO:[opciones que evalúa]` — cliente comparando
- `DESCUENTO:[razón]` — se aplicó descuento
- `NOTA:[detalle específico]` — info importante para el día
- `BUDDY:[nombre amigo]` — buddy booking confirmado

---

## PAGOS EN OFICINA (saldo restante)

El depósito reserva el lugar. El saldo restante se paga al llegar a la oficina.

**Métodos de pago en oficina:**
- **Efectivo en THB:** sin cargo
- **Transferencia bancaria local:** +3% cargo
- **Tarjeta de crédito/débito:** +8% cargo

Si el cliente preguntó por tarjeta: explicar que online (con el link Stripe) no hay cargo, y en oficina sí tiene cargo extra.

---

## DATOS A RECOLECTAR DESPUÉS DEL DEPÓSITO

Una vez confirmado el comprobante, pedir:
1. Nombre completo (como en pasaporte)
2. Fecha de nacimiento (DD/MM/AAAA)
3. Número de pasaporte
4. Talla de camiseta (S/M/L/XL/XXL)
5. Talla de calzado **europeo** (35-46)
6. Certificación actual (si aplica) + foto del carnet

Tono sugerido:
> ES: "Muchas gracias por elegir DPM Diving! Para poder organizar todo antes de que llegues, te pido estos datos cuando puedas:
> Nombre completo
> Fecha de nacimiento
> Pasaporte
> Talla camiseta
> Talla calzado europeo
> Si tenés certificación, mandame foto del carnet
> Sin apuro, lo que tengas a mano ya nos sirve 🙂"

---

## SSI APP

Pedirle al cliente que descargue la app SSI y cree cuenta para acelerar registro:

```
ANDROID: https://play.google.com/store/apps/details?id=com.divessi.app
iOS: https://apps.apple.com/app/my-ssi/id1116948811
```

Training Center number: **766698 / DPM Diving Phi Phi**

Al crear cuenta tiene que introducir el email dos veces (verificación).

---

## CANCELACIONES Y CAMBIOS

- **Sin reembolsos** del depósito.
- **Rebooking** dentro de 6 meses sin costo (a otra fecha en Phi Phi).
- **Transferencia a otra sede DPM** (Koh Tao, Gili Air, Gili Trawangan, Nusa Penida) posible — depósito viaja con el cliente.
- Si insiste en reembolso → **[AGENTE REQUERIDO]**.

---

## PROBLEMAS DE PAGO — PLAYBOOK STRIPE

Cuando CUALQUIER método de pago falla (tarjeta declinada, Revolut error, transferencia rechazada, Wise no disponible, IBAN incorrecto):

**Switch universal: mandar Stripe link inmediato.**

**Frase:**
- EN: "No worries! Let me send you our card payment link — works with debit or credit, no extra fees:
> https://buy.stripe.com/00w7sK8mXdwX8c91bc4AU3J
> You can use it more than once if you're paying for multiple people 🙂"
- ES: "¡No hay drama! Te paso nuestro link de pago con tarjeta — débito o crédito, sin cargos extra:
> https://buy.stripe.com/00w7sK8mXdwX8c91bc4AU3J
> Lo podés usar más de una vez si pagás por más de una persona 🙂"

**Reglas:**
- NO insistir con el método fallido
- Pivotar a Stripe inmediato
- Si Stripe también falla → `[AGENTE REQUERIDO: 2 métodos de pago fallaron]`

---

## CICLO DE VIDA DEL CONTACTO

- Nueva consulta → **New Lead**
- Fechas + programa definidos → **In process**
- Depósito enviado + comprobante (PDF o screenshot verificado) → **Payment + Customer**
- Sin respuesta tras 2 follow-ups → **Lost Lead**

⚠️ **CRÍTICO:** Cambiar a **Payment SOLO** cuando el comprobante es verificado. NUNCA al solo enviar datos bancarios.
