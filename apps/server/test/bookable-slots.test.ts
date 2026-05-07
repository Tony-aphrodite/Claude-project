import { describe, expect, it } from "vitest";

import { bookableSlots } from "../src/services/bookable-slots.js";

describe("bookableSlots — same-day cutoffs", () => {
  const TODAY = "2026-05-06";

  it("before 07:15: AM and PM both bookable", () => {
    const set = bookableSlots("06:30", TODAY, TODAY);
    expect(set.has("AM")).toBe(true);
    expect(set.has("PM")).toBe(true);
  });

  it("right at 07:15: AM no longer bookable, PM still is", () => {
    const set = bookableSlots("07:15", TODAY, TODAY);
    expect(set.has("AM")).toBe(false);
    expect(set.has("PM")).toBe(true);
  });

  it("between 07:15 and 12:15: only PM", () => {
    const set = bookableSlots("10:00", TODAY, TODAY);
    expect(set.has("AM")).toBe(false);
    expect(set.has("PM")).toBe(true);
  });

  it("right at 12:15: nothing bookable today (PM boat departs)", () => {
    const set = bookableSlots("12:15", TODAY, TODAY);
    expect(set.size).toBe(0);
  });

  it("at 12:20 (just past PM cutoff): nothing today", () => {
    const set = bookableSlots("12:20", TODAY, TODAY);
    expect(set.size).toBe(0);
  });

  it("between 12:15 and 17:00: nothing today (PM in progress)", () => {
    const set = bookableSlots("14:00", TODAY, TODAY);
    expect(set.size).toBe(0);
  });

  it("after 17:00: nothing today", () => {
    const set = bookableSlots("19:30", TODAY, TODAY);
    expect(set.size).toBe(0);
  });
});

describe("bookableSlots — future and past days", () => {
  const TODAY = "2026-05-06";

  it("future day: AM and PM both bookable regardless of current time", () => {
    const set = bookableSlots("23:50", TODAY, "2026-05-07");
    expect(set.has("AM")).toBe(true);
    expect(set.has("PM")).toBe(true);
  });

  it("far future day: AM and PM both bookable", () => {
    const set = bookableSlots("06:00", TODAY, "2026-08-15");
    expect(set.has("AM")).toBe(true);
    expect(set.has("PM")).toBe(true);
  });

  it("past day: nothing bookable", () => {
    const set = bookableSlots("06:00", TODAY, "2026-05-05");
    expect(set.size).toBe(0);
  });
});

describe("bookableSlots — malformed time", () => {
  const TODAY = "2026-05-06";

  it("falls back to PM-only when hora_actual_wita is unparseable", () => {
    const set = bookableSlots("not-a-time", TODAY, TODAY);
    expect(set.has("AM")).toBe(false);
    expect(set.has("PM")).toBe(true);
  });

  it("rejects out-of-range hours and degrades", () => {
    const set = bookableSlots("25:99", TODAY, TODAY);
    expect(set.has("AM")).toBe(false);
    expect(set.has("PM")).toBe(true);
  });
});

describe("bookableSlots — sede without hora_actual_wita (multi-sede)", () => {
  const TODAY = "2026-05-06";

  it("returns PM-only when null (Nusa Penida / Koh Tao / Koh Phi Phi)", () => {
    const set = bookableSlots(null, TODAY, TODAY);
    expect(set.has("AM")).toBe(false);
    expect(set.has("PM")).toBe(true);
  });

  it("returns PM-only when undefined", () => {
    const set = bookableSlots(undefined, TODAY, TODAY);
    expect(set.has("AM")).toBe(false);
    expect(set.has("PM")).toBe(true);
  });

  it("future days still allow AM and PM even without hora_actual_wita", () => {
    const set = bookableSlots(null, TODAY, "2026-05-10");
    expect(set.has("AM")).toBe(true);
    expect(set.has("PM")).toBe(true);
  });
});
