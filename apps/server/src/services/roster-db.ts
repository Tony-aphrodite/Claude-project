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
import { addDays } from "./program-schedule.js";

/**
 * Days between two YYYY-MM-DD strings. Positive when `to` is after `from`.
 * Used to compute Apps-Script-compatible `offset_dias` for fetchAvailability.
 */
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  if (!fy || !ty) return 0;
  const f = Date.UTC(fy, (fm ?? 1) - 1, fd ?? 1);
  const t = Date.UTC(ty, (tm ?? 1) - 1, td ?? 1);
  return Math.round((t - f) / 86400000);
}

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
  /** Real seat count (preserved across block/unblock toggles). */
  capacity: number;
  /** Sum of pax across confirmed bookings. */
  reserved: number;
  /**
   * Effective availability: 0 when manually blocked, otherwise
   * max(0, capacity - reserved). The AI consumes this directly.
   */
  available: number;
  /**
   * Manual block flag (weather, charter, festivo, no boat). Independent
   * from full-by-bookings: a slot can be `blocked=false` but still have
   * `available=0` if reserved equals capacity (that's the natural-full
   * state, no manual action required).
   */
  blocked: boolean;
  /** Reason for the manual block, surfaced to operators in the panel. */
  blockedReason?: string | undefined;
  /**
   * True when reserved equals or exceeds capacity. Derived; provided as a
   * separate signal so callers can distinguish "manually blocked" from
   * "sold out". Both produce available=0 but require different UX.
   */
  full: boolean;
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
      const blocked = override?.blocked === true;
      const reserved = await this.getReserved(sedeId, fecha, t);
      const full = reserved >= capacity;
      // Effective availability: manual block forces 0; otherwise clamp at 0.
      const available = blocked ? 0 : Math.max(0, capacity - reserved);
      result.push({
        fecha,
        turno: t,
        capacity,
        reserved,
        available,
        blocked,
        blockedReason: blocked ? (override?.blockReason ?? undefined) : undefined,
        full,
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
        if (overrideRow?.blocked === true) {
          return {
            ok: false as const,
            reason: "blocked" as const,
            blockedReason: overrideRow.blockReason ?? undefined,
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
   * Mark one or more turnos of a date as manually blocked (weather, charter,
   * festivo, no boat). Sets the `blocked` flag without touching capacity —
   * unblockDay restores the slot to its previous capacity automatically.
   *
   * Upserts the override row(s). Idempotent — calling twice is a no-op.
   * Omit `turnos` to block ALL turnos at once (the "día entero" case).
   *
   * Schema note (Miguel feedback 2026-06-05): this is the FLAG-based block,
   * not the prior capacity=0 hack. If a row already exists with a custom
   * capacity (e.g. 18 set via setCapacity earlier), that capacity is
   * preserved through the block/unblock cycle.
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
          // Insert path: no prior row → seed with default capacity so the
          // value is preserved through the block/unblock toggle.
          capacity: DEFAULT_CAPACITY_PER_TURNO,
          blocked: true,
          blockReason: input.reason ?? null,
          createdBy: input.by ?? "api",
        })
        .onConflictDoUpdate({
          target: [
            rosterCapacityOverrides.sedeId,
            rosterCapacityOverrides.fecha,
            rosterCapacityOverrides.turno,
          ],
          set: {
            // Critically: do NOT overwrite capacity here. If a prior row
            // had capacity=18, blocking must keep 18 so the unblock path
            // restores the right number. Only the flag + reason are touched.
            blocked: true,
            blockReason: input.reason ?? null,
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
      "roster_db day blocked (flag)",
    );
    return { blocked: turnos as Turno[] };
  }

  /**
   * Reverse blockDay — clear the manual block flag. Capacity is untouched,
   * so the slot returns to its previous (overridden or default) capacity.
   *
   * Omit `turnos` to unblock ALL turnos.
   */
  async unblockDay(input: {
    sedeId: string;
    fecha: string;
    turnos?: Turno[];
    by?: string;
  }): Promise<{ unblocked: Turno[] }> {
    const turnos = input.turnos && input.turnos.length > 0 ? input.turnos : [...VALID_TURNOS];
    const db = getDb();
    const log = getLogger();
    for (const turno of turnos) {
      await db
        .update(rosterCapacityOverrides)
        .set({
          blocked: false,
          blockReason: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(rosterCapacityOverrides.sedeId, input.sedeId),
            eq(rosterCapacityOverrides.fecha, input.fecha),
            eq(rosterCapacityOverrides.turno, turno),
          ),
        );
    }
    log.info(
      {
        sedeId: input.sedeId,
        fecha: input.fecha,
        turnos,
        by: input.by,
      },
      "roster_db day unblocked",
    );
    return { unblocked: turnos as Turno[] };
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
        // Insert path: no prior row → default blocked=false. Schema default.
      })
      .onConflictDoUpdate({
        target: [
          rosterCapacityOverrides.sedeId,
          rosterCapacityOverrides.fecha,
          rosterCapacityOverrides.turno,
        ],
        // Update path: capacity + reason only. Do NOT touch blocked flag —
        // operator may be adjusting capacity on a day that is independently
        // blocked (e.g. weather), and changing capacity should not unblock.
        set: {
          capacity: input.capacity,
          reason: input.reason ?? null,
          updatedAt: new Date(),
        },
      });
  }

  /**
   * Insert a confirmed booking directly, bypassing the OCR-validation flow.
   * Used to SEED existing future bookings before the AI starts selling
   * (Miguel's go-live recommendation 2026-06-05). Race-safe — same
   * SERIALIZABLE-tx + capacity-check logic as confirmBooking. The only
   * difference vs confirmBooking is that this entry point doesn't require
   * a conversation_id; the booking will be attributed to whatever `notes`
   * field the caller supplies.
   *
   * Returns the same shape as confirmBooking.
   */
  async seedBooking(input: {
    sedeId: string;
    fecha: string;
    turno: Turno;
    programa: string;
    pax: number;
    notes?: string | undefined;
    contactId?: string | undefined;
  }): Promise<ConfirmBookingResult> {
    return this.confirmBooking({
      sedeId: input.sedeId,
      fecha: input.fecha,
      turno: input.turno,
      programa: input.programa,
      pax: input.pax,
      notes: input.notes ?? "seeded",
      contactId: input.contactId,
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

  /**
   * Slice 3a (2026-06-05): DB-backed availability fetch shaped EXACTLY like
   * the Apps Script's `AvailabilityResponse`. Lets us swap the read source
   * in `consultar_disponibilidad` without rewriting the rest of the handler
   * (which parses turno_manana/turno_tarde/turno_nocturno, applies
   * bookableSlots time-cutoff logic, etc).
   *
   * Why this exists: Miguel's 2026-06-05 feedback identified that the AI
   * kept saying "necesito verificar con el equipo" because Apps Script
   * timeouts / cold-starts produced `null`/`ok:false` responses too often,
   * triggering the fallback prompt rule. The DB has no cold-start and no
   * external dependency — it always returns a clean answer.
   *
   * Mapping from DB rows to Apps Script shape:
   *   • `capacity` → `capacidad`
   *   • `reserved` → `reservados` (implicitly, via `espacios = capacity - reserved`)
   *   • `available > 0` → `disponible: true`
   *   • `blocked: true` → `disponible: false` + `espacios: 0`
   *   • `full: true (reserved >= capacity)` → `disponible: false` + `espacios: 0`
   *
   * Nocturno: the AI tool's getRequiredSlots only emits AM/PM (no Nocturno
   * required by any program today). We still surface turno_nocturno in the
   * response because the prompt-builder dynamic block uses the 7-day
   * preview to give the AI context. Nocturno comes through with the same
   * capacity/reserved as AM/PM.
   */
  async fetchAvailability(
    sedeId: string,
    opts: {
      date: string;
      days: number;
    },
  ): Promise<import("@dpm/shared").AvailabilityResponse> {
    const detalle: import("@dpm/shared").AvailabilityDay[] = [];
    let firstAvailableDate: string | null = null;

    for (let i = 0; i < Math.max(1, opts.days); i++) {
      const fecha = addDays(opts.date, i);
      const slots = await this.getAvailability(sedeId, fecha);
      const am = slots.find((s) => s.turno === "AM");
      const pm = slots.find((s) => s.turno === "PM");
      const noc = slots.find((s) => s.turno === "Nocturno");
      const dayAvailable =
        (am?.available ?? 0) > 0 ||
        (pm?.available ?? 0) > 0 ||
        (noc?.available ?? 0) > 0;
      if (dayAvailable && !firstAvailableDate) firstAvailableDate = fecha;

      detalle.push({
        fecha,
        disponible: dayAvailable,
        turno_manana: am
          ? {
              disponible: am.available > 0,
              espacios: am.available,
              capacidad: am.capacity,
            }
          : { disponible: false, espacios: 0, capacidad: 0 },
        turno_tarde: pm
          ? {
              disponible: pm.available > 0,
              espacios: pm.available,
              capacidad: pm.capacity,
            }
          : { disponible: false, espacios: 0, capacidad: 0 },
        ...(noc
          ? {
              turno_nocturno: {
                disponible: noc.available > 0,
                espacios: noc.available,
                capacidad: noc.capacity,
              },
            }
          : {}),
      });
    }

    const horaActualWita = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());

    return {
      hora_actual_wita: horaActualWita,
      fecha_consultada: opts.date,
      disponible: firstAvailableDate !== null,
      primer_dia_disponible: firstAvailableDate ?? opts.date,
      resumen: firstAvailableDate
        ? `Disponible desde ${firstAvailableDate}`
        : "Sin disponibilidad en la ventana consultada",
      detalle,
      offset_dias: firstAvailableDate
        ? Math.max(0, daysBetween(opts.date, firstAvailableDate))
        : 0,
    };
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
