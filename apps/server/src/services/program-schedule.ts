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

const TRY_SCUBA: readonly RequiredSlot[] = [{ dayOffset: 0, slot: "PM" }];
const SCUBA_DIVER: readonly RequiredSlot[] = [{ dayOffset: 0, slot: "PM" }];
const REFRESH: readonly RequiredSlot[] = [{ dayOffset: 0, slot: "PM" }];
const OW: readonly RequiredSlot[] = [
  { dayOffset: 1, slot: "PM" },
  { dayOffset: 2, slot: "AM" },
];
const AOW: readonly RequiredSlot[] = [
  { dayOffset: 0, slot: "PM" },
  { dayOffset: 1, slot: "AM" },
  { dayOffset: 1, slot: "PM" },
];
const REFRESH_ADV: readonly RequiredSlot[] = [
  { dayOffset: 0, slot: "PM" },
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
    case "AOW":
      return AOW;
    case "RefreshAdv":
      return REFRESH_ADV;
    case "FunDive":
    case "DeepAdvFD":
      if (!fundiveSlot) return null;
      return [{ dayOffset: 0, slot: fundiveSlot }];
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
