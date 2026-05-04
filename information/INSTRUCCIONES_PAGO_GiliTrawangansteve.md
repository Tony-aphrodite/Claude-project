# Instrucciones de Pago — Tool `solicitar_deposito` — Gili Trawangan

**Documento técnico para integración**
**Sede:** Gili Trawangan (única sede del piloto Pieza 1)
**Versión:** v1
**Audiencia:** Steve (desarrollador)

---

## 1. Resumen ejecutivo {#resumen}

La tool `solicitar_deposito` se activa cuando el AI detecta cierre de venta. Genera un código de referencia único, devuelve el bloque bancario correspondiente a la moneda del cliente, y mueve el lead a estado `deposit_pending`.

**Decisiones operativas confirmadas por el cliente:**

| Decisión | Valor |
|---|---|
| Formato del código de referencia | Auto-generado por sistema (`DPM-XXXXXX`) |
| Comprobante en EUR/GBP/USD/AUD | PDF obligatorio (rechazar screenshots) |
| Comprobante en IDR | Screenshot aceptado (banca móvil indonesia) |
| Validación del comprobante | AI valida (OCR + match) + humano confirma con un click |
| Detección de moneda | Por prefijo telefónico; si no se puede detectar → mostrar las 5 monedas y que el cliente elija |
| Notificación de `deposit_pending` | A todos los agentes humanos logueados (cualquiera puede confirmar, lock optimista) |
| Timeout cliente sin comprobante | Recordatorio a las 24h, segundo recordatorio a las 48h, mover a `lost` a las 72h |
| Timeout `handed_off` sin actividad humana | 30 minutos |
| Timeout `deposit_pending` (alerta interna) | 24h en panel |

---

## 2. Código de referencia {#codigo-referencia}

### Formato {#codigo-formato}

```
DPM-XXXXXX
```

Donde `XXXXXX` son 6 caracteres alfanuméricos en mayúscula (A-Z, 0-9), generados aleatoriamente al activar la tool.

**Ejemplos válidos:**
- `DPM-A7B3K2`
- `DPM-X2K9PQ`
- `DPM-7H3N4M`

### Generación {#codigo-generacion}

- El código se genera **una sola vez** por lead/contacto cuando se activa `solicitar_deposito` por primera vez.
- Se almacena en `chat_contacts.deposit_reference_code` (texto, único por sede).
- Si el cliente vuelve a pedir los datos bancarios después, **reutilizar el mismo código**, no generar uno nuevo.
- Si el cliente cambia de moneda, **mantener el mismo código** (la moneda se asocia separadamente).

### Garantía de unicidad {#codigo-unicidad}

- Verificar contra `chat_contacts` que el código no exista antes de asignarlo.
- En caso improbable de colisión, regenerar.

### Uso del código {#codigo-uso}

- Se inserta en el bloque bancario en el campo `Reference:`.
- El cliente lo copia tal cual al hacer la transferencia (en el campo "concepto" o "descripción" del banco).
- Tu equipo lo usa desde el panel del espía para identificar el pago al verlo entrar en Wise / Revolut / banco.

---

## 3. Detección de moneda {#deteccion-moneda}

### Tabla de prefijos telefónicos {#prefijos}

| Prefijo | Moneda |
|---|---|
| +49, +43, +41, +33, +34, +39, +31, +32, +351 | EUR |
| +44 | GBP |
| +61 | AUD |
| +1 | USD |
| +62 | IDR |

### Flujo de detección {#flujo-deteccion}

```
1. Detectar prefijo del número de WhatsApp del cliente
2. Si prefijo está en la tabla → usar moneda detectada y enviar bloque correspondiente
3. Si prefijo NO está en la tabla (ej: +55 Brasil, +7 Rusia, +81 Japón):
   → Enviar mensaje al cliente con las 5 monedas disponibles
   → Esperar respuesta del cliente
   → Enviar bloque correspondiente a la elección
```

### Mensaje cuando no se detecta moneda {#mensaje-no-deteccion}

**EN:**
```
In which currency would you like to pay your deposit? We accept:
• EUR (Euros)
• GBP (British Pounds)
• AUD (Australian Dollars)
• USD (US Dollars)
• IDR (Indonesian Rupiah — only with local Indonesian bank account)
```

**ES:**
```
¿En qué moneda querés pagar tu depósito? Aceptamos:
• EUR (Euros)
• GBP (Libras esterlinas)
• AUD (Dólares australianos)
• USD (Dólares estadounidenses)
• IDR (Rupias indonesias — solo con cuenta bancaria local indonesia)
```

