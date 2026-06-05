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
