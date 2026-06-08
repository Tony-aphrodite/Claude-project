# Phi Phi cronograma + Confinadas capacity — Miguel 2026-06-07

Source: Miguel WhatsApp 2026-06-07 evening.

## Decisión 1: Capacidad de Confinadas

> "Capacidad de confinadas: 30 lugares disponibles am y pm no importa si
> tenemos o no instructores eso lo manejamos nosotros internamente."

**Phi Phi Confinadas default capacity = 30 (per day).**

The pool can host up to 30 students per day regardless of AM/PM
distribution — instructor availability is managed internally by the
office, the AI doesn't need to track it. Our roster model has one
Confinadas slot per day per sede, so this maps cleanly: set
`sede.roster_config.default_capacities.Confinadas = 30` for Phi Phi.

**How to apply (panel)**:
1. Open `/roster` page in panel
2. Select sede "Koh Phi Phi"
3. In the "Capacidad por defecto" form, set `Confinadas: 30`
4. Click "Guardar default"

Verification: the grid below should refresh and show `cap 30` for the
Confinadas column on every day (assuming no per-day overrides exist).

**Alternative (SQL, if panel can't be used)**:
```sql
UPDATE sedes
SET roster_config = jsonb_set(
  coalesce(roster_config, '{}'::jsonb),
  '{default_capacities,Confinadas}',
  '30'
)
WHERE nombre = 'Koh Phi Phi';
```

## Decisión 2: Cronogramas iterativos (no waterfall)

> "creo que lo mejor para hacer cada cronograma va a ser ir haciendo
> pruebas concretas de cada curso y en base a lo que responda realmente
> hacer el arreglo. podemos empezar con los que ya tienes porque la
> verdad que mi socio no me envió ninguno de momento ya la escribí pero
> ya sabes no depende de mi."

**Approach**: keep the current schedules in
`packages/shared/src/program-schedule.ts` (they originated from the
DPM_AI_LAUNCH 2026-05-07 spec — designed for Gili Trawangan but
applied globally today). Run real test conversations per program and
ADJUST when reality diverges.

**Why this matters for us:**
- We're NOT blocked waiting for Miguel's partner to send the per-sede
  per-program day-by-day breakdown.
- Each test conversation IS the verification step.
- When a test reveals a mismatch (e.g. "this program needs 2 boat days
  not 3"), edit `program-schedule.ts` for that one entry.
- The 3-layer alt-date defense ([[architecture_three_layer_availability_defense]])
  catches schedule bugs anyway — even if a cronograma is wrong, the
  AI won't double-book because solicitar_deposito re-validates and
  consultar_disponibilidad returns verified alternatives.

## Per-sede note (still true)

Miguel's earlier rule "cada sede es diferente" still applies — these
cronogramas are CURRENTLY GLOBAL in our code. When we activate Koh
Tao / Gili Trawangan / Gili Air / Nusa Penida, each program needs
per-sede schedule data and the function signature widens from
`getRequiredSlots(programa)` to `getRequiredSlots(sede, programa)`.
Not blocking Phi Phi pilot.

## Programs that still escalate (NOT scheduled)

These have no `RequiredSlot[]` mapping today and `getRequiredSlots()`
returns null → AI routes to human via prompt instead of quoting
availability. Miguel's iterative approach will add them as tests
reveal real-world demand:

- OWAOWCombo, OWDeepCombo (combos)
- Adventures, DMT, StressRescue (specialties / pro)
- DeepSpecialty, RescueDiver, NitroxSpecialty (intentionally human-routed)
- Perfect Buoyancy, Wreck, Advanced Wreck, Night Specialty (in tarifario but not in enum)
- Basic Diver → OW Upgrade, Scuba Diver → OW Upgrade (upgrades)

## What this resolves vs leaves open

**Resolved by this message**:
- ✅ Confinadas default capacity for Phi Phi (= 30)
- ✅ Cronograma strategy (iterative testing, start with current code)

**Still open from Miguel side**:
- 🟡 Respond.io workflow config verification (3 items in
  `architecture_close_sale_logger` memory open-followups)

That's the ONLY thing blocking real-money production after Tony sets
Confinadas = 30 in the panel.
