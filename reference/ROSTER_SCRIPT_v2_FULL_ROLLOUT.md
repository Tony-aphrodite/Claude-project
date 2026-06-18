# Roster Apps Script v2 — full 4-sede rollout (Miguel 2026-05-19)

> Source message: WhatsApp from Papu (Miguel) 2026-05-19.

Extends [16-information-koh-tao/ROSTER_SCRIPT_v2_NOTES.md](16-information-koh-tao/ROSTER_SCRIPT_v2_NOTES.md). Same `/exec` URLs as before — Miguel re-deployed via "Manage Deployments → New Version" so the existing URLs in `sedes.roster_config.url` keep working.

## What's new in this v2 wave

Beyond the KT-specific contract documented in the original v2 notes:

| Feature | Behavior |
|---|---|
| Per-day schedule with flags `requires_boat` / `require_all` | Some program days are pool-only or all-required-slots; the script understands the pattern. |
| 14-day forward search | If the requested date doesn't fit, the algorithm walks forward up to 14 days and picks the next valid block. |
| `offset_dias` | New field in the response: how many days the result is shifted from the original request. `0` = day requested fits; `2` = had to walk 2 days forward. |
| `failingSlots` | New field: list of slots that couldn't be filled (no boat, capacity below pax, slot not allowed for curso, past cutoff). Lets the AI explain *why* a window failed. |
| Backward compatibility | Calling without `curso` (legacy path) still works — returns simple N-day report. |

## Per-sede curso vocabulary (Miguel's CURSOS dictionaries)

### Gili Trawangan — 12 cursos
`TryScuba`, `ScubaDiver`, `OW`, `OW30`, `Advanced`, `Refresh`, `RefreshAdvanced`, `FunDives`, `DeepAdventure`, `DeepSpecialty`, `Rescue`, `Nitrox`

### Gili Air — 15 cursos
All of GT plus night variants: `AdvancedNight`, `RefreshAdvancedNight`, `NightAdventure`, `NightFunDive`

### Koh Phi Phi — 24 cursos (largest catalog)
`TryScuba`, `ScubaDiver`, `OW` (3d), `OW2days`, `OW30`, `Advanced` (D1 PM+nocturno require_all), `AdvancedAlt`, `Refresh`, `RefreshAdvanced`, `FunDives`, `Adventure`, `DeepAdventure`, `NightAdventure`, `NightFunDive`, `Rescue` (2d), `ReactRight`, `NitroxSpecialty`, `PerfectBuoyancy`, `WreckSpecialty`, `AdvancedWreck`, `NightSpecialty`, `DeepSpecialtyOW`, `DeepSpecialtyAOW`, `BasicToOW`, `ScubaDiverToOW`

### Nusa Penida — 18 cursos (no night dives)
`TryScuba`, `ScubaDiver`, `OW`, `OW30`, `Advanced` (D1 PM, D2 AM+PM require_all), `AdvancedAlt` (D1 AM+PM require_all, D2 PM), `Refresh`, `RefreshAdvanced`, `FunDives`, `MantaFunDive` (AM only — specific Manta Point request), `DeepAdventure`, `NitroxSpecialty`, `NitroxDry`, `DeepSpecialty`, `ReactRight`, `Rescue` (3d), `BasicToOW`, `ScubaDiverToOW`

### Excluded from CURSOS (escalate to human)
`Divemaster`, `Instructor` — should fire `escalation_reason: out_of_scope` and forward to office phone.

## Time-of-day cutoffs (server-side handling)

| Sede | AM cutoff | PM cutoff | Night cutoff | Grace |
|---|---|---|---|---|
| KPP | 7:00 | 12:30 | 18:00 | none |
| NP | 6:30 | 12:00 | — (no night) | 30 min AM, 15 min PM |
| GA | — | — | — | (prompt-level, .gs has none) |
| GT | — | — | — | (prompt-level, .gs has none) |

Our server-side cutoff logic in `bookable-slots.ts` runs alongside the .gs cutoffs for KPP/NP — defense in depth.

## Course-name mismatches between our enum and Miguel's CURSOS keys

Our `programa` enum (in [apps/server/src/tools/consultar-disponibilidad.ts](../apps/server/src/tools/consultar-disponibilidad.ts)) is a smaller historical set. The mapping in [apps/server/src/services/apps-script.ts](../apps/server/src/services/apps-script.ts) translates on the way out:

| Our enum value | Miguel's CURSOS key | Notes |
|---|---|---|
| `AOW` | `Advanced` | already mapped |
| `RescueDiver` | `Rescue` | already mapped |
| `RefreshAdv` | `RefreshAdvanced` | added 2026-05-19 |
| `FunDive` | `FunDives` | added 2026-05-19 (note plural) |
| `DeepAdvFD` | `DeepAdventure` | added 2026-05-19 |

Verbatim matches (no mapping needed): `TryScuba`, `ScubaDiver`, `OW`, `OW30`, `Refresh`, `DeepSpecialty`, `ReactRight`, `NitroxSpecialty`.

### Untranslated course names (deferred)

KPP-only courses Miguel's CURSOS supports but our `programa` enum doesn't expose:
`OW2days`, `AdvancedAlt`, `AdvancedNight`, `RefreshAdvancedNight`, `AdvancedWreck`, `Adventure`, `NightAdventure`, `NightFunDive`, `MantaFunDive`, `PerfectBuoyancy`, `WreckSpecialty`, `NightSpecialty`, `DeepSpecialtyOW`, `DeepSpecialtyAOW`, `NitroxDry`, `BasicToOW`, `ScubaDiverToOW`.

These can't be expressed in tool calls today (Anthropic enforces the enum in `consultar_disponibilidad`'s schema). Until each persona's prompt actively offers these to customers, the AI never tries to invoke them, so the gap is theoretical. When Francisco Emilio (or any persona) starts selling those courses in production, expand the enum at that time.

## Open follow-up from Miguel

The ferry/Bali logistics rule (Bali-based clients can't make morning boats in NP / Gilis because ferries arrive after the 7am departure) will be sent tomorrow as a prompt-level rule, **not** in the `.gs`. So:

- The `.gs` reports raw roster availability regardless of where the client is.
- Our prompts will need a guard that asks where the client is staying and overrides AM offers when the answer is Bali.

## Miguel's open question (his side)

> "Does the server pass `failingSlots` back to the AI when no window is available, or do you want me to format it differently? The .gs already returns it in the JSON response."

Answer (this rollout): pass it through. We surface it on `ConsultarDisponibilidadResult.failingSlots` so the AI can compose specific refusals. Stay with the current JSON shape.
