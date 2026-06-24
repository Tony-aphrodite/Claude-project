// ============================================================================
// Programa → Activity footprint mapping
//
// Spec: reference/roster-engine-spec-2026-06-24.md §3 (Activity dictionary)
//       + §6.1 (multi-day simulation)
// Arch: docs/roster-engine-architecture.md §5 (sale-time simulation)
//
// The existing `getRequiredSlots(programa)` in program-schedule.ts answers
// "which (dayOffset, slot) does this program occupy?" with slot values
// 'Confinadas' / 'AM' / 'PM' / 'Nocturno'. The new roster engine needs
// the same info plus an Activity code per slot and the new Slot
// vocabulary (POOL / AM / PM / NIGHT).
//
// This module bridges the two. Given a program + starting date + diver
// certification level (+ optional fundive slot for FunDive-class
// programs), it emits the array of (fecha, slot, activity,
// activityDetail) the engine will simulate against.
// ============================================================================

import type { Activity, ActivityDetail, NivelCertificacion, Slot } from "./roster-engine.js";
import type { AvailabilityProgram, SlotKey } from "./types.js";
import { addDays, getRequiredSlots } from "./program-schedule.js";

/**
 * Map the legacy Slot enum used by program-schedule.ts to the new
 * roster engine's Slot enum.
 *
 *   Confinadas → POOL
 *   Nocturno   → NIGHT
 *   AM / PM    → identical
 */
function legacySlotToEngineSlot(legacy: "AM" | "PM" | "Confinadas" | "Nocturno"): Slot {
  switch (legacy) {
    case "Confinadas":
      return "POOL";
    case "Nocturno":
      return "NIGHT";
    case "AM":
      return "AM";
    case "PM":
      return "PM";
  }
}

export interface FootprintEntry {
  fecha: string;
  slot: Slot;
  activity: Activity;
  activityDetail?: ActivityDetail;
}

/**
 * Activity-code resolution for each (program, dayOffset, slot) tuple.
 * Pure data + a tiny dispatcher.
 *
 * The rule for each program follows spec §3:
 *   - TryScuba   → BD_CONFINADA on pool day, BD_BARCO on boat day
 *   - ScubaDiver → OW1 on pool day, OW2 on boat day (same as OW1+OW2)
 *   - Refresh    → REF_FASE1 on pool day, REF_FASE2 on boat day
 *   - OW         → OW1 (pool) → OW2 (PM 12m) → OW3 (AM 18m)
 *   - OW30       → OW1 → OW2 → OW3 + extra FD day-2 PM
 *   - AOW        → AA (PM) + ADV-night (NIGHT) on day 0, AA2 (AM + PM) on day 1
 *   - RefreshAdv → REF_FASE1 (POOL) + AA (PM) + ADV-night (NIGHT) day 0, AA2 day 1
 *   - FunDive    → FD on the chosen slot
 *   - DeepAdvFD  → FD + ADV-deep package (one slot)
 *   - Specialties (DeepSpecialty / NitroxSpecialty etc.) → SP (escalates if unscheduled)
 *
 * Returns `null` when the program isn't roster-scheduled (escalate to
 * human, same semantics as the underlying `getRequiredSlots`).
 */
export function programaToActivityFootprint(input: {
  programa: AvailabilityProgram | string;
  startDate: string;
  nivel: NivelCertificacion;
  fundiveSlot?: SlotKey;
  /**
   * Optional subtype for SP / ADV / DeepAdvFD programs — passes through
   * to activityDetail so dedicated specialty groups stay separate.
   */
  detail?: ActivityDetail;
}): FootprintEntry[] | null {
  const { programa, startDate, fundiveSlot, detail } = input;
  const required = getRequiredSlots(programa, fundiveSlot);
  if (required === null) return null;
  if (required.length === 0) return [];

  return required.map(({ dayOffset, slot }) => {
    const fecha = addDays(startDate, dayOffset);
    const engineSlot = legacySlotToEngineSlot(slot as "AM" | "PM" | "Confinadas" | "Nocturno");
    const { activity, activityDetail } = resolveActivity(programa, dayOffset, slot, detail);
    return {
      fecha,
      slot: engineSlot,
      activity,
      ...(activityDetail !== undefined ? { activityDetail } : {}),
    };
  });
}

