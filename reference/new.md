# Hilo Miguel — Contact Cleanup (Respond.io)

> Conversación iniciada: 2026-05-05
> Contexto: Miguel pidió en paralelo al panel un script para limpiar los
> 14,226 contactos en Respond.io antes de que el AI vaya a producción real.

---

## 1. Miguel — petición inicial (2026-05-05)

Hi Steve,

While you build the panel, I want to tackle something in parallel that I think is important: cleaning up the contact base in respond.io. We have 14,226 contacts and the data quality is mixed. Before the AI goes live, I want this cleaned so John (and the humans) work on a clean dataset.

Quick categorization of what I see:

1. Junk names: contacts with names like "$", "&y", ".", "**Heisenberg**", etc. Tests, spam, or people who never engaged.

2. No-name contacts: name field shows just the phone number (e.g. "+33 6 46 69 04 47"). Real humans behind them, but they never gave a name.

3. Special character names: "$ubbu", "$hilpi Ghoshal" — likely "$" instead of "S" from the autocomplete.

4. Dead leads: real names, real conversations, but tagged "No response" for months. Not dirty, just cold.

5. Duplicates: I haven't confirmed but with 14k contacts I'm certain they exist.

What I'd like to do:

A script that uses the respond.io API to:
- Export everything to CSV first (backup)
- Classify each contact into one of the categories above
- Output a dry-run plan showing what would change (rename, archive, merge, delete)
- Apply changes only after I review and approve
- Log every change in case we need to roll back

The policies (how many months until a lead is considered dead, archive vs. delete, how to handle duplicates when both have activity) I'll define before you write anything — doesn't make sense to code without those rules locked.

My questions:

1. Can you build this? How long do you estimate?
2. Does it conflict with the panel work or can it run in parallel?
3. Do you see a better approach? I'm not married to a script — if respond.io's native bulk tools handle most of this, even better.
4. Anything I should know about the respond.io API limits (rate limits, batch size) that affects how we run this?

No rush — the panel is priority. But I'd like to start defining policies on my side this week so we can execute when you have bandwidth.

Thanks

---

## 2. Steve — respuesta inicial (2026-05-05)

Hola Miguel,

Buenas, te respondo punto por punto.

1) ¿Se puede construir? ¿Cuánto tiempo?

Sí, perfectamente factible. Respond.io v2 API expone los endpoints
que necesitamos (list, get, update, tag, delete) y ya integré con esa
misma API para el envío de mensajes desde el AI, así que el patrón
está probado.

Estimación realista: ~3.5 días hábiles de desarrollo. Distribuido así:
- Cliente API + paginación + export CSV de respaldo: 0.5d
- Motor de clasificación con tus 5 categorías: 1d (empieza cuando
  vos cierres las políticas)
- Reporte dry-run en markdown (cuántos en cada categoría + sample +
  qué pasaría si aplicamos): 0.5d
- Modo apply con log JSONL para rollback + cap de seguridad: 1d
- Validación contra un batch pequeño (50 contactos) antes de correr
  los 14k: 0.5d

Importante sobre el alcance: este trabajo NO está dentro del alcance
de Pieza 1, que es estrictamente el AI customer service pilot de Gili
Trawangan. Es housekeeping del CRM operativo y aprovecha a las 5 sedes
y al equipo humano por igual. Mi propuesta para no embarrarlo:

Lo bundleamos a Pieza 2 como trabajo de preparación. DPM Cloud va a
heredar esta data, y querés que llegue limpia. Si te parece, lo
incluyo en la propuesta de Pieza 2 como un milestone "Data hygiene"
de 3.5d. Si preferís hacerlo standalone fuera de cualquier pieza
también va, lo cotizo aparte cuando me digas.

2) ¿Conflicto con el panel? No.

