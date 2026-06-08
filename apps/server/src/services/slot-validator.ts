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
 * Originally 30 days but reduced to 14 (Tony perf feedback 2026-06-07:
 * "tardó 3 minutos en contestar"). A 30-day window made each
 * consultar_disponibilidad call fetch 30+ days of roster from Apps
 * Script which was the bottleneck. 14 days is still long enough to
 * find viable alternatives in most cases (Phi Phi rarely fills up
 * more than 1-2 days a week in a row); if all 14 days are full the
 * AI escalates to human which is the safer fallback anyway.
 * Returned list is capped by `limit` (default 5) so the AI's outbound
 * message stays readable.
 */
export const ALT_SCAN_DAYS_FORWARD = 14;
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
    // CRITICAL bug fix 2026-06-07 (Miguel test "no lee confinadas"):
    // previous code did `req.slot === "AM" ? turno_manana : turno_tarde`
    // which routed BOTH "Confinadas" and "Nocturno" to turno_tarde (PM)
    // — meaning Confinadas slot checks were silently looking at PM boat
    // capacity. When PM was full, AI would say "Confinadas no hay lugar"
    // which was a totally bogus check. Now we map each turno to its
    // correct AvailabilityDay field.
    //
    // Confinadas + Nocturno are optional in AvailabilityDay (Apps Script
    // doesn't return them, only the DB-backed roster does). When absent,
    // Miguel's policy is: ALWAYS AVAILABLE (instructor / night-boat
    // scheduling is managed internally by the office, AI doesn't need
    // to verify it). Treat as available with "high" espacios so the
    // check passes.
    let slotData: typeof dayDetail.turno_manana | undefined;
    // Track which actual turno was picked (matters for the legacy
    // "Confinadas" → AM/PM choice path below).
    let pickedSlot: typeof req.slot = req.slot;
    if (req.slot === "AM") slotData = dayDetail.turno_manana;
    else if (req.slot === "PM") slotData = dayDetail.turno_tarde;
    else if (req.slot === "Nocturno") slotData = dayDetail.turno_nocturno;
    else if (req.slot === "ConfinadasAM") slotData = dayDetail.turno_confinadas_am;
    else if (req.slot === "ConfinadasPM") slotData = dayDetail.turno_confinadas_pm;
    else if (req.slot === "Confinadas") {
      // Pool requirement (Miguel 2026-06-07 PM split): pick whichever
      // session has space. Prefer AM (the natural morning-pool-then-
      // afternoon-rest schedule); fall back to PM if AM is full. This
      // is the "any of" semantic — both sessions count as a valid
      // Day-1 for OW.
      const am = dayDetail.turno_confinadas_am;
      const pm = dayDetail.turno_confinadas_pm;
      const amHasSpace = am && am.disponible && (am.espacios ?? 0) > 0;
      const pmHasSpace = pm && pm.disponible && (pm.espacios ?? 0) > 0;
      if (amHasSpace) {
        slotData = am;
        pickedSlot = "ConfinadasAM";
      } else if (pmHasSpace) {
        slotData = pm;
        pickedSlot = "ConfinadasPM";
      } else if (am || pm) {
        // Both populated but both full — report failure against AM
        // (canonical session), keeps the error message stable.
        slotData = am ?? pm;
        pickedSlot = am ? "ConfinadasAM" : "ConfinadasPM";
      } else {
        // Neither field populated — fall through to legacy single
        // Confinadas slot (some sedes still on pre-split data).
        slotData = dayDetail.turno_confinadas;
        pickedSlot = "Confinadas";
      }
    }
    if (!slotData) {
      // Miguel rule: when the roster source doesn't expose this turno
      // (Apps Script doesn't have Confinadas/Nocturno), trust that
      // capacity exists. Office manages internally. Surface as
      // available so the program-day check passes.
      slots.push({ date, slot: pickedSlot, available: true, espacios: 99 });
      continue;
    }
    const espacios = slotData.espacios ?? 0;
    const bookable = bookableSlots(input.horaActualWita, input.todayWitaStr, date);
    // bookable-slots uses "AM"/"PM"/"Nocturno" only — pool slots are
    // never gated by hora-actual-wita (the office runs the pool when
    // it wants). Treat Confinadas* as always bookable from a
    // time-of-day perspective.
    const bookableSlotKey: typeof req.slot =
      pickedSlot === "ConfinadasAM" || pickedSlot === "Confinadas"
        ? "AM"
        : pickedSlot === "ConfinadasPM"
          ? "PM"
          : pickedSlot;
    if (
      pickedSlot !== "ConfinadasAM" &&
      pickedSlot !== "ConfinadasPM" &&
      pickedSlot !== "Confinadas" &&
      !bookable.has(bookableSlotKey)
    ) {
      slots.push({ date, slot: pickedSlot, available: false, espacios, reason: "past_today" });
      allAvailable = false;
      continue;
    }
    if (!slotData.disponible || espacios <= 0) {
      slots.push({ date, slot: pickedSlot, available: false, espacios, reason: "full" });
      allAvailable = false;
      continue;
    }
    slots.push({ date, slot: pickedSlot, available: true, espacios });
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