/**
 * Pure dispatch — given (program, dayOffset, slot), return the Activity
 * code (+ optional detail) for that day-slot pair.
 *
 * The function reads as a long switch, but each clause maps directly
 * to the day-by-day breakdown in spec §3. Easy to audit.
 */
function resolveActivity(
  programa: AvailabilityProgram | string,
  dayOffset: number,
  slot: "AM" | "PM" | "Confinadas" | "Nocturno" | string,
  detail: ActivityDetail | undefined,
): { activity: Activity; activityDetail?: ActivityDetail } {
  switch (programa) {
    case "TryScuba":
      return slot === "Confinadas"
        ? { activity: "BD_CONFINADA" }
        : { activity: "BD_BARCO" };

    case "ScubaDiver":
      // Day 1 pool day + boat day. Spec treats it as OW1/OW2 since the
      // skills + grouping are identical — the diver just doesn't earn
      // OW3 (full OW). Engine semantics: same grouping as OW1/OW2.
      return slot === "Confinadas"
        ? { activity: "OW1" }
        : { activity: "OW2" };

    case "Refresh":
      return slot === "Confinadas"
        ? { activity: "REF_FASE1" }
        : { activity: "REF_FASE2" };

    case "OW":
      // dayOffset 0 = pool (OW1), 1 = PM 12m (OW2), 2 = AM 18m (OW3)
      if (dayOffset === 0) return { activity: "OW1" };
      if (dayOffset === 1) return { activity: "OW2" };
      return { activity: "OW3" };

    case "OW30":
      // dayOffset 0 = pool (OW1), 1 = PM 12m (OW2), 2 AM+PM = OW3 + extra
      // FD-style adventure pack. Treat the day-2 PM as OW3 (still part
      // of the cert), since the grouping fits with other OW3 students.
      if (dayOffset === 0) return { activity: "OW1" };
      if (dayOffset === 1) return { activity: "OW2" };
      return { activity: "OW3" };

    case "AOW":
      // Day 0 PM = AA (2 dives), Day 0 NIGHT = ADV-night
      // Day 1 AM/PM = AA2 (3 dives total)
      if (dayOffset === 0 && slot === "PM") return { activity: "AA" };
      if (dayOffset === 0 && slot === "Nocturno") {
        return { activity: "ADV", activityDetail: "night" };
      }
      return { activity: "AA2" };

    case "RefreshAdv":
      if (dayOffset === 0 && slot === "Confinadas") return { activity: "REF_FASE1" };
      if (dayOffset === 0 && slot === "PM") return { activity: "AA" };
      if (dayOffset === 0 && slot === "Nocturno") {
        return { activity: "ADV", activityDetail: "night" };
      }
      return { activity: "AA2" };

    case "FunDive":
      return { activity: "FD" };

    case "DeepAdvFD":
      // Deep Adventure package — 2-dive bundle (deep + fun). Modelled as
      // FD for grouping (the diver IS a fun diver during this), with
      // ADV-deep as the subtype if a caller cares.
      return detail
        ? { activity: "FD", activityDetail: detail }
        : { activity: "FD", activityDetail: "deep" };

    // Specialties — engine treats them as SP with subtype.
    case "DeepSpecialty":
      return { activity: "SP", activityDetail: detail ?? "deep" };
    case "NitroxSpecialty":
      return { activity: "SP", activityDetail: detail ?? "nitrox" };
    case "RescueDiver":
      return { activity: "RES" };

    default:
      // Should not reach here when getRequiredSlots returned a non-null
      // schedule — but keep a safe default so the engine doesn't crash.
      return { activity: "FD" };
  }
}
