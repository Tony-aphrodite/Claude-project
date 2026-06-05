// Shared slot-validation logic used by:
//   • consultar_disponibilidad — to verify the requested start_date AND
//     to scan forward for `verifiedAlternativeStartDates` the AI may
//     propose without further hallucination.
//   • solicitar_deposito — to RE-VALIDATE all required slots immediately
//     before booking, catching the race where another customer takes the
//     last seat between the disponibilidad consult and the deposit confirm.
//
// Single source of truth for "is this (program, start_date) bookable right
// now?" — both handlers call into the same predicate so they cannot drift.
//
// Miguel rule 2026-06-05 (incident: OW June 22 → AI proposed June 23 without
// re-checking → June 24 was BLOCKED and AI confirmed anyway). Belt-and-
// suspenders: prompt + verified-list + booking-time guard. Any one of the
// three failing still leaves the other two as safety nets.

import type {
  AvailabilityDay,
  AvailabilityProgram,
  AvailabilityResponse,
  SlotVerdict,
  SlotKey,
} from "@dpm/shared";

import { bookableSlots } from "./bookable-slots.js";
import {
  addDays,
  getRequiredSlots,
  isClosureDay,
  maxDayOffset,
  type RequiredSlot,
} from "./program-schedule.js";

/**
 * Default scan window when looking for viable alternative start dates.
 * 30 days = roughly "next month" — long enough that the AI rarely runs out
 * of options, short enough to keep the roster fetch payload reasonable.
 * Returned list is capped by `limit` (default 5) so the AI's outbound
 * message stays readable.
 */
export const ALT_SCAN_DAYS_FORWARD = 30;
export const ALT_SCAN_RESULT_LIMIT = 5;

/**
 * Verdict for one (date, slot) pair. Re-uses the public `SlotVerdict`
 * shape so the AI sees the same structure in both handlers.
 */
export type SlotCheck = SlotVerdict;

export type ValidateRequiredSlotsInput = {
  /** Already resolved via `getRequiredSlots(programa, fundive_slot)`. */
  required: readonly RequiredSlot[];
  /** Roster window we already fetched — keys = YYYY-MM-DD. */
  detalleByDate: Map<string, AvailabilityDay>;
  /** Apps Script's wall-clock for "today" cutoff logic. May be undefined. */
  horaActualWita: string | undefined;
  /** Calendar date matching `horaActualWita` in WITA. */
  todayWitaStr: string;
  /** The candidate start_date being checked. */
  startDate: string;
};

export type ValidateRequiredSlotsResult = {
  allAvailable: boolean;
  slots: SlotCheck[];
  failingSlots: SlotCheck[];
};

/**
 * Check every (start_date + offset, slot) pair against the roster window.
 * Pure function — no I/O, no DB calls — so it can be re-used as the inner
 * loop of `findVerifiedAlternativeStartDates`.
 *
 * Mirrors the inline check that lived in `process-message.ts` before this
 * service existed; keep behavior identical (`missing_data` / `past_today` /
 * `full`) so the AI sees the same reason strings on both code paths.
 */
export function validateRequiredSlots(
  input: ValidateRequiredSlotsInput,
): ValidateRequiredSlotsResult {
  const slots: SlotCheck[] = [];
  let allAvailable = true;
  for (const req of input.required) {
    const date = addDays(input.startDate, req.dayOffset);
    const dayDetail = input.detalleByDate.get(date);
    if (!dayDetail) {
      slots.push({ date, slot: req.slot, available: false, espacios: 0, reason: "missing_data" });
      allAvailable = false;
      continue;
    }
    const slotData =
      req.slot === "AM" ? dayDetail.turno_manana : dayDetail.turno_tarde;
    const espacios = slotData.espacios ?? 0;
    const bookable = bookableSlots(input.horaActualWita, input.todayWitaStr, date);
    if (!bookable.has(req.slot)) {
      slots.push({ date, slot: req.slot, available: false, espacios, reason: "past_today" });
      allAvailable = false;
      continue;
    }
    if (!slotData.disponible || espacios <= 0) {
      slots.push({ date, slot: req.slot, available: false, espacios, reason: "full" });
      allAvailable = false;
      continue;
    }
    slots.push({ date, slot: req.slot, available: true, espacios });
  }
  return {
    allAvailable,
    slots,
    failingSlots: slots.filter((s) => !s.available),
  };
}

/**
 * Scan forward from `fromDate + 1` up to `daysForward` candidates and return
 * the first `limit` start dates where every required slot of `programa`
 * clears the same validation as the primary `consultar_disponibilidad`
 * check. Closure days (Dec 25 / Jan 1) are skipped, including when ANY
 * program-day extends into a closure.
 *
 * The AI is instructed via prompt to propose alternatives ONLY from this
 * list. Anything outside is hallucination by definition.
 */
export function findVerifiedAlternativeStartDates(input: {
  programa: AvailabilityProgram;
  fundiveSlot: SlotKey | undefined;
  fromDate: string;
  /** Pre-fetched window large enough to cover up to `daysForward`. */
  detalleByDate: Map<string, AvailabilityDay>;
  horaActualWita: string | undefined;
  todayWitaStr: string;
  daysForward?: number;
  limit?: number;
}): string[] {
  const required = getRequiredSlots(input.programa, input.fundiveSlot);
  // Programs without a schedule (Divemaster / Instructor) cannot have
  // alternatives — the AI must escalate to human anyway.
  if (!required) return [];
  // Programs with no boat requirement (ReactRight) are always bookable —
  // the original consult would have returned available=true and the AI
  // wouldn't reach this path. Defensive: empty list, no alternatives needed.
  if (required.length === 0) return [];

  const daysForward = input.daysForward ?? ALT_SCAN_DAYS_FORWARD;
  const limit = input.limit ?? ALT_SCAN_RESULT_LIMIT;
  const maxOffset = maxDayOffset(required);
  const results: string[] = [];

  for (let i = 1; i <= daysForward && results.length < limit; i++) {
    const candidate = addDays(input.fromDate, i);

    // Skip if the candidate OR any of its program-days hits a closure.
    let touchesClosure = false;
    for (let j = 0; j <= maxOffset; j++) {
      if (isClosureDay(addDays(candidate, j))) {
        touchesClosure = true;
        break;
      }
    }
    if (touchesClosure) continue;

    // Re-use the same predicate the primary consult uses.
    const verdict = validateRequiredSlots({
      required,
      detalleByDate: input.detalleByDate,
      horaActualWita: input.horaActualWita,
      todayWitaStr: input.todayWitaStr,
      startDate: candidate,
    });
    if (verdict.allAvailable) results.push(candidate);
  }
  return results;
}

/**
 * Build a `detalleByDate` map from an Apps Script / roster-db response.
 * Tiny helper centralised here so callers don't re-implement the same
 * `new Map(fresh.detalle.map(...))` pattern in three places.
 */
export function buildDetalleMap(
  fresh: AvailabilityResponse,
): Map<string, AvailabilityDay> {
  return new Map(fresh.detalle.map((d) => [d.fecha, d]));
}
