// ============================================================================
// Roster Engine — Multi-day Simulation
//
// Spec: reference/roster-engine-spec-2026-06-24.md §6.1
// Arch: docs/roster-engine-architecture.md §5 (sale-time simulation)
//
// Given a candidate diver + program + start date, simulate the roster
// engine across ALL days the program occupies. The sale is feasible
// only if EVERY day's simulation comes back valid.
//
// This module composes:
//   1. programaToActivityFootprint() — translate program → list of
//      (fecha, slot, activity)
//   2. For each (fecha, slot): load existing roster_divers + instructor
//      availability from the DB
//   3. Append a synthetic candidate row
//   4. Run buildRoster() in sim mode
//   5. Aggregate verdicts
//
// Output is a small structured verdict the AI tool can render to the
// customer ("July 15 doesn't work — no instructor for OW3", etc.).
// ============================================================================

import { and, eq, inArray, isNull, sql as drizzleSql } from "drizzle-orm";

import {
  getDb,
  instructorAvailability,
  instructors as instructorsTable,
  rosterDivers,
  type RosterDiver as DbRosterDiver,
} from "@dpm/db";
import type {
  Activity,
  ActivityDetail,
  BuildRosterOutput,
  InstructorInput,
  NivelCertificacion,
  RosterDiverInput,
  Slot,
} from "@dpm/shared";
import { programaToActivityFootprint, type FootprintEntry } from "@dpm/shared";

import { buildRoster } from "./roster-engine.js";

export interface SimulationCandidate {
  /** Customer's first name (for trace logs only — sim doesn't persist). */
  nombre: string;
  nivelCertificacion: NivelCertificacion;
  /** Pax count. Each pax becomes one synthetic diver row per day. */
  pax: number;
  /** Optional — set to true only when the AI has confirmed the cap. */
  acceptsCap?: boolean;
}

export interface DayVerdict {
  fecha: string;
  slot: Slot;
  activity: Activity;
  activityDetail?: ActivityDetail;
  ok: boolean;
  /** Why the day fails. Populated when ok=false. */
  reason: "no_instructor" | "no_boat_capacity" | "program_not_scheduled" | null;
  /** Underlying engine output — full detail when caller needs it. */
  engine?: BuildRosterOutput;
}

export interface SimulationVerdict {
  ok: boolean;
  /** When ok=false, at least one day failed. Otherwise empty. */
  failingDays: DayVerdict[];
  /** All days the program occupies, in order. */
  allDays: DayVerdict[];
  /**
   * If the simulation couldn't run because the program isn't on a
   * roster schedule (DM / Instructor / unsupported specialty), the
   * verdict is "unscheduled" → caller falls back to existing escalate
   * path; the AI does NOT try to sell from a fabricated footprint.
   */
  programScheduled: boolean;
}

export interface SimulationInput {
  sedeId: string;
  /** The 'sede.nombre' string the spec / engine consumes. */
  sedeName: string;
  programa: string;
  startDate: string;
  candidate: SimulationCandidate;
  /**
   * For FunDive / DeepAdvFD where the customer chooses AM vs PM. The
   * shared `getRequiredSlots()` needs this to expand the footprint.
   */
  fundiveSlot?: "AM" | "PM";
  /**
   * Optional boat capacity per slot. If omitted, the secondary boat
   * check is skipped (Phase 2 default behaviour — boats are NOT the
   * primary constraint anymore).
   */
  boatCapacityBySlot?: Partial<Record<Slot, number>>;
}

/**
 * Run the multi-day simulation. Pure side-effects: 2 read queries per
 * day (existing divers + instructor availability). No writes.
 */
export async function simulateRosterFit(
  input: SimulationInput,
): Promise<SimulationVerdict> {
  const { sedeId, programa, startDate, candidate, fundiveSlot, boatCapacityBySlot } = input;

  const footprint = programaToActivityFootprint({
    programa,
    startDate,
    nivel: candidate.nivelCertificacion,
    fundiveSlot,
  });

  if (footprint === null) {
    return {
      ok: false,
      failingDays: [],
      allDays: [],
      programScheduled: false,
    };
  }

  // No-roster programs (ReactRight is theory-only → empty array).
  if (footprint.length === 0) {
    return { ok: true, failingDays: [], allDays: [], programScheduled: true };
  }

  // For each (fecha, slot), load context and simulate. Sequential for
  // simplicity — Phase 4 can parallelise; today's footprints have ≤ 6
  // entries so the round-trip latency is fine sequentially.
  const allDays: DayVerdict[] = [];
  for (const entry of footprint) {
    const verdict = await simulateOneDay({
      sedeId,
      sedeName: input.sedeName,
      entry,
      candidate,
      boatCapacity: boatCapacityBySlot?.[entry.slot] ?? null,
    });
    allDays.push(verdict);
  }

  const failingDays = allDays.filter((d) => !d.ok);
  return {
    ok: failingDays.length === 0,
    failingDays,
    allDays,
    programScheduled: true,
  };
}