---

## 4. Bloques bancarios por moneda {#bloques-bancarios}

> **Regla crítica:** enviar SOLO el bloque de la moneda elegida. Nunca todos juntos. Datos bancarios siempre en mensaje separado del precio y de la pregunta de cierre.

### Variables a reemplazar {#variables}

- `{{REFERENCE_CODE}}` → el código auto-generado (ej: `DPM-A7B3K2`)

### Bloque EUR {#bloque-eur}

```
Here are the EUR bank details for your deposit of 40 EUR 🙏

Beneficiary: DPM Diving Gili T LLC
IBAN: BE93 9050 6891 4867
BIC/SWIFT: TRWIBEB1XXX
Bank: Wise, Brussels, Belgium

Reference: {{REFERENCE_CODE}}

Once sent, please share the payment confirmation as PDF 🙏
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

Reference: {{REFERENCE_CODE}}

Once sent, please share the payment confirmation as PDF 🙏
```

### Bloque AUD {#bloque-aud}

```
Here are the AUD bank details for your deposit of 40 AUD 🙏

Beneficiary: DPM Diving Gili T LLC
Account number: 222625669
BSB: 774-001
BIC/SWIFT: TRWIAUS1XXX
Bank: Wise Australia, Sydney

Reference: {{REFERENCE_CODE}}

Once sent, please share the payment confirmation as PDF 🙏
```

### Bloque USD {#bloque-usd}

> **Nota interna (no mostrar al cliente):** esta cuenta es de Koh Tao. La usamos para clientes USD de Gili Trawangan porque no tenemos cuenta USD propia en las Gilis.

```
Here are the USD bank details for your deposit of 40 USD 🙏

Beneficiary: Dpm Diving
Account number: 822000685807
Routing number: 026073150
BIC/SWIFT: CMFGUS33
Bank: Community Federal Savings Bank, New York, USA

Reference: {{REFERENCE_CODE}}

Once sent, please share the payment confirmation as PDF 🙏
```

### Bloque IDR {#bloque-idr}

> **Solo para clientes con cuenta bancaria local indonesia.** Monto: 700,000 IDR.

```
Here are the IDR bank details for your deposit of 700,000 IDR 🙏

Beneficiary: Dalam Professional Menyelam
Bank: Bank Mandiri
Account: 1610010570609

Reference: {{REFERENCE_CODE}}

Once sent, please share the payment confirmation 🙏
```

---

## 5. Validación del comprobante {#validacion-comprobante}

### Reglas por moneda {#validacion-reglas}

| Moneda | Formato aceptado |
|---|---|
| EUR | PDF obligatorio (rechazar screenshots) |
| GBP | PDF obligatorio (rechazar screenshots) |
| AUD | PDF obligatorio (rechazar screenshots) |
| USD | PDF obligatorio (rechazar screenshots) |
| IDR | PDF o screenshot aceptados |

### Si el cliente manda screenshot en moneda extranjera {#screenshot-rechazo}

El AI debe rechazar amablemente y pedir PDF:

**EN:**
```
Thanks 🙏 Could you share the bank confirmation as a PDF instead of a screenshot? Most banks have a "Download" or "Export PDF" option in the transaction details. We need the PDF to validate the transfer properly.
```

**ES:**
```
Gracias 🙏 ¿Podés compartir la confirmación del banco en PDF en vez de captura? La mayoría de los bancos tienen una opción "Descargar" o "Exportar PDF" en los detalles de la transacción. Necesitamos el PDF para validar la transferencia correctamente.
```

### Flujo de validación AI + humano {#flujo-validacion}

```
1. Cliente envía comprobante (PDF en EUR/GBP/USD/AUD; PDF o screenshot en IDR)

2. AI lee el comprobante (Vision API + OCR) y extrae:
   - Monto transferido
   - Moneda
   - Nombre del beneficiario
   - Código de referencia / concepto
   - Fecha de la transferencia

3. AI valida automáticamente:
   ✓ Formato correcto (PDF en moneda extranjera, PDF o screenshot en IDR)
   ✓ Monto = 40 EUR/GBP/USD/AUD o 700,000 IDR (tolerancia ±0.50 unidades)
   ✓ Nombre del beneficiario coincide con la cuenta de la moneda elegida
   ✓ Código de referencia coincide con el lead

4. AI propone match en el panel del espía:
   - Nombre cliente
   - Código DPM-XXXXXX
   - Monto y moneda detectada
   - Estado: "AI verificó, esperando confirmación humana"

5. Humano de tu equipo entra a Wise / Revolut / banco, verifica que el dinero
   realmente llegó (settled, no pending), y aprieta "Confirmar" en el panel

6. AI mueve el lead a deposit_paid y dispara el handoff al humano de la sede
```

