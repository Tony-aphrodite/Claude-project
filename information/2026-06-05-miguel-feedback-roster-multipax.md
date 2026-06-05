# Miguel feedback — 2026-06-05 — Roster cutover + multi-pax + missing wiring

Verbatim feedback delivered after Tony's verification tests of the catalog
flow showed the catalog itself working, but with multiple downstream gaps
that block production-real use. Miguel is firm: nothing fully works until
this list is closed.

---

## Verbatim message from Miguel

> *El problema con la disponibilidad sigue siendo igual, tiene que comprobar con el equipo humano.*
>
> *Las fotos se envían bien cuando es un solo programa cuando es multiprograma no envía la foto de cada programa solo de uno.*
>
> *Y la disponibilidad sigue prometiendo preguntar a la oficina.*
>
> *Para que envíe de cada programa tengo que preguntárselo. Eso tiene que ser en automático.*
>
> *Si el cliente quiere reservar son 3 personas y cada persona quiere algo diferente debería enviar la foto y la descripción de cada uno. Sin necesidad de que el cliente le esté preguntando nuevamente ya que se le comunicó a la AI que son 3 y que tienen diferentes intereses.*
>
> *Luego la disponibilidad sigue sin saber dice que tiene que preguntar a la oficina. Y nada no funciona la disponibilidad.*
>
> *Dónde está la disponibilidad en el comando central?*
> *Preguntas and? Y te digo que…. No funciona cuando la AI busca la disponibilidad. Por qué no funciona? Por qué la respuesta de la AI es tengo que preguntar a la oficina. Eso dije.*
> *Dónde está el bloque de donde mira la AI la disponibilidad?*
>
> *La AI de momento con cada venta que vamos fingiendo deja algunos pasos sin hacer.*
> *1. No agrega el programa.*
> *2. El humano cada programa que vende tiene que hacer un proceso para que ese cliente quede guardado en una base de datos así la escuela sabe que es lo que se vendió para preparar la logística.*
> *3. Cuando la AI se hace cargo de la conversación de un cliente no se lo asigna a ella y la conversación queda en respond sin asignar.*
>
> *Cuando esté solucionado el problema de la disponibilidad pasamos a ver estos pormenores y cómo se solucionan.*

## Tone clarification from Miguel

> *Imagínate una cosa. Tú estás queriendo que funcione verdad? Y yo también, no hay lugar para hablar mal el uno al otro eso no es bueno. Si tú español o tu traductor lo hace mal tienes que tener el grado de entender que puede tratarse de un error por que yo no hablo mal a la gente no soy ese tipo de persona pero no me gusta que me hablen mal. Yo busco lo mismo que vos, terminar que funcione y poder trabajar.*

Recorded so future sessions remember: Miguel is collaborative, not antagonistic.
He's frustrated about specific functional gaps, not the team. Future feedback
should not mistake his directness for hostility.

## Visual evidence (screenshots)

1. **Conversation with date proposal**: AI replied *"Necesito verificar la disponibilidad para el 24 PM con el equipo, te confirmo apenas tenga la info"* — i.e. the AI is in fallback mode even though Apps Script returned data this week per probes. Pattern repeats on multiple turns.
2. **Multi-program request**: customer wrote *"And advance program?"* — AI sent ONLY the Advanced card. Should have sent Try Scuba + Refresh + Advanced (per prior context: "3 personas con diferentes intereses").
3. **Command Center**: side bar has Dashboard / Pipeline / Depósitos / Auto-confirmados / Simulator / Conversaciones / Follow-ups / Prompts / KB / Regression. **No Roster section** — Miguel is asking explicitly *"Dónde está la disponibilidad en el comando central?"*
4. **Contact panel of a deposit_paid lead**:
   - pax: `1`
   - Monto: `40`
   - Moneda: `USD`
   - Turno: *empty* (not filled)
   - programa: *empty* (not filled)
   - descuento: *empty*
   - Etiquetas: `deposit_paid`, `Koh Phi Phi`, `venta_completa`
   - **Assignee**: "Sin asignar" — the AI did not claim the conversation

---

## Issue-by-issue analysis

### A — Disponibilidad still says "preguntar a la oficina" (CRITICAL)

**What Miguel observes**: every test of "X de junio para Y personas" gets *"necesito verificar con el equipo"* — i.e. the safe fallback message we wrote into the prompt.

