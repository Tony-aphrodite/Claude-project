import { describe, expect, it } from "vitest";

import {
  addDays,
  computeTurno,
  getRequiredSlots,
  isClosureDay,
  maxDayOffset,
} from "../src/services/program-schedule.js";

describe("getRequiredSlots (Miguel rule 2026-06-07: Confinadas slot added)", () => {
  it("returns Day-0 Confinadas + Day-0 PM for TryScuba / ScubaDiver / Refresh", () => {
    // Pool morning is now an explicit Confinadas slot in the roster
    // (before 2026-06-07 it was invisible — Miguel demonstrated the
    // overbooking risk).
    for (const p of ["TryScuba", "ScubaDiver", "Refresh"] as const) {
      const slots = getRequiredSlots(p);
      expect(slots).toEqual([
        { dayOffset: 0, slot: "Confinadas" },
        { dayOffset: 0, slot: "PM" },
      ]);
    }
  });

  it("returns OW pattern: Day-0 Confinadas + Day-1 PM + Day-2 AM", () => {
    const slots = getRequiredSlots("OW");
    expect(slots).toEqual([
      { dayOffset: 0, slot: "Confinadas" },
      { dayOffset: 1, slot: "PM" },
      { dayOffset: 2, slot: "AM" },
    ]);
  });

  it("returns AOW pattern: PM + Nocturno day 1 + AM/PM day 2 (Miguel 2026-06-10: night dive on day 1 needs the Noc boat seat)", () => {
    const slots = getRequiredSlots("AOW");
    expect(slots).toEqual([
      { dayOffset: 0, slot: "PM" },
      { dayOffset: 0, slot: "Nocturno" },
      { dayOffset: 1, slot: "AM" },
      { dayOffset: 1, slot: "PM" },
    ]);
  });

  it("RefreshAdv = Confinadas + AOW including the night-dive Noc seat (mirrors AOW Day 1)", () => {
    expect(getRequiredSlots("RefreshAdv")).toEqual([
      { dayOffset: 0, slot: "Confinadas" },
      { dayOffset: 0, slot: "PM" },
      { dayOffset: 0, slot: "Nocturno" },
      { dayOffset: 1, slot: "AM" },
      { dayOffset: 1, slot: "PM" },
    ]);
  });

  it("returns null for FunDive without fundive_slot (caller must provide)", () => {
    expect(getRequiredSlots("FunDive")).toBe(null);
    expect(getRequiredSlots("DeepAdvFD")).toBe(null);
  });

  it("uses fundive_slot when supplied for FunDive / DeepAdvFD", () => {
    expect(getRequiredSlots("FunDive", "AM")).toEqual([{ dayOffset: 0, slot: "AM" }]);
    expect(getRequiredSlots("DeepAdvFD", "PM")).toEqual([{ dayOffset: 0, slot: "PM" }]);
  });
});

describe("maxDayOffset", () => {
  it("returns 0 for single-day programs", () => {
    expect(maxDayOffset(getRequiredSlots("TryScuba")!)).toBe(0);
    expect(maxDayOffset(getRequiredSlots("Refresh")!)).toBe(0);
  });

  it("returns 2 for OW (3-day window)", () => {
    expect(maxDayOffset(getRequiredSlots("OW")!)).toBe(2);
  });

  it("returns 1 for AOW (2-day window)", () => {
    expect(maxDayOffset(getRequiredSlots("AOW")!)).toBe(1);
  });
});

describe("addDays", () => {
  it("adds zero days", () => {
    expect(addDays("2026-05-06", 0)).toBe("2026-05-06");
  });

  it("adds positive days, crossing month boundary", () => {
    expect(addDays("2026-05-30", 3)).toBe("2026-06-02");
  });

  it("handles year boundary", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles leap year (2028 is leap)", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
  });

  it("throws on malformed input", () => {
    expect(() => addDays("not-a-date", 1)).toThrow();
  });
});

describe("isClosureDay — DPM_AI_LAUNCH 2026-05-07 §9", () => {
  it("returns true for Dec 25", () => {
    expect(isClosureDay("2026-12-25")).toBe(true);
    expect(isClosureDay("2027-12-25")).toBe(true);
    expect(isClosureDay("2030-12-25")).toBe(true);
  });

  it("returns true for Jan 1", () => {
    expect(isClosureDay("2026-01-01")).toBe(true);
    expect(isClosureDay("2027-01-01")).toBe(true);
  });

  it("returns false for any other day", () => {
    expect(isClosureDay("2026-12-24")).toBe(false);
    expect(isClosureDay("2026-12-26")).toBe(false);
    expect(isClosureDay("2026-01-02")).toBe(false);
    expect(isClosureDay("2026-05-11")).toBe(false);
  });

  it("returns false for Indonesian holidays NOT in the spec (Nyepi, Lebaran)", () => {
    expect(isClosureDay("2026-03-19")).toBe(false); // example Nyepi date
    expect(isClosureDay("2026-04-22")).toBe(false); // example Lebaran-ish date
  });
});

describe("computeTurno — high-level field for Miguel's Sheet Logger", () => {
  it("returns null for null input", () => {
    expect(computeTurno(null)).toBe(null);
  });

  it("returns null for empty array (ReactRight: no boat)", () => {
    expect(computeTurno([])).toBe(null);
  });

  it("returns 'PM' for PM-only programs even when they also have a Confinadas day", () => {
    // TryScuba / ScubaDiver / Refresh = Confinadas + PM. computeTurno
    // surfaces "PM" because it tracks BOAT turnos for the sales
    // logger; Confinadas isn't a boat departure so it's ignored here.
    expect(computeTurno(getRequiredSlots("TryScuba")!)).toBe("PM");
    expect(computeTurno(getRequiredSlots("ScubaDiver")!)).toBe("PM");
    expect(computeTurno(getRequiredSlots("Refresh")!)).toBe("PM");
  });

  it("returns 'AM/PM' for multi-day mixed programs (OW, OW30, AOW)", () => {
    expect(computeTurno(getRequiredSlots("OW")!)).toBe("AM/PM");
    expect(computeTurno(getRequiredSlots("OW30")!)).toBe("AM/PM");
    expect(computeTurno(getRequiredSlots("AOW")!)).toBe("AM/PM");
  });

  it("returns 'AM' or 'PM' for FunDive based on client choice", () => {
    expect(computeTurno(getRequiredSlots("FunDive", "AM")!)).toBe("AM");
    expect(computeTurno(getRequiredSlots("FunDive", "PM")!)).toBe("PM");
  });
});