async function simulateOneDay(args: {
  sedeId: string;
  sedeName: string;
  entry: FootprintEntry;
  candidate: SimulationCandidate;
  boatCapacity: number | null;
}): Promise<DayVerdict> {
  const { sedeId, sedeName, entry, candidate, boatCapacity } = args;
  const db = getDb();

  // ── Load existing divers in this (sede, fecha, slot) ──────────────
  // We only need active rows: pending / deposit_paid / full_paid count
  // toward capacity. Cancelled rows are excluded. Miguel v2.2 §3:
  // soft-deleted rows (deletedAt IS NOT NULL) are also excluded — the
  // walk-in was removed by the office, so the seat is free.
  const existing = await db
    .select()
    .from(rosterDivers)
    .where(
      and(
        eq(rosterDivers.sedeId, sedeId),
        eq(rosterDivers.fecha, entry.fecha),
        eq(rosterDivers.slot, entry.slot),
        inArray(rosterDivers.estadoPago, ["pending", "deposit_paid", "full_paid"]),
        isNull(rosterDivers.deletedAt),
      ),
    );

  // ── Load instructors available on this (sede, fecha) for this slot ─
  // Miguel v2.2 addendum §1 (2026-06-27): also load the `role` column
  // so the matching engine can pack DMs into fun-dive groups first.
  const availabilityRows = await db
    .select({
      instructorId: instructorAvailability.instructorId,
      slots: instructorAvailability.slots,
      nombre: instructorsTable.nombre,
      languages: instructorsTable.languages,
      role: instructorsTable.role,
      active: instructorsTable.active,
    })
    .from(instructorAvailability)
    .innerJoin(
      instructorsTable,
      eq(instructorAvailability.instructorId, instructorsTable.id),
    )
    .where(
      and(
        eq(instructorAvailability.sedeId, sedeId),
        eq(instructorAvailability.fecha, entry.fecha),
      ),
    );

  const availableInstructors: InstructorInput[] = availabilityRows
    .filter((r) => r.active === true && (r.slots ?? []).includes(entry.slot))
    .map((r) => ({
      id: r.instructorId,
      nombre: r.nombre,
      languages: r.languages ?? undefined,
      role:
        r.role === "divemaster"
          ? ("divemaster" as const)
          : ("instructor" as const),
    }));

  // ── Compose engine input ──────────────────────────────────────────
  const engineDivers: RosterDiverInput[] = existing.map(dbRowToEngineInput);
  // Append the candidate as `pax` synthetic divers — each one will be
  // grouped per the engine's rules, just like real divers.
  for (let i = 0; i < candidate.pax; i += 1) {
    engineDivers.push({
      id: `candidate-${i + 1}`,
      codigoBuceador: `CANDIDATE-${i + 1}`,
      nombre: candidate.nombre,
      nivelCertificacion: candidate.nivelCertificacion,
      activity: entry.activity,
      activityDetail: entry.activityDetail,
      acceptsCap: candidate.acceptsCap ?? false,
    });
  }

  // ── Run engine in simulation mode ─────────────────────────────────
  const engineResult = buildRoster({
    sede: sedeName,
    fecha: entry.fecha,
    slot: entry.slot,
    divers: engineDivers,
    availableInstructors,
    boatCapacity,
  });

  // ── Map to a structured day verdict ───────────────────────────────
  if (engineResult.valid) {
    return {
      fecha: entry.fecha,
      slot: entry.slot,
      activity: entry.activity,
      activityDetail: entry.activityDetail,
      ok: true,
      reason: null,
      engine: engineResult,
    };
  }

  // Pick the most-informative reason. If both fail, instructor is
  // primary per spec §3 ("instructor outranks the boat").
  const reason: DayVerdict["reason"] = !engineResult.validation.instructor.ok
    ? "no_instructor"
    : "no_boat_capacity";

  return {
    fecha: entry.fecha,
    slot: entry.slot,
    activity: entry.activity,
    activityDetail: entry.activityDetail,
    ok: false,
    reason,
    engine: engineResult,
  };
}

/**
 * Map a DB row to the engine's input type. The DB stores extra
 * columns the engine doesn't need (created_at, conversacion_id, etc.)
 * — drop them here.
 */
function dbRowToEngineInput(row: DbRosterDiver): RosterDiverInput {
  return {
    id: row.id,
    codigoBuceador: row.codigoBuceador,
    nombre: row.nombre,
    nivelCertificacion: row.nivelCertificacion as RosterDiverInput["nivelCertificacion"],
    activity: row.activity as RosterDiverInput["activity"],
    activityDetail: (row.activityDetail ?? undefined) as RosterDiverInput["activityDetail"],
    acceptsCap: row.acceptsCap,
  };
}

// Re-export for tests / callers that want to bypass the DB and feed
// engine input directly.
export { buildRoster };

// Re-export drizzle sql for raw queries if needed.
export { drizzleSql };
