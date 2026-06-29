// ============================================================================
// Consolidated capacity helpers — Miguel v2.2 addendum §7 (2026-06-27).
//
// Why this exists:
//   Two parallel tables consume the same boat/pool seats but were counted
//   separately:
//     • `roster_bookings`  — AI-driven, multi-pax per row, turno field.
//     • `roster_divers`    — walk-in, one-row-per-diver, slot field.
//   AI capacity checks counted only `roster_bookings`. Walk-in CRUD did
//   not count anything. Result: AI ↔ walk-in and walk-in ↔ walk-in could
//   both push a slot over its limit (see
//   `reference/2026-06-29-atomic-claim-roster-audit.md`).
//
// This module fixes that by:
//   1. Providing a single function (`computeReservedCapacity`) every
//      caller can use INSIDE a SERIALIZABLE transaction to atomically
//      check capacity across both tables.
//   2. Normalising the slot/turno naming differences (POOL_AM vs
//      ConfinadasAM, NIGHT vs Nocturno) so the same call works regardless
//      of which side of the system the caller comes from.
//
// Atomic guarantee: this helper alone is NOT enough. The caller MUST run
// it inside `db.transaction(..., { isolationLevel: "serializable" })` for
// Postgres to detect the read-write conflict between two concurrent
// claims. The helper just gives you the consolidated `reserved` number;
// SERIALIZABLE on the wrapping transaction is what closes the race.
// ============================================================================

import { sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";

// ── Slot ↔ Turno normalisation ───────────────────────────────────────────
//
// Same time bucket, two names. Walk-in side (`roster_divers.slot`) uses
// the panel-friendly `POOL_AM` / `POOL_PM` / `NIGHT`. AI side
// (`roster_bookings.turno`) uses the canonical `ConfinadasAM` /
// `ConfinadasPM` / `Nocturno`. The list below is exhaustive — adding a
// new turno requires updating BOTH this map and the panel's `ALL_SLOTS`.

/**
 * All `roster_divers.slot` values that map to a given canonical
 * `roster_bookings.turno` value. Used to count walk-in divers in the
 * same time bucket as an AI booking.
 *
 * "Confinadas" without a suffix is the legacy AI-side alias from before
 * 2026-06-26 (the POOL split). Bookings written under it should be
 * treated as occupying BOTH ConfinadasAM and ConfinadasPM, so we list
 * both pool slots under the legacy key — keeps stale rows from leaking
 * capacity.
 */
const TURNO_TO_WALKIN_SLOTS: Record<string, readonly string[]> = {
  AM: ["AM"],
  PM: ["PM"],
  Nocturno: ["NIGHT"],
  ConfinadasAM: ["POOL_AM"],
  ConfinadasPM: ["POOL_PM"],
  Confinadas: ["POOL_AM", "POOL_PM"],
};

/**
 * All `roster_bookings.turno` values that map to a given walk-in
 * `roster_divers.slot` value. The walk-in side queries by `slot` and
 * needs to count AI bookings on the matching turno — including the
 * legacy `Confinadas` alias for pool slots, otherwise a hold from
 * before the 2026-06-26 split would slip under the radar.
 */
const WALKIN_SLOT_TO_TURNOS: Record<string, readonly string[]> = {
  AM: ["AM"],
  PM: ["PM"],
  NIGHT: ["Nocturno"],
  POOL_AM: ["ConfinadasAM", "Confinadas"],
  POOL_PM: ["ConfinadasPM", "Confinadas"],
};

export function walkInSlotsForTurno(turno: string): readonly string[] {
  return TURNO_TO_WALKIN_SLOTS[turno] ?? [];
}

export function turnosForWalkInSlot(slot: string): readonly string[] {
  return WALKIN_SLOT_TO_TURNOS[slot] ?? [];
}

// ── Consolidated reserved count ──────────────────────────────────────────

export type CapacityBreakdown = {
  /** SUM(pax) from roster_bookings WHERE status IN ('pending','confirmed'). */
  aiReserved: number;
  /** COUNT(*) from roster_divers WHERE estado_pago not in cancelled-states. */
  walkInReserved: number;
  /** aiReserved + walkInReserved. */
  total: number;
};

/**
 * Count every seat consumed on a given (sede, fecha, turno) across BOTH
 * `roster_bookings` (AI) and `roster_divers` (walk-in). Two `SELECT`s
 * inside one transaction — Drizzle's `tx` runs both against the same
 * snapshot so the numbers are mutually consistent.
 *
 * Call from inside `db.transaction(..., { isolationLevel: "serializable" })`
 * — that wrapping is what makes the subsequent INSERT race-safe. The
 * helper itself just does the math.
 *
 * Walk-in payment states we EXCLUDE from the count:
 *   - 'cancelled' — explicitly cancelled, seat is free
 * Everything else (pending / deposit_paid / full_paid / no_show / etc.)
 * is treated as "still consuming a seat" — Miguel's office reads the
 * Sheet that way, the AI should too.
 *
 * The `sandboxBookingsTableName` parameter switches between the
 * production `roster_bookings` table and the sandbox copy. We pass the
 * raw table name instead of a Drizzle reference because the helper has
 * to live in `@dpm/db` (shared between server + panel) without
 * depending on the server-only `bookingsTable()` indirection.
 */
export async function computeReservedCapacity(
  tx: PgTransaction<any, any, any>,
  args: {
    sedeId: string;
    fecha: string;
    turno: string;
    /** `'roster_bookings'` or `'roster_bookings_sandbox'`. */
    bookingsTableName: "roster_bookings" | "roster_bookings_sandbox";
  },
): Promise<CapacityBreakdown> {
  const { sedeId, fecha, turno, bookingsTableName } = args;
  const walkInSlots = walkInSlotsForTurno(turno);

  // AI side: roster_bookings (or sandbox). Use raw SQL so the table name
  // can be a string literal — Drizzle's typed builder would require us
  // to import both tables and switch at compile time, which we already
  // do in the server's bookingsTable() helper but can't re-do here.
  const tableIdent = bookingsTableName === "roster_bookings_sandbox"
    ? sql.identifier("roster_bookings_sandbox")
    : sql.identifier("roster_bookings");

  const [aiRow] = (await tx.execute(sql`
    SELECT COALESCE(SUM(pax), 0)::int AS reserved
      FROM ${tableIdent}
     WHERE sede_id = ${sedeId}
       AND fecha = ${fecha}
       AND turno = ${turno}
       AND status IN ('pending', 'confirmed')
  `)) as unknown as Array<{ reserved: number }>;
  const aiReserved = Number(aiRow?.reserved ?? 0);

  // Walk-in side: roster_divers. Skip the query entirely if the turno
  // has no walk-in mapping (defensive — empty IN () is a syntax error).
  let walkInReserved = 0;
  if (walkInSlots.length > 0) {
    const [walkRow] = (await tx.execute(sql`
      SELECT COUNT(*)::int AS reserved
        FROM roster_divers
       WHERE sede_id = ${sedeId}
         AND fecha = ${fecha}
         AND slot IN ${sql.raw(`(${walkInSlots.map((s) => `'${s}'`).join(",")})`)}
         AND estado_pago <> 'cancelled'
    `)) as unknown as Array<{ reserved: number }>;
    walkInReserved = Number(walkRow?.reserved ?? 0);
  }

  return {
    aiReserved,
    walkInReserved,
    total: aiReserved + walkInReserved,
  };
}

/**
 * Same as `computeReservedCapacity` but takes the walk-in side's slot
 * naming (POOL_AM / POOL_PM / NIGHT). Used by `createWalkInDiver` and
 * friends which think in `slot` rather than `turno`. Internally maps to
 * the canonical turno + matching walk-in slots so the SUM covers
 * everything regardless of which alias was written.
 */
export async function computeReservedCapacityBySlot(
  tx: PgTransaction<any, any, any>,
  args: {
    sedeId: string;
    fecha: string;
    slot: string;
    bookingsTableName: "roster_bookings" | "roster_bookings_sandbox";
  },
): Promise<CapacityBreakdown> {
  const { sedeId, fecha, slot, bookingsTableName } = args;
  const turnos = turnosForWalkInSlot(slot);

  const tableIdent = bookingsTableName === "roster_bookings_sandbox"
    ? sql.identifier("roster_bookings_sandbox")
    : sql.identifier("roster_bookings");

  // AI side — match any of the turno aliases that resolve to this slot.
  let aiReserved = 0;
  if (turnos.length > 0) {
    const [aiRow] = (await tx.execute(sql`
      SELECT COALESCE(SUM(pax), 0)::int AS reserved
        FROM ${tableIdent}
       WHERE sede_id = ${sedeId}
         AND fecha = ${fecha}
         AND turno IN ${sql.raw(`(${turnos.map((t) => `'${t}'`).join(",")})`)}
         AND status IN ('pending', 'confirmed')
    `)) as unknown as Array<{ reserved: number }>;
    aiReserved = Number(aiRow?.reserved ?? 0);
  }

  // Walk-in side — exact slot match.
  const [walkRow] = (await tx.execute(sql`
    SELECT COUNT(*)::int AS reserved
      FROM roster_divers
     WHERE sede_id = ${sedeId}
       AND fecha = ${fecha}
       AND slot = ${slot}
       AND estado_pago <> 'cancelled'
  `)) as unknown as Array<{ reserved: number }>;
  const walkInReserved = Number(walkRow?.reserved ?? 0);

  return {
    aiReserved,
    walkInReserved,
    total: aiReserved + walkInReserved,
  };
}