### Casos de rechazo automático del AI {#rechazos-automaticos}

El AI debe rechazar y volver a pedir el comprobante en estos casos (sin involucrar al humano todavía):

| Caso | Mensaje al cliente |
|---|---|
| Screenshot enviado en moneda extranjera | Pedir PDF (ver `#screenshot-rechazo`) |
| Monto distinto al esperado | "Veo que el monto enviado es X, pero el depósito es 40 [MONEDA]. ¿Podés revisar?" |
| Beneficiario no coincide | "El comprobante muestra otro beneficiario. ¿Podés revisar que enviaste a la cuenta correcta?" |
| Código de referencia no coincide o falta | "No veo el código `DPM-XXXXXX` en el concepto. ¿Podés confirmar que lo incluiste?" |
| Comprobante ilegible / no se puede leer | "No puedo leer bien el comprobante. ¿Podés compartirlo de nuevo en mejor calidad?" |

### Casos que pasan a revisión humana inmediata {#revision-humana}

Estos casos **no los rechaza el AI**, los manda directo al panel para revisión humana:

- Comprobante válido pero con metadata sospechosa (fecha futura, edición detectada)
- Cliente envía comprobante por tercera vez con datos contradictorios
- Cliente reclama que pagó pero no aparece el comprobante

---

## 6. Estados del lead durante el flujo de pago {#estados-lead}

```
proposed
   │
   │ AI activa solicitar_deposito
   ▼
deposit_pending ──── timeout 24h ────► alerta en panel
   │
   │ Cliente envía comprobante
   ▼
deposit_pending (con comprobante propuesto por AI)
   │
   │ Humano confirma desde el panel
   ▼
deposit_paid
   │
   │ AI envía mensaje de cierre al cliente
   │ + handoff al humano de la sede
   ▼
handed_off ──── timeout 30min ────► alerta en panel
   │
   │ Humano de la sede toma la conversación
   ▼
closed (won)
```

---

## 7. Mensajes del AI durante el flujo {#mensajes-ai}

### Al activar `solicitar_deposito` (después del bloque bancario) {#mensaje-post-bloque}

**EN:**
```
The deposit isn't refundable, but you can change the date or transfer to any DPM location at no extra charge 😊

Want me to lock in your spot once the deposit is confirmed?
```

**ES:**
```
El depósito no se reembolsa, pero podés cambiar la fecha o trasladar a cualquier sede DPM sin cargo 😊

¿Te confirmo el lugar en cuanto recibamos el depósito?
```

### Al recibir el comprobante (validación AI exitosa, esperando humano) {#mensaje-comprobante-recibido}

**EN:**
```
Got it, thanks 🙏 Let me confirm the transfer with the team and I'll get back to you in a few minutes.
```

**ES:**
```
¡Recibido, gracias 🙏! Déjame confirmar la transferencia con el equipo y te aviso en unos minutos.
```

### Al confirmar el pago (humano aprietá "Confirmar" en panel) {#mensaje-deposito-confirmado}

**EN:**
```
Deposit confirmed ✅ Your spot is locked in for [PROGRAMA] on [FECHA].

To finish your booking, please share:
• Full name (as on your ID)
• T-shirt size (XS to 4XL)
• European shoe size

Also, please drop by the school the day before your program between 8am and 6pm for registration. Here's the location: https://maps.app.goo.gl/9e7PLpg1WU8b8S9R9

My colleague from Gili Trawangan will message you shortly to coordinate the rest 🤿
```

**ES:**
```
¡Depósito confirmado ✅! Tu lugar está reservado para [PROGRAMA] el [FECHA].

Para terminar la reserva, mandame por favor:
• Nombre completo (como figura en tu documento)
• Talla de camiseta (XS a 4XL)
• Talla de calzado europeo

Además, pasá por la escuela el día anterior a tu programa entre las 8am y las 6pm para el registro. Acá tenés la ubicación: https://maps.app.goo.gl/9e7PLpg1WU8b8S9R9

Mi compañera de Gili Trawangan te escribe en breve para coordinar el resto 🤿
```

