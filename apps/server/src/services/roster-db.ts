// ============================================================================
// DB-backed roster service. Source of truth for capacity overrides + atomic
// confirmed bookings. Added 2026-06-04 as Phase 2 of "el roster vive dentro
// del AI" (Miguel's architectural pivot — see MIGUEL_FEEDBACK_LOG Entry #19
// when it lands).
//
// Architecture:
//   • Capacity per (sede, fecha, turno) defaults to DEFAULT_CAPACITY (22).
//     Operators (via /admin/roster/block) can write a `roster_capacity_overrides`
//     row to (a) reduce capacity for maintenance, (b) extend it for special
//     events, or (c) zero it out to mark the day as LLENO.
//
//   • Each confirmed booking lives in `roster_bookings`. Reading availability
//     is a single SQL query:  capacity_override OR default  −  SUM(pax)
//     over `status = 'confirmed'`. The query is consistent because all writes
//     funnel through `confirmBooking` (transactional, re-checks capacity).
//
// Race-condition guard: confirmBooking opens a SERIALIZABLE transaction that
// first computes `available = capacity − reserved` and only inserts when the
// new pax fits. Two simultaneous confirmations for the same slot will see
// the same `reserved` snapshot; the second commit will get a serialization
// failure → caller can retry or surface as overbooked. This is the same
// pattern Postgres docs recommend for atomic counter-increment under
// contention.
//
// What this DOES NOT replace yet:
//   • `consultar-disponibilidad` still reads from the Apps Script + Google
//     Sheet for production reads (Slice 3 — deferred to next session pending
//     Miguel's reply on the 3 product questions). This file is the write
//     path + the read path that the cut-over will use.
//
// Default capacity is a const here for now. If Miguel wants per-sede or
// per-day-of-week defaults, lift it to `sedes.roster_config.default_capacity`
// or a new `roster_default_capacities` table; getCapacity()  reads it.
// ============================================================================

import { and, eq, sql } from "drizzle-orm";

import {
  conversaciones,
  getDb,
  rosterBookings,
  rosterCapacityOverrides,
  type NewRosterBooking,
  type RosterBooking,
  type RosterCapacityOverride,
} from "@dpm/db";

import { getLogger } from "../logger.js";

/**
 * Default capacity per turno when no per-(sede, fecha, turno) override exists.
 * Matches the historical "22 espacios por barco" used in Miguel's Apps Script
 * roster summary view (PHI PHI ROSTER 06 JUN26 screenshot from feedback).
 *
 * If Miguel later asks for per-sede or per-day-of-week defaults, this becomes
 * a function of (sedeId, fecha) rather than a constant — no caller changes
 * because getAvailability already delegates to getCapacity.
 */
const DEFAULT_CAPACITY_PER_TURNO = 22;

export type Turno = "AM" | "PM" | "Nocturno";

export const VALID_TURNOS: readonly Turno[] = ["AM", "PM", "Nocturno"] as const;

export function isValidTurno(value: string): value is Turno {
  return (VALID_TURNOS as readonly string[]).includes(value);
}

export type AvailabilitySlot = {
  fecha: string;
  turno: Turno;
  capacity: number;
  reserved: number;
  available: number;
  blocked: boolean;
  blockedReason?: string | undefined;
};

export type ConfirmBookingInput = {
  sedeId: string;
  fecha: string;
  turno: Turno;
  programa: string;
  pax: number;
  conversacionId?: string | undefined;
  contactId?: string | undefined;
  notes?: string | undefined;
};

export type ConfirmBookingResult =
  | { ok: true; booking: RosterBooking }
  | { ok: false; reason: "overbooked"; available: number; capacity: number; reserved: number }
  | { ok: false; reason: "blocked"; blockedReason: string | undefined }
  | { ok: false; reason: "invalid_input"; message: string };

export type BlockDayInput = {
  sedeId: string;
  fecha: string;
  /** Turnos to block. Omit / empty array → blocks ALL turnos for the day. */
  turnos?: Turno[];
  reason?: string;
  by?: string;
};

export class RosterDbService {
  /**
   * Read availability for a (sede, fecha) across one or all turnos.
   * Returns one slot row per turno. `available` is always non-negative
   * (clamped to zero if overbooked — should never happen via confirmBooking
   * but possible via direct DB edits).
   */
  async getAvailability(
    sedeId: string,
    fecha: string,
    turno?: Turno,
  ): Promise<AvailabilitySlot[]> {
    const turnos = turno ? [turno] : ([...VALID_TURNOS] as Turno[]);
    const result: AvailabilitySlot[] = [];
    for (const t of turnos) {
      const override = await this.getOverride(sedeId, fecha, t);
      const capacity = override?.capacity ?? DEFAULT_CAPACITY_PER_TURNO;
      const reserved = await this.getReserved(sedeId, fecha, t);
      const blocked = capacity === 0;
      result.push({
        fecha,
        turno: t,
        capacity,
        reserved,
        available: Math.max(0, capacity - reserved),
        blocked,
        blockedReason: blocked ? (override?.reason ?? undefined) : undefined,
      });
    }
    return result;
  }

