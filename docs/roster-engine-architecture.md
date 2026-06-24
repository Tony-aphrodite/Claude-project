# Intelligent Roster Engine — Architecture & Implementation Guide

**Status:** in-flight (Phase 1+2 in this session, Phase 3+4 follow-up)
**Owner:** Steve
**Spec source of truth:** [reference/roster-engine-spec-2026-06-24.md](../reference/roster-engine-spec-2026-06-24.md)
**Started:** 2026-06-24
**Target sedes:** all 5 (KT, PP, GA, GT, NP) — engine is sede-agnostic
**Rollout strategy:** shadow mode → per-sede activation (per spec §9)

---

## 0. Why this document exists

Miguel's spec (the file linked above) defines **what** the engine must
do. This file defines **how** we'll build it inside the existing
codebase: which packages, which tables, which functions, which
existing systems we keep / replace / extend.

Anything that the spec leaves open ("define with Papu", "ensure the AI
records X") gets a concrete decision here. Read the spec first; come
back here for the implementation contract.

---

## 1. The big picture

```
┌─────────────────────────────────────────────────────────────────┐
│                        OPERATOR (Miguel)                        │
└────────────────┬────────────────────────────────┬───────────────┘
                 │                                │
                 ↓                                ↓
        ┌─────────────────┐              ┌─────────────────┐
        │  Panel UI (Vercel) │            │  Google Sheet   │
        │  (Phase 4)        │            │  (manual backup) │
        │  - Roster grouped │            │  - Reference     │
        │    by instructor  │            │  - Compare vs    │
        │  - Walk-in form   │            │    engine output │
        │  - Instructor mgmt│            │                  │
        └────────┬─────────┘            └─────────────────┘
                 │
                 ↓ (reads/writes)
        ┌───────────────────────────────────────────────────────┐
        │                    Supabase (Postgres)                │
        │                                                       │
        │  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐ │
        │  │roster_divers│  │ instructors  │  │roster_groups │ │
        │  │(per-diver   │  │ + per_day    │  │(engine output│ │
        │  │ per-day)    │  │  availability│  │ persisted)   │ │
        │  └─────────────┘  └──────────────┘  └──────────────┘ │
        └────────┬──────────────────────────────────────────────┘
                 │
                 ↓ (reads, writes through service layer)
        ┌──────────────────────────────────────────────────────┐
        │              apps/server (Fastify)                   │
        │                                                      │
        │  Existing: process-message.ts (AI loop)              │
        │  New:      roster-engine.ts (pure function)          │
        │  New:      validar-cupo-grupo (AI tool)              │
        │  Existing: solicitar-deposito (calls engine pre-quote)│
        └────────┬─────────────────────────────────────────────┘
                 │
                 ↓ (called by AI as tool)
        ┌──────────────────────────────────────────────────────┐
        │                  Anthropic Claude                    │
        │  AI sells → calls validar_cupo_grupo → engine runs   │
        │  simulation → AI either closes or offers alt date    │
        └──────────────────────────────────────────────────────┘
```

---

## 2. What we keep, what we replace, what's new

### 2.1 Keep (already in place)

- `ref_code` system — corresponds to Miguel's `codigo_buceador`
- `program-schedule.ts` (`@dpm/server`) — per-program day-by-day slot
  pattern. We extend this to also emit the `Activity` code per day.
- `lead_metadata` — keeps conversation-level state (program, dates,
  pax, ref code). The engine reads from here to build `roster_divers`
  rows.
- 5-sede infrastructure, contact-state, OCR pipeline, etc. — unchanged.

### 2.2 Replace

- **Boat capacity counter model** in the current "Availability" view
  → becomes a **derived view** computed from `roster_groups` and
  `instructor_availability`. The counter still exists in the panel for
  human eyes, but it's no longer the source of truth.
- `consultar_disponibilidad` tool → **augmented** (not removed). It
  still tells the AI which dates have *any* slots open, but
  `validar_cupo_grupo` becomes the authoritative pre-sale check.
- The Apps Script push-back (commits `f6433cf` + the spec work this
  week) → **obsolete**. The engine becomes the source of truth, the
  Google Sheet becomes a manual backup / shadow-mode comparison
  target.

### 2.3 New

- 4 new Postgres tables (§3)
- Activity dictionary + grouping primitives in `@dpm/shared`
- Pure `buildRoster()` function in `@dpm/server/services/roster-engine.ts`
- 12 unit-test cases mirroring Miguel's spec §7
- New AI tool `validar_cupo_grupo` (simulation mode)
- Panel UI: roster-by-instructor view + walk-in form + instructor
  availability admin (Phase 4)
- Shadow-mode reporter: engine output vs Miguel's manual sheet diff

---

## 3. Data model

### 3.1 `roster_divers` — one row per diver per dive-day

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `sede_id` | uuid (FK sedes) | |
| `fecha` | date | The diving day this row represents |
| `slot` | enum('AM','PM','POOL','NIGHT') | Matches Miguel's Sheet blocks |
| `codigo_buceador` | text (NOT unique — same ref_code spans multiple days) | The AI's `ref_code` (e.g. `DPM-KT-0624-XXXXXX`) |
| `nombre` | text | Diver's first name |
| `nivel_certificacion` | enum('BEG','OW','AA','RES','DM','INS') | BEG = uncertified beginner |
| `activity` | enum (see §3.4) | What the diver does THIS day |
| `activity_detail` | text NULL | For SP/ADV subtypes ("nitrox", "deep", "wreck", "night", "buoyancy", "navigation", "fish_id") |
| `perfil_profundidad` | int | Computed depth ceiling (5/12/18/30/40), derived from activity + level |
| `acepta_capar` | boolean DEFAULT false | Set true only when AI explicitly asks + customer agrees |
| `origen` | enum('AI','Manual') | AI = booked through conversation; Manual = walk-in |
| `estado_pago` | enum('pending','deposit_paid','full_paid','cancelled') | Mirrors `lead_stage` for AI-origin rows |
| `conversacion_id` | uuid NULL (FK conversaciones) | NULL for walk-ins |
| `instructor_id` | uuid NULL (FK instructors) | Set by engine on grouping pass |
| `group_id` | uuid NULL (FK roster_groups) | |
| `group_order` | smallint NULL | 1..6, position within group (the Sheet's Ratio column) |
| `created_at` / `updated_at` | timestamptz | |

**Indexes:**
- `(sede_id, fecha, slot)` — primary lookup for engine runs
- `(conversacion_id)` — for the conversation → divers join
- `(codigo_buceador)` — for the ref code lookup
- `(instructor_id, fecha, slot)` — for the instructor-load query

### 3.2 `instructors` — master list per sede

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `sede_id` | uuid (FK sedes) | |
| `nombre` | text | MIGUE / BILLY / ESTE / YOUNNES / TUTU / ARI / KIELE / Freelance1 / Freelance2 / Freelance3 |
| `nombre_legal` | text NULL | Full legal name (for accounting) |
| `languages` | text[] | ['en','es','de','fr'] etc. — used by office for manual swaps |
| `active` | boolean DEFAULT true | False = no longer with DPM, never auto-assigned |
| `notes` | text NULL | |
| `created_at` / `updated_at` | timestamptz | |

### 3.3 `instructor_availability` — per-day staffing

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `sede_id` | uuid (FK sedes) | |
| `fecha` | date | |
| `instructor_id` | uuid (FK instructors) | |
| `slots` | text[] | Which slots they're available: `['AM','PM']`, `['POOL','NIGHT']`, etc. — empty array = off that day, omit row instead |
| `source` | enum('default','manual') | default = auto-populated from a weekly schedule (Phase 4); manual = office override |
| `notes` | text NULL | "language: ES preferred", "no deep dives", etc. |
| `created_at` / `updated_at` | timestamptz | |

Unique key: `(sede_id, fecha, instructor_id)`.

### 3.4 `roster_groups` — engine output, one row per group

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `sede_id` | uuid (FK sedes) | |
| `fecha` | date | |
| `slot` | enum('AM','PM','POOL','NIGHT') | |
| `instructor_id` | uuid (FK instructors) NULL | NULL = engine couldn't assign (capacity short); diver rows hold reference to this row |
| `grupo_actividad` | enum('pool_inicial','mar_12m','ow_18m','fundive_18m','fundive_30m','fundive_40m','profunda','dedicado_sp','dedicado_res') | The §4.3 compat key value |
| `perfil_profundidad` | int | 5 / 12 / 18 / 30 / 40 |
| `ratio_max` | smallint | 4 or 6 |
| `site_1` | text NULL | Office assigns day-of |
| `site_2` | text NULL | |
| `divers_count` | smallint | Cached count for fast queries |
| `engine_run_id` | uuid | Group runs produced together share this id (auditable) |
| `created_at` / `updated_at` | timestamptz | |

### 3.5 Activity codes (canonical)

```typescript
type Activity =
  | 'BD_CONFINADA'   // baptism in pool
  | 'BD_BARCO'       // baptism on boat (max 12m)
  | 'OW1'            // OW day 1 — pool
  | 'OW2'            // OW day 2 — 12m boat
  | 'OW3'            // OW day 3 — 18m boat
  | 'FD'             // fun dive (depth derives from nivel)
  | 'AA'             // Advanced day 1
  | 'AA2'            // Advanced day 2
  | 'ADV'            // stand-alone adventure dive
  | 'SP'             // specialty (deep/nitrox/wreck/etc.)
  | 'RES'            // rescue
  | 'REF_FASE1'      // refresh phase 1 — pool
  | 'REF_FASE2';     // refresh phase 2 — as FD
```

### 3.6 Compatibility groups (the engine's group key)

```typescript
type GrupoActividad =
  | 'pool_inicial'   // BD_CONFINADA + OW1 + REF_FASE1
  | 'mar_12m'        // BD_BARCO + OW2
  | 'ow_18m'         // OW3
  | 'fundive_18m'    // FD@OW + REF_FASE2@OW
  | 'fundive_30m'    // FD@AA + REF_FASE2@AA (+ AA capped-down member counts but is on AA group)
  | 'fundive_40m'    // FD with Deep Specialty
  | 'profunda'       // AA + AA2 + ADV (same dive)
  | 'dedicado_sp'    // each SP type gets its own group
  | 'dedicado_res';  // RES is dedicated
```

---

## 4. Pure engine — `buildRoster()`

The engine is a pure function. No I/O. Easy to unit-test. Wrapped by
a service that does the DB I/O.

### 4.1 Signature

```typescript
type BuildRosterInput = {
  sede: SedeName;
  fecha: ISO8601Date;
  slot: Slot;
  divers: RosterDiver[];
  availableInstructors: Instructor[];   // already filtered to this sede + date + slot
  boatCapacity?: number;                 // optional secondary constraint
};

type BuildRosterOutput = {
  groups: AssignedGroup[];               // each group has instructor (or null), divers (ordered), grupo_actividad
  instructorsNeeded: number;
  instructorsAvailable: number;
  valid: boolean;
  validation: {
    instructor: { ok: boolean; needed: number; available: number };
    boat: { ok: boolean; used: number; capacity: number | null };
  };
  unassignable: RosterDiver[];           // empty if valid; populated if either constraint fails
};

type AssignedGroup = {
  grupoActividad: GrupoActividad;
  perfilProfundidad: number;
  ratioMax: 4 | 6;
  divers: RosterDiver[];                 // ordered, length ≤ ratioMax
  instructorId: string | null;           // null if engine ran in "validation-only" mode and couldn't assign
};

function buildRoster(input: BuildRosterInput): BuildRosterOutput;
```

### 4.2 Internal stages

```
deriveActivityProfile(diver) → { grupoActividad, perfilProfundidad, ratioCap }
                                              │
                                              ▼
        groupByCompatibilityKey(divers) → Map<key, RosterDiver[]>
                                              │
                                              ▼
                packGroups(diversInKey, ratioMax)
                  (greedy fill-open-before-open-new)
                                              │
                                              ▼
            assignInstructors(groups, availableInstructors)
              (round-robin fairness OR same-instructor-multi-day affinity?)
                                              │
                                              ▼
                  validate(instructorCount, boatCapacity)
                                              │
                                              ▼
                          BuildRosterOutput
```

### 4.3 Sub-function contracts

**`deriveActivityProfile(diver: RosterDiver, sedeContext): ActivityProfile`**
- Given `(activity, nivel_certificacion, acepta_capar, slot)`, return:
  - `grupoActividad: GrupoActividad`
  - `perfilProfundidad: number`
  - `ratioCap: 4 | 6`
- Handles the BD/REF special cases inline.

**`groupByCompatibilityKey(divers: WithProfile[]): Map<key, WithProfile[]>`**
- `key = grupoActividad + ':' + perfilProfundidad`
- Pure pivot — no business logic.

**`packGroups(divers: WithProfile[], ratioMax: 4|6): WithProfile[][]`**
- Greedy: fill the current group until it hits `ratioMax`, then start
  a new one. Minimises group count → minimises instructors.
- The Sheet's "ratio 1, 2, 3, 4" ordering = the order of elements in
  each returned sub-array.

**`assignInstructors(groups, instructors): GroupWithInstructor[]`**
- For Phase 1+2: round-robin from the available list.
- Open question — multi-day affinity (test case #4: same instructor
  sees the same OW students day 1 → day 2 → day 3). The spec implies
  this (case 4 expects "mismo instructor: AA2 de los primeros + AA de
  los nuevos"). We'll handle in Phase 2 with a lookup against
  yesterday's `roster_groups`. If unavailable, fall back to round-robin.

**`validate({ groupCount, instructorCount, boatCapacity, divers }) → Validation`**
- Primary: `instructorCount ≥ groupCount`
- Secondary: `divers.length ≤ boatCapacity` if slot uses boat

---

## 5. Sale-time simulation — `validar_cupo_grupo` tool

### 5.1 Why a new AI tool

`consultar_disponibilidad` answers "are there seats open on date X for
program Y?" — a coarse yes/no based on the boat counter. The new
engine answers a stricter question: "if I add candidate diver D to the
roster, does the engine still produce a valid group assignment for
ALL days the program covers?"

### 5.2 Tool signature (Claude side)

```json
{
  "name": "validar_cupo_grupo",
  "description": "Validate whether a candidate diver can be added to the roster across all days their program occupies, considering instructor + boat constraints. Returns ok=true/false with failing days if any.",
  "input_schema": {
    "type": "object",
    "properties": {
      "sede_id": {"type": "string"},
      "candidato": {
        "type": "object",
        "properties": {
          "nombre": {"type": "string"},
          "nivel_certificacion": {"enum": ["BEG", "OW", "AA", "RES", "DM", "INS"]},
          "programa": {"type": "string"},  // e.g. "OW", "OW30", "AOW", "FunDive"
          "pax": {"type": "integer", "minimum": 1},
          "acepta_capar": {"type": "boolean", "default": false}
        }
      },
      "fecha_inicio": {"type": "string", "format": "date"}
    },
    "required": ["sede_id", "candidato", "fecha_inicio"]
  }
}
```

### 5.3 Server-side flow

```
1. Translate `programa + fecha_inicio` → array of (fecha, slot, activity)
   using extended program-schedule.ts (already exists, augment with activity codes)
2. For each (fecha, slot):
   a. Load current roster_divers for (sede, fecha, slot)
   b. Add candidate clone to the list
   c. Load instructor_availability for (sede, fecha) → filter to slot
   d. Run buildRoster() in simulation mode
   e. Collect verdicts
3. Return:
   {
     "ok": all_days_pass,
     "failing_days": [
       {"fecha": "2026-07-15", "slot": "AM", "reason": "no_instructor", "missing": 1},
       ...
     ]
   }
```

### 5.4 AI integration

`solicitar_deposito` already exists. The new contract:
1. AI gathers `nivel_certificacion`, `programa`, `pax`, `acepta_capar`
2. AI calls `validar_cupo_grupo` BEFORE `solicitar_deposito`
3. If validation fails, AI does NOT call `solicitar_deposito` — it
   offers an alternative date (using existing `consultar_disponibilidad`
   to scan ahead).
4. If validation passes, AI calls `solicitar_deposito` as today.
5. On payment confirmation (OCR auto-confirm path), the conversation's
   committed roster_divers rows are persisted (one per dive-day in the
   footprint).

---

## 6. Field capture — what the AI must extract

Today's `solicitar_deposito` already captures: program, start date,
pax, currency. We need to add:

| Field | Required? | Source / fallback |
|---|---|---|
| `nivel_certificacion` | YES | AI must ask if not stated. Default fallback: `BEG` (safest — assumes uncertified). |
| `activity` per day | DERIVED | Always derivable from `programa + day_offset`. Not asked. |
| `slot` per day | DERIVED | Always derivable from `programa + day_offset` + sede defaults. |
| `acepta_capar` | OPTIONAL | Default `false`. AI asks ONLY if a FD-AA diver is being added to a group that has an FD-OW present (depth conflict). Office can flip post-hoc. |

Prompt changes per sede (Phase 1.5):
- Add a qualification block: "Before quoting price + booking, confirm
  `nivel_certificacion`. If the customer doesn't mention it, ask
  warmly."
- Add `acepta_capar` rule (only triggers in a narrow case).

---

## 7. Migration strategy

### 7.1 Pre-launch state (this session)

- Schema migration adds the 4 new tables, empty.
- Existing `roster_bookings_sandbox` remains untouched — historical
  data preserved.
- No code path writes to `roster_divers` yet.

### 7.2 Phase 1 launch (next session)

- Schema in production.
- Backfill `instructors` table — Miguel inputs the roster (10 names
  per sede × 5 sedes = ~50 rows).
- Backfill `instructor_availability` — start blank; office fills
  weekly default schedule.
- New rows start landing in `roster_divers` from the OCR auto-confirm
  path AND from manual walk-in form.

### 7.3 Phase 2 launch — engine in shadow mode

- Engine runs nightly across the next 14 days.
- Output stored to `roster_groups` with `source = 'shadow'`.
- Panel surfaces a "Engine says X / Miguel sheet says Y" diff page.
- Miguel reviews + tunes until divergence < 5%.

### 7.4 Phase 3 launch — engine drives sales

- `validar_cupo_grupo` tool enabled for one sede first.
- AI consults engine before any sale.
- Boat counter still visible in panel but is read-only / derived.

### 7.5 Phase 4 launch — full UI

- Sheet-style panel view per slot.
- Walk-in form.
- Instructor availability admin.
- Google Sheet deprecated to "manual backup only".

---

## 8. Test coverage

The 12 scenarios in §7 of the spec → 12 unit tests. Each test:

```typescript
test('case N — scenario description', () => {
  const result = buildRoster({
    sede: 'Koh Tao',
    fecha: '2026-07-01',
    slot: 'AM',
    divers: [
      buildDiver({ nombre: 'A', nivel: 'OW', activity: 'OW2' }),
      buildDiver({ nombre: 'B', nivel: 'OW', activity: 'OW2' }),
      buildDiver({ nombre: 'C', nivel: 'BEG', activity: 'BD_BARCO' }),
    ],
    availableInstructors: [makeInstructor('ARI')],
  });
  expect(result.groups).toHaveLength(1);
  expect(result.groups[0].grupoActividad).toBe('mar_12m');
  expect(result.groups[0].ratioMax).toBe(4);
  expect(result.groups[0].divers).toHaveLength(3);
  expect(result.instructorsNeeded).toBe(1);
  expect(result.valid).toBe(true);
});
```

The full table of 12 tests is implemented in `apps/server/src/services/__tests__/roster-engine.test.ts`.

---

## 9. Performance + scaling notes

- Each `buildRoster()` call: O(N log N) where N = divers in the slot.
  Typical slot has 20-30 divers → microseconds.
- Sale-time simulation calls the engine 1–3× per validation (OW = 3
  days). p99 must stay under 200 ms (well below Anthropic's tool
  timeout).
- DB lookups per simulation: `~3 queries × 1-3 days = 9 queries
  max`. Use prepared statements + composite indexes (§3.1).

No caching needed at Phase 1+2 scale. Add Redis if Miguel grows past
500 daily divers per sede.

---

## 10. Open questions (parked until Miguel confirms)

These were flagged in the post-analysis message Steve drafted:

1. **6 new KT programs** (NightAdventure, NightFunDive,
   PerfectBuoyancy, UpgradeBasic, UpgradeScuba, Instructor) →
   Activity-code mapping:
   - NightAdventure → `ADV` (subtype `night`)
   - NightFunDive → `FD` (depth profile depends on cert)
   - PerfectBuoyancy → `SP` (subtype `buoyancy`) or `ADV` if Miguel
     treats it as Adventure-style
   - UpgradeBasic / UpgradeScuba → custom mapping (no equivalent in
     current dictionary — possibly `OW2` + `OW3` for upgrade dives?)
   - Instructor → not a diving activity at all; excluded from engine
2. **Instructor availability source** — manual panel input (Phase 4)
   vs Google Sheet import vs default weekly schedule. We're going with
   "manual panel input" as the source of truth, with a "default weekly
   schedule" override (Miguel sets MIGUE = ['AM','PM'] for Mon-Fri,
   we apply it automatically until a per-day manual override).
3. **`acepta_capar` UX** — AI auto-asks vs office-only flip. Going
   with "office-only flip" for safer default. AI never asks; office
   manually grants if a sale would unlock by capping.

---

## 11. What's in THIS session vs follow-up

### This session — Phase 1 + Phase 2
- [x] Spec saved (English)
- [x] This architecture doc
- [ ] DB schema migration (4 new tables) — next step
- [ ] Shared types + activity dict — next
- [ ] Pure roster engine — next
- [ ] 12 unit tests — next

### Follow-up session(s) — Phase 3
- AI tool `validar_cupo_grupo` integration
- Multi-day program footprint helpers
- `solicitar_deposito` wiring
- Per-sede prompt updates to capture `nivel_certificacion`

### Follow-up session(s) — Phase 4
- Panel UI (roster by instructor)
- Walk-in form
- Instructor admin
- Shadow-mode reporter

### Operator action (Miguel)
- Backfill instructor roster (50 rows)
- Confirm Activity-code mapping for the 6 new KT programs
- Define weekly default schedule per instructor per sede

---

## 12. File index for this work

| File | Purpose | Status |
|---|---|---|
| `reference/roster-engine-spec-2026-06-24.md` | Miguel's spec (English) | ✅ saved |
| `docs/roster-engine-architecture.md` | This file | ✅ saved |
| `packages/db/migrations/00XX_roster_engine.sql` | Schema migration | pending |
| `packages/db/src/schema.ts` | Drizzle ORM types | pending |
| `packages/shared/src/roster.ts` | Activity / GrupoActividad / RosterDiver / Instructor types + dictionary | pending |
| `apps/server/src/services/roster-engine.ts` | Pure `buildRoster()` function | pending |
| `apps/server/src/services/__tests__/roster-engine.test.ts` | 12 test cases | pending |
| `apps/server/src/tools/validar-cupo-grupo.ts` | New AI tool (Phase 3) | follow-up |
| `apps/panel/...` | Panel UI changes (Phase 4) | follow-up |
