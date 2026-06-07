// Roster panel Server Actions — block / unblock / setCapacity / seed
// booking. Mutations only. Read helpers (getRosterView etc) live in
// apps/panel/src/lib/roster-queries.ts because `"use server"` at this
// file's top would mark every export as a Server Action, breaking the
// page's plain async data fetchers.
//
// Added 2026-06-05 Slice 3e (Miguel feedback).

"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import {
  getDb,
  rosterBookings,
  rosterCapacityOverrides,
  sedes,
} from "@dpm/db";
import { addDays, getRequiredSlots } from "@dpm/shared";

import { requireAdminContext } from "~/lib/auth-context";

// Miguel rule 2026-06-07: Confinadas added as a 4th slot to track pool /
// confined-water capacity explicitly (instructor capacity, no boat).
type Turno = "AM" | "PM" | "Nocturno" | "Confinadas";

const VALID_TURNOS = ["AM", "PM", "Nocturno", "Confinadas"] as const;
const DEFAULT_CAPACITY_PER_TURNO = 22;

function isValidTurno(value: string): value is Turno {
  return (VALID_TURNOS as readonly string[]).includes(value);
}

export async function blockRosterSlot(formData: FormData): Promise<void> {
  await requireAdminContext();
  const sedeId = String(formData.get("sedeId") ?? "");
  const fecha = String(formData.get("fecha") ?? "");
  const turno = String(formData.get("turno") ?? "");
  const reason = (formData.get("reason") as string) || null;
  if (!sedeId || !fecha || !isValidTurno(turno)) {
    throw new Error("Invalid input");
  }

  const db = getDb();
  await db
    .insert(rosterCapacityOverrides)
    .values({
      sedeId,
      fecha,
      turno,
      capacity: DEFAULT_CAPACITY_PER_TURNO,
      blocked: true,
      blockReason: reason,
      createdBy: "panel",
    })
    .onConflictDoUpdate({
      target: [
        rosterCapacityOverrides.sedeId,
        rosterCapacityOverrides.fecha,
        rosterCapacityOverrides.turno,
      ],
      set: {
        blocked: true,
        blockReason: reason,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/roster");
}

export async function unblockRosterSlot(formData: FormData): Promise<void> {
  await requireAdminContext();
  const sedeId = String(formData.get("sedeId") ?? "");
  const fecha = String(formData.get("fecha") ?? "");
  const turno = String(formData.get("turno") ?? "");
  if (!sedeId || !fecha || !isValidTurno(turno)) {
    throw new Error("Invalid input");
  }

  const db = getDb();
  await db
    .update(rosterCapacityOverrides)
    .set({
      blocked: false,
      blockReason: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(rosterCapacityOverrides.sedeId, sedeId),
        eq(rosterCapacityOverrides.fecha, fecha),
        eq(rosterCapacityOverrides.turno, turno),
      ),
    );

  revalidatePath("/roster");
}

export async function setRosterCapacity(formData: FormData): Promise<void> {
  await requireAdminContext();
  const sedeId = String(formData.get("sedeId") ?? "");
  const fecha = String(formData.get("fecha") ?? "");
  const turno = String(formData.get("turno") ?? "");
  const capacity = Number(formData.get("capacity") ?? 0);
  const reason = (formData.get("reason") as string) || null;
  if (!sedeId || !fecha || !isValidTurno(turno) || !Number.isInteger(capacity) || capacity < 0) {
    throw new Error("Invalid input");
  }

  const db = getDb();
  await db
    .insert(rosterCapacityOverrides)
    .values({
      sedeId,
      fecha,
      turno,
      capacity,
      reason,
      createdBy: "panel",
    })
    .onConflictDoUpdate({
      target: [
        rosterCapacityOverrides.sedeId,
        rosterCapacityOverrides.fecha,
        rosterCapacityOverrides.turno,
      ],
      set: {
        capacity,
        reason,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/roster");
}

/**
 * Update the per-sede default capacity (Miguel feedback 2026-06-05). The form
 * sends either a single `capacity` number (flat — applies to all turnos when
 * no per-turno override) or empty `am`/`pm`/`nocturno` fields to set the
 * per-turno granular defaults. Empty values are ignored so the user can
 * update just one field at a time.
 *
 * Existing per-day overrides in rosterCapacityOverrides are NOT touched.
 * To "reset" a day to use the new default, the office can hit `Set cap`
 * with the new number on that day's slot.
 */
export async function setSedeDefaultCapacity(formData: FormData): Promise<void> {
  await requireAdminContext();
  const sedeId = String(formData.get("sedeId") ?? "");
  if (!sedeId) throw new Error("sedeId requerido");

  const parseOptionalNum = (v: FormDataEntryValue | null): number | undefined => {
    if (v === null || v === "") return undefined;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) {
      throw new Error("La capacidad debe ser un entero >= 0");
    }
    return n;
  };

  const flat = parseOptionalNum(formData.get("capacity"));
  const am = parseOptionalNum(formData.get("am"));
  const pm = parseOptionalNum(formData.get("pm"));
  const nocturno = parseOptionalNum(formData.get("nocturno"));
  const confinadas = parseOptionalNum(formData.get("confinadas"));

  if (
    flat === undefined &&
    am === undefined &&
    pm === undefined &&
    nocturno === undefined &&
    confinadas === undefined
  ) {
    throw new Error("Ingresá al menos un valor de capacidad");
  }

  const db = getDb();
  const [row] = await db
    .select({ rosterConfig: sedes.rosterConfig })
    .from(sedes)
    .where(eq(sedes.id, sedeId))
    .limit(1);
  if (!row) throw new Error("Sede no encontrada");

  const existing = (row.rosterConfig as Record<string, unknown> | null) ?? {};
  const newConfig: Record<string, unknown> = { ...existing };

  if (flat !== undefined) newConfig.default_capacity = flat;

  if (
    am !== undefined ||
    pm !== undefined ||
    nocturno !== undefined ||
    confinadas !== undefined
  ) {
    const existingPerTurno = (existing.default_capacities as
      | Record<string, number>
      | undefined) ?? {};
    const merged = { ...existingPerTurno };
    if (am !== undefined) merged.AM = am;
    if (pm !== undefined) merged.PM = pm;
    if (nocturno !== undefined) merged.Nocturno = nocturno;
    if (confinadas !== undefined) merged.Confinadas = confinadas;
    newConfig.default_capacities = merged;
  }

  await db
    .update(sedes)
    .set({ rosterConfig: newConfig, updatedAt: new Date() })
    .where(eq(sedes.id, sedeId));

  revalidatePath("/roster");
}

/**
 * Seed a booking into the roster via the panel form.
 *
 * Miguel rule 2026-06-07: when the program has a defined schedule
 * (TryScuba, OW, AOW, etc.), the form expands the start_date across
 * ALL of the program's required slots — e.g. seeding "OW starting
 * 2026-07-03" inserts:
 *   • 2026-07-03 Confinadas (pool day)
 *   • 2026-07-04 PM         (Day 2 boat dives)
 *   • 2026-07-05 AM         (Day 3 boat dives)
 *
 * Before this rule, the form only wrote ONE row at the entered
 * (fecha, turno) — Miguel demonstrated overbooking risk because
 * subsequent program-days didn't appear in the roster grid. The form
 * now uses the same `getRequiredSlots` table the AI uses, so the panel
 * and the AI cannot drift.
 *
 * Fallback: when the program has NO schedule (combos, specialties not
 * yet defined), or the manualSlot flag is set, write a single row at
 * the explicit (fecha, turno) the user picked. This preserves the
 * ability to seed walk-ins / private charters that don't follow a
 * standard schedule.
 *
 * The form's `fecha` field is the START_DATE (Day 0). The `turno`
 * field is only used in the fallback path.
 */
export async function seedRosterBooking(formData: FormData): Promise<void> {
  await requireAdminContext();
  const sedeId = String(formData.get("sedeId") ?? "");
  const fecha = String(formData.get("fecha") ?? ""); // = start_date
  const turno = String(formData.get("turno") ?? "");
  const programa = String(formData.get("programa") ?? "");
  const pax = Number(formData.get("pax") ?? 1);
  const notes = (formData.get("notes") as string) || "seeded via panel";
  const manualSlotMode = formData.get("manualSlot") === "on";

  if (!sedeId || !fecha || !programa || pax < 1) {
    throw new Error("Invalid input");
  }
  if (manualSlotMode && !isValidTurno(turno)) {
    throw new Error("Invalid turno for manual slot mode");
  }

  const db = getDb();

  // Resolve the program's required slots — same source of truth the
  // AI uses (apps/server consultar_disponibilidad). When the schedule
  // is missing (combos / specialty courses Miguel hasn't defined yet)
  // OR the user explicitly checked "Slot manual", we fall back to the
  // single (fecha, turno) the form supplied.
  const required = manualSlotMode ? null : getRequiredSlots(programa);
  if (!manualSlotMode && required && required.length > 0) {
    // Expand into one row per required slot.
    const rows = required.map((slot) => ({
      sedeId,
      fecha: addDays(fecha, slot.dayOffset),
      turno: slot.slot,
      programa,
      pax,
      status: "confirmed" as const,
      notes: `${notes} (Día ${slot.dayOffset + 1} de ${programa})`,
    }));
    await db.insert(rosterBookings).values(rows);
  } else {
    // No schedule available, OR user explicitly chose a manual slot.
    // Single-row insert at exactly (fecha, turno).
    if (!isValidTurno(turno)) {
      throw new Error(
        `El programa "${programa}" no tiene cronograma definido — marcá "Slot manual" y elegí AM/PM/Nocturno/Confinadas`,
      );
    }
    await db.insert(rosterBookings).values({
      sedeId,
      fecha,
      turno,
      programa,
      pax,
      status: "confirmed",
      notes,
    });
  }

  revalidatePath("/roster");
}
