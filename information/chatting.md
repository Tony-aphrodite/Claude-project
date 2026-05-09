# Hilo Miguel — Cierre de Pieza 1 + nueva propuesta DPM Cloud

> Conversación: 2026-05-06
> Contexto: Miguel valida lo construido para Pieza 1, libera pagos
> escalonados, define los últimos pendientes (Apps Script + product
> cards), aprueba el lanzamiento real para el lunes 11 de mayo, y
> abre formalmente la propuesta de Pieza 2 (DPM Cloud) enviando el
> archivo BubbleManager_be.accdb como referencia funcional.

---

## 1. Miguel — pregunta de validación

a ver si estoy entendiendo bien esto es el espia y la ai conversacional ?

(perdón estoy medio dormido jejeje)

---

## 2. Steve — recap de qué quedó construido

Sí, exactamente — y un poco más. Te resumo qué quedó construido:

1) AI conversacional (sí)
   - John, el agente de DPM Diving Gili Trawangan
   - Recibe cada mensaje del cliente vía Respond.io webhook
   - Cada llamada a Claude usa los 4 bloques que diseñamos
   - Tool_use: consultar_disponibilidad y solicitar_deposito (con código
     DPM-XXXXXX, monedas EUR/GBP/AUD/USD/IDR)
   - Pipeline de leads con state machine: new → qualified → proposed →
     deposit_pending → deposit_paid → handed_off → closed/lost

2) Espía (sí, pero ahora restringido al modo test)
   - Captura mensajes del agente humano con sender="agente_humano"
   - Observa transiciones automáticas (pago recibido, te paso al instructor)
   - Modo test: solo procesa contactos con etiqueta `ai-test`

3) Extras incluidos:
   - Follow-up automático en 5 niveles
   - Panel completo (dashboard, pipeline, depósitos, conversaciones,
     follow-ups, KB editor con diff/rollback, prompts editor con
     regression gate)
   - Login con email + contraseña, cambio de password
   - Cost guard, idempotency, PII retention, WhatsApp template fallback

---

## 3. Miguel — agradecimiento + 3 puntos pendientes

Steve, this is impressive work — beyond what we contracted 👏

✅ AI conversational with the 4-block prompt structure: perfect
✅ Spy with human agent capture (sender="agente_humano")
✅ Pipeline state machine with auto-transitions: smart
✅ 5-level follow-up sequence
✅ "ai-test" tag gate

Two things still pending from my side / one question:

1. Apps Script URL for Gili Trawangan roster — sending today.
2. Product catalogs — wants AI to send native WhatsApp Business product
   cards (Try Scuba, Open Water, OW30, etc.) like his human team does.
   Plan A: Respond.io API. Plan B: image+text from dpmdiving.com.
3. Timeline for activating real traffic — once roster + cards work.

---

## 4. Steve — plan de 5 días + propuesta de absorber catálogos

1) Apps Script URL — perfecto, dale. Cuando me pases la URL hago la
   integración en menos de un día (código de consultar_disponibilidad
   ya escrito + testeado contra mocks).

2) Catálogos / product cards — NO está estrictamente en el alcance
   original. Pero tiene sentido sumarlo. Lo absorbo dentro de Pieza 1
   sin costo adicional, ~2 días de trabajo.

   Plan A: Respond.io API expone "send template/interactive message"
   si los catálogos están cargados como Meta WhatsApp Business Catalog.

   Plan B: enviar mensaje "rich" con URL de imagen desde dpmdiving.com
   + texto descriptivo.

3) Timeline para abrir tráfico real:
   - Día 1: roster wired up
   - Día 2: backend + tool_use para catálogos
   - Día 3: prompt updates + testing end-to-end
   - Día 4: check-in + validación con Miguel
   - Día 5: sacar tag-gate y arrancar piloto real con Gili Trawangan

   5 días hábiles desde inputs. Si plan B, 3 días.

---

## 5. Miguel — confirmación + aprobación de pago

Hi Steve, your plan looks great 👏

1. Apps Script URL: sending today.
2. Product catalogs — go with Option A: catalogs ARE in Meta WhatsApp
   Business catalog format, loaded in Respond.io, approved by Meta.
   Plan A confirmed.
3. Timeline (Monday May 11): approving 5-day plan.
4. Payment: I'm happy to release 50% now as you asked. The remaining
   will be released at the end of the pilot once we validate
   real-traffic results.

---

## 6. Pagos liberados en Workana — 2026-05-06

Secuencia de releases en escrow durante el día:

- Hito 1 ya estaba liberado previamente: 30% (USD 1,440)
- Miguel libera 20% adicional → total 50% (USD 2,400)
- Steve aclara: "I want to 50%, but you gave me 20% more 😭"
  (Steve quería 50% adicional, no 50% total)
- Miguel libera otro 20% → total 70% (USD 3,360)
- Steve agradece + admite: "Honestly, since the project was progressing
  quickly, I requested an additional 10% on top of the originally
  contracted 40%."
- Miguel libera 10% más → total 80% (USD 3,840)

**Estado al cierre del día**: 80% liberado, 20% (USD 960) en escrow
para fin de pilot.

---

## 7. Miguel — propuesta de nuevo proyecto: DPM Cloud (Pieza 2)

> Adjunto: `BubbleManager_be.accdb` (Microsoft Access database con la
> operación completa de las 5 sedes — clientes, cursos, instructores,
> pagos, equipo, certificaciones, roster por sede, módulos VBA con
> nómina, comisiones de retail y máquinas de estado de estudiantes).

Hi Steve,

I just sent you the .accdb file we currently use across our 5 dive
centers (Koh Tao, Koh Phi Phi, Gili Air, Gili Trawangan, Nusa Penida).
It's the original Access database that runs all our operations today —
customer management, courses, instructors, payments, equipment,
certifications, sede-specific roster logic, etc.

What I want you to do is review the file and quote me a project to
replicate the same functionality but in a modern cloud-based
multi-tenant web app.

Clarifications:

- **No data migration needed.** Start clean from day 1 of launch.
- **Use the file as a functional reference, not as a data source.**
  Look at table structures, VBA modules (especially GenericPaysheet,
  co-teaching pay splits, retail commission logic, student state
  machines), and per-sede variations.

