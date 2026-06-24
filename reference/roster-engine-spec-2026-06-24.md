# DPM Diving — Intelligent Roster Engine — Functional Specification

**Source:** Miguel (Papu)
**To:** Steve (Dev)
**Version:** 2.1
**Date:** 2026-06-24
**English translation:** prepared by Claude 2026-06-24 (original Spanish kept in `roster-engine-spec-2026-06-24.es.md` for reference)

This file is the canonical English version of Miguel's spec. The
implementation guide that draws from it lives in
`docs/roster-engine-architecture.md`.

## 1. What this is and why

**Today:** Papu builds the roster manually in a Google Sheet. Each day,
per sede, he looks at booked divers and groups them under an instructor
based on each diver's program — respecting how many divers each
instructor can take and at what depth. The roster on the panel (Vercel)
only deducts seats against a capacity counter — it does not group
divers, does not consider instructors.

**Goal:** the AI (which already sells, qualifies, charges, knows
certification level, and issues a unique code per diver) should
**automatically** do what Papu does manually in the Sheet. Build the
groups, assign instructors, validate instructor + seat availability,
and block the sale when it's not feasible. Plus support manual entry
for walk-ins.

**Guiding principle:** the **instructor is the primary constraint, not
the boat**. If no instructor can take the diver, the sale is blocked —
even if there are boat seats left.

## 2. The current Google Sheet as the data model

The Sheet is organised in blocks by **slot**: AM, PM, POOL, NIGHT. Each
block is a grid of divers. The real columns and what they mean:

| Column | Meaning | Use in the engine |
|---|---|---|
| Name | Diver's name | Identity (linked to the AI's unique code) |
| Bag / Reg / Reg# / Bcd / WS / Fin | Equipment + sizes | Gear logistics — does not affect grouping |
| Inst / Dm | Instructor / Divemaster assigned to the group | Group header. Roster: MIGUE, BILLY, ESTE, YOUNNES, TUTU, ARI, KIELE, Freelance1-3 |
| Lvl | Diver's certification level (BEG, OW, AA, RES…) | Determines allowed depth in fun dive |
| Activity | What the diver does that day (see §3 dictionary) | Determines class, depth, ratio |
| Ratio | Diver's **order within the group** (1, 2, 3, 4) | Position. Max 4 (or 6 if everyone is FD) |
| T1 / D1 / T2 / D2 | Tanks + dives per diver | Tank logistics |
| Tanks | Total tanks for the row | Gas / fill control |
| Capacity | Dive site capacity | Per-site cap (secondary constraint) |
| Site 1 / Site 2 | Dive sites of the day | Site assignment — informational |

**Key reading:** the `Ratio` column in the Sheet is NOT the max ratio.
It's the **order number** of the diver within their instructor's
group. "ARI – FD – 1, 2, 3" means ARI has 3 fun divers (diver 1, 2 and
3) and can still take one more up to the cap of 4. The engine uses
this to know how much slack each instructor has.

## 3. Activity dictionary (DPM's real codes)

Each Activity code defines depth, what it groups with, and the ratio.
This table is the heart of the engine:

