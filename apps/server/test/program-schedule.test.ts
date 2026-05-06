import { describe, expect, it } from "vitest";

import {
  addDays,
  getRequiredSlots,
  maxDayOffset,
} from "../src/services/program-schedule.js";

describe("getRequiredSlots", () => {
  it("returns single PM slot for TryScuba / ScubaDiver / Refresh", () => {
    for (const p of ["TryScuba", "ScubaDiver", "Refresh"] as const) {
      const slots = getRequiredSlots(p);
      expect(slots).toEqual([{ dayOffset: 0, slot: "PM" }]);
    }
  });

  it("returns OW pattern: PM day 2 + AM day 3", () => {
    const slots = getRequiredSlots("OW");
    expect(slots).toEqual([
      { dayOffset: 1, slot: "PM" },
      { dayOffset: 2, slot: "AM" },
    ]);
  });

  it("returns AOW pattern: PM day 1 + AM/PM day 2", () => {
    const slots = getRequiredSlots("AOW");
    expect(slots).toEqual([
      { dayOffset: 0, slot: "PM" },
      { dayOffset: 1, slot: "AM" },
      { dayOffset: 1, slot: "PM" },
    ]);
  });

  it("RefreshAdv mirrors AOW", () => {
    expect(getRequiredSlots("RefreshAdv")).toEqual(getRequiredSlots("AOW"));
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