Es código completamente separado: el panel vive en el repo de la
integración (apps/panel) y el cleanup va como script independiente
(scripts/cleanup-respond-contacts.ts). No comparten archivos. La
única limitación es mi tiempo — soy una persona, así que en la
práctica corren en serie: termino el panel primero (KB editor demo
está listo de hecho, te paso el link en otro mensaje) y arranco
cleanup cuando tengas las políticas definidas.

3) ¿Hay un mejor enfoque? Casi seguro no, pero te explico qué probé
mentalmente:

- Export CSV nativo de Respond.io: sirve para backup pero no para
  modificar nada de vuelta.
- Bulk tag/archive en la UI: existe pero está pensado para lotes de
  25-50, no 14k. No es práctico hacerlo a mano.
- Dedupe automático en la UI: no existe. Hay que ir uno por uno.
- Reglas de auto-clasificación en Respond.io: no existen.

Conclusión: el script es el camino. La UI nativa solo nos sirve para
el backup inicial.

4) Límites de la API que afectan la corrida:

- Rate limit típico de Respond.io v2: ~100 requests/minuto. Vos podés
  ver el límite exacto de tu plan en Settings.
- Para 14,226 contactos, asumiendo unas 3 llamadas por contacto
  (read + update + tag) es ~42k requests, que a 100/min son ~7 horas
  de corrida total. Lo divido en lotes (ej. 500 contactos por sesión
  con backoff entre lotes) para no saturar.
- Respond.io no expone "merge contacts" como endpoint. Para duplicados
  con actividad en ambos hay que mover conversations al canónico y
  archivar el otro — eso suma complejidad y lo aclaro cuando me pasés
  la política de duplicados.

Cosas que vale aclarar antes de que escribas las políticas:

a) "Sin nombre" no siempre es junk. Hay clientes reales que nunca
   compartieron el nombre pero tienen historial activo. Mi propuesta:
   filtrar primero por "tiene 0 conversaciones" antes de marcar como
   junk.
b) Para duplicados con actividad en ambos: ¿el canónico es el que
   tiene más mensajes, el más reciente, el que tiene Branch seteado?
   Definí esa regla.
c) "Dead" necesita umbral concreto: "Sin respuesta del cliente >X
   meses" — me decís X.
d) Archivar vs borrar definitivo: para no perder histórico
   recomiendo archivar (mantiene el row en Respond.io pero lo saca
   del activo), salvo que sea junk obvio (nombre "$" + 0 mensajes).

Cuando tengas las políticas listas las repaso brevemente y arrancamos.
La corrida real (los 7 horas) la programo en horario que no choque con
tráfico real para no saturar a tus agentes humanos.

Saludos,
Steve

---

## 3. Miguel — políticas definidas (2026-05-05)

Hi Steve,

Thanks for the breakdown — the 7–10 day estimate is fair and I appreciate the validation step against 50 contacts before the full run. Smart.

Closing the four policy points:

A) "No name" classification:
  • No name + 0 inbound messages → junk → delete (this is the only delete case in the whole cleanup).
  • No name + 1-5 inbound messages → try to extract real name from the first inbound message; if not extractable, archive.
  • No name + 6+ inbound messages → do NOT touch the name, just add a "Name pending review" tag for manual follow-up. These are real engaged contacts and we don't want to mess with them automatically.

B) Duplicate canonical rule — priority order:
  1. Contact tagged "Customer" wins (paid client always wins).
  2. If neither is Customer: contact with more total messages wins.
  3. If tied on messages: most recently active wins.
  4. If both are Customer or any other ambiguous case: do NOT auto-merge. Flag for manual review and I'll decide.

C) Dead lead threshold: 7 months without an inbound message from the contact (counting from their last reply, not our last outbound).

D) Archive vs. delete: archive everything, with one exception only — junk names ("$", "&y", ".", random characters with no human pattern) AND 0 inbound messages. Those get deleted. Everything else is archived. When in doubt, archive.

Hard exclusion list (do not touch under any condition, even if they match the 7-month rule):
  • Tagged "Customer", "Booked", or "Repeat".
  • Has any record of a past deposit payment.
  • Has 6+ inbound messages without a name (point A above).

