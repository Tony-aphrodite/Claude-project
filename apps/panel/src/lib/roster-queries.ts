// Server-only read helpers for the /roster panel page. Kept separate from
// apps/panel/src/app/actions/roster.ts because that file is "use server" —
// which marks every export as a Server Action, breaking the page's plain
// async data fetchers (Server Actions have a different invocation contract
// than data loaders in RSC).

import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";

import {
  getDb,
  rosterBookings,
  rosterCapacityOverrides,
  sedes,
} from "@dpm/db";

const DEFAULT_CAPACITY_PER_TURNO = 22;

export type RosterSlotData = {
  capacity: number;
  reserved: number;
  available: number;
  blocked: boolean;
  blockReason: string | null;
};

export type RosterSlotView = {
  fecha: string;
  weekday: string;
  am: RosterSlotData;
  pm: RosterSlotData;
  nocturno: RosterSlotData;
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
        inArray(rosterCapacityOverrides.fecha, dates),
      ),
    );

  const reservedRows = (await db.execute(sql`
    SELECT
      ${rosterBookings.fecha} AS fecha,
      ${rosterBookings.turno} AS turno,
      COALESCE(SUM(${rosterBookings.pax}), 0)::int AS reserved
      FROM ${rosterBookings}
     WHERE ${rosterBookings.sedeId} = ${input.sedeId}
       AND ${rosterBookings.fecha} = ANY(${dates}::text[])
       AND ${rosterBookings.status} = 'confirmed'
     GROUP BY ${rosterBookings.fecha}, ${rosterBookings.turno}
  `)) as unknown as Array<{ fecha: string; turno: string; reserved: number }>;

  const overrideMap = new Map<string, (typeof overrides)[number]>();
  for (const o of overrides) overrideMap.set(`${o.fecha}|${o.turno}`, o);
  const reservedMap = new Map<string, number>();
  for (const r of reservedRows) reservedMap.set(`${r.fecha}|${r.turno}`, Number(r.reserved));

  const slotData = (fecha: string, turno: "AM" | "PM" | "Nocturno"): RosterSlotData => {
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
    am: slotData(fecha, "AM"),
    pm: slotData(fecha, "PM"),
    nocturno: slotData(fecha, "Nocturno"),
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
    .orderBy(
      asc(rosterBookings.fecha),
      asc(rosterBookings.turno),
      desc(rosterBookings.createdAt),
    )
    .limit(input.limit ?? 50);
}

export async function listAllSedes() {
  const db = getDb();
  return await db
    .select({ id: sedes.id, nombre: sedes.nombre })
    .from(sedes)
    .orderBy(asc(sedes.nombre));
}
