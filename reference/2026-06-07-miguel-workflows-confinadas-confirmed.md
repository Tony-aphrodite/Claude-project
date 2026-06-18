# Miguel responses 2026-06-07 evening — workflows + Confinadas confirmed

Source: Miguel WhatsApp 2026-06-07 evening (response to our 6-question
list).

## Respond.io workflows — ALL CLEAR ✅

| Question | Miguel | Notes |
|---|---|---|
| a) "booked by ai" category exists | ✅ "si" | Confirmed via screenshot — visible in close-category dropdown next to "Forward to branch", "Pricing related", etc. |
| b) DPM Ventas Master Logger filters "booked by ai" | ✅ Not needed | Miguel: "no escribe nada asi que no hay duplicado". His Logger fires on the manual "Cerrar Venta" snippet, NOT on conversation close events. Since AI doesn't fire that snippet, no duplicate happens naturally. |
| c) Unassign workflow fires on "booked by ai" | ✅ Yes | Screenshots confirm the workflow logs: "Flujo trabajo Assignment: Unassign After Conversation Closes iniciado" + "terminado" right after each "booked by ai" close. |

**No further Respond.io configuration required.** The infrastructure
works as needed for the AI's close_sale path.

## Confinadas capacity — clarified to 60 per day (not 30)

> Miguel: "si 30 plazas disponibles am y 30 plazas disponibles pm confinadas"

Original: "30 lugares disponibles am y pm" — ambiguous between 30 total
or 30 each.

Clarified: **30 AM + 30 PM = 60 total per day**.

Combined with his earlier statement "eso lo manejamos nosotros
internamente": Miguel handles the AM/PM internal split of pool sessions
operationally. The AI only needs to know the daily ceiling (60).

### Architecture decision: single Confinadas slot per day, capacity = 60

Rationale:
- Keeps Confinadas as one turno in our 4-turno model (AM/PM/Nocturno/Confinadas)
- No schema change required
- Miguel's "no me importa, lo manejo internamente" maps cleanly to "one bucket"
- If 60 students try to start OW the same day → AI accepts, office distributes
  AM/PM internally
- If theoretical undercount becomes a problem (rare — Phi Phi rarely fills
  pool >30 in a single AM or PM session), we revisit and split into
  ConfinadasAM + ConfinadasPM. NOT needed today.

### Setting it

Tony to set via panel: `/roster` → sede "Koh Phi Phi" → "Capacidad por
defecto" → **Confinadas: 60** → "Guardar default".

Previously we had documented setting it to 30. The correct number is **60**
based on Miguel's clarification.

## Still pending from Miguel (4 minor items, not blockers)

| # | Item | Workaround if no response |
|---|---|---|
| 3 | Sede exact name in tarifario | Assume "Koh Phi Phi" (matches our DB) — verify in first test |
| 4 | THB deposits for local Thai customers | Today AI offers EUR/GBP/AUD/USD/IDR only — Thai customers get foreign currency option, probably fine for tourist market |
| 5 | 5 programs not in tarifario (Adventures, Combos, StressRescue, DMT) | Today escalate to human (safe default) |
| 6 | First test sync slot | Tony coordinates when ready |

None of these block the first real test.