Approval flow:
  1. You run the script in dry-run mode against the full 14k.
  2. You send me the markdown report with category counts + samples.
  3. I review a random 5% sample (around 700 contacts).
  4. If the sample looks clean, I approve the apply mode.
  5. The 50-contact validation batch you proposed runs first.
  6. If validation passes, full run scheduled in low-traffic window.

One thing you mentioned in passing that I want to flag: "DPM Cloud will inherit this data". That makes the cleanup more important than I'd assumed. When you have a moment, I'd like to understand the DPM Cloud roadmap so I can plan accordingly — but separate conversation, not blocking this.

Ready when you are. Let me know when the panel demo is up and I'll review it in parallel.

Thanks

---

## 4. Steve — confirmación + flags técnicos (2026-05-05)

Hola Miguel,

Recibido. Las políticas están claras y son razonables. Tres
puntos técnicos que vale aclarar antes de que escriba código:

1) Extracción de nombre del primer mensaje (regla A, segundo nivel)

Para los "sin nombre + 1-5 mensajes" propongo una llamada barata a
Claude Haiku 4.5 por contacto (~$0.0001 cada una, total ~$0.50 si
hay ~5000 candidatos). El prompt extrae el nombre solo si aparece
explícitamente ("Soy Ana", "Hola me llamo Patricio", "Marcos here",
etc.) y devuelve null cuando no es claro. Los null caen en archive
— sigue siendo conservador. Te paso la heurística + 20 ejemplos
antes de correr para que valides.

2) Detección de duplicados

¿Cuál es la regla de "mismo contacto" para vos? Te propongo:
  • Mismo phone normalizado (sin espacios, con código de país) =
    misma persona. Esto cubre el 99% en WhatsApp.
  • Misma combinación nombre + email cuando ambos existen.
Si querés algo más liberal (ej. fuzzy match de nombre, por si
escriben "Marcos" vs "Marquitos") avisame y lo agrego, pero
recomiendo arrancar conservador y ampliar después.

3) Exclusión por "deposit payment record"

Esto es importante: el registro de depósitos vive en tu
BubbleManager local, NO en Respond.io. Desde el script no puedo
consultarlo directamente. Dos opciones:

a) Reemplazo esa exclusión por la combinación: tag "Customer" /
   "Booked" / "Repeat" + cualquier mensaje saliente histórico que
   mencione un código "DPM-XXXXXX" como referencia de pago. Esto
   cubre ~95% de los casos pero no es perfecto.

b) Exportás del BubbleManager los phone numbers o contact_ids de
   todos los que pagaron deposit alguna vez (un CSV simple,
   columna phone) y me lo pasás. Lo cargo como lista de exclusión
   y queda 100% cubierto.

La (b) es más segura. Si querés evito el problema de raíz y
hacemos (b) — se hace una vez y listo.

Approval flow lo seguimos al pie de la letra como lo escribiste.
Si en la validación de 50 contactos algo se ve raro paramos y
revisamos.

Roadmap de DPM Cloud — anotado, te paso propuesta formal por
separado en los próximos días (scope, milestones, costo, stack).
Con la conversación de hoy ya tengo más claro que querés que la
data llegue limpia, así que el milestone de migración va a estar
diseñado pensando en eso.

Demo del panel:
Está vivo. Entrá a https://pdm-diving.vercel.app/login,
pedí magic link a tu correo y vas a ver:
  • Editor de KB por sede con preview / Save / Diff con activa /
    Activar / Historial / Rollback
  • Editor del prompt del sistema con el mismo flujo
  • Pipeline, depósitos pendientes, conversaciones, follow-ups,
    regression panel
Te paso en mensaje aparte una guía de 1 página con captura de
pantalla de cada paso para que hagas tu primera edición real
(podés cambiar un precio, ver el diff, activarlo y desactivarlo
para que veas que no es destructivo).

Cuando me confirmes 1, 2 y 3 arrancamos cleanup.

Saludos,
Steve
