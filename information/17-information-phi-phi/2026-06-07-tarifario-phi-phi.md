# Koh Phi Phi tarifario — Miguel 2026-06-07

Source: Miguel WhatsApp 2026-06-07. Authoritative list of program display
names + full course prices for Phi Phi as used in `DPM_Ventas_Master`'s
revenue calculator. Names MUST match exactly when posted via
`sales-logger` — mismatch makes Miguel's revenue calc return 0 for the
row.

## Full tarifario (19 programs)

| # | Display name (Miguel's tarifario) | Full price | Currency |
|---|---|---|---|
| 1 | DSD / Try Scuba | 3,600 | THB |
| 2 | Scuba Diver | 8,500 | THB |
| 3 | OW 18 | 12,900 | THB |
| 4 | OW 30 | 18,900 | THB |
| 5 | Advanced (AOW) | 10,400 | THB |
| 6 | Fun Dive | 2,700 | THB |
| 7 | Refresh | 3,400 | THB |
| 8 | Deep Adventure + Fun Dive | 3,700 | THB |
| 9 | React Right | 4,500 | THB |
| 10 | Rescue | 12,500 | THB |
| 11 | Deep Specialty (OW cert) | 8,900 | THB |
| 12 | Deep Specialty (Advanced cert) | 7,900 | THB |
| 13 | Nitrox Specialty | 9,000 | THB |
| 14 | Perfect Buoyancy Specialty | 7,000 | THB |
| 15 | Wreck Specialty | 9,800 | THB |
| 16 | Advanced Wreck Specialty | 11,300 | THB |
| 17 | Night Specialty | 7,000 | THB |
| 18 | Basic Diver to OW Upgrade | 9,300 | THB |
| 19 | Scuba Diver to OW Upgrade | 4,500 | THB |

## Mapping to our internal `CatalogProgram` enum

| Internal key | Miguel's display name | Notes |
|---|---|---|
| `TryScuba` | `DSD / Try Scuba` | Spaces around slash matter |
| `ScubaDiver` | `Scuba Diver` | |
| `OW` | `OW 18` | Confirmed earlier (2026-06-06 example payload) |
| `OW30` | `OW 30` | |
| `AOW` | `Advanced (AOW)` | Parens part of the name |
| `Refresh` | `Refresh` | |
| `RefreshAdv` | (no mapping yet) | Needs Miguel confirmation — maybe "Refresh + Advanced"? Not in tarifario as separate line |
| `FunDive` | `Fun Dive` | |
| `DeepAdvFD` | `Deep Adventure + Fun Dive` | |
| `ReactRight` | `React Right` | |
| `RescueDiver` | `Rescue` | |
| `NitroxSpecialty` | `Nitrox Specialty` | |
| `DeepSpecialty` | `Deep Specialty (OW cert)` OR `Deep Specialty (Advanced cert)` | ⚠️ 2 variantes según certificación. Default a "(OW cert)" hasta que el AI sepa distinguir |

## Gaps — programs in tarifario NOT mapped to our enum

These exist in Miguel's tarifario but not in our `CATALOG_PROGRAMS`
enum. AI can't currently quote them. If Miguel wants the AI to sell
them, add to the enum + provide a schedule:

- Perfect Buoyancy Specialty (7,000 THB)
- Wreck Specialty (9,800 THB)
- Advanced Wreck Specialty (11,300 THB)
- Night Specialty (7,000 THB)
- Basic Diver to OW Upgrade (9,300 THB)
- Scuba Diver to OW Upgrade (4,500 THB)

## Gaps — programs in our enum NOT in this tarifario

These have CATALOG entries (sometimes catalog images) but no price line
in the tarifario:

- `Adventures` — possibly bundled into "Advanced (AOW)" since SSI
  Adventures is a stepping stone
- `OWAOWCombo` — combo not in single-line tarifario
- `OWDeepCombo` — combo not in single-line tarifario
- `StressRescue` — SSI variant of Rescue, possibly priced same
- `DMT` — Divemaster Trainee, separate flow (likely escalates to human)

For these, the sales-logger will SKIP the row with a warning when AI
tries to log a sale. The conversation can still progress but the row
needs manual entry until either (a) Miguel adds them to the tarifario
+ we map them, or (b) we decide they always escalate to human.

## Currency note

Prices are in THB (Thai Baht). Phi Phi is in Thailand. Our deposit
system supports EUR / GBP / AUD / USD / IDR but NOT THB today. Customer
deposits are typically in foreign currency via Wise (EUR / USD).

The `precio_total_usd` field in the sales-logger row is currently left
EMPTY because we'd need a THB→USD conversion and a per-program total
price lookup. Deferred — Miguel's spec says it's optional.

If Miguel wants populated `precio_total_usd`, the easiest path is:
1. Add a THB-USD rate constant (or a daily fetch)
2. Look up the program in this tarifario
3. Compute usd = thb / rate
4. Send as string in the row

Not blocking real venta test.

## What we did with this data (2026-06-07)

Updated `apps/server/src/services/sales-logger-mapping.ts` →
`PROGRAMA_DISPLAY_NAME["Koh Phi Phi"]` with the EXACT display names
from this tarifario. The provisional names that didn't match
(`"Try Scuba"`, `"Advanced"`, `"Nitrox"`) were corrected.