Modifications I want vs the current system:

- Cloud-based, accessible from any device (web + mobile).
- Multi-sede with role-based access: owner, sede manager, staff,
  instructor, reception.
- Public kiosk flow for customer self-registration from their phone
  (separate from staff registration).
- WhatsApp integration via Respond.io (we're already using it).
- Payment integration with Wise Business (not Stripe).
- Add Instagram and TikTok fields to customer profiles (we only had
  Facebook before).
- Modern UI/UX — the current system feels like a 2005 hospital app.

What I need from you:

1. Total quote to deliver this end-to-end.
2. Timeline estimate with milestones.
3. Tech stack you'd recommend (and why).
4. Areas you see as risky or where scope might need clarification.
5. Whether this fits your existing 7-week pilot scope or it's a
   separate project.

Take your time reviewing — I'd rather you give me a thoughtful quote
than a fast one. Let me know if you have questions about any of the
business logic in the VBA modules, those are the trickiest part.

Thanks,
Miguel

---

## 8. Miguel — acceso a catálogos WhatsApp en Respond.io — 2026-05-06

> Mensaje breve de Miguel apuntando a la consola de Respond.io donde
> se administran los catálogos de WhatsApp Business que ya están
> dados de alta para DPM Diving.

https://app.respond.io/space/216239/settings/channels/274637/whatsapp-catalog

there you have the access to all catalogs in respond.io

**Contexto / acción tomada:**

- El AI ya tiene la herramienta `enviar_catalogo` implementada con
  fallback a texto cuando el catálogo no está configurado para la
  sede. Este link permite a Steve (y al panel) inspeccionar qué
  catálogos / product sets existen y mapearlos por sede en
  `sede_catalog_config` cuando llegue el momento de activarlos.
- Workspace ID: `216239` · Channel ID: `274637`. Guardado como
  referencia en memoria para no tener que hurgar la URL otra vez.
- No requiere cambio de código inmediato — la integración del lado
  servidor ya está lista y solo necesita los `productSetId` reales
  de cada catálogo cuando Miguel los confirme por sede.

---

## 9. Miguel — Apps Script `days` parameter fix + URL por sede — 2026-05-06

> Respuesta a la observación de Steve sobre que el Apps Script
> ignoraba el parámetro `days` y devolvía siempre un solo día en
> `detalle`. Miguel parchó el `doGet` y confirmó que ahora respeta
> el rango pedido. Además aclara la arquitectura multi-sede: cada
> centro tiene su propio Apps Script.

Apps Script bug fixed ✅
I just patched the doGet function — the days parameter now works
correctly. URL stays the same, no change needed on your side.

Verified with 3-day query:
GET …/exec?date=2026-05-08&days=3
Returns the 3 days as expected:

  2026-05-08
  2026-05-09
  2026-05-10

Each with their full turno_manana, turno_tarde, turno_nocturno data.
Numbers match the live Sheets.

Your server-side workaround should keep working — and now your code
path that detects "if N days come back in one call, don't make N
requests" should kick in automatically.
Let me know once you've verified.

This is only for Gili Trawangan; each location has a different one.

**Verificación / acciones tomadas (2026-05-06):**

- Confirmé con `curl …?date=2026-05-08&days=3` → `detalle.length === 3`
  con las 3 fechas pedidas (2026-05-08, 2026-05-09, 2026-05-10) y
  los 3 turnos completos en cada día. `hora_actual_wita` sigue
  llegando fresco (00:11 al momento de la verificación).
- El `fetchFresh` de `apps-script.ts` ya tenía la guardia
  `if (missing.length === 0) return first` — con la respuesta
  completa el set `have` cubre todas las fechas y NO se disparan
  llamadas extra. La fan-out queda como red de seguridad, sin
  costo en el camino feliz.
- **Arquitectura multi-sede confirmada**: cada sede tiene su propio
  Apps Script URL. El schema ya lo soporta vía `sedes.roster_config.url`
  (JSONB), así que cuando Miguel decida activar otra sede solo hay
  que correr un UPDATE sobre esa fila — no hay cambio de código.
  El piloto sigue siendo solo Gili Trawangan; los otros 4 URLs
  se piden cuando el alcance se extienda.

---

## 10. Miguel — URLs de Apps Script de las 5 sedes — 2026-05-06

> Miguel mandó los 5 URLs (uno por sede) sin pedirlo explícitamente.
> Probable contexto: facilitarnos la activación rápida cuando
> termine el piloto de Gili Trawangan.

```
GILI TRAWANGAN:
https://script.google.com/macros/s/AKfycbzmSetuWdCOEIIbO8T7YS6ZP9kHCO9YI0ZT-QfF_rqQqZzf9RrNiZt6qhX81e5SmdEcJg/exec

GILI AIR:
https://script.google.com/macros/s/AKfycbwEHo97P7DCI5D-HRZ_JgibjweAQzfnshBS1HivVPpZXhF7sGSQqh9ajmRosZoQ8aQw/exec

NUSA PENIDA:
https://script.google.com/macros/s/AKfycbyVYIbbdZjyZ2_YbKbOlf2KKaZq2b16x-YSddMNo-xUWbOYdyu_K5WEet5znuefvO_WLA/exec

KOH TAO:
https://script.google.com/macros/s/AKfycbxygnv93Ve_1jirG7A9eFLg4b3NEPgZSwfz_eNGiEmrgXK4v5fvSyBW7oNs8XnJ9DJV/exec

KOH PHI PHI:
https://script.google.com/macros/s/AKfycbzLTj2AJsOQmEqqcHaQ-0JDJhP0t2MgGK3aiCNSrrJXx8DS6UkQ-mnBdErGDDgmeVvZ/exec
```

**Verificación contra los 5 URLs (2026-05-06, `?date=2026-05-08&days=3`):**

| Sede | País | TZ | `days` honrado | `hora_actual_wita` | `turno_nocturno` |
|------|------|----|----------------|--------------------|-----------------|
| Gili Trawangan | Indonesia | WITA (UTC+8) | ✅ 3 días | ✅ presente | ✅ presente |
| Gili Air | Indonesia | WITA | ✅ 3 días | ✅ presente | ✅ presente |
| Nusa Penida | Indonesia | WITA | ✅ 3 días | ❌ `null` | ❌ ausente |
| Koh Tao | Thailand | WIB (UTC+7) | ✅ 3 días | ❌ `null` | ✅ presente |
| Koh Phi Phi | Thailand | WIB | ✅ 3 días | ❌ `null` | ✅ presente |

**Diferencias detectadas que afectarán a la activación de otras sedes:**

1. **`hora_actual_wita`** lo devuelven solo Gili Trawangan + Gili Air.
   Razones probables: el campo se llama explícitamente "WITA" y los
   centros tailandeses están en otra zona (WIB/Indochina Time);
   Nusa Penida está en WITA pero su Apps Script parece más viejo.
   → Hablar con Miguel: o renombramos el campo a `hora_actual_local`
   y agregamos `timezone` aparte, o cada sede devuelve la hora pero
   en el TZ apropiado.
2. **`turno_nocturno`** lo omite Nusa Penida (operacionalmente no
   tienen night dives). Es info válida — el AI debería tratar
   esa sede como "AM/PM only".
3. **`days` parameter**: ya funciona en las 5 sedes (Miguel
   parchó el de Gili T y por lo visto los demás ya estaban OK
   o también se actualizaron).

**Implicancias para Pieza 1 (Gili Trawangan, 2026-05-11):** ninguna.
Gili Trawangan devuelve los dos campos completos y ya está
configurado en `sedes.roster_config.url`.

**Implicancias para futuras activaciones (Pieza 1 ampliada o
post-launch):** el validador en `apps/server/src/services/apps-script.ts`
exige `hora_actual_wita` como string y la shape `AvailabilityDay`
exige `turno_nocturno`. Si activamos otras sedes sin tocar el
schema, las respuestas se descartan como malformadas. **Refactor
pendiente** (no bloquea el lanzamiento del lunes):
- Hacer `hora_actual_wita` opcional en `AvailabilityResponse`
  (cuando esté ausente, `bookable-slots.ts` ya tiene fallback
  conservador → solo PM hoy).
- Hacer `turno_nocturno` opcional en `AvailabilityDay`.
- Renombrar a `hora_actual_local` + agregar `timezone` (idealmente
  pedirle a Miguel que extienda el Apps Script para que cada uno
  emita ambos campos).

**SQL templates listos** (NO ejecutar todavía — el piloto del lunes
es solo Gili T, las otras 4 sedes se activan post-launch):

```sql
-- Gili Air
UPDATE sedes SET roster_source='apps_script_url',
  roster_config = jsonb_build_object('url',
    'https://script.google.com/macros/s/AKfycbwEHo97P7DCI5D-HRZ_JgibjweAQzfnshBS1HivVPpZXhF7sGSQqh9ajmRosZoQ8aQw/exec')
WHERE nombre='Gili Air';

-- Nusa Penida
UPDATE sedes SET roster_source='apps_script_url',
  roster_config = jsonb_build_object('url',
    'https://script.google.com/macros/s/AKfycbyVYIbbdZjyZ2_YbKbOlf2KKaZq2b16x-YSddMNo-xUWbOYdyu_K5WEet5znuefvO_WLA/exec')
WHERE nombre='Nusa Penida';

-- Koh Tao
UPDATE sedes SET roster_source='apps_script_url',
  roster_config = jsonb_build_object('url',
    'https://script.google.com/macros/s/AKfycbxygnv93Ve_1jirG7A9eFLg4b3NEPgZSwfz_eNGiEmrgXK4v5fvSyBW7oNs8XnJ9DJV/exec')
WHERE nombre='Koh Tao';

-- Koh Phi Phi
UPDATE sedes SET roster_source='apps_script_url',
  roster_config = jsonb_build_object('url',
    'https://script.google.com/macros/s/AKfycbzLTj2AJsOQmEqqcHaQ-0JDJhP0t2MgGK3aiCNSrrJXx8DS6UkQ-mnBdErGDDgmeVvZ/exec')
WHERE nombre='Koh Phi Phi';
```


---

## 11. Miguel — DPM_AI_LAUNCH_GT_DOCUMENTO_COMPLETO.md (response to launch queries) — 2026-05-07

> Respuesta integral a los dos mensajes que Steve mandó pidiendo
> contenido y confirmaciones para activar el AI con clientes
> reales. Miguel adjunta un documento maestro
> `DPM_AI_LAUNCH_GT_DOCUMENTO_COMPLETO.md` (todavía pendiente de
> upload al repo al momento de este registro).

### Mensaje original

```
Steve, here's the full document with everything you asked for to
activate the AI with real clients:

📎 DPM_AI_LAUNCH_GT_DOCUMENTO_COMPLETO.md

The document covers:

✅ The 5 short confirmations (programs not offered, handoff,
   24/7 AI schedule, catalog, launch)

✅ Frente 1 — Complete KB content:
  - Pricing for all 14 programs (includes Rescue, Nitrox, Deep
    Specialty and React Right that I had missed mentioning before)
  - Detailed day-by-day schedules
  - Full cancellation + refund policy
  - Discount policy (10% is the AI's hard limit, anything above
    transfers to human)
  - Updated schedules: AM Boat 7:15-11:00, PM Boat 12:15-16:00
  - Detailed medical requirements (important: epilepsy NOT
    allowed to dive with DPM, strict rule)
  - 10 FAQ with DPM tone
  - Instructor policy: AI does not mention names

✅ Frente 2 — Tone and rules:
  - Casual using 'tú' (not 'vos'), max 2 emojis
  - 15 prohibited topics
  - New time logic: after 12:15 we can offer to start course
    with theory+pool today and dives next day
  - AI phrases marked with EN/ES in both versions
  - Authorized to use real conversations as few-shots

✅ Frente 3 — Wise/Deposit:
  - Correct amount: 40 EUR/GBP/AUD/USD or 700,000 IDR (fixes the
    current prompt bug)
  - 5 complete bank accounts (EUR, GBP, AUD, USD via KT account, IDR)
  - Reference code: DPM-GT-MMDD-XXXXXX
  - AUTOMATIC AI confirmation when receiving PDF that matches
    expected amount (no manual action)
  - Post-booking workflow with 3 automated messages
  - Notifications to gilit@dpmdiving.com

⏳ Pending - I'll send you later:
  - The 3 exact texts of the post-booking workflow (Maps link,
    personal data form, recommendations). I'll get them from the
    GT team and send them this week.

One important note: the document has several items where I
reviewed the previous responses I had loaded (pricing, schedules,
medical policy) and corrected them. If anything doesn't make
sense or you need more info, let me know.

Goal: Monday 11/5 internal day with the center team testing,
Tuesday 12/5 we open to real clients.

Looking forward to your feedback.
```

### Cambios identificados que afectan código (orden de impacto)

**Cambios "seguros" — implementables solo con el resumen
(precisión 100%):**

| # | Item | Antes | Después |
|---|------|-------|---------|
| A | PM cutoff time-of-day | 12:30 WITA | **12:15 WITA** |
| B | Reference code format | `DPM-XXXXXX` | **`DPM-GT-MMDD-XXXXXX`** |
| C | Launch date | Lunes 11/5 todo abierto | **Lunes 11/5 interno (equipo) + Martes 12/5 clientes reales** |
| D | Handoff alert channel | sin definir (panel only) | **email a `gilit@dpmdiving.com`** |

**Cambios que requieren el documento completo** (los textos
literales son críticos y no se pueden inferir del resumen):

| # | Item | Necesita del documento |
|---|------|------------------------|
| 1 | 14 programas (vs 8 actuales) | Lista exacta + cronogramas |
| 2 | Tono `tú` (vs `vos` actual en system prompt) | Frases EN/ES literales aprobadas |
| 3 | Max 2 emojis (vs 1 actual) | Confirmación |
| 4 | 15 prohibited topics | Lista literal |
| 5 | New time logic post-12:15 (theory+pool today) | Texto del system prompt |
| 6 | Auto-confirmation cuando PDF matches | Threshold de match exacto |
| 7 | Discount policy 10% AI hard limit | Frase literal de transferencia |
| 8 | Medical policy (epilepsia) | Texto literal de rechazo |
| 9 | 10 FAQ con tono DPM | Q&A literales |
| 10 | 5 bank accounts actualizados | IBAN/SWIFT/account # de cada uno |
| 11 | 3 automated messages post-booking | **Pendiente — Miguel los manda en la semana** |

### Acción tomada (2026-05-07)

1. **Mensaje guardado** en este archivo (sección 11).
2. **Cambios seguros A-D implementados** sin esperar al documento.
3. **Cambios 1-11 esperando** el upload de
   `DPM_AI_LAUNCH_GT_DOCUMENTO_COMPLETO.md` al directorio
   `information/`.
4. La fecha del lanzamiento real con clientes pasa al
   **martes 2026-05-12** (no lunes 11). Steve actualiza
   memoria y procedimiento de gate-removal en consecuencia.

---

## 12. Miguel — 5 dudas sobre el doc DPM_AI_LAUNCH — 2026-05-07

> Después de subir el documento Miguel revisó cuestiones que faltan
> aclarar antes de seguir armando secciones. Mezcla de preguntas
> técnicas (campos en Respond.io, almacenamiento del refCode, webhook
> inactivo) y operativas (links que faltan, formato del formulario
> médico).

### Mensaje original

```
Hola Steve,
Estuve repasando el doc y me surgieron algunas dudas / cosas que creo
que faltan. Antes de seguir agregando secciones quería tu opinión:

1. Captura de datos al sheet
Tengo armado todo un sistema de Sheets que captura las ventas
(DPM_Ventas_Master → DPM_Comando_Central). Hoy lo llena un agente
humano al cerrar la conversación con un rayito específico ("Cerrar
Venta — Captura Datos") que tiene un form de 8 campos (programa,
turno, pax, monto, moneda, sede, descuento). Después un Logger
automatizado escribe la fila al sheet.
Mi idea para John: que vaya actualizando los campos de contacto a
medida que va captando la info en la conversación, así cuando se
cierra la conv el Logger lee solo y no hace falta que un humano
ejecute nada. ¿Eso lo podés configurar desde el AI Agent en
Respond.io? ¿O preferís otra forma de hacerlo?

2. Código único de referencia
Lo del formato DPM-GT-MMDD-XXXXXX, ¿dónde lo vas a guardar exactamente?
Mi idea es que tu servidor lo escriba a un campo de contacto custom
en Respond.io (ej: codigo_referencia, tipo Text). Yo creo el campo y
agrego una columna nueva al sheet, el Logger lo lleva solo. ¿Te sirve
o tenías pensado otra cosa?

3. Mensajes post-venta (sección 3.5)
Dejé como "pendiente" los textos reales de los 3 mensajes
post-reserva y el formato del formulario médico. ¿Querés que te los
pase antes de arrancar, o preferís ir con placeholders y los
reemplazás después? Patrick los tiene, se los pido esta semana si
querés.

4. Detalles que también faltan:
- Link del Google Maps del centro DPM Gili Trawangan
- Links de fast boats (Bluewater Express, Scoot, Eka Jaya)
- Formato del formulario médico (¿Google Form existente? ¿Campos
  custom en Respond.io? ¿Otro?)

5. Webhook Developer Webhook 1 inactivo
Te avisé ayer pero veo que hoy sigue marcado como Inactivo en
Respond.io (el que apunta a https://dpmserver-production.up.railway.app...).
¿Lo dejaste así a propósito o se desactivó solo? Te lo recuerdo por
las dudas porque entiendo que sin ese webhook activo el server no
recibe los mensajes nuevos de WhatsApp y John no podría procesar
nada cuando lo conectemos.

Avisame qué pensás y arreglamos cómo sumamos esto al doc, o
arrancamos con lo que ya esté claro.
```

### Respuesta operativa (pegada a Miguel)

Texto sugerido — limpio, en orden de las 5 preguntas y técnico
donde corresponde:

```
Hola Miguel,

Te respondo punto por punto.

1) Captura al Sheet → SÍ, lo hace el server.
La forma más limpia es: a medida que John va calificando, mi server
escribe los campos en el contacto de Respond.io vía API (lo mismo que
el Logger que tenés hoy, pero disparado por el AI en lugar de por un
humano). Concretamente, cuando el AI invoca consultar_disponibilidad
empujo programa + turno + start_date al contacto. Cuando invoca
solicitar_deposito empujo monto + moneda + codigo_referencia + pax.
Para descuento, si el cliente lo pide, lo registro como un campo
adicional. El Logger sigue funcionando igual — lee el contacto
cuando dispara el rayito de cierre.

Para que esto funcione necesito que crees en Respond.io los siguientes
campos custom de contacto (te los paso en el orden que los va a
escribir el server, todos tipo Text salvo donde digo otro):

  programa            (Text — ej: "OW30", "TryScuba")
  turno               (Text — "AM" / "PM")
  start_date          (Date — primer día del programa)
  pax                 (Number — cantidad de personas)
  monto_deposito      (Number — 40 / 700000 según moneda)
  moneda              (Text — "EUR" / "GBP" / "AUD" / "USD" / "IDR")
  codigo_referencia   (Text — "DPM-GT-MMDD-XXXXXX")
  descuento           (Number — % aplicado, default 0)

Si querés cambiar nombres avisame, los uso tal cual los crees.

2) Código de referencia → exactamente como decís.
Servidor genera DPM-GT-MMDD-XXXXXX, lo guarda en Supabase (mi panel)
Y en simultáneo lo escribe al campo codigo_referencia del contacto
en Respond.io. Doble registro: el panel para auditoría, Respond.io
para que el Logger lo levante al sheet.

3) Mensajes post-venta → mejor con los textos reales antes del lunes.
Si Patrick los tiene, mandámelos esta semana — los cargo como
plantillas en Respond.io o los hardcodeo según prefieras. Con
placeholders se puede arrancar pero el cliente real va a recibir
"[INSERT MAPS LINK]" si me olvido de actualizar antes del switch.
Mejor cerrarlo bien.

4) Detalles que faltan:
- Maps GT: yo tengo este link cargado de algún doc viejo —
  https://maps.app.goo.gl/9e7PLpg1WU8b8S9R9
  Confirmame si es el correcto o me pasás otro.
- Fast boats: necesito los 3 links (Bluewater Express, Scoot,
  Eka Jaya). Los meto en el mensaje 3 post-venta cuando me los pases.
- Formulario médico: te tiro mi recomendación — usemos un Google
  Form existente si Patrick ya tiene uno que ustedes usan; si no,
  armamos uno nuevo simple con: nombre completo, edad, teléfono
  emergencia, condiciones médicas (sí/no + cuál), seguro de viaje
  (sí/no + compañía + N° póliza). Más fácil de mantener que campos
  custom en Respond.io porque cualquiera del equipo puede editarlo.

5) Webhook Developer Webhook 1 inactivo → necesito que lo actives vos.
El webhook está creado correctamente apuntando a la URL de Railway
(/webhook/respond-io). Yo no puedo activarlo desde mi lado — ese
toggle vive en tu workspace de Respond.io. Andá a Settings →
Integrations → Webhooks (o Developer Hub según versión) y prendé el
toggle "Active" del webhook Developer Webhook 1. Apenas lo hagas
hago un ping de prueba para confirmar que llega el evento al server.

Tenés razón en que sin ese webhook activo el server no procesa
nada. Lo mantuve apagado durante el desarrollo para no contaminar
con tráfico de prueba; ahora que vamos al lunes interno hay que
prenderlo.

Resumen de lo que necesito de vos para arrancar el lunes:
  a) Crear los 8 campos custom de contacto en Respond.io (lista arriba)
  b) Pasar los 3 textos post-venta + formato del form médico
  c) Confirmar el link de Maps + pasar los 3 links de fast boats
  d) Activar Developer Webhook 1

Mientras llegan (a) (b) (c), yo voy implementando del lado del server
la escritura de los campos custom (con los nombres que propuse arriba)
y la auto-confirmación del depósito por OCR. Si después cambiás los
nombres de los campos, lo ajusto en una línea.

Saludos!
```

### Acción tomada del lado de Steve (2026-05-07)

1. Mensaje guardado en este archivo (sección 12).
2. Voy a implementar la escritura a campos custom de Respond.io en el
   server con los nombres tentativos `programa`, `turno`, `start_date`,
   `pax`, `monto_deposito`, `moneda`, `codigo_referencia`, `descuento`.
3. Pendiente de Miguel: 8 campos creados en Respond.io, 3 textos
   post-venta, formato form médico, links faltantes, activación del
   webhook.

---

## 13. Miguel — respuesta a las 11 dudas + ajustes — 2026-05-07

> Miguel cierra todos los items pendientes. Hay dos cambios de plan
> importantes (handoff por team Round Robin en lugar de Patrick
> directo; AI Agent en Respond.io NO se usa, todo viene de nuestro
> Railway server) y varias confirmaciones que destraban el lunes.

### Mensaje resumido (puntos clave)

**Cambios de plan:**

1. **Handoff target — equipo "Agents" (ID 21595) Round Robin con 9
   miembros** (Patrick, Giovanni, Grecia, Fabiola, Francis, Roberto,
   Alba, Richard, Laura). Resuelve también el backup de Patrick
   (item 10).

3. **No se usa el Asistente IA de Respond.io** — todo el cerebro
   está en nuestro Railway. El handoff se dispara por workflow de
   Respond.io que escucha algún signal nuestro. Miguel pregunta cómo
   prefiero señalar:
   - (a) etiqueta al contacto (ej. `handoff-needed`)
   - (b) custom field (ej. `ai_status = escalated`)
   - (c) llamada directa a la API de asignación

   **Steve responde: opción (a) — tag-based.** Es el patrón nativo
   de Respond.io workflows y mantiene la API del server simple.
   Concretamente:
   - Tag `deposit_paid` se sigue aplicando cuando OCR auto-confirma
     o cuando el operador confirma manual en el panel. Es el mismo
     tag que ya existía en el flujo de Miguel — Round Robin se
     dispara por ahí.
   - Tag nuevo `ai_escalation` para handoffs pre-depósito (médica,
     descuento >10 %, tema prohibido, etc.). Mismo workflow puede
     escuchar ese tag con la misma asignación Round Robin.

**Confirmaciones (todas ✅):**

2. 8 campos custom creados (programa, turno, pax, moneda, monto,
   descuento, start_date, codigo_referencia) — usar nombres
   exactos.
4. 16 snippets armados (sizes, paperwork con `$contact.programa /
   start_date / pax`, predive_tips, ssi_app, location Maps DPM,
   quma Maps, accommodation Quma + Green Banana, closing_days,
   medical questionnaire). EN+ES.
5. Maps DPM Gili Trawangan + fast boats (12go.asia genérico).
6. **Las 6 plantillas Meta APROBADAS** (dpm_followup_48h_es/en,
   _7d_es/en, _30d_es/en) — categoría Marketing/Personalizada.
7. **Anthropic Tier 2 APROBADO**, spend cap $400/mes, alerta a
   $80, $46.68 de crédito.
8. Wise email gilit@dpmdiving.com **CONFIRMADO ACTIVO**.
9. **Feriados**: solo 2 días al año cierra GT — **25/12 y 01/01**.
   AI no acepta reservas que empiecen esos días. Si un curso ya
   empezó y cae uno de esos días, se pausa y reanuda al día
   siguiente. **No hay Nyepi / Lebaran**.
10. Resuelto vía Round Robin (item 1).

**Pendientes:**

11. 🟡 Steve verifica si tiene opción de exportar conversaciones en
    Respond.io.

### Aclaración importante sobre `descuento`

El campo `descuento` (List) tiene 3 valores fijos:
- `Sin descuento`
- `5%`
- `10%`

Miguel recomienda usar el List directamente. El AI escribe uno de
los 3 literalmente. Si por algún motivo hay que registrar otro
valor (15 %, monto fijo, etc.) → usar `descuento_aplicado` (Text)
como fallback.

### Implicancia arquitectónica importante

Como el flujo post-confirmación lo dispara el **workflow de
Respond.io** sobre el tag `deposit_paid` (envía gten_paperwork,
gten_predive_tips, etc. con datos sacados de los custom fields),
**nuestro server NO debe enviar el mensaje largo de confirmación**
que armamos antes (`buildAutoConfirmedText` en process-message.ts
y `buildHandoffText` en panel/leads.ts). Si lo enviamos, duplica
con los snippets que dispara Miguel.

**Refactor necesario:** Auto-confirm OCR y manual-confirm panel
deben:
1. Subir lead_stage a `deposit_paid`
2. Aplicar tag `deposit_paid` al contacto en Respond.io (ya no
   mandar texto largo — Miguel's workflow se ocupa)
3. Subir lead_stage a `handed_off`
4. Push a custom fields: programa, turno, pax, moneda, monto,
   start_date, codigo_referencia, descuento

Los textos `buildAutoConfirmedText` / `buildHandoffText` quedan
muertos — borrar o dejar como fallback solo si Miguel desactiva
el workflow.

### Acción tomada (2026-05-07)

1. Mensaje guardado.
2. Refactor del server: tag `deposit_paid` + `ai_escalation`,
   contact field writes, drop long handoff messages.
3. KB05 + system prompt v2.1 con feriados Dec 25 / Jan 1.
4. consultar_disponibilidad rechaza start_date en feriados.
5. Pendiente respuesta de Steve a Miguel sobre handoff
   tag-based + descuento List + export Respond.io.

---

## 14. Miguel — confirmación scope API key Respond.io — 2026-05-07

> Respuesta a la pregunta #4 del checklist final: ¿la
> RESPOND_IO_API_KEY tiene permisos para `add contact tag` y
> `patch contact custom fields`?

### Mensaje de Miguel

```
Hola Steve! Verifiqué. La key es un Workspace Developer API
token de Respond.io. En Respond.io estos tokens NO tienen
scopes granulares — automáticamente dan acceso COMPLETO a
todas las APIs del workspace.

Eso quiere decir que ya tenés permisos para los 3 que pediste:
✅ Send message
✅ Add contact tag
✅ Patch contact custom fields
+ todos los otros endpoints

Confirmé además que la key ya figura como "usada por última
vez" (may 06, 04:32 AM), así que la autenticación funciona
de tu lado.

Probá las llamadas que necesitás. Si alguna te tira 401/403
avisame y regenero el token. Doc oficial:
https://developers.respond.io/

🤿
```

### Análisis técnico

- **Workspace Developer API token de Respond.io NO tiene scopes
  granulares** — un token cualquiera tiene acceso completo a
  todos los endpoints del workspace.
- Es coherente con el modelo de Respond.io (cada workspace
  tiene 1 token "developer" que actúa como master key).
- La key que tenemos en `.env` (RESPOND_IO_API_KEY) ya está
  registrada como activa y autenticando correctamente.

### Acción tomada (2026-05-07)

1. **No requiere cambios de código.** Las dos funciones nuevas
   en `services/respond-io.ts` (`addContactTag`,
   `updateContactCustomFields`) ya usan el header correcto:
   `authorization: Bearer ${env.RESPOND_IO_API_KEY}` — mismo
   formato que `sendMessage`, que ya funciona. Si la auth pasa
   para una llamada, pasa para las otras.
2. Si en producción aparece un 401/403 inesperado, Miguel
   regenera el token en su workspace y lo subimos al `.env` de
   Railway.
3. Tony puede hacer un smoke test local antes del lunes:

```bash
# Test add_tag (no destructivo si el contacto ya tiene la tag)
curl -X POST \
  https://api.respond.io/v2/contact/id:<test_contact_id>/tag \
  -H "authorization: Bearer $RESPOND_IO_API_KEY" \
  -H "content-type: application/json" \
  -d '{"tags":["smoke_test_2026_05_07"]}'

# Test patch custom fields
curl -X PATCH \
  https://api.respond.io/v2/contact/id:<test_contact_id> \
  -H "authorization: Bearer $RESPOND_IO_API_KEY" \
  -H "content-type: application/json" \
  -d '{"customFields":[{"name":"programa","value":"OW"}]}'
```

Esperar 200 en ambas. 401/403 → regenerar token con Miguel.

---

## 15. Miguel — update snippets + workflow filtering — 2026-05-07

> Update operativo del lado de Respond.io. Confirma los 16 snippets
> de GT, agrega 2 snippets genéricos (ferry), explica el filtrado
> del workflow "Onboarding Cliente Confirmado" para evitar
> duplicaciones con nuestro AI, y ofrece exportar los textos
> completos de cada snippet como contexto para el prompt del AI.

### Mensaje original

```
Hola Steve, update rapido del lado nuestro 👇

Ya quedaron listos los 16 snippets especificos de Gili Trawangan
para que el AI los pueda disparar:

Post-venta / datos cliente:
- gten_sizes / gtes_sizes
- gten_paperwork / gtes_paperwork_gt (usa $contact.programa,
  $contact.start_date, $contact.pax)
- gten_predive_tips / gtes_predive_tips
- gtenssi_app / gtes_ssi_app_gt (con numero SSI 741421)
- gten_closing_days / gtes_closing_days

Ubicacion / hoteles:
- gtenlocation / gteslocationes (Maps DPM GT)
- gten_quma / gtesquma (Maps Quma actualizado)
- gten_naccommodation / gtes_accommodation (Quma 4★ Adults Only +
  Green Banana 3★ family-friendly con sus links)

Genericos:
- genenmedical / genesmedical (cuestionario medico SSI con PDFs
  EN/ES, tag MEDICAL)
- indoenferry_info / indoesferry_info (fast boats, 12go.asia)

Workflow side:
- Workflow original "Onboarding Cliente Confirmado" lo voy a
  filtrar para excluir GT, asi no se duplican mensajes con lo que
  dispare tu AI
- Equipo "Agents" (ID 21595) ya configurado en Round Robin con
  los 9 agentes para el handoff
- Los 8 custom fields de contacto creados (programa, turno, pax,
  moneda, monto, descuento, start_date, codigo_referencia)

Total en Respond.io tenemos 29 snippets controlados.

Avisame si necesitas que te exporte los textos completos de cada
uno para que los uses como contexto en el prompt del AI 🤿
```

### Información nueva vs §13

| Item | §13 | §15 (nuevo) |
|------|-----|-------------|
| 16 snippets GT | ✅ listados | ✅ confirmados |
| `indoenferry_info / indoesferry_info` (ferry) | — | 🆕 nuevos |
| Total snippets en Respond.io | implícito | **29** explícito |
| Filtrado del workflow "Onboarding Cliente Confirmado" para excluir GT | — | 🆕 dato operativo importante |
| Oferta de export de textos completos | — | 🆕 |

### Implicancia técnica importante — workflow filtering

Miguel filtra el workflow "Onboarding Cliente Confirmado" para
**excluir contactos de GT**. Esto significa:
- En GT, **toda la mensajería post-confirmación pertenece a nuestro
  AI / al workflow nuevo que escucha el tag `deposit_paid`**.
- No hay riesgo de doble mensaje (workflow viejo + AI).
- En las otras 4 sedes (Koh Tao, Phi Phi, Gili Air, Nusa Penida),
  el workflow original sigue funcionando como antes.

Esto se alinea con el alcance de Pieza 1 (solo GT) y mantiene las
otras sedes intactas.

### Acciones tomadas (2026-05-07)

1. Mensaje guardado en este archivo.
2. **Cambio en `00_SYSTEM_PROMPT.md`** — añadida sección que
   explica a John qué hace el workflow post-confirmación
   automáticamente, para que no duplique con sus respuestas
   propias antes del depósito.
3. Sin cambios de código de servidor — toda la coordinación es
   vía tag `deposit_paid` (ya implementado).
4. Pendiente respuesta a Miguel — sí queremos los textos
   completos de los snippets para usarlos como contexto.

---

## 16. Miguel — workflow trigger decision + onboarding workflow listo — 2026-05-07

> Miguel cierra dos pendientes (filtro de exclusión GT activo,
> workflow nuevo creado) y pide a Steve decidir entre dos opciones
> de trigger. Además pregunta sobre formato de los textos del
> snippet médico (texto solo o texto + links de PDFs).

### Mensaje resumido

**Completados del lado de Miguel:**
- ✅ Filtro "Onboarding Cliente Confirmado" excluyendo GT — **ACTIVO**.
  Testeado end-to-end: contactos con tag Gili Trawangan no reciben
  el mensaje genérico, las otras 4 sedes siguen recibiéndolo normal.
- ✅ Workflow "DPM GT - Onboarding Piloto" creado y publicado con
  los 7 mensajes secuenciales EN/ES (welcome → medical → location
  → hotels → ferry → predive tips → SSI app, ~16 min total).

**Decisión pedida — trigger del workflow:**

Miguel armó el workflow con trigger `Lifecycle = Customer` porque
otros workflows suyos (NotificacionPago, Cerrar Venta) también
disparan en ese evento. Steve venía asumiendo trigger `Tag
deposit_paid`. Opciones:

| Opción | Pro | Contra |
|--------|-----|--------|
| **(a) Cambiar trigger a `Tag deposit_paid`** | Separa la lógica del AI de los otros workflows. Limpio y predecible. | Miguel tiene que reconfigurar el workflow. |
| (b) Dejar `Lifecycle = Customer` y server pasa el lifecycle a Customer al aplicar deposit_paid | Workflow no cambia. | Acopla nuestro server a más eventos de los que controla; harder to reason about. |

**Miguel vota (a). Steve también.**

**Plan post-decisión:**
- Si (a) confirmado → workflow `DPM GT - Onboarding Piloto` reusa
  con trigger `Tag deposit_paid`, agrega al final acción de
  asignar al equipo 21595.
- Workflow `ai_escalation` nuevo, simple, trigger por tag, filtrado
  por sede GT para no afectar otras sedes.
- `snippets_textos.md` con 10 textos (7 post-confirm + genenmedical
  + indoenferry_info + gten_closing_days), formato `código + ES +
  EN literal`. Miguel lo manda sábado o domingo.

**Pregunta de Miguel — formato del snippet médico:**

`genenmedical` tiene PDFs adjuntos del cuestionario SSI. ¿Steve
quiere solo el texto del mensaje o también los links de los PDFs?

### Decisión de Steve (2026-05-07)

✅ **Opción (a) — trigger por tag.** Es lo que ya implementamos
(`addContactTag('deposit_paid')` aplica el tag desde nuestro server
en OCR auto-confirm + panel manual confirm). Cero cambio de
código.

✅ **Para `genenmedical`: pasarme tanto el texto como los links de
los PDFs.** Razones:
- John necesita poder mencionar de forma natural "te vamos a
  pedir un cuestionario médico al llegar / te lo mando ahora si
  necesitás" sin reescribir el contenido oficial.
- Si en algún caso edge el server tiene que enviar el cuestionario
  fuera del workflow estándar (ej. cliente solicita el form antes
  de pagar), tener los URLs disponibles permite hacerlo sin
  duplicar contenido.

### Acciones tomadas

1. Mensaje guardado en este archivo.
2. **Sin cambio de código** — la decisión (a) coincide con la
   implementación actual.
3. Pendiente respuesta a Miguel confirmando (a) y formato del
   snippet médico.

---

## 17. Miguel — snippets_textos.md + 2 workflows + bug fixes — 2026-05-08

> Miguel cierra TODOS los pendientes operativos: cambia trigger
> del workflow, crea el de ai_escalation, arregla 3 bugs de
> snippets en español, y entrega el doc completo de snippets.

### Mensaje resumido

```
Steve, además del snippets_textos.md que ya te pasé, te confirmo
que las otras 2 cosas pendientes también estan hechas hoy:

✅ Cambio de trigger en "DPM GT - Onboarding Piloto"
- Trigger ya cambiado de Lifecycle=Customer a tag deposit_paid
- Mantuve la Rama #2 con filtro tag Gili Trawangan como capa de
  seguridad
- Al final de cada rama (ES y EN) agregue accion de asignar al
  equipo Agents (ID 21595) Round Robin con toggle "solo usuarios
  online" activado
- Workflow publicado y operativo

✅ Workflow ai_escalation nuevo
- Nombre: "DPM GT - AI Escalation"
- Trigger: tag ai_escalation agregado
- Accion unica: asignar al equipo Agents 21595, Round Robin, solo
  usuarios online
- Sin mensajes intermedios — el humano agarra la conversacion directo
- Workflow publicado y operativo

Tags ai_escalation y deposit_paid ya creados en el workspace.

Bugs detectados y arreglados hoy en versiones ES de los snippets:
- GTESPAPERWORK no usaba las variables $contact, ahora si
- GTESQuma tenia link Quma roto, arreglado con
  maps.app.goo.gl/qmbzy2QjhgsdiSn76
- GTESSSIApp link iOS apuntaba a una app SSI vieja
  (id1117125353), cambie al ID oficial actual (id1249389209)

Sobre los PDFs del cuestionario medico SSI: vamos por la opcion
"snippet directo" porque en nuestro flujo nadie pide info medica
antes de pagar — el cuestionario solo se envia post-deposito via
el workflow GT.

Con esto del lado mio queda todo listo para arrancar el lunes 11/5.
```

### Análisis del archivo recibido

Path: `information/snippetstextosmdgilitai.md` (220 líneas, 13.7 KB).

**Estructura:**
- Sección 1: 7 snippets post-confirmación (auto-disparados por
  workflow tras tag `deposit_paid`)
- Sección 2: 3 snippets genéricos invocables por John en
  conversación
- Notas finales: reglas de uso del AI, variables de contacto,
  protocolo médico

**Snippets confirmados:**

| # | Código (EN/ES) | Categoría | Variables |
|---|----------------|-----------|-----------|
| 1 | `GTENPaperwork` / `GTESPAPERWORK` | Confirmación reserva | `$contact.programa`, `$contact.start_date`, `$contact.pax` |
| 2 | `GTENSizes` / `GTESSizes` | Datos personales |   |
| 3 | `GTENPreDiveTips` / `GTESPreDiveTips` | Tips pre-buceo |   |
| 4 | `GTENSSIApp` / `GTESSSIApp` | App SSI (centro 741421) |   |
| 5 | `GTENlocation` / `GTESlocation` | Maps DPM GT |   |
| 6 | `GTENaccommodation` / `GTESaccommodation` | Quma + Green Banana |   |
| 7 | `GTENQuma` / `GTESQuma` | Maps Quma standalone |   |
| 8 | `GENENMedical` / `GENESMedical` | Cuestionario médico SSI | tag `MEDICAL` |
| 9 | `INDOENFerryInfo` / `INDOESFerryInfo` | Fast boats / 12go.asia |   |
| 10 | `GTENClosingDays` / `GTESClosingDays` | Días cierre centro |   |

**Reglas operativas confirmadas:**
1. No duplicar contenido del workflow — los 7 snippets de la
   Sección 1 NO deben enviarse manualmente ni anticipar su
   contenido pre-pago.
2. Solo lenguaje del cliente — usar `*EN*` para inglés,
   `*ES*` para español.
3. Cuestionario médico solo post-depósito vía workflow.
4. Preferencia por invocación de snippet vs reescritura — John
   dice "te paso el detalle de hoteles" pero no reescribe el
   texto en sus palabras.

### Decisiones del lado de Steve

✅ **Agregar el archivo a la KB del AI** (KB_FILES seeder)
para que John tenga el texto literal de los 10 snippets como
contexto.

✅ **Actualizar `00_SYSTEM_PROMPT.md`** con los nombres exactos
de los snippets (CamelCase / UPPERCASE como están en el doc),
porque la sección que añadí en §15 usaba lowercase del primer
mensaje de Miguel.

✅ **Sin cambios de código de servidor** — la lógica de tags
(`deposit_paid` + `ai_escalation`) ya está implementada y matchea
exactamente lo que Miguel armó.

### Acciones tomadas (2026-05-08)

1. Mensaje guardado.
2. `snippetstextosmdgilitai.md` agregado al seeder como KB07.
3. System prompt v2.1 con códigos exactos de snippets.
4. Re-run de seeder pendiente (Tony lo ejecuta tras push).
5. Pendiente respuesta corta a Miguel acusando recibo.
