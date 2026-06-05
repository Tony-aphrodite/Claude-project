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

import { requireAdminContext } from "~/lib/auth-context";

type Turno = "AM" | "PM" | "Nocturno";

const VALID_TURNOS = ["AM", "PM", "Nocturno"] as const;
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

  if (flat === undefined && am === undefined && pm === undefined && nocturno === undefined) {
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

  if (am !== undefined || pm !== undefined || nocturno !== undefined) {
    const existingPerTurno = (existing.default_capacities as
      | Record<string, number>
      | undefined) ?? {};
    const merged = { ...existingPerTurno };
    if (am !== undefined) merged.AM = am;
    if (pm !== undefined) merged.PM = pm;
    if (nocturno !== undefined) merged.Nocturno = nocturno;
    newConfig.default_capacities = merged;
  }

  await db
    .update(sedes)
    .set({ rosterConfig: newConfig, updatedAt: new Date() })
    .where(eq(sedes.id, sedeId));

  revalidatePath("/roster");
}

export async function seedRosterBooking(formData: FormData): Promise<void> {
  await requireAdminContext();
  const sedeId = String(formData.get("sedeId") ?? "");
  const fecha = String(formData.get("fecha") ?? "");
  const turno = String(formData.get("turno") ?? "");
  const programa = String(formData.get("programa") ?? "");
  const pax = Number(formData.get("pax") ?? 1);
  const notes = (formData.get("notes") as string) || "seeded via panel";
  if (!sedeId || !fecha || !isValidTurno(turno) || !programa || pax < 1) {
    throw new Error("Invalid input");
  }

  const db = getDb();
  await db.insert(rosterBookings).values({
    sedeId,
    fecha,
    turno,
    programa,
    pax,
    status: "confirmed",
    notes,
  });

  revalidatePath("/roster");
}