| Code | Meaning | Depth | Groups with | Ratio |
|---|---|---|---|---|
| BD (confinada) | Try Scuba / DSD / Baptism in pool or pool-like environment | Pool | OW1 | 4 |
| BD (barco) | Try Scuba on the boat | Max 12 m | OW2 | 4 |
| OW1 | Open Water day 1 — confined / pool | Pool | BD-confinada, other OW1 | 4 |
| OW2 | Open Water — dives to 12 m | 12 m | BD-barco, other OW2 | 4 |
| OW3 | Open Water — dives to 18 m | 18 m | Other OW3 | 4 |
| FD | Fun Dive (certified diver) | 18 m if OW / 30 m+ if AA | FD with same depth profile, REF phase 2 | 6 |
| AA / AA2 | Advanced course day 1 / day 2 | Deep | AA, AA2, ADV (same dive) | 4 |
| ADV | Stand-alone adventure dive (wreck, deep, night, buoyancy, navigation, fish ID…) | Per adventure | AA, AA2, ADV (same dive) | 4 |
| SP | Specialty (deep, nitrox, wreck, buoyancy…) | Per specialty | Dedicated (doesn't mix) | 4 |
| RES | Rescue | Varies | Dedicated (doesn't mix) | 4 |
| REF | Refresh (certified diver +1 year inactive) | 2 phases (see below) | Phase 1: confined / Phase 2: as FD | 4 → 6 |

### 3.1 Two special cases that switch groups

**BD (baptism) switches group based on slot:** it's not a single
activity. In confined water (pool or pool-like environment) BD shares
with OW1 because the skills are the same. On the boat, BD shares with
OW2 because both go to max 12 m. The engine must check **where** the
BD takes place that day to know who to group it with.

**REF (refresh) is a two-phase process:** Phase 1 — the certified
diver (regardless of cert level: OW, AA, Rescue) reviews skills in the
pool because they haven't dived in over a year; occupies a confined
slot. Phase 2 — they then go diving as a Fun Dive at their cert level;
they group as FD per their depth profile. REF does NOT need a
dedicated instructor: starts in pool, ends as fun diver.

## 4. Grouping rules

### 4.1 Ratio — divers per instructor

**Uniform across all DPM sedes.** The group's ratio is set by the
**most restrictive** member:

- **Max 4** — if the group contains ANY BD, OW course (OW1/2/3),
  Advanced (AA/AA2/ADV), Specialty (SP) or Rescue (RES).
- **Max 6** — only if the entire group is Fun Dives (FD), including
  REF in phase 2.

**Mixed group rule:** a single ratio-4 member caps the whole group to
4. Example: 1 FD-capped + 3 BD = group of 4, not 6, because BD is
present.

### 4.2 Depth — group inherits the most restrictive

Everyone in the group dives at the depth of the LEAST-deep member. The
most-certified member "sacrifices":

- Level OW certified → 18 m max. Level AA (Advanced) → 30 m+ per sede.
- An FD-Advanced (30 m) and an FD-OW (18 m) go together only if the
  Advanced accepts capping to 18 m. Otherwise, separate groups.
- **Companion case:** an OW certified diver coming with their partner
  who does BD. The instructor takes the OW as an FD capped to 12 m + the
  partner as BD. Because BD is present → ratio 4 + depth 12 m. Two more
  BD divers can still fit (1 FD-capped + 3 BD).

### 4.3 Compatibility key

Two divers go to the same group (same instructor) only if they share:

```
key = (sede, fecha, slot, group_of_activity, depth_profile)
```

Where `group_of_activity` resolves the special cases:

```
BD-confinada / OW1                 → group 'pool_inicial'
BD-barco / OW2                     → group 'mar_12m'
OW3                                → group 'ow_18m'
FD / REF-phase2 (same depth)       → group 'fundive_<depth>'
AA / AA2 / ADV (same dive)         → group 'profunda'
SP                                 → group 'dedicado_sp' (one per specialty)
RES                                → group 'dedicado_res'

group_ratio = 6 if ALL FD/REF-phase2, otherwise 4
```

## 5. Data the AI must register per sale

The AI already issues a unique code, program and payment status. For
the engine to group, each diver also needs these fields. Fields still
to ensure are flagged.

| Field | Sheet equivalent | Already in the AI? |
|---|---|---|
| `codigo_buceador` | (new key, not in Sheet) | ✅ AI already issues it (`ref_code`) |
| `sede` | Roster sheet / sede tab | ✅ |
| `nombre` | Name | ✅ |
| `nivel_certificacion` | Lvl (BEG / OW / AA / RES) | ⚠️ **ENSURE — critical for depth** |
| `activity` | Activity (BD / OW1 / OW2 / OW3 / FD / AA / AA2 / ADV / SP / RES / REF) | ⚠️ **ENSURE — AI translates sold program to this code** |
| `fecha` | Roster date | ✅ |
| `slot` | AM / PM / POOL / NIGHT | ⚠️ **ENSURE** |
| `acepta_capar` | (certified diver accepts depth cap) | ⚠️ **ENSURE — optional, default `false`** |
| `estado_pago` | (payment status) | ✅ |
| `origen` | AI vs Manual walk-in | 🆕 New field |

**New resource — instructors available per day:** today in the Sheet
the instructor is assigned manually by picking from a list (MIGUE,
BILLY, ESTE…). The engine needs to know, per sede + date, how many /
which instructors are available. This is a staff input — same data
type as today's name pick on the `Inst/Dm` column.

## 6. Algorithm

For a given `(sede, fecha, slot)` with the list of booked divers:

1. For each diver, derive `group_of_activity` and `depth_profile`
   from the dictionary (§3) and the special cases for BD and REF.
2. Group divers by compatibility key (§4.3).
3. Within each key, partition into groups of size ≤ `group_ratio`
   (4 or 6). Fill open groups before opening a new one — minimises
   instructors needed.
4. `instructors_needed = total number of groups in the slot`.
5. **Validate instructor (primary):** if
   `instructors_needed > available[sede][fecha]` → sale cannot proceed.
   Report how many are missing.
6. **Validate boat / site (secondary):** if the slot uses a boat,
   verify the divers do not exceed the site's `Capacity`. If they do
   → cannot proceed, even with instructors.
7. If both pass, persist the assignment: each group with its
   instructor and its divers numbered (the `Ratio` 1, 2, 3, 4 column).
   Return the grouped roster — identical in shape to the current Sheet.

### 6.1 Real-time sale validation

Before closing the sale, the AI runs the algorithm in **simulation
mode** adding the candidate diver, for ALL days the program occupies
(an OW occupies OW1+OW2+OW3 on different days). The sale is feasible
only if ALL days pass. If it fails, the AI offers another date or
slot.

### 6.2 Manual walk-in

Staff loads a diver with the same fields (`origen = 'Manual'`),
generates or enters the code, and saving runs the same validation.
Reuses the panel's existing create form.

### 6.3 Instructor assignment + manual edit from office

The engine **picks the instructor automatically** when building each
group, drawing from the list of instructors available that day at that
sede (MIGUE, BILLY, ESTE, YOUNNES, TUTU, ARI, KIELE, Freelance1-3).

The assignment is **editable from the office**. Staff can swap
instructor A for instructor B manually on a group (typical case:
language — a Spanish-speaking group needs a Spanish-speaking
instructor).

**Critical implementation distinction** — two office operations look
similar but affect the engine totally differently:

| Office action | Effect on the engine |
|---|---|
| Swap instructor A → instructor B in a group | **NONE** on the logic. Pure name swap. Same number of groups, same capacity. AI does NOT recalculate. |
| Add an instructor to the day's availability | **CAPACITY UP**. Engine recalculates: more groups possible, AI can sell more. |
| Remove an instructor from the day | **CAPACITY DOWN**. If groups end up without instructor, AI stops selling those slots. |
| Boat has seats but no instructor available | AI does NOT sell. Instructor outranks the boat. An empty seat without an instructor is not sellable. |

**Why this separation matters:** swapping an instructor for language
(or any last-minute imprevisto) MUST NOT touch the logic the AI
already computed. The engine still sees "this day I need N
instructors"; who leads each group is irrelevant for the count. Office
makes last-minute changes without breaking anything. ONLY adding or
removing instructors changes real capacity.

**Golden rule of the system:** if there are no instructors available
but there's boat space, the AI does NOT sell. An empty boat is
worthless if nobody can lead the dive.

## 7. Test cases

Reproducible against the real Sheet. Steve must get these results:

| # | Scenario | Expected result |
|---|---|---|
| 1 | 2 OW2 + 1 BD-barco, same AM boat | 1 group (`mar_12m`), ratio 4, 3 filled, 1 slot open. 1 instructor. |
| 2 | 2 OW1 + 2 BD-confinada, POOL | 1 group (`pool_inicial`), ratio 4, full. 1 instructor. |
| 3 | 2 AA + 2 ADV-deep, same boat | 1 group (`profunda`), ratio 4, full. 1 instructor. |
| 4 | Case 3 + next day 2 new Advanced | Same instructor: AA2 from the first pair + AA from the new ones. 1 group. |
| 5 | 1 FD-OW (18m) + 1 FD-AA (30m), no cap accepted | 2 groups (different depth profiles). 2 instructors. |
| 6 | Case 5 but AA `acepta_capar = true` | 1 group at 18 m, ratio 6. 1 instructor. |
| 7 | 8 FD same level | 2 groups (6 + 2). 2 instructors. |
| 8 | 1 RES + 1 FD | 2 groups (RES is dedicated). 2 instructors. |
| 9 | 1 SP-nitrox + 1 SP-deep | 2 groups (each specialty is dedicated). 2 instructors. |
| 10 | REF: Fernanda phase 1 in POOL, then FD at her level | Phase 1 occupies confined; phase 2 groups as FD 18m. |
| 11 | 5 divers, only 1 instructor available | Sale that would open the 2nd group: BLOCKED, no instructor. |
| 12 | Instructors OK, site Capacity full | BLOCKED on secondary validation — no boat seat. |

## 8. Build phases

1. **Phase 1 — Data.** Move from aggregated counter to per-diver
   detail with the fields in §5. Add per-day instructor availability.
   Ensure the AI records `nivel_certificacion`, `activity`, `slot`.
2. **Phase 2 — Engine.** Implement the algorithm (§6) as a pure
   function: takes a slot's divers, returns groups + instructors
   needed. Validate against the 12 test cases.
3. **Phase 3 — Sale validation.** Expose the engine in simulation
   mode so the AI consults before closing.
4. **Phase 4 — Walk-in + UI.** Manual entry and a roster view grouped
   by instructor (matching the Sheet), replacing the panel's flat
   counter.

**Data source:** to be defined with Papu — divers live in Supabase
(`dpm-ai-production`) where the AI already writes. The engine reads
from there; the panel just renders. The current Sheet stays as the
design reference + manual backup until the engine is validated in
shadow mode.

## 9. Production rollout note

**Do not replace the current method on day one.** Run the engine in
**shadow mode**: it calculates and shows the groups, but staff
continues building the roster manually and compares the two outputs.
Wherever the engine differs from the manual build, it is tuned. When
the engine consistently matches staff judgement in one sede, that
sede is switched over and the rollout replicates to the rest. This
converts launch risk into a controlled transition.

---

## Appendix — Original WhatsApp message from Miguel (Spanish, verbatim)

> Tenemos si o si que arreglar el sistema de roster que tiene la ai.
> Es el mayor problema que veo.
> Puede contestar mejor o peor o tener algunos errores pero lo que más
> daña la producción real de la ai es el roster por que es muy difícil
> de hacer que vaya de la mano con la operación real de cada escuela.
> Al principio pensé que con el roster solo descontando disponibilidad
> podía funcionar pero no es viable.
> Así que no va a quedar otro remedio que hacer el roster de la misma
> manera que tengo en el Google sheet así la ai puede poner cada
> cliente en el lugar que corresponde y asociarlo a lo que realmente
> puede vender.
> Ya lo tengo si quieres te mando como creo que es así podrías
> realmente ejecutarlo ya que conozco muy bien la lógica del trabajo
> y como se pueden combinar los programas, las limitaciones de
> disponibilidad, y muchas pequeñas cosas que hacen que realmente la
> ai pueda escribir y hacer el trabajo eficiente.
> Mil gracias ese es nuestro mayor problema hoy viñedo viviendo en la
> ai cambiaría mucho como la ai se comporta y como se hace el trabajo
> en cada sede.
> A esto lo único que le faltaría es que entre el código único que la
> ai le da a cada cliente
