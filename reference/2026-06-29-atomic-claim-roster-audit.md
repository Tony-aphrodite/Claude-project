# §7 Atomic Claim — Auditoría del código (2026-06-29)

**Contexto:** respuesta a la pregunta directa de Miguel en el addendum v2.2 §7
("¿la validación de cupo ya usa un lock / transacción atómica para que dos
ventas concurrentes no puedan tomar el mismo lugar?").

**Resultado corto:** parcialmente. La venta AI ↔ venta AI ya es atómica
(SERIALIZABLE). La venta AI ↔ walk-in y walk-in ↔ walk-in **no lo son** — son
huecos abiertos hoy en producción.

**Fecha del audit:** 2026-06-29
**Archivos revisados:**
- `apps/server/src/services/roster-db.ts` (rutas AI)
- `apps/server/src/services/roster-simulation.ts` (consultar_disponibilidad)
- `apps/panel/src/app/actions/roster-engine.ts` (CRUD walk-in del panel)
- `apps/panel/src/app/actions/roster.ts` (seed bookings del panel)

---

## Inventario por path

### ✅ Path seguro — AI booking (atomic SERIALIZABLE)

| Función | Archivo:Línea | Garantía |
|---|---|---|
| `holdPendingBookings()` | [roster-db.ts:477-642](../apps/server/src/services/roster-db.ts#L477-L642) | `db.transaction(...,{isolationLevel:"serializable"})`. Re-lee capacity + reserved adentro. Rechaza con `overbooked` si no entra. |
| `confirmBooking()` | [roster-db.ts:286-452](../apps/server/src/services/roster-db.ts#L286-L452) | Misma primitiva — SERIALIZABLE, check-then-write atómico. Promueve `pending → confirmed` o inserta nuevo. |

→ Venta AI vs venta AI **concurrentes** = imposibles de sobrevender. La primera
toma el lugar dentro de la transacción, la segunda se rechaza al comitear.
Esto es exactamente la primitiva que Miguel pidió.

### 🚨 Path inseguro — Walk-in (sin atomic, sin capacity check)

| Función | Archivo:Línea | Problema |
|---|---|---|
| `createWalkInDiver()` | [roster-engine.ts:326-418](../apps/panel/src/app/actions/roster-engine.ts#L326-L418) | `db.insert(rosterDivers)` directo. **Cero chequeo de capacidad**. Sin transacción. |
| `updateWalkInDiver()` | [roster-engine.ts:433-508](../apps/panel/src/app/actions/roster-engine.ts#L433-L508) | Cambia slot/activity/instructor sin re-validar grupo destino. Viola §4-B + §6. |
| `deleteWalkInDiver()` | [roster-engine.ts:510-530](../apps/panel/src/app/actions/roster-engine.ts#L510-L530) | `db.delete()` hard. Sin log de auditoría. Viola §3 ("dejar rastro"). |
| `seedRosterBooking()` | [roster.ts:263-320](../apps/panel/src/app/actions/roster.ts#L263-L320) | Insert directo en `roster_bookings` sin capacity check ni transacción. Path de prueba/seed pero también accesible desde la UI. |

---

## La falla arquitectónica de fondo — dos sistemas paralelos de capacidad

```
┌──────────────────────────────────┬────────────────────────────────────┐
│  Path AI                          │  Path walk-in                       │
│  ─────────                       │  ─────────────                     │
│  Tabla: roster_bookings          │  Tabla: roster_divers              │
│  (status='pending'|'confirmed')  │  (estado_pago='pending'|...)       │
│                                  │                                    │
│  Capacity check vía              │  Capacity check: NINGUNO           │
│  SUM(pax) DENTRO de              │                                    │
│  SERIALIZABLE txn                │                                    │
│                                  │                                    │
│  ✅ AI ↔ AI race-safe             │  ❌ walk-in ↔ walk-in race           │
└──────────────────────────────────┴────────────────────────────────────┘
```

Lo crítico: **los dos no se ven entre sí**.

- `holdPendingBookings` (AI) cuenta solo `SUM(roster_bookings.pax)` ([roster-db.ts:593-600](../apps/server/src/services/roster-db.ts#L593-L600)). **No ve a los walk-ins** de `roster_divers`.
- `createWalkInDiver` no cuenta nada — inserta sin chequeo.
- El simulador ([roster-simulation.ts:170-180](../apps/server/src/services/roster-simulation.ts#L170-L180)) lee SOLO `roster_divers` para correr el packing del motor. **No ve las reservas AI** de `roster_bookings` cuando simula.

Esto significa que la consolidación de capacidad (lo que ve la AI cuando llama
`consultar_disponibilidad` y lo que ve el motor cuando arma grupos) está
parcialmente desincronizada del cobro de cupo (lo que se descuenta cuando la
AI o el walk-in escriben).

---

## Escenarios de carrera bajo el código actual

| # | Escenario | Resultado |
|---|---|---|
| 1 | Dos ventas AI simultáneas al último lugar | ✅ Atómico (SERIALIZABLE en `holdPendingBookings`). La segunda recibe `overbooked`. |
| 2 | Venta AI + walk-in simultáneos al último lugar | 🚨 **Sobreventa.** AI cuenta solo `roster_bookings`, no ve el walk-in que se está escribiendo. Ambos quedan. |
| 3 | Dos walk-ins simultáneos al último lugar | 🚨 **Sobreventa.** No hay capacity check en `createWalkInDiver`. Ambos se insertan. |
| 4 | Walk-in primero, luego venta AI | 🟡 Si el walk-in ya comiteó, el simulador lo ve. Pero `holdPendingBookings` no cuenta walk-ins en su SUM → sigue siendo posible sobrepasar. |
| 5 | Venta AI primero, luego walk-in | 🚨 El walk-in no chequea nada → siempre se inserta. |

Solo el escenario 1 está cubierto por el lock atómico que Miguel pidió. Los
otros cuatro están abiertos hoy.

---

## Mapeo a otros puntos del addendum

| § | Tocado por este audit | Estado |
|---|---|---|
| §2 walk-in con instructor + double charge | walk-in no descuenta capacidad ni de barco ni de instructor | hueco abierto |
| §3 delete con log de auditoría | `deleteWalkInDiver` es hard delete, sin log | hueco abierto |
| §4 reassign parte/todo | `updateWalkInDiver` cambia slot/activity sin re-validar grupo destino, sin distinción A/B, sin cascada multi-día | hueco abierto |
| §6 revalidar en cada acción | walk-in CRUD entero sin validación; los 3 endpoints (create/update/delete) deberían pasar por el mismo motor | hueco abierto |
| §7 atomic claim | AI ↔ AI cubierto; AI ↔ walk-in y walk-in ↔ walk-in NO | parcialmente cubierto |

---

## Plan de fix sugerido

### Capa 1 — cierre del race (urgente, 1–2 horas)

1. **Walk-in CRUD adentro de transacción SERIALIZABLE.** Mismo patrón que
   `holdPendingBookings`: abrir txn, leer capacidad consolidada, validar,
   insertar/actualizar/borrar.

2. **Capacity SUM consolidada en ambos paths.** La query de "cuántos lugares
   tomados" debe contar:
   ```sql
   COALESCE((
     SELECT SUM(pax) FROM roster_bookings
     WHERE sede_id = $1 AND fecha = $2 AND turno = $3
       AND status IN ('pending', 'confirmed')
   ), 0)
   +
   COALESCE((
     SELECT COUNT(*) FROM roster_divers
     WHERE sede_id = $1 AND fecha = $2 AND slot = $3
       AND estado_pago IN ('pending', 'deposit_paid', 'full_paid')
   ), 0)
   ```
   Aplicable tanto en `holdPendingBookings` como en el nuevo
   `createWalkInDiver` transaccional.

3. **Mismo lock para ambos paths.** SERIALIZABLE sobre la misma vista
   consolidada → AI y walk-in compiten por las mismas filas en la fase de
   commit. Postgres serializa el conflicto.

### Capa 2 — operativa (§3, §6, no urgente, 1 día)

4. Soft-delete en `roster_divers` (columna `deleted_at`) + `roster_audit_log`
   simple para edits.
5. Re-correr la validación del motor en `updateWalkInDiver` cuando cambia
   slot/activity/instructor.

### Capa 3 — spec (§1, §4, §5, planificar para v2.2)

6. DM role en `instructors`, branching del matching, UI de reassign con
   distinción A/B + cascada multi-día, refactor del UI ops.

---

## Decisión recomendada

- Capa 1 sale como un commit antes de seguir con cualquier otra feature de
  panel — es el único hueco que pone al cliente en producción en riesgo de
  sobreventa silenciosa.
- Capa 2 + 3 entran en v2.2 spec doc y se planifican aparte.

**Pregunta a Miguel:** OK arrancar con Capa 1 (fix de §7) hoy/mañana, y
diferir §1-§6 a v2.2 normal? Tiempo estimado 1.5–2h, commit local + push tras
su OK.
