// Roster panel Server Actions — block / unblock / set capacity / seed
// booking. Mirrors the admin endpoints in apps/server/src/routes/admin.ts
// (Slice 3) but executes directly against the DB so the panel doesn't
// need to round-trip through the API. The admin endpoints remain live
// for headless / curl usage.
//
// Added 2026-06-05 Slice 3e (Miguel feedback).

"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, gte, sql } from "drizzle-orm";

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
    throw new Error(`Invalid input: sedeId/fecha/turno required, got ${sedeId}/${fecha}/${turno}`);
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

// ── read-side helpers used by the page (server-only) ───────────────────────

export type RosterSlotView = {
  fecha: string;
  weekday: string;
  am: { capacity: number; reserved: number; available: number; blocked: boolean; blockReason: string | null };
  pm: { capacity: number; reserved: number; available: number; blocked: boolean; blockReason: string | null };
  nocturno: { capacity: number; reserved: number; available: number; blocked: boolean; blockReason: string | null };
};

const WEEKDAY_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function addDays(yyyymmdd: string, n: number): string {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`addDays: invalid ${yyyymmdd}`);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function weekdayOf(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  if (!y || !m || !d) return "";
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return WEEKDAY_ES[dow] ?? "";
}

export async function getRosterView(input: {
  sedeId: string;
  startDate: string;
  days: number;
}): Promise<RosterSlotView[]> {
  const db = getDb();
  const dates: string[] = [];
  for (let i = 0; i < input.days; i++) dates.push(addDays(input.startDate, i));

  const overrides = await db
    .select()
    .from(rosterCapacityOverrides)
    .where(
      and(
        eq(rosterCapacityOverrides.sedeId, input.sedeId),
        sql`${rosterCapacityOverrides.fecha} = ANY(${dates})`,
      ),
    );

  const reservedRows = (await db.execute(sql`
    SELECT
      ${rosterBookings.fecha} AS fecha,
      ${rosterBookings.turno} AS turno,
      COALESCE(SUM(${rosterBookings.pax}), 0)::int AS reserved
      FROM ${rosterBookings}
     WHERE ${rosterBookings.sedeId} = ${input.sedeId}
       AND ${rosterBookings.fecha} = ANY(${dates})
       AND ${rosterBookings.status} = 'confirmed'
     GROUP BY ${rosterBookings.fecha}, ${rosterBookings.turno}
  `)) as unknown as Array<{ fecha: string; turno: string; reserved: number }>;

  const overrideMap = new Map<string, (typeof overrides)[number]>();
  for (const o of overrides) overrideMap.set(`${o.fecha}|${o.turno}`, o);
  const reservedMap = new Map<string, number>();
  for (const r of reservedRows) reservedMap.set(`${r.fecha}|${r.turno}`, Number(r.reserved));

  const slotView = (fecha: string, turno: Turno): RosterSlotView["am"] => {
    const o = overrideMap.get(`${fecha}|${turno}`);
    const capacity = o?.capacity ?? DEFAULT_CAPACITY_PER_TURNO;
    const blocked = o?.blocked === true;
    const reserved = reservedMap.get(`${fecha}|${turno}`) ?? 0;
    const available = blocked ? 0 : Math.max(0, capacity - reserved);
    return {
      capacity,
      reserved,
      available,
      blocked,
      blockReason: o?.blockReason ?? null,
    };
  };

  return dates.map((fecha) => ({
    fecha,
    weekday: weekdayOf(fecha),
    am: slotView(fecha, "AM"),
    pm: slotView(fecha, "PM"),
    nocturno: slotView(fecha, "Nocturno"),
  }));
}

export async function listRecentBookings(input: {
  sedeId: string;
  fechaFrom: string;
  limit?: number;
}) {
  const db = getDb();
  return await db
    .select()
    .from(rosterBookings)
    .where(
      and(
        eq(rosterBookings.sedeId, input.sedeId),
        gte(rosterBookings.fecha, input.fechaFrom),
        eq(rosterBookings.status, "confirmed"),
      ),
    )
    .orderBy(rosterBookings.fecha, rosterBookings.turno, desc(rosterBookings.createdAt))
    .limit(input.limit ?? 50);
}

export async function listAllSedes() {
  const db = getDb();
  return await db
    .select({ id: sedes.id, nombre: sedes.nombre })
    .from(sedes)
    .orderBy(sedes.nombre);
}