  /**
   * Confirm and persist a booking. Race-safe: opens a SERIALIZABLE transaction
   * that recomputes capacity − reserved before inserting. Returns:
   *   • ok:true with the new booking row
   *   • ok:false reason:overbooked when the requested pax exceeds available
   *   • ok:false reason:blocked when the turno is marked blocked (capacity 0)
   *   • ok:false reason:invalid_input on validation failure
   */
  async confirmBooking(input: ConfirmBookingInput): Promise<ConfirmBookingResult> {
    const log = getLogger();

    // Input validation — defensive, since some call sites stamp from
    // free-form AI tool input.
    if (!isValidTurno(input.turno)) {
      return {
        ok: false,
        reason: "invalid_input",
        message: `Invalid turno: ${input.turno}. Expected one of ${VALID_TURNOS.join(", ")}.`,
      };
    }
    if (!Number.isInteger(input.pax) || input.pax < 1) {
      return {
        ok: false,
        reason: "invalid_input",
        message: `Invalid pax: ${input.pax}. Must be a positive integer.`,
      };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) {
      return {
        ok: false,
        reason: "invalid_input",
        message: `Invalid fecha: ${input.fecha}. Expected YYYY-MM-DD.`,
      };
    }

    const db = getDb();
    return await db.transaction(
      async (tx) => {
        // Re-read capacity + reserved inside the transaction. SERIALIZABLE
        // isolation makes both queries see a consistent snapshot.
        const [overrideRow] = await tx
          .select()
          .from(rosterCapacityOverrides)
          .where(
            and(
              eq(rosterCapacityOverrides.sedeId, input.sedeId),
              eq(rosterCapacityOverrides.fecha, input.fecha),
              eq(rosterCapacityOverrides.turno, input.turno),
            ),
          )
          .limit(1);
        const capacity = overrideRow?.capacity ?? DEFAULT_CAPACITY_PER_TURNO;
        if (capacity === 0) {
          return {
            ok: false as const,
            reason: "blocked" as const,
            blockedReason: overrideRow?.reason ?? undefined,
          };
        }

        const [reservedRow] = (await tx.execute(sql`
          SELECT COALESCE(SUM(${rosterBookings.pax}), 0)::int AS reserved
            FROM ${rosterBookings}
           WHERE ${rosterBookings.sedeId} = ${input.sedeId}
             AND ${rosterBookings.fecha} = ${input.fecha}
             AND ${rosterBookings.turno} = ${input.turno}
             AND ${rosterBookings.status} = 'confirmed'
        `)) as unknown as Array<{ reserved: number }>;
        const reserved = Number(reservedRow?.reserved ?? 0);
        const available = Math.max(0, capacity - reserved);

        if (available < input.pax) {
          return {
            ok: false as const,
            reason: "overbooked" as const,
            available,
            capacity,
            reserved,
          };
        }

        const values: NewRosterBooking = {
          sedeId: input.sedeId,
          fecha: input.fecha,
          turno: input.turno,
          programa: input.programa,
          pax: input.pax,
          status: "confirmed",
          conversacionId: input.conversacionId ?? null,
          contactId: input.contactId ?? null,
          notes: input.notes ?? null,
        };
        const [booking] = await tx
          .insert(rosterBookings)
          .values(values)
          .returning();
        if (!booking) {
          throw new Error("confirmBooking insert returned no row");
        }

        log.info(
          {
            sedeId: input.sedeId,
            fecha: input.fecha,
            turno: input.turno,
            programa: input.programa,
            pax: input.pax,
            capacityAfter: capacity,
            reservedAfter: reserved + input.pax,
            conversacionId: input.conversacionId,
          },
          "roster_db booking confirmed",
        );

        return { ok: true as const, booking };
      },
      { isolationLevel: "serializable" },
    );
  }

  /**
   * Mark one or more turnos of a date as blocked (capacity=0). Upserts the
   * override row(s). Idempotent — calling twice with the same input is a no-op.
   *
   * Omit `turnos` to block ALL turnos at once (the "día entero" case).
   */
  async blockDay(input: BlockDayInput): Promise<{ blocked: Turno[] }> {
    const turnos = input.turnos && input.turnos.length > 0 ? input.turnos : [...VALID_TURNOS];
    const db = getDb();
    const log = getLogger();
    for (const turno of turnos) {
      await db
        .insert(rosterCapacityOverrides)
        .values({
          sedeId: input.sedeId,
          fecha: input.fecha,
          turno,
          capacity: 0,
          reason: input.reason ?? null,
          createdBy: input.by ?? "api",
        })
        .onConflictDoUpdate({
          target: [
            rosterCapacityOverrides.sedeId,
            rosterCapacityOverrides.fecha,
            rosterCapacityOverrides.turno,
          ],
          set: {
            capacity: 0,
            reason: input.reason ?? null,
            updatedAt: new Date(),
          },
        });
    }
    log.info(
      {
        sedeId: input.sedeId,
        fecha: input.fecha,
        turnos,
        reason: input.reason,
        by: input.by,
      },
      "roster_db day blocked",
    );
    return { blocked: turnos as Turno[] };
  }