---

## 8. Schema sugerido para la base de datos {#schema-db}

> Sugerencia. Steve puede ajustar nombres según su convención.

### Tabla `deposit_requests` {#tabla-deposit-requests}

```sql
CREATE TABLE deposit_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      text REFERENCES chat_contacts(respond_io_contact_id),
  reference_code  text UNIQUE NOT NULL,           -- DPM-XXXXXX
  currency        text NOT NULL,                  -- EUR | GBP | AUD | USD | IDR
  amount          numeric NOT NULL,               -- 40 o 700000
  program         text,                           -- ej: "Open Water"
  program_date    date,                           -- fecha en que arranca el curso
  
  -- Estados del comprobante
  receipt_url           text,                     -- URL del PDF/screenshot subido
  receipt_format        text,                     -- "pdf" | "image"
  ai_validation_status  text,                     -- "pending" | "approved" | "rejected"
  ai_validation_notes   text,                     -- detalles del OCR
  
  human_confirmed_at    timestamptz,              -- cuándo el humano confirmó
  human_confirmed_by    text,                     -- email del humano
  
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_deposit_requests_contact ON deposit_requests(contact_id);
CREATE INDEX idx_deposit_requests_reference ON deposit_requests(reference_code);
CREATE INDEX idx_deposit_requests_status ON deposit_requests(ai_validation_status);
```

---

## 9. Política de notificaciones y timeouts {#politica-notificaciones}

### Notificación de `deposit_pending` para confirmación humana {#notif-deposit-pending}

Cuando el AI valida un comprobante y queda esperando confirmación humana, el panel del espía debe:

- **Mostrar el `deposit_pending` a TODOS los agentes humanos logueados** simultáneamente
- **Cualquier agente puede entrar y confirmar** (no hay asignación específica a una persona)
- **Lock optimista:** el primero en clickear "Confirmar" cierra la operación. Si un segundo agente intenta confirmar el mismo a la vez, el sistema le muestra "Ya confirmado por [otro agente]"
- **Mostrar visiblemente quién confirmó** para auditoría posterior (campo `human_confirmed_by` en la tabla)

### Política de timeout en `deposit_pending` (cliente sin enviar comprobante) {#timeout-deposit-pending}

Si el cliente recibió los datos bancarios pero no envió comprobante:

```
Hora 0    → AI envía bloque bancario, lead pasa a deposit_pending
Hora 24h  → AI envía recordatorio automático al cliente
Hora 48h  → AI envía segundo recordatorio + alerta visible en el panel
Hora 72h  → Lead pasa a estado `lost` automáticamente
            (puede revivirse manualmente desde el panel si el cliente reaparece)
```

### Mensaje de recordatorio a las 24h {#mensaje-recordatorio-24h}

**EN:**
```
Hi [NAME] 👋 Just checking in — did you have any trouble with the bank transfer? Let me know if you need a different currency or if you have any questions.
```

**ES:**
```
Hola [NAME] 👋 ¿Tuviste algún inconveniente con la transferencia? Avisame si necesitás otra moneda o si tenés alguna duda.
```

### Mensaje de recordatorio a las 48h {#mensaje-recordatorio-48h}

**EN:**
```
Hi [NAME] 🤿 Your spot is still on hold but I can't keep it much longer without the deposit confirmation. Would you like to proceed or did your plans change?
```

**ES:**
```
Hola [NAME] 🤿 Todavía tengo tu lugar reservado pero no puedo mantenerlo mucho más sin el depósito. ¿Seguimos adelante o te cambiaron los planes?
```

### Política de timeout en `handed_off` (sin actividad humana) {#timeout-handed-off}

Como ya está confirmado en el resumen ejecutivo:
- **30 minutos** sin actividad humana después del handoff → alerta visible en el panel para que cualquier agente humano la tome.

---

## 10. Cross-references al KB {#cross-refs}

Este documento es complementario al KB principal. Referencias relevantes:

- Política completa de depósitos: `KB-03_payments.md#politica-deposito`
- Detección de moneda y prefijos: `KB-03_payments.md#deteccion-moneda`
- Mensajes de cierre y manejo de objeciones: `KB-04_sales_patterns.md`
- Estados del contacto en Respond.io: `KB-05_operational_rules.md#etapas-contacto-respondio`
- Proceso de reserva completo: `00_SYSTEM_PROMPT.md#proceso-reserva`
