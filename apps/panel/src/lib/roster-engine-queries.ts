// Server-only read helpers for the intelligent roster engine UI
// (Phase 4 — Miguel v2.1 spec).
//
// Lives alongside roster-queries.ts (the legacy boat-counter view); the
// two surfaces coexist during shadow rollout (spec §9). When the engine
// becomes authoritative for a sede, /roster/engine replaces /roster as
// the operational view; until then both stay visible.

import { and, asc, eq, inArray } from "drizzle-orm";

import {
  getDb,
  instructorAvailability,
  instructors as instructorsTable,
  rosterDivers,
  rosterGroups,
  sedes,
} from "@dpm/db";

export type EngineSedeRow = {
  id: string;
  nombre: string;
};

/**
 * All AI-enabled sedes (everyone with an entry in the sedes table).
 * The engine UI uses the same sede list as the legacy roster view.
 */
export async function listEngineSedes(): Promise<EngineSedeRow[]> {
  const db = getDb();
  const rows = await db
    .select({ id: sedes.id, nombre: sedes.nombre })
    .from(sedes)
    .orderBy(asc(sedes.nombre));
  return rows;
}

export type InstructorRow = {
  id: string;
  sedeId: string;
  nombre: string;
  nombreLegal: string | null;
  languages: string[];
  active: boolean;
  notes: string | null;
};

/**
 * All instructors for a sede, active first then inactive. Used by the
 * /roster/instructors admin page.
 */
export async function listInstructors(sedeId: string): Promise<InstructorRow[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(instructorsTable)
    .where(eq(instructorsTable.sedeId, sedeId))
    .orderBy(asc(instructorsTable.nombre));
  return rows.map((r) => ({
    id: r.id,
    sedeId: r.sedeId,
    nombre: r.nombre,
    nombreLegal: r.nombreLegal,
    languages: r.languages ?? [],
    active: r.active,
    notes: r.notes,
  }));
}

export type AvailabilityRow = {
  id: string;
  fecha: string;
  instructorId: string;
  instructorNombre: string;
  slots: string[];
  source: string;
  notes: string | null;
};

/**
 * Instructor availability rows for a sede + date window. Used by the
 * admin to see who's scheduled when. Joins to instructors so the
 * display shows the name.
 */
export async function listAvailability(input: {
  sedeId: string;
  fromDate: string;
  toDate: string;
}): Promise<AvailabilityRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: instructorAvailability.id,
      fecha: instructorAvailability.fecha,
      instructorId: instructorAvailability.instructorId,
      instructorNombre: instructorsTable.nombre,
      slots: instructorAvailability.slots,
      source: instructorAvailability.source,
      notes: instructorAvailability.notes,
    })
    .from(instructorAvailability)
    .innerJoin(
      instructorsTable,
      eq(instructorAvailability.instructorId, instructorsTable.id),
    )
    .where(
      and(
        eq(instructorAvailability.sedeId, input.sedeId),
        // String comparison works because fecha is stored as YYYY-MM-DD.
        // gte(fecha, fromDate) AND lte(fecha, toDate):
      ),
    )
    .orderBy(asc(instructorAvailability.fecha), asc(instructorsTable.nombre));
  // Filter the date range in TS — drizzle's `between` operator needs
  // typed date columns; our schema uses text. Cheap (≤ 30 rows/day × 30
  // days = 900 rows max).
  return rows
    .filter((r) => r.fecha >= input.fromDate && r.fecha <= input.toDate)
    .map((r) => ({
      id: r.id,
      fecha: r.fecha,
      instructorId: r.instructorId,
      instructorNombre: r.instructorNombre,
      slots: r.slots ?? [],
      source: r.source,
      notes: r.notes,
    }));
}

export type DiverRow = {
  id: string;
  fecha: string;
  slot: string;
  codigoBuceador: string;
  nombre: string;
  nivelCertificacion: string;
  activity: string;
  activityDetail: string | null;
  perfilProfundidad: number;
  acceptsCap: boolean;
  origen: string;
  estadoPago: string;
  instructorId: string | null;
  groupId: string | null;
  groupOrder: number | null;
};

/**
 * All divers for a sede on a specific date. The engine view groups
 * these by (slot, group_id) for display.
 */
export async function listDiversForDate(input: {
  sedeId: string;
  fecha: string;
}): Promise<DiverRow[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(rosterDivers)
    .where(
      and(
        eq(rosterDivers.sedeId, input.sedeId),
        eq(rosterDivers.fecha, input.fecha),
        inArray(rosterDivers.estadoPago, ["pending", "deposit_paid", "full_paid"]),
      ),
    )
    .orderBy(
      asc(rosterDivers.slot),
      asc(rosterDivers.groupId),
      asc(rosterDivers.groupOrder),
    );
  return rows.map((r) => ({
    id: r.id,
    fecha: r.fecha,
    slot: r.slot,
    codigoBuceador: r.codigoBuceador,
    nombre: r.nombre,
    nivelCertificacion: r.nivelCertificacion,
    activity: r.activity,
    activityDetail: r.activityDetail,
    perfilProfundidad: r.perfilProfundidad,
    acceptsCap: r.acceptsCap,
    origen: r.origen,
    estadoPago: r.estadoPago,
    instructorId: r.instructorId,
    groupId: r.groupId,
    groupOrder: r.groupOrder,
  }));
}

export type GroupRow = {
  id: string;
  fecha: string;
  slot: string;
  instructorId: string | null;
  instructorNombre: string | null;
  grupoActividad: string;
  perfilProfundidad: number;
  ratioMax: number;
  site1: string | null;
  site2: string | null;
  diversCount: number;
  source: string;
};

/**
 * All persisted groups for a sede on a date. Used to render the
 * "engine view" — what the engine produced for that day.
 */
export async function listGroupsForDate(input: {
  sedeId: string;
  fecha: string;
}): Promise<GroupRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: rosterGroups.id,
      fecha: rosterGroups.fecha,
      slot: rosterGroups.slot,
      instructorId: rosterGroups.instructorId,
      instructorNombre: instructorsTable.nombre,
      grupoActividad: rosterGroups.grupoActividad,
      perfilProfundidad: rosterGroups.perfilProfundidad,
      ratioMax: rosterGroups.ratioMax,
      site1: rosterGroups.site1,
      site2: rosterGroups.site2,
      diversCount: rosterGroups.diversCount,
      source: rosterGroups.source,
    })
    .from(rosterGroups)
    .leftJoin(
      instructorsTable,
      eq(rosterGroups.instructorId, instructorsTable.id),
    )
    .where(
      and(
        eq(rosterGroups.sedeId, input.sedeId),
        eq(rosterGroups.fecha, input.fecha),
      ),
    )
    .orderBy(asc(rosterGroups.slot), asc(instructorsTable.nombre));
  return rows.map((r) => ({
    id: r.id,
    fecha: r.fecha,
    slot: r.slot,
    instructorId: r.instructorId,
    instructorNombre: r.instructorNombre,
    grupoActividad: r.grupoActividad,
    perfilProfundidad: r.perfilProfundidad,
    ratioMax: r.ratioMax,
    site1: r.site1,
    site2: r.site2,
    diversCount: r.diversCount,
    source: r.source,
  }));
}
