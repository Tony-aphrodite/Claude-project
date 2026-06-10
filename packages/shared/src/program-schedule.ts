// Shared per-program roster schedule. Owner spec (Miguel, 2026-05-06;
// revised 2026-06-07 — Confinadas slot).
//
// Lives in @dpm/shared so both the AI server (consultar_disponibilidad,
// solicitar_deposito guard, OCR-validated booking writes) and the panel
// (seed-booking form expansion — Miguel rule 2026-06-07) consume the
// same source of truth. Adding/changing a program's day-by-day
// breakdown means editing ONE file.
//
// Every day of every program consumes ONE slot in the roster — including
// pool / confined-water days which use the "Confinadas" turno. Before
// 2026-06-07 pool days were INVISIBLE (no entry in the required_slots
// array) which left them unmanaged in the roster and risked overbooking
// when two students did pool on the same day with one instructor.
// Miguel rule 2026-06-07: "sin excusas — todo día de todo programa
// tiene un slot explícito en el roster."

import type { AvailabilityProgram, SlotKey, TurnoKey } from "./types.js";

export type RequiredSlot = {
  /** 0 = start_date, 1 = next day, … */
  dayOffset: number;
  /**
   * Roster bucket the day consumes. "Confinadas" = pool/confined-water
   * (instructor capacity, no boat). "AM"/"PM"/"Nocturno" = boat
   * departures.
   */
  slot: TurnoKey;
};

const TRY_SCUBA: readonly RequiredSlot[] = [
  // Day 1 morning: pool training (Confinadas) → 12:30 PM 2 dives
  { dayOffset: 0, slot: "Confinadas" },
  { dayOffset: 0, slot: "PM" },
];
const SCUBA_DIVER: readonly RequiredSlot[] = [
  // Day 1 morning: pool training (Confinadas) → 12:30 PM 2 dives
  { dayOffset: 0, slot: "Confinadas" },
  { dayOffset: 0, slot: "PM" },
];
const REFRESH: readonly RequiredSlot[] = [
  // Pool 9 AM (Confinadas) → 12:30 PM 2 dives
  { dayOffset: 0, slot: "Confinadas" },
  { dayOffset: 0, slot: "PM" },
];
const OW: readonly RequiredSlot[] = [
  // Day 1: 1:30 PM theory+pool — Confinadas slot
  { dayOffset: 0, slot: "Confinadas" },
  // Day 2: 12:30 PM 2 dives
  { dayOffset: 1, slot: "PM" },
  // Day 3: 7:15 AM 2 dives
  { dayOffset: 2, slot: "AM" },
];
const OW30: readonly RequiredSlot[] = [
  // Day 1: 1:30 PM theory+pool — Confinadas slot
  { dayOffset: 0, slot: "Confinadas" },
  // Day 2: 12:30 PM 2 dives
  { dayOffset: 1, slot: "PM" },
  // Day 3: 7:15 AM 2 dives + 12:30 PM 2 extra dives (Deep + Fun)
  { dayOffset: 2, slot: "AM" },
  { dayOffset: 2, slot: "PM" },
];
const AOW: readonly RequiredSlot[] = [
  // Day 1, 12:15 PM block — 2 day dives on the PM boat (Navegación +
  // Flotabilidad).
  { dayOffset: 0, slot: "PM" },
  // Day 1, 6–8 PM block — 1 night dive on the night boat (Aventura
  // Nocturna). Miguel rule 2026-06-10: the night boat is a SEPARATE
  // resource from the day boat. Before this line existed, a full Noc
  // didn't block an AOW start because consultar_disponibilidad only
  // looked at PM — the AI even narrated the night dive but the
  // availability engine never checked it. Schedule gap, not reasoning
  // gap.
  { dayOffset: 0, slot: "Nocturno" },
  // Day 2: 7:30 AM 2 dives + 12:30 PM 1 dive
  { dayOffset: 1, slot: "AM" },
  { dayOffset: 1, slot: "PM" },
];
const REFRESH_ADV: readonly RequiredSlot[] = [
  // Day 1, 9 AM block — Refresh pool (Confinadas).
  { dayOffset: 0, slot: "Confinadas" },
  // Day 1, 12:15 PM block — 2 AOW dives on the PM boat.
  { dayOffset: 0, slot: "PM" },
  // Day 1, 6–8 PM block — 1 night dive on the night boat (Aventura
  // Nocturna). Mirrors the AOW Day-1 Noc seat added 2026-06-10; without
  // it RefreshAdv inherited the same overbooking hole on the night dive.
  { dayOffset: 0, slot: "Nocturno" },
  // Day 2: same as AOW Day 2
  { dayOffset: 1, slot: "AM" },
  { dayOffset: 1, slot: "PM" },
];

/**
 * Resolve which (dayOffset, slot) pairs need to clear capacity for a
 * given program. FunDive / DeepAdvFD are client-choice — the caller
 * must supply `fundiveSlot`. Returns null when the program isn't
 * scheduled (caller surfaces `program_not_scheduled` and routes to
 * human, or in the panel rejects the seed with a clear message).
 */
export function getRequiredSlots(
  programa: AvailabilityProgram | string,
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
      // Theory-only — no roster reservation needed.
      return [];
    case "DeepSpecialty":
    case "RescueDiver":
    case "NitroxSpecialty":
      // Cronograma derives to human (see DPM_AI_LAUNCH §1.1). Returning
      // null tells callers to escalate rather than fabricate a schedule.
      return null;
    default:
      return null;
  }
}

/** Span of days the schedule needs to cover. */
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
 * Owner spec DPM_AI_LAUNCH 2026-05-07 §9. Gili Trawangan closes Dec 25
 * + Jan 1. AI must reject reservations that START on a closure day.
 */
const CLOSURE_MMDD = new Set(["12-25", "01-01"]);

export function isClosureDay(yyyymmdd: string): boolean {
  const mmdd = yyyymmdd.length >= 10 ? yyyymmdd.slice(5, 10) : "";
  return CLOSURE_MMDD.has(mmdd);
}

/**
 * High-level "turno" hint string for Miguel's contact custom field
 * `turno` (Text). One value per program — used by the sales sheet
 * logger, not as scheduling input.
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
