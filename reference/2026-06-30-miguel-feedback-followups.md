# Miguel feedback 2026-06-30 — follow-up items pending implementation

**Source:** Miguel WhatsApp + screenshots throughout 2026-06-30 testing
of the v2.2 roster engine in production.

**Status when this doc was written:** v2.2 §1-§7 deployed and verified;
ActionForm UX polish deployed; ActionResult refactor (error message
survival in prod) deployed. Miguel started field-testing the panel and
flagged a series of UX gaps + design questions that need follow-up.

**Rule (Steve 2026-06-30):** no code changes from this doc until Steve
explicitly says "fix it". The doc is for triage + queue, not autonomous
work.

---

## Index of issues (most-blocking first)

| #  | Issue | Scope | Time | Status |
|----|---|---|---|---|
| 1  | "Asignar" button updates DB but UI still shows "Sin asignar" | UI bug (panel) | 30-45 min | 🔴 confirmed bug |
| 2  | Auto-generated ref code not visible in walk-in display | UI miss | 15 min | 🟡 small fix |
| 3  | Need a per-day diver list to verify what's loaded | Feature request | 1-2h | 🟡 new view |
| 4  | Código field placeholder confuses users (Miguel typed DPM-AM-D3D3) | UI clarity | 5 min | 🟡 copy edit |
| 5  | AI reservations not visible as individual cards in /roster/engine | Architecture gap | 4-6h | 🔴 spec gap |
| 6  | Confirm whether boat capacity includes the instructor seat | Design Q | 0 + Miguel reply | 🟡 awaiting Miguel |
| 7  | Bandeja humana con respuesta (chat from panel) | Big sub-project | 12-20 days | 🟢 already memorialized |

---

## #1 — "Asignar" button updates DB but UI still shows "Sin asignar"

**Miguel's words (screenshot, 2026-06-30 19:14):**
> "el boton de asignar queda cargando pero no asigna."

**Repro (verified by Steve via DB read):**

1. Fiky walk-in created (slot=AM, activity=BD_CONFINADA, instructor_id=NULL, group_id=NULL).
2. Lands in "Sin asignar a instructor" bucket of TURNO AM.
3. Miguel clicks "asignar" → form expands → picks Billy [INST] → clicks asignar.
4. Server action `reassignDiver` (→ `reassignDiverThisDay`) succeeds — DB shows `instructor_id = Billy.uuid`, audit_log row written.
5. `router.refresh()` fires, page re-renders.
6. **Fiky still appears under "SIN ASIGNAR A INSTRUCTOR — 1 BUCEADOR"** because the engine grouping uses `group_id`, not `instructor_id`. Fiky's `group_id` stayed NULL (engine packing never ran).

**Root cause:** the engine page groups divers by `${slot}::${groupId ?? "none"}`. Manually-assigned divers (instructor_id set, group_id null) hit the "none" bucket and look identical to truly unassigned divers.

**Fix shape:**

In `apps/panel/src/app/(app)/roster/engine/page.tsx`, change the grouping key:

```typescript
function groupKey(d: DiverRow): string {
  if (d.groupId) return `${d.slot}::${d.groupId}`;
  if (d.instructorId) return `${d.slot}::manual-${d.instructorId}`;
  return `${d.slot}::none`;
}
```

