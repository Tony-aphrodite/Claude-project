// ============================================================================
// Per-program boat schedule. Owner spec (Miguel, 2026-05-06):
//
// Not every day of a program consumes boat capacity — some days are pool
// only. The AI must check the boat roster ONLY for the actual diving days,
// otherwise we get false positives ("availability confirmed" on a day that
// doesn't even use the boat).
//
// The table below mirrors `Regla crítica — días que ocupan barco por
// programa` from the system prompt v1. dayOffset is relative to the
// client-supplied start_date: 0 = start_date, 1 = next day, …
//
// Programs Miguel did NOT define here (RescueDiver, DMT, multi-week
// instructor courses, etc.) return null and the tool degrades to a
// "program_not_scheduled" verdict so the AI routes to a human.
// ============================================================================

import type { AvailabilityProgram, SlotKey } from "@dpm/shared";

export type RequiredSlot = {
  /** 0 = start_date, 1 = next day, … */
  dayOffset: number;
  slot: SlotKey;
};

// Owner spec DPM_AI_LAUNCH §1.1 (2026-05-07).
//
// Day-by-day boat-needing slots per program. dayOffset 0 = start_date.
// Programs that start with theory + pool DON'T consume boat capacity on
// day 1 — those days are intentionally absent from the array. The AI uses
// this fact to offer "start theory+pool today, dives tomorrow" when the
// requested same-day boat has already departed.
const TRY_SCUBA: readonly RequiredSlot[] = [
  // Pool morning (no boat) → 12:30 PM 2 dives
  { dayOffset: 0, slot: "PM" },
];
const SCUBA_DIVER: readonly RequiredSlot[] = [
  // Pool morning (no boat) → 12:30 PM 2 dives
  { dayOffset: 0, slot: "PM" },
];
const REFRESH: readonly RequiredSlot[] = [
  // Pool 9 AM (no boat) → 12:30 PM 2 dives
  { dayOffset: 0, slot: "PM" },
];
const OW: readonly RequiredSlot[] = [
  // Day 1: 1:30 PM theory+pool (no boat)
  // Day 2: 12:30 PM 2 dives
  { dayOffset: 1, slot: "PM" },
  // Day 3: 7:15 AM 2 dives
  { dayOffset: 2, slot: "AM" },
];
const OW30: readonly RequiredSlot[] = [
  // Day 1: 1:30 PM theory+pool (no boat)
  // Day 2: 12:30 PM 2 dives
  { dayOffset: 1, slot: "PM" },
  // Day 3: 7:15 AM 2 dives + 12:30 PM 2 extra dives (Deep + Fun)
  { dayOffset: 2, slot: "AM" },
  { dayOffset: 2, slot: "PM" },
];
const AOW: readonly RequiredSlot[] = [
  // Day 1: 12:15 PM 2 dives (Navegación + Flotabilidad)
  { dayOffset: 0, slot: "PM" },
  // Day 2: 7:30 AM 2 dives + 12:30 PM 1 dive
  { dayOffset: 1, slot: "AM" },
  { dayOffset: 1, slot: "PM" },
];
const REFRESH_ADV: readonly RequiredSlot[] = [
  // Day 1: 9 AM Refresh pool (no boat) + 12:15 PM 2 AOW dives
  { dayOffset: 0, slot: "PM" },
  // Day 2: same as AOW Day 2
  { dayOffset: 1, slot: "AM" },
  { dayOffset: 1, slot: "PM" },
];

/**
 * Resolve which (dayOffset, slot) pairs need to clear the boat-capacity
 * check for a given program. FunDive / DeepAdvFD are client-choice — the
 * caller must supply `fundiveSlot`. Returns null when the program isn't
 * scheduled (AI degrades).
 */
export function getRequiredSlots(
  programa: AvailabilityProgram,
  fundiveSlot?: SlotKey,
): readonly RequiredSlot[] | null {
  switch (programa) {
    case "TryScuba":
      return TRY_SCUBA;
    case "ScubaDiver":
      return SCUBA_DIVER;
    case "Refresh":
      return REFRESH;
    case "OW":
      return OW;
    case "OW30":
      return OW30;
    case "AOW":
      return AOW;
    case "RefreshAdv":
      return REFRESH_ADV;
    case "FunDive":
    case "DeepAdvFD":
      if (!fundiveSlot) return null;
      return [{ dayOffset: 0, slot: fundiveSlot }];
    case "ReactRight":
      // Theory-only emergency response course — no boat required at all.
      // Empty array signals "schedule-able any day, no roster check".
      return [];
    case "DeepSpecialty":
    case "RescueDiver":
    case "NitroxSpecialty":
      // Per DPM_AI_LAUNCH §1.1: cronograma derives to human. Returning null
      // surfaces `program_not_scheduled` to the AI which then routes to the
      // GT team rather than fabricating a schedule.
      return null;
    default:
      return null;
  }
}

/** Span of days the schedule needs to cover, used for the Apps Script call. */
export function maxDayOffset(slots: readonly RequiredSlot[]): number {
  return slots.reduce((m, s) => (s.dayOffset > m ? s.dayOffset : m), 0);
}

/** Add `n` days to a YYYY-MM-DD string in UTC. */
export function addDays(yyyymmdd: string, n: number): string {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`addDays: invalid date ${yyyymmdd}`);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + n);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Owner spec DPM_AI_LAUNCH 2026-05-07 reply §9. Gili Trawangan only
 * closes on Dec 25 + Jan 1. Other Indonesian holidays (Nyepi, Lebaran)
 * are NOT closure days. AI must reject reservations that START on a
 * closure day. Courses already in progress that hit a closure day get
 * paused and resume the next day — that case is handled at the
 * conversation level by the operator, not by the schedule.
 */
const CLOSURE_MMDD = new Set(["12-25", "01-01"]);

export function isClosureDay(yyyymmdd: string): boolean {
  // Match on MM-DD to be year-agnostic.
  const mmdd = yyyymmdd.length >= 10 ? yyyymmdd.slice(5, 10) : "";
  return CLOSURE_MMDD.has(mmdd);
}

/**
 * Resolve a high-level "turno" string for Miguel's contact field
 * `turno` (Text). One value per program — used as a hint for the
 * sales sheet logger, not as scheduling input.
 *
 *   AM-only programs: programs whose required slots are all AM
 *   PM-only programs: programs whose required slots are all PM
 *   AM/PM:            mixed (multi-day with both turnos)
 *   null:             empty (no boat needed) or unknown
 */
export function computeTurno(
  required: readonly RequiredSlot[] | null,
): string | null {
  if (!required || required.length === 0) return null;
  const hasAm = required.some((s) => s.slot === "AM");
  const hasPm = required.some((s) => s.slot === "PM");
  if (hasAm && hasPm) return "AM/PM";
  if (hasAm) return "AM";
  if (hasPm) return "PM";
  return null;
}