  /**
   * Set an explicit capacity for a (sede, fecha, turno). 0 is equivalent to
   * blockDay for that single turno. Useful for "reduce a 18 because of fewer
   * tanks today" rather than full block.
   */
  async setCapacity(input: {
    sedeId: string;
    fecha: string;
    turno: Turno;
    capacity: number;
    reason?: string | undefined;
    by?: string | undefined;
  }): Promise<void> {
    if (!isValidTurno(input.turno)) {
      throw new Error(`Invalid turno: ${input.turno}`);
    }
    if (!Number.isInteger(input.capacity) || input.capacity < 0) {
      throw new Error(`Invalid capacity: ${input.capacity}. Must be a non-negative integer.`);
    }
    const db = getDb();
    await db
      .insert(rosterCapacityOverrides)
      .values({
        sedeId: input.sedeId,
        fecha: input.fecha,
        turno: input.turno,
        capacity: input.capacity,
        reason: input.reason ?? null,
        createdBy: input.by ?? "api",
      })
      .onConflictDoUpdate({
        target: [
          rosterCapacityOverrides.sedeId,
          rosterCapacityOverrides.fecha,
          rosterCapacityOverrides.turno,
        ],
        set: {
          capacity: input.capacity,
          reason: input.reason ?? null,
          updatedAt: new Date(),
        },
      });
  }

  /**
   * Cancel a booking. Pass either the booking id directly OR the
   * conversacionId (when the lead cancels, the panel can target by
   * conversation without having to know the booking id).
   */
  async cancelBooking(input: {
    bookingId?: string | undefined;
    conversacionId?: string | undefined;
    by?: string | undefined;
    reason?: string | undefined;
  }): Promise<{ cancelled: number }> {
    if (!input.bookingId && !input.conversacionId) {
      throw new Error("cancelBooking: provide bookingId or conversacionId");
    }
    const db = getDb();
    const now = new Date();
    const where = input.bookingId
      ? and(
          eq(rosterBookings.id, input.bookingId),
          eq(rosterBookings.status, "confirmed"),
        )
      : and(
          eq(rosterBookings.conversacionId, input.conversacionId!),
          eq(rosterBookings.status, "confirmed"),
        );
    const updated = await db
      .update(rosterBookings)
      .set({
        status: "cancelled",
        cancelledAt: now,
        cancelledBy: input.by ?? "api",
        cancelReason: input.reason ?? null,
        updatedAt: now,
      })
      .where(where)
      .returning({ id: rosterBookings.id });
    return { cancelled: updated.length };
  }

  /**
   * List confirmed bookings for a sede in a date range. Used by the panel
   * (when we build it) and by the office for "what's the day looking like".
   */
  async listBookings(input: {
    sedeId: string;
    fechaFrom: string;
    fechaTo: string;
  }): Promise<RosterBooking[]> {
    const db = getDb();
    const rows = await db.execute<RosterBooking>(sql`
      SELECT *
        FROM ${rosterBookings}
       WHERE ${rosterBookings.sedeId} = ${input.sedeId}
         AND ${rosterBookings.fecha} BETWEEN ${input.fechaFrom} AND ${input.fechaTo}
         AND ${rosterBookings.status} = 'confirmed'
       ORDER BY ${rosterBookings.fecha} ASC, ${rosterBookings.turno} ASC, ${rosterBookings.createdAt} ASC
    `);
    return rows as unknown as RosterBooking[];
  }

  // ────────────────────────────────────────────────────────────────────────
  // Internals
  // ────────────────────────────────────────────────────────────────────────

  private async getOverride(
    sedeId: string,
    fecha: string,
    turno: Turno,
  ): Promise<RosterCapacityOverride | undefined> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(rosterCapacityOverrides)
      .where(
        and(
          eq(rosterCapacityOverrides.sedeId, sedeId),
          eq(rosterCapacityOverrides.fecha, fecha),
          eq(rosterCapacityOverrides.turno, turno),
        ),
      )
      .limit(1);
    return row;
  }

  private async getReserved(
    sedeId: string,
    fecha: string,
    turno: Turno,
  ): Promise<number> {
    const db = getDb();
    const result = (await db.execute(sql`
      SELECT COALESCE(SUM(${rosterBookings.pax}), 0)::int AS reserved
        FROM ${rosterBookings}
       WHERE ${rosterBookings.sedeId} = ${sedeId}
         AND ${rosterBookings.fecha} = ${fecha}
         AND ${rosterBookings.turno} = ${turno}
         AND ${rosterBookings.status} = 'confirmed'
    `)) as unknown as Array<{ reserved: number }>;
    return Number(result[0]?.reserved ?? 0);
  }
}

export const rosterDbService = new RosterDbService();

// Avoid an unused-import warning for `conversaciones` — the FK reference in
// the schema definition is what we want, but TS sees nothing using it here.
// Keep the type reference live so renames in schema get caught.
type _UsedFK = typeof conversaciones;
