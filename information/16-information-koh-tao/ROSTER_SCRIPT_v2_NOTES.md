# Koh Tao roster Apps Script v2 — Miguel note 2026-05-18

> Original `.gs` file was attached to Miguel's WhatsApp message; not yet
> committed to this repo. This note captures the contract changes so the
> server side stays in sync.

## Why this v2 exists

The previously-deployed Koh Tao Apps Script only read `date` and `days`
from the query string and ignored `pax`, `curso`, `mode` even when our
server sent them. In practice it returned `disponible: true` for almost
any query, which meant **Emma confirmed reservations on boats that
didn't run or were already full**. Three symptoms observed in live
testing.

## What the v2 script reads now

| Param | Behavior |
|---|---|
| `date` (existing) | First date of the window |
| `days` (existing) | Length of the window (used only when `mode=range`) |
| `pax` (new) | Filters slots where `espacios < pax`. Reason string in response: `"Solo {N} espacios, necesitas {M}"`. |
| `curso` (new) | Filters slots by course type. See CURSOS table below (lives at the top of the `.gs`, editable without touching code). |
| `mode` (new) | `"single"` → returns only the days actually needed by the course pattern. `"range"` → respects `days` (legacy behavior). |

### Course → allowed slots (Miguel's CURSOS table, paraphrased)

| Course | Slots allowed |
|---|---|
| TryScuba | PM only |
| ScubaDiver | PM only |
| Night | nocturno only |
| OW | AM or PM |
| OW30 | AM or PM |
| Advanced | AM or PM |
| Rescue | AM or PM |
| Refresh | AM or PM |

### Consecutive-window enforcement for multi-day courses

| Course | Window size |
|---|---|
| OW | 3 consecutive days |
| OW30 | 3 consecutive days |
| Rescue | 3 consecutive days |
| Advanced | 2 consecutive days |

If a "broken" day appears mid-window (insufficient pax, slot not
allowed for course, etc.), the script skips to the next valid block.
Response now includes a `ventana` field with the chosen date range.

### Resumen field

The natural-language `resumen` only mentions the slots that are valid
for the requested course. Avoids the regression where Emma told a
TryScuba lead "podés venir 5:45am" when TryScuba is PM-only.

## Backward compatibility

> "si una integración llama sin pax/curso/mode, los defaults (pax=1,
> sin curso, mode=range) replican el comportamiento anterior."

So safe to call without the new params; safer with.

## Deploy notes (for reference)

Miguel deploys by going to **Implementar → Administrar implementaciones
→ editar la deployment activa → Nueva versión** (NOT "Nueva
implementación"). Reusing the deployment keeps the `/exec` URL stable
so neither this codebase nor Respond.io needs an update on his end.

## Tests Miguel ran post-deploy

1. `?mode=range&curso=OW30&date=2026-05-19&days=7&pax=30` — should
   filter PMs with `< 30` espacios.
2. `?mode=single&curso=TryScuba&date=2026-05-19&pax=1` — should return
   PM only.
3. `?mode=range&curso=OW30&date=2026-05-19&days=7&pax=2` — should
   return a 3-day consecutive window.

## Open questions on our side

- Does `curso` need a translation from our `programa` enum to the
  CURSOS keys (TryScuba/ScubaDiver/OW/OW30/Advanced/Rescue/Refresh/
  Night)? Most names match verbatim. **`AOW` → `Advanced` and
  `RescueDiver` → `Rescue` are the only definite mismatches** in our
  current enum. `RefreshAdv`, `FunDive`, `DeepAdvFD`, `DeepSpecialty`,
  `NitroxSpecialty`, `ReactRight` aren't in Miguel's CURSOS table —
  the script will fall through to "no curso filter" for those, same
  as the old behavior.
- Should `mode` default to `"single"` when the program's required
  slots fit in one date, and `"range"` otherwise? The current handler
  passes `windowDays = maxDayOffset(required) + 1` which is already
  the minimal window size — calling with `mode=range&days=windowDays`
  is equivalent in result. Sticking with `range` keeps the contract
  symmetric across sedes.

When the actual `.gs` file lands in this folder we can revisit the
mapping if any of the above turns out wrong.
