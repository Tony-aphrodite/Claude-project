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

const GLOBAL_DEFAULT_CAPACITY = 22;

/**
 * Resolve effective default capacity from sede.rosterConfig (Miguel feedback
 * 2026-06-05). Lookup order: default_capacities.{turno} → default_capacity →
 * GLOBAL. Kept in sync with apps/server/src/services/roster-db.ts.
 */
type Turno = "AM" | "PM" | "Nocturno" | "Confinadas";

function defaultCapacityFor(
  rosterConfig: Record<string, unknown> | null | undefined,
  turno: Turno,
): number {
  if (!rosterConfig) return GLOBAL_DEFAULT_CAPACITY;
  const perTurno = rosterConfig.default_capacities as
    | Partial<Record<Turno, number>>
    | undefined;
  if (perTurno && typeof perTurno[turno] === "number") return perTurno[turno]!;
  const flat = rosterConfig.default_capacity;
  if (typeof flat === "number" && flat >= 0) return flat;
  return GLOBAL_DEFAULT_CAPACITY;
}

export type RosterSlotData = {
  capacity: number;
  reserved: number;
  available: number;
  blocked: boolean;
  blockReason: string | null;
};

export type SedeDefaultCapacity = {
  flat: number | null;
  perTurno: {
    AM: number | null;
    PM: number | null;
    Nocturno: number | null;
    Confinadas: number | null;
  };
  effective: { AM: number; PM: number; Nocturno: number; Confinadas: number };
};

export type RosterSlotView = {
  fecha: string;
  weekday: string;
  am: RosterSlotData;
  pm: RosterSlotData;
  nocturno: RosterSlotData;
  /** Miguel rule 2026-06-07 — pool / confined-water capacity, tracked
   *  explicitly to remove ambiguity around multi-day programs. */
  confinadas: RosterSlotData;
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

  const [sedeRow] = await db
    .select({ rosterConfig: sedes.rosterConfig })
    .from(sedes)
    .where(eq(sedes.id, input.sedeId))
    .limit(1);
  const sedeConfig = (sedeRow?.rosterConfig as Record<string, unknown> | null) ?? null;

  const overrides = await db
    .select()
    .from(rosterCapacityOverrides)
    .where(
      and(
        eq(rosterCapacityOverrides.sedeId, input.sedeId),
        inArray(rosterCapacityOverrides.fecha, dates),
      ),
    );

  const reservedRows = await db
    .select({
      fecha: rosterBookings.fecha,
      turno: rosterBookings.turno,
      reserved: sql<number>`COALESCE(SUM(${rosterBookings.pax}), 0)::int`,
    })
    .from(rosterBookings)
    .where(
      and(
        eq(rosterBookings.sedeId, input.sedeId),
        inArray(rosterBookings.fecha, dates),
        eq(rosterBookings.status, "confirmed"),
      ),
    )
    .groupBy(rosterBookings.fecha, rosterBookings.turno);

  const overrideMap = new Map<string, (typeof overrides)[number]>();
  for (const o of overrides) overrideMap.set(`${o.fecha}|${o.turno}`, o);
  const reservedMap = new Map<string, number>();
  for (const r of reservedRows) reservedMap.set(`${r.fecha}|${r.turno}`, Number(r.reserved));

  const slotData = (fecha: string, turno: Turno): RosterSlotData => {
    const o = overrideMap.get(`${fecha}|${turno}`);
    const capacity = o?.capacity ?? defaultCapacityFor(sedeConfig, turno);
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
    confinadas: slotData(fecha, "Confinadas"),
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

export async function getSedeDefaultCapacity(
  sedeId: string,
): Promise<SedeDefaultCapacity> {
  const db = getDb();
  const [row] = await db
    .select({ rosterConfig: sedes.rosterConfig })
    .from(sedes)
    .where(eq(sedes.id, sedeId))
    .limit(1);
  const cfg = (row?.rosterConfig as Record<string, unknown> | null) ?? null;
  const perTurnoRaw = (cfg?.default_capacities as
    | Partial<Record<Turno, number>>
    | undefined) ?? {};
  const flatRaw = cfg?.default_capacity;
  return {
    flat: typeof flatRaw === "number" ? flatRaw : null,
    perTurno: {
      AM: typeof perTurnoRaw.AM === "number" ? perTurnoRaw.AM : null,
      PM: typeof perTurnoRaw.PM === "number" ? perTurnoRaw.PM : null,
      Nocturno: typeof perTurnoRaw.Nocturno === "number" ? perTurnoRaw.Nocturno : null,
      Confinadas: typeof perTurnoRaw.Confinadas === "number" ? perTurnoRaw.Confinadas : null,
    },
    effective: {
      AM: defaultCapacityFor(cfg, "AM"),
      PM: defaultCapacityFor(cfg, "PM"),
      Nocturno: defaultCapacityFor(cfg, "Nocturno"),
      Confinadas: defaultCapacityFor(cfg, "Confinadas"),
    },
  };
}