**Why this happens (technical root cause)**:
- The AI calls `consultar_disponibilidad` → handler invokes `appsScriptService.fetchAvailability`
- Apps Script call sometimes times out (Google cold-start), returns 4xx, or returns ambiguous data
- When ANY of those happen, the consultar_disponibilidad result has `ok: false` or empty slots
- The DISPONIBILIDAD—FALLO/TIMEOUT prompt rule then forces Francisco to say "necesito verificar"
- Customer perceives this as "the AI doesn't know"

**What Miguel wants**: stop reading the Apps Script. Read from our DB. The DB has clear capacity + bookings; no flakiness, no timeouts, no "preguntar a la oficina".

**Fix (Slice 3a — implementing today, no Apps Script)**:
1. Add `getAvailabilityForProgram(sedeId, programa, startDate, pax, fundiveSlot?)` to `roster-db.ts` that:
   - Computes required slots via `getRequiredSlots(programa, fundiveSlot)`
   - For each required slot, computes fecha + reads `roster_capacity_overrides` + `roster_bookings`
   - Returns same `AvailabilityResponse` shape that the AI tool already expects (so the prompt rules and tool consumer code don't change)
2. Modify `consultarDisponibilidadHandler` in `process-message.ts` so PP sede uses `rosterDbService` instead of `appsScriptService`. Other sedes (GT, GA, KT, NP) continue with Apps Script until they cut over.
3. The DB is mostly empty today (default capacity 22 per turno) so PP will return *available=true* for any reasonable date that isn't manually blocked → AI stops saying "verificar con equipo" for the common case.
4. Update prompt rule DISPONIBILIDAD—FALLO/TIMEOUT to emphasize the new behavior: "the DB is the source of truth — confirm directly to the customer when it says available; only fall back to 'verificar con equipo' on technical errors of the tool itself".

### B — Multi-program catalog send (HIGH)

**What Miguel observes**: customer mentions 3 people with different programs; AI sends only 1 catalog photo. To get the rest, Miguel has to ask the AI manually.

**Why this happens**: The current prompt rule for `enviar_catalogo` says "Mandar 1 tarjeta, ofrecer la siguiente". The dedup guard added 2026-06-04 prevents sending the same card twice but does not encourage sending multiple distinct cards in the same turn when context warrants it.

**What Miguel wants**: when context already shows multi-pax with different programs, AI sends one card per program automatically.

**Fix (Slice 3b)**:
1. Update prompt CATÁLOGO—CRÍTICO section to add a new sub-rule: when customer message or recent history shows *multiple distinct programs* (e.g. "uno hace Try Scuba, otro Fun Dive, otro Advanced"), the AI MUST call `enviar_catalogo` for EACH program in the same turn, before the descriptive text.
2. Server-side check is unnecessary: the prompt rule + the existing dedup guard (which only blocks the SAME programa) already allow multi-card sends across distinct programs.
3. Important UX caveat: WhatsApp may render 3 image attachments + a long description as a wall. Need to keep the post-message text shorter when 2+ cards were sent — focus on the closing question rather than 3 separate explanations. Update prompt accordingly.

### C — Custom fields not filled (HIGH)

**What Miguel observes**: contact panel shows `pax: 1, Monto: 40, Moneda: USD` but `Turno: empty, programa: empty`.

**Why this happens**: The handler code at `process-message.ts:1138-1153` calls `respondIoClient.updateContactCustomFields` with programa + turno + start_date + pax + moneda. BUT it only runs inside the `consultar_disponibilidad` success path. If the AI never reached a successful `consultar_disponibilidad` call (because of the Apps Script flakiness), those fields are never pushed.

**Fix (Slice 3c)**:
1. Slice 3a (DB-backed disponibilidad) will make `consultar_disponibilidad` reliably succeed → custom fields will start populating naturally.
2. ALSO: when the AI calls `solicitar_deposito` (which currently fills pax/monto/moneda), have it ALSO push the programa + turno + start_date if they are present in `lead_metadata` from a prior consultar_disponibilidad. This way, even if the customer skipped the disponibilidad path, the deposit step populates everything.
3. Verify the field NAMES in Respond.io custom fields match exactly: `programa`, `turno`, `start_date`. The screenshot shows lowercase `programa` and `Turno` (mixed case). If our code sends one case and Respond.io expects another, the field never sets. Need to double-check exact spelling.

### D — Sale data not auto-saved for the school logistics (HIGH)

**What Miguel observes**: when a sale closes, the human has to do a manual process to save the customer info to a database so the school can prepare logistics.

**Why this happens**: Today's flow stops at "deposit_paid" tag + lead_metadata.ocr_result. The office team then has to manually transcribe to their own logistics sheet (the per-day roster sheet from the screenshots earlier in the week).

**What Miguel wants**: once a sale closes, the customer + program + fecha + turno + pax should be auto-saved in a queryable database that the school can consult for daily logistics.

**Fix**:
1. We already have `roster_bookings` (added in Slice 2). Every deposit_paid via OCR validation writes one row per (fecha, turno) for that lead.
2. Slice 3a closes the loop: once consultar_disponibilidad uses DB and AI starts confirming dates correctly, the bookings table will populate fast.
3. NEEDS: a panel view (Slice 3e) for the school office to query bookings by date / sede / week. Without UI, the office can't see what's there.
4. Bridge until panel UI: a simple SQL export the office can run weekly, OR an email summary that the system sends Miguel/Patrick at end of day with the day's confirmed bookings.

### E — Roster not visible in command center (MEDIUM-HIGH)

**What Miguel observes**: side bar has no "Roster" / "Disponibilidad" item. He explicitly asks "¿Dónde está el bloque de donde mira la AI la disponibilidad?".

**Why this happens**: We built the roster backend (DB, service, admin endpoints) but did NOT build the panel UI. The Slice 3e was deferred.

**Fix (Slice 3e)**:
- Add `Roster` link to the side bar under `OPERACIÓN`
- Page: per-sede selector → calendar/week view showing capacity / reserved / available per turno per day
- Block / Unblock buttons per (fecha, turno)
- Bookings list (recent + upcoming, filterable by sede, status)
- Manual "Seed Booking" form (calls `POST /admin/roster/booking`)

### F — AI does not assign itself to the conversation (LOW-MEDIUM)

**What Miguel observes**: conversation stays "Sin asignar" in Respond.io even though the AI is replying.

**Why this happens**: Respond.io's `assignee` field stays null unless explicitly set. Our server-side code doesn't set it because the contract was that the AI is a "team member" abstract; the assignment is for HUMAN agents.

**What Miguel wants**: when the AI handles a conversation, it should be visible as the assignee, so:
- Operators don't pick up conversations the AI is already handling
- The dashboard shows who owns each conversation
- Workflows that gate on assignee can include the AI

**Fix (Slice 3d)**:
1. Identify if Respond.io workspace has a user/team configured for the AI agent. If not, create one in their UI: "Francisco (AI)" or similar.
2. Add a call to `respondIoClient.assignConversation(conversationId, userId)` whenever the AI starts handling a conversation. Idempotent — already-assigned conversations skip.
3. When the AI hands off to a human (via the existing handoff flow), re-assign to the human team.

---

## Implementation priority

Per Miguel: *"Cuando esté solucionado el problema de la disponibilidad pasamos a ver estos pormenores"* — disponibilidad is the gate.

Order:
1. **Slice 3a** (disponibilidad cutover) — unblocks everything else
2. **Slice 3b** (multi-program catalog)
3. **Slice 3c** (custom fields population — naturally fixes after 3a)
4. **Slice 3d** (AI self-assignment)
5. **Slice 3e** (panel UI — needed for Miguel to feel it's "real")
6. **Slice 3f** (sale-saved automation — already partial via roster_bookings; UI is the missing piece)

Each slice ships independently with its own deploy + test.

---

## Decisions confirmed by Miguel (recapped here for reference)

From feedback Entry #19 earlier today:
- Capacity: per-day, per-slot, default 22, overrideable ✅ (live)
- Block via FLAG, not capacity=0 ✅ (live, verified curl-by-curl)
- Seed future bookings before go-live via `/admin/roster/booking` ✅ (live, endpoint ready)

From this Entry #20 message:
- Do NOT use Apps Script. Use the DB-backed approach (his recommendation from Entry #19 #2).
- Multi-program send must be automatic
- Sale data must auto-save (already partial via roster_bookings; complete via panel UI + custom fields)
- AI must assign itself

---

## Open questions for Miguel (to ask after Slice 3a lands)

1. The "Sin asignar" fix — does Respond.io already have a user/team for "Francisco AI" or do we need to create one? Preferred name?
2. For multi-pax with different programs: should the AI send 3 separate image attachments in the same turn (heavy but informative), or send them sequentially with a small delay between each (slower but easier to read)?
3. Sale-saved auto-email summary: would a daily 6pm summary email of all bookings to Miguel + Patrick be useful as a bridge until the panel UI lands?
