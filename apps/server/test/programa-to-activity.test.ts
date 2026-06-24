// ============================================================================
// programaToActivityFootprint — unit tests
//
// Validates the bridge between the legacy program-schedule (used by the
// existing roster_bookings flow) and the new Activity-coded footprint
// (consumed by the intelligent roster engine).
// ============================================================================

import { describe, expect, it } from "vitest";

import { programaToActivityFootprint } from "@dpm/shared";

describe("programaToActivityFootprint", () => {
  it("OW expands to OW1 (POOL) → OW2 (PM) → OW3 (AM) across 3 days", () => {
    const footprint = programaToActivityFootprint({
      programa: "OW",
      startDate: "2026-07-15",
      nivel: "BEG",
    });
    expect(footprint).not.toBeNull();
    expect(footprint!).toHaveLength(3);
    expect(footprint![0]).toMatchObject({
      fecha: "2026-07-15",
      slot: "POOL",
      activity: "OW1",
    });
    expect(footprint![1]).toMatchObject({
      fecha: "2026-07-16",
      slot: "PM",
      activity: "OW2",
    });
    expect(footprint![2]).toMatchObject({
      fecha: "2026-07-17",
      slot: "AM",
      activity: "OW3",
    });
  });

  it("TryScuba: pool BD_CONFINADA + boat BD_BARCO on the same day", () => {
    const footprint = programaToActivityFootprint({
      programa: "TryScuba",
      startDate: "2026-07-15",
      nivel: "BEG",
    });
    expect(footprint).not.toBeNull();
    expect(footprint!).toHaveLength(2);
    expect(footprint![0]).toMatchObject({
      slot: "POOL",
      activity: "BD_CONFINADA",
    });
    expect(footprint![1]).toMatchObject({
      slot: "PM",
      activity: "BD_BARCO",
    });
  });

  it("Refresh: pool REF_FASE1 + boat REF_FASE2 same day", () => {
    const footprint = programaToActivityFootprint({
      programa: "Refresh",
      startDate: "2026-07-15",
      nivel: "OW",
    });
    expect(footprint).not.toBeNull();
    expect(footprint!).toHaveLength(2);
    expect(footprint![0]).toMatchObject({
      slot: "POOL",
      activity: "REF_FASE1",
    });
    expect(footprint![1]).toMatchObject({
      slot: "PM",
      activity: "REF_FASE2",
    });
  });

  it("AOW: day 0 = AA (PM) + ADV-night (NIGHT), day 1 = AA2 (AM + PM)", () => {
    const footprint = programaToActivityFootprint({
      programa: "AOW",
      startDate: "2026-07-15",
      nivel: "OW",
    });
    expect(footprint).not.toBeNull();
    expect(footprint!).toHaveLength(4);
    expect(footprint![0]).toMatchObject({
      fecha: "2026-07-15",
      slot: "PM",
      activity: "AA",
    });
    expect(footprint![1]).toMatchObject({
      fecha: "2026-07-15",
      slot: "NIGHT",
      activity: "ADV",
      activityDetail: "night",
    });
    expect(footprint![2]).toMatchObject({
      fecha: "2026-07-16",
      slot: "AM",
      activity: "AA2",
    });
    expect(footprint![3]).toMatchObject({
      fecha: "2026-07-16",
      slot: "PM",
      activity: "AA2",
    });
  });

  it("FunDive AM: single FD entry on the chosen slot", () => {
    const footprint = programaToActivityFootprint({
      programa: "FunDive",
      startDate: "2026-07-15",
      nivel: "OW",
      fundiveSlot: "AM",
    });
    expect(footprint).not.toBeNull();
    expect(footprint!).toHaveLength(1);
    expect(footprint![0]).toMatchObject({
      fecha: "2026-07-15",
      slot: "AM",
      activity: "FD",
    });
  });

  it("FunDive without fundiveSlot → null (caller must provide)", () => {
    const footprint = programaToActivityFootprint({
      programa: "FunDive",
      startDate: "2026-07-15",
      nivel: "OW",
    });
    expect(footprint).toBeNull();
  });

  it("DMT → null (Divemaster is escalated, not roster-scheduled)", () => {
    // DMT isn't in the AVAILABILITY_PROGRAMS list — getRequiredSlots
    // returns null for unrecognised programs.
    const footprint = programaToActivityFootprint({
      programa: "DMT",
      startDate: "2026-07-15",
      nivel: "AA",
    });
    expect(footprint).toBeNull();
  });

  it("ReactRight → empty array (theory-only, no roster footprint)", () => {
    const footprint = programaToActivityFootprint({
      programa: "ReactRight",
      startDate: "2026-07-15",
      nivel: "AA",
    });
    expect(footprint).toEqual([]);
  });

  it("RefreshAdv: day 0 = REF_FASE1 (POOL) + AA (PM) + ADV-night (NIGHT)", () => {
    const footprint = programaToActivityFootprint({
      programa: "RefreshAdv",
      startDate: "2026-07-15",
      nivel: "OW",
    });
    expect(footprint).not.toBeNull();
    expect(footprint!).toHaveLength(5);
    expect(footprint![0]).toMatchObject({
      slot: "POOL",
      activity: "REF_FASE1",
    });
    expect(footprint![1]).toMatchObject({
      slot: "PM",
      activity: "AA",
    });
    expect(footprint![2]).toMatchObject({
      slot: "NIGHT",
      activity: "ADV",
      activityDetail: "night",
    });
  });
});