Then render "manual-{instructorId}" buckets as a synthetic group with:
- Header: instructor's nombre + "(manual)" badge
- No ratio/depth (motor didn't compute)
- Same eliminar / mover / reasignar actions per diver

Only divers where BOTH group_id AND instructor_id are null still go to "Sin asignar".

**Side benefit:** the alert "⚠ N buceadores sin asignar" in the top banner becomes truthful — it now reflects only fully-unassigned divers.

**Files affected:** `apps/panel/src/app/(app)/roster/engine/page.tsx` only.

---

## #2 — Auto-generated ref code not visible in walk-in display

**Miguel's words (final 2026-06-30 message):**
> "no hay ningun codigo autogenerado o no se ve, por eso creo que falta un listado de los alumnos cargados por cada dia para poder comprobar o de alguna otra manera ya me dices tu."

**Current display (engine page diver card):**
```
Fiky (BD_CONFINADA / BEG) · walk-in
```

The diver's `codigoBuceador` (e.g. `DPM-GA-0630-A1B2C3`) is in the DB but never rendered. Miguel sees no proof that the auto-generation actually happened.

**Fix shape:**

In the diver card render (both grouped and unassigned paths in `engine/page.tsx`), add the code:

```tsx
<span className="text-ink-500 text-[10px] font-mono">
  {d.codigoBuceador}
</span>
```

Optionally with copy-to-clipboard action (later UX polish).

**Why this matters operationally:** the code is the future SSI-online-registro auth ID (per `ref_code_per_pax_confirmed.md`). The diver uses it to register their certification. Office needs to see it without dropping into SQL.

**Files affected:**
- `apps/panel/src/lib/roster-engine-queries.ts` — already returns `codigoBuceador` in `DiverRow`. Verify.
- `apps/panel/src/app/(app)/roster/engine/page.tsx` — add render in the two diver-row templates (grouped table row + unassigned `<li>`).

---

## #3 — Need a per-day diver list to verify what's loaded

**Miguel's words (final 2026-06-30 message):**
> "creo que falta un listado de los alumnos cargados por cada dia para poder comprobar o de alguna otra manera ya me dices tu."

**Translation:** A flat per-day list of all divers loaded would help him verify the system state — currently the engine page groups by instructor, which can hide divers (especially after #1 is fixed) and doesn't give a quick "did all my walk-ins land?" view.

**Options:**

**A. Flat table view on the engine page (collapsible).**
Add a "Ver listado plano" toggle below the turno grid. When open, show a table:
| Nombre | Slot | Actividad | Instructor | Estado | Código | Origen | Audit |
| Fiky | AM | BD_CONFINADA | Billy (manual) | pending | DPM-GA-0630-A1B2C3 | Manual | created 14:32 |

**B. New page `/roster/divers?fecha=YYYY-MM-DD`**
Same data, dedicated route. Easier to bookmark and export.

**C. CSV export from current engine page.**
Smallest scope — adds a "Descargar CSV" button. Miguel can open in Sheets and audit.

**Recommended:** A first (cheapest), evaluate need for B later.

**Files affected (option A):**
- `apps/panel/src/app/(app)/roster/engine/page.tsx` — new collapsible `<details>` section.
- `apps/panel/src/lib/roster-engine-queries.ts` — `listDiversForDate` already has everything needed.

---

## #4 — Código field placeholder confuses users

**Repro:** Miguel typed `DPM-AM-D3D3` into the "Código (auto si vacío)" field, thinking AM was a placeholder he should fill. The format requires `DPM-<SEDE>-MMDD-XXXXXX`, so the action threw "Código inválido…".

**Current copy:**
```
Código (auto si vacío)
[ DPM-XX-MMDD-XXXXXX o vacío ]
Mismo formato que la AI — el buceador lo usa para acceder al
registro online cuando esté listo.
```

**Problem:** `DPM-XX-MMDD-XXXXXX` in the placeholder is shown as if it were an example — Miguel filled the XX with what he saw on screen ("AM" from the slot dropdown).

**Fix shape — clearer hint:**
```
Código del buceador (opcional)
[ Dejar vacío → se genera solo ]
ℹ Solo llenar si el cliente YA tiene un código del flujo de la AI.
  El server genera uno automáticamente con la forma
  DPM-<SEDE>-MMDD-XXXXXX cuando dejás el campo vacío.
```

**Files affected:** `apps/panel/src/app/(app)/roster/engine/page.tsx` — the input label + placeholder + helper text.

---

## #5 — AI reservations not visible as individual cards in /roster/engine

**Miguel's words (2026-06-30 morning message Q3 + Q4):**
> "lo mismo si entra una resrva desde la ai si descuenta si se escribe y si hay algun luigar para ver a quien se lo asigno y que dias asi si necesito mover al alumno o combiar al instructor puedo hacerlo."

**Current state:**
- AI confirms a sale (e.g. 4-pax OW) → writes ONE row to `roster_bookings` with `pax=4`.
- `roster_divers` has nothing for those 4 customers — there is no per-pax row.
- `/roster/engine` reads `roster_divers` → AI customers don't appear as individual cards.
- They DO consume capacity (the §7 consolidated SUM counts both tables), but they're invisible to the per-instructor view.

**Operational consequence:**
- Office can't see "Roberto, Lucía, Pablo, Ana" individually under their instructor.
- Office can't reassign or move individual AI-sold divers.
- All Miguel's reassign / swap-leader / mover UI we just shipped is walk-in-only.

**Fix shape (the real work — ~4-6h):**

On the AI confirmation path (currently writes `roster_bookings`), ALSO write per-pax rows to `roster_divers`:

1. After `confirmBooking()` in `apps/server/src/services/roster-db.ts`:
   ```typescript
   for each pax {
     INSERT roster_divers (
       sede_id, fecha, slot,
       codigo_buceador,  // from leadMetadata.ref_codes_by_pax
       nombre,           // from leadMetadata.nombres_por_pax (need to add this)
       nivel_certificacion,  // from leadMetadata.programa derivation
       activity,         // derived from programa + day-offset
       perfil_profundidad,
       origen='AI',
       estado_pago='deposit_paid',
       conversacion_id
     )
   }
   ```

2. Multi-day programs (OW = 3 days) → one row per (pax × day).

3. The `roster_bookings` row stays — it's the source of truth for the booking-level data + the AI's reservation flow. `roster_divers` becomes the per-diver detail layer the office sees.

4. Engine grouping then auto-includes AI customers — they group with walk-ins on shared slots.

5. Reassign / swap / eliminar all work uniformly across AI and walk-in divers.

**Open design questions before implementation:**
- Where does the diver's `nombre` come from? Today the AI captures it loosely in the conversation; we need a canonical field on `leadMetadata` (e.g. `nombres_por_pax: string[]`). Either:
  - Make the AI extract names explicitly during qualification.
  - OR fall back to `Cliente 1`, `Cliente 2` placeholders the office renames later.
- How to handle `nivel_certificacion` per pax — the AI knows the group's level but per-pax detail might vary (e.g. one OW certified, one beginner in mixed group).
- Idempotency: re-running confirmBooking (OCR retry) must not duplicate diver rows. Use `(conversacion_id, slot, pax_index)` as a natural key for upsert.

**Files affected:**
- `apps/server/src/services/roster-db.ts` — extend `confirmBooking` flow.
- `packages/shared/src/types.ts` — add `nombres_por_pax` (or equivalent) to `LeadMetadata`.
- `apps/server/src/handlers/process-message.ts` — capture names from AI flow.
- Possibly prompt edits to make the AI ask "¿cómo se llaman los buceadores?" during qualification.

---

## #6 — Boat capacity: includes instructor seat or not?

**Miguel's words (2026-06-30 morning Q2):**
> "también debo comprender si al instructor lo cuenta como un espacio en el barco o no?"

**Current model:** boat capacity = customer seats only. Instructor goes regardless (own logistics). Per-sede caps:
- KT 35 · PP 22 · NP 18 · GT 20 · GA 20

These match Miguel's 2026-06-23 sheet audit: `CAPACIDAD + RESERVADOS = <cap>` per slot, where RESERVADOS counted customers only.

**Pending:** Miguel needs to confirm this interpretation. Two outcomes:

- **"22 = customer ceiling, instructor goes aparte"** → no code change needed.
- **"22 = total including instructor"** → matching engine must subtract 1 per group's instructor before validating boat capacity (spec §6 secondary check).

**Files affected (if needs change):** `apps/server/src/services/roster-engine.ts` — the boat-capacity validation step in `buildRoster`.

---

## #7 — Bandeja humana con respuesta (chat directly from the panel)

**Miguel's words (2026-06-30 morning, first message):**
> "Todavía no está hecha la parte, incluso de de poder chatear directamente desde el comando central con los clientes."

**Original request:** 2026-06-12 resilience layer message, component #2. Already documented in the followup memory but not yet in `reference/`. This is its first formal pass into the followup queue.

**Status:** Large sub-project (~12-20 days). Eight components in the original Miguel message:
1. Crash-proof ingestion endpoint
2. **Operator inbox with reply** ← Miguel's #7 here, the immediate ask
3. Auto-respuesta de respaldo
4. Monitoring + alert
5. Health dashboard semáforo
6. Quick replies + per-sede resources panel
7. "Guardar respuesta" button
8. Send-layer abstraction for Respond.io exit migration

**Recommended next step:** save the original 2026-06-12 message to `reference/2026-06-12-miguel-resilience-layer-respondio-exit.md` (per `feedback_save_miguel_docs.md` policy — this doc never made it in) and start a scope/quote conversation with Miguel.

This is OUT OF SCOPE of the current contract (per `scope_pieza1_definitive.md` — Pieza 1 is the AI sales agent only). Treat as a Pieza 4 sub-project for negotiation.

---

## Implementation order (when Steve says go)

The order minimises rework — each item builds on the previous:

1. **#4 (5 min)** — Código placeholder copy edit. Trivial.
2. **#2 (15 min)** — Show codigoBuceador in diver cards. Trivial.
3. **#1 (30-45 min)** — Manual-assignment grouping in engine page. Tightens the §4 reassign UI we just shipped.
4. **#3 (1-2h)** — Per-day flat diver list. Now Miguel can audit visually.
5. **#5 (4-6h)** — AI write to roster_divers. The architectural fix; unblocks Miguel's "see AI customers under each instructor" need.
6. **#6** — Wait for Miguel's confirmation on Q2 before touching the engine.
7. **#7** — Separate contract / quote phase.

**Total for #1-#5 if approved as a batch:** ~6-9 hours.

---

## Open from Steve to Miguel (Spanish reply ready when requested)

Suggested message body summarising the gap analysis:

> Papu, dejo en un solo lugar lo que vimos hoy y lo que queda por
> arreglar — con orden de prioridad. Pasame OK y arranco.
>
> Lo que ya funciona y podés probar tranquilo:
>   ✓ Walk-in se carga, descuenta cupo del barco, valida instructor
>   ✓ El error "Código inválido" ahora aparece claro en rojo en el form
>   ✓ Atomic claim (dos cargas simultáneas no rompen)
>   ✓ Soft-delete + audit log
>
> Pendientes que vi de tu testeo (los voy a arreglar en este orden
> cuando me confirmes):
>   1) Mostrar el código auto-generado del buceador en la tarjeta
>      (hoy se genera pero no se ve)
>   2) Al asignar manualmente un instructor, que el buceador salga
>      de "Sin asignar" y vaya a la tarjeta de ese instructor
>      (hoy se asigna en la base de datos pero la pantalla no lo
>      refleja — por eso parecía que el botón "no asignaba")
>   3) Aclarar el campo Código en el form de walk-in (vos pusiste
>      DPM-AM-D3D3 porque el placeholder es confuso — voy a dejarlo
>      como "Dejar vacío → se genera solo")
>   4) Agregar listado plano por día — buceadores con código,
>      instructor, día — para que puedas auditar de una mirada
>   5) Hacer que las reservas de la AI también escriban filas
>      individuales por buceador en roster_divers, así aparecen
>      como tarjetas en /roster/engine y los podés mover / reasignar
>      igual que los walk-ins. Hoy contribuyen al cupo pero no son
>      visibles individualmente.
>
> Necesito confirmación tuya en una cosa antes de tocar el motor:
>   ¿Para vos esos 22 lugares del barco de Phi Phi incluyen al
>   instructor (= 21 alumnos + 1 instructor) o son 22 alumnos y el
>   instructor va aparte? Si es lo primero ajusto el motor.
>
> Y queda pendiente lo de chatear desde el panel — eso lo veo como
> contrato aparte (~2-3 semanas) porque toca panel + server + integración
> Meta. Te paso propuesta formal cuando me digas que arranquemos.
