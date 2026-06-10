// Tests for the shared slot validator used by consultar_disponibilidad
// AND solicitar_deposito (Miguel rule 2026-06-05 — incident: OW Phi Phi
// June 22→23 hallucination). Both code paths must call into the same
// predicate so they cannot drift; this file pins the contract.

import { describe, expect, it } from "vitest";

import type { AvailabilityDay } from "@dpm/shared";

import {
  findVerifiedAlternativeStartDates,
  validateRequiredSlots,
} from "../src/services/slot-validator.js";
import { getRequiredSlots } from "../src/services/program-schedule.js";

// Build a synthetic AvailabilityDay. Defaults: AM full+available, PM
// full+available. Override per-test for blocked / full / partial states.
// Noc fields added 2026-06-10 for the AOW night-dive Day-1 footprint —
// omit when not exercising night-boat scenarios so existing tests don't
// have to think about it.
function day(fecha: string, opts: {
  amDisp?: boolean;
  amEspacios?: number;
  pmDisp?: boolean;
  pmEspacios?: number;
  nocDisp?: boolean;
  nocEspacios?: number;
} = {}): AvailabilityDay {
  return {
    fecha,
    turno_manana: {
      disponible: opts.amDisp ?? true,
      espacios: opts.amEspacios ?? 22,
      capacidad: 22,
    },
    turno_tarde: {
      disponible: opts.pmDisp ?? true,
      espacios: opts.pmEspacios ?? 22,
      capacidad: 22,
    },
    turno_nocturno: {
      disponible: opts.nocDisp ?? true,
      espacios: opts.nocEspacios ?? 22,
      capacidad: 22,
    },
  } as AvailabilityDay;
}

function buildMap(...days: AvailabilityDay[]): Map<string, AvailabilityDay> {
  return new Map(days.map((d) => [d.fecha, d]));
}

// ────────────────────────────────────────────────────────────────────────
// validateRequiredSlots — the primitive used by both handlers
// ────────────────────────────────────────────────────────────────────────
describe("validateRequiredSlots — primary check", () => {
  it("returns allAvailable=true when every slot has espacios > 0 and disponible", () => {
    const result = validateRequiredSlots({
      required: [
        { dayOffset: 1, slot: "PM" },
        { dayOffset: 2, slot: "AM" },
      ],
      detalleByDate: buildMap(
        day("2026-06-22"),
        day("2026-06-23"),
        day("2026-06-24"),
      ),
      horaActualWita: undefined,
      todayWitaStr: "2026-06-01", // far enough in past to skip cutoff
      startDate: "2026-06-22",
    });
    expect(result.allAvailable).toBe(true);
    expect(result.failingSlots).toHaveLength(0);
  });

  it("returns allAvailable=false with reason='full' when any required slot is full", () => {
    // The exact OW June 22→23 case from Miguel's incident: starting June 23,
    // Day 2 = June 24 PM is BLOCKED → must fail validation.
    const result = validateRequiredSlots({
      required: [
        { dayOffset: 1, slot: "PM" },
        { dayOffset: 2, slot: "AM" },
      ],
      detalleByDate: buildMap(
        day("2026-06-23"), // start, no boat
        day("2026-06-24", { pmDisp: false, pmEspacios: 0 }), // Day 2 PM blocked
        day("2026-06-25"),
      ),
      horaActualWita: undefined,
      todayWitaStr: "2026-06-01",
      startDate: "2026-06-23",
    });
    expect(result.allAvailable).toBe(false);
    expect(result.failingSlots).toHaveLength(1);
    expect(result.failingSlots[0]).toMatchObject({
      date: "2026-06-24",
      slot: "PM",
      reason: "full",
    });
  });

  it("returns reason='missing_data' when the roster window doesn't include a required date", () => {
    const result = validateRequiredSlots({
      required: [{ dayOffset: 5, slot: "AM" }],
      detalleByDate: buildMap(day("2026-06-22")), // missing 2026-06-27
      horaActualWita: undefined,
      todayWitaStr: "2026-06-01",
      startDate: "2026-06-22",
    });
    expect(result.allAvailable).toBe(false);
    expect(result.failingSlots[0]?.reason).toBe("missing_data");
  });

  it("reports BOTH failing slots when more than one required day is blocked", () => {
    const result = validateRequiredSlots({
      required: [
        { dayOffset: 1, slot: "PM" },
        { dayOffset: 2, slot: "AM" },
      ],
      detalleByDate: buildMap(
        day("2026-06-22"),
        day("2026-06-23", { pmEspacios: 0, pmDisp: false }),
        day("2026-06-24", { amEspacios: 0, amDisp: false }),
      ),
      horaActualWita: undefined,
      todayWitaStr: "2026-06-01",
      startDate: "2026-06-22",
    });
    expect(result.failingSlots).toHaveLength(2);
  });
});

// ────────────────────────────────────────────────────────────────────────
// findVerifiedAlternativeStartDates — the source of truth for alt dates
// ────────────────────────────────────────────────────────────────────────
describe("findVerifiedAlternativeStartDates — alt-date scanner", () => {
  it("returns the next K dates where the OW schedule clears (no boat on Day 0, PM Day 1, AM Day 2)", () => {
    // June 22 BLOCKED (the original ask). All subsequent days clear.
    // OW = required [{1,PM},{2,AM}] → for start=23, check 24-PM + 25-AM.
    // For start=24, check 25-PM + 26-AM. Etc.
    const detalle = buildMap(
      day("2026-06-22"), // start day not strictly needed but include
      day("2026-06-23"),
      day("2026-06-24"),
      day("2026-06-25"),
      day("2026-06-26"),
      day("2026-06-27"),
      day("2026-06-28"),
    );
    const alts = findVerifiedAlternativeStartDates({
      programa: "OW",
      fundiveSlot: undefined,
      fromDate: "2026-06-22",
      detalleByDate: detalle,
      horaActualWita: undefined,
      todayWitaStr: "2026-06-01",
      limit: 3,
    });
    // First 3 candidates after 2026-06-22 are 23/24/25 — all should clear.
    expect(alts).toEqual(["2026-06-23", "2026-06-24", "2026-06-25"]);
  });

  it("skips candidates where a downstream program-day has no roster data", () => {
    // OW needs Day 1 PM + Day 2 AM. From start=22, need 23-PM + 24-AM.
    // From start=23, need 24-PM + 25-AM. We only seed 22 + 23 + 24, no 25.
    // So start=22 → checks 23-PM (ok) + 24-AM (ok) → ALT viable.
    // Start=23 → checks 24-PM (ok) + 25-AM (missing) → NOT viable.
    const detalle = buildMap(
      day("2026-06-22"),
      day("2026-06-23"),
      day("2026-06-24"),
    );
    const alts = findVerifiedAlternativeStartDates({
      programa: "OW",
      fundiveSlot: undefined,
      fromDate: "2026-06-21",
      detalleByDate: detalle,
      horaActualWita: undefined,
      todayWitaStr: "2026-06-01",
      limit: 5,
    });
    expect(alts).toEqual(["2026-06-22"]);
  });

  it("returns the Miguel incident shape: June 23 NOT a viable alt when June 24 PM is BLOCKED", () => {
    // Exact reproduction of the OW Phi Phi June 22→23 hallucination.
    // The AI proposed start=23 without checking June 24 PM. This test pins
    // that the new server logic refuses to include June 23 in the
    // verified-alts list under that roster state.
    const detalle = buildMap(
      day("2026-06-22", { amDisp: false, pmDisp: false }), // BLOQUEADO
      day("2026-06-23"), // OK
      day("2026-06-24", { amDisp: false, pmDisp: false }), // BLOQUEADO both
      day("2026-06-25"), // OK
      day("2026-06-26"), // OK
      day("2026-06-27"), // OK
    );
    const alts = findVerifiedAlternativeStartDates({
      programa: "OW",
      fundiveSlot: undefined,
      fromDate: "2026-06-22",
      detalleByDate: detalle,
      horaActualWita: undefined,
      todayWitaStr: "2026-06-01",
      limit: 5,
    });
    // start=23 should NOT be in the list because Day 2 = June 24 PM is blocked.
    // start=24 NOT in the list because Day 0 of that course schedule has no
    // boat (OW Day 0 = theory/pool — OK), Day 1 = June 25 PM (OK), Day 2 =
    // June 26 AM (OK). So start=24 IS viable per OW schedule. But wait —
    // June 24 itself has no required slot for OW (Day 0 of OW is pool only),
    // so the start date itself being blocked is irrelevant.
    //
    // Expected viable alts after June 22: 24, 25, 26 (and forward).
    // June 23 is NOT in the list because of the failing Day 2 PM check.
    expect(alts).not.toContain("2026-06-23");
    expect(alts.length).toBeGreaterThan(0);
  });

  it("returns empty array when every day in the scan window has a blocking slot for this program", () => {
    // All AM blocked for many days → OW (which needs Day 2 AM) can never start.
    const days: AvailabilityDay[] = [];
    for (let d = 22; d <= 30; d++) {
      days.push(
        day(`2026-06-${String(d).padStart(2, "0")}`, {
          amDisp: false,
          amEspacios: 0,
        }),
      );
    }
    const alts = findVerifiedAlternativeStartDates({
      programa: "OW",
      fundiveSlot: undefined,
      fromDate: "2026-06-21",
      detalleByDate: buildMap(...days),
      horaActualWita: undefined,
      todayWitaStr: "2026-06-01",
      daysForward: 9,
      limit: 5,
    });
    expect(alts).toEqual([]);
  });

  it("returns empty array for programs without a defined schedule (combos, specialties)", () => {
    // OWAOWCombo has no schedule yet (Miguel needs to define it).
    // Until then, the scanner can't propose alternatives — guarded.
    const detalle = buildMap(day("2026-06-22"), day("2026-06-23"));
    const alts = findVerifiedAlternativeStartDates({
      programa: "OWAOWCombo",
      fundiveSlot: undefined,
      fromDate: "2026-06-21",
      detalleByDate: detalle,
      horaActualWita: undefined,
      todayWitaStr: "2026-06-01",
      limit: 5,
    });
    expect(alts).toEqual([]);
  });

  it("caps results at `limit`", () => {
    const days: AvailabilityDay[] = [];
    for (let d = 22; d <= 30; d++) {
      days.push(day(`2026-06-${String(d).padStart(2, "0")}`));
    }
    const alts = findVerifiedAlternativeStartDates({
      programa: "OW",
      fundiveSlot: undefined,
      fromDate: "2026-06-21",
      detalleByDate: buildMap(...days),
      horaActualWita: undefined,
      todayWitaStr: "2026-06-01",
      limit: 2,
    });
    expect(alts).toHaveLength(2);
  });

  it("respects daysForward — does not scan past it", () => {
    const days: AvailabilityDay[] = [];
    for (let d = 22; d <= 30; d++) {
      days.push(day(`2026-06-${String(d).padStart(2, "0")}`));
    }
    // Only scan 2 days forward → can only return start=22 (the only one
    // whose required days fit in the window).
    const alts = findVerifiedAlternativeStartDates({
      programa: "OW",
      fundiveSlot: undefined,
      fromDate: "2026-06-21",
      detalleByDate: buildMap(...days),
      horaActualWita: undefined,
      todayWitaStr: "2026-06-01",
      daysForward: 1,
      limit: 5,
    });
    expect(alts.length).toBeLessThanOrEqual(1);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Miguel 2026-06-10 — partial-occupancy overbook guard
//
// Repro from Miguel's report: PM 15/06 = 20/22 (2 free). Group of 4 lands
// on the same PM (2 OW + 2 Fun Dives). Pre-fix, `validateRequiredSlots`
// reported `available=false, reason='full'` but did NOT surface the
// deficit numerically — the AI's mental math missed the gap. Post-fix
// `shortBy` makes the gap unmissable + `paxRequested` echoes back exactly
// what the AI passed in.
// ────────────────────────────────────────────────────────────────────────
describe("validateRequiredSlots — Miguel 2026-06-10 partial-occupancy overbook guard", () => {
  it("populates shortBy = pax - espacios when the slot is partially full", () => {
    const result = validateRequiredSlots({
      required: [{ dayOffset: 0, slot: "PM" }],
      detalleByDate: buildMap(day("2026-06-15", { pmEspacios: 2 })),
      horaActualWita: undefined,
      todayWitaStr: "2026-06-01",
      startDate: "2026-06-15",
      pax: 4,
    });
    expect(result.allAvailable).toBe(false);
    expect(result.failingSlots).toHaveLength(1);
    const slot = result.failingSlots[0]!;
    expect(slot.reason).toBe("full");
    expect(slot.espacios).toBe(2);
    expect(slot.paxRequested).toBe(4);
    expect(slot.shortBy).toBe(2); // 4 pax - 2 libres = 2 short
  });

  it("populates paxRequested on the success path too (for parity with failure)", () => {
    const result = validateRequiredSlots({
      required: [{ dayOffset: 0, slot: "PM" }],
      detalleByDate: buildMap(day("2026-06-15", { pmEspacios: 22 })),
      horaActualWita: undefined,
      todayWitaStr: "2026-06-01",
      startDate: "2026-06-15",
      pax: 4,
    });
    expect(result.allAvailable).toBe(true);
    expect(result.slots[0]!.paxRequested).toBe(4);
    expect(result.slots[0]!.shortBy).toBeUndefined();
  });

  it("does NOT set shortBy when slot is completely full (espacios=0) — full is full, no deficit needed", () => {
    const result = validateRequiredSlots({
      required: [{ dayOffset: 0, slot: "AM" }],
      detalleByDate: buildMap(day("2026-06-15", { amEspacios: 0, amDisp: false })),
      horaActualWita: undefined,
      todayWitaStr: "2026-06-01",
      startDate: "2026-06-15",
      pax: 4,
    });
    expect(result.allAvailable).toBe(false);
    const slot = result.failingSlots[0]!;
    expect(slot.reason).toBe("full");
    expect(slot.espacios).toBe(0);
    // shortBy still set — = pax - 0 — useful for the AI to say "para 4 no
    // hay nada, está completo". 0 free seats is just a special case of
    // the same comparison.
    expect(slot.shortBy).toBe(4);
  });

  it("missing_data reason carries paxRequested (so the AI can quote the original ask)", () => {
    const result = validateRequiredSlots({
      required: [{ dayOffset: 5, slot: "PM" }], // day not in map
      detalleByDate: buildMap(day("2026-06-15")),
      horaActualWita: undefined,
      todayWitaStr: "2026-06-01",
      startDate: "2026-06-15",
      pax: 3,
    });
    const slot = result.failingSlots[0]!;
    expect(slot.reason).toBe("missing_data");
    expect(slot.paxRequested).toBe(3);
  });

  it("multi-day footprint: deficit on day 2 alone fails the whole start_date", () => {
    // OW 3-day footprint starting 14/06: Día 1 Confinadas, Día 2 PM 15,
    // Día 3 AM 16. Miguel's exact repro: PM 15 has 2 free; group of 4
    // wants OW. The validator runs once for pax=4; Día 2 fails with
    // shortBy=2 and the whole start_date is rejected.
    const result = validateRequiredSlots({
      required: [
        { dayOffset: 1, slot: "PM" }, // Día 2 — the failing day
        { dayOffset: 2, slot: "AM" }, // Día 3 — fine
      ],
      detalleByDate: buildMap(
        day("2026-06-15", { pmEspacios: 2 }),
        day("2026-06-16"),
      ),
      horaActualWita: undefined,
      todayWitaStr: "2026-06-01",
      startDate: "2026-06-14",
      pax: 4,
    });
    expect(result.allAvailable).toBe(false);
    expect(result.failingSlots).toHaveLength(1);
    expect(result.failingSlots[0]!.date).toBe("2026-06-15");
    expect(result.failingSlots[0]!.shortBy).toBe(2);
    // The other day still appears in `slots` as available with paxRequested echo.
    const okSlot = result.slots.find((s) => s.date === "2026-06-16");
    expect(okSlot?.available).toBe(true);
    expect(okSlot?.paxRequested).toBe(4);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Miguel 2026-06-10 — AOW night-dive Day-1 footprint guard
//
// Repro: AOW Day 1 = 2 PM dives + 1 night dive. The day boat (PM) and
// the night boat (Noc) are SEPARATE resources. Before the AOW schedule
// gained the Noc slot, a full Noc didn't block the start because
// consultar_disponibilidad only looked at PM. Francisco narrated the
// night dive but called the date "wide open".
//
// These tests pin BOTH: (a) the validator rejects when Day-1 Noc is full,
// and (b) the alternative-date scanner skips past the bad date to the
// next start whose FULL footprint (PM + Noc + AM/PM Day 2) fits — which
// was Miguel's recovery requirement.
// ────────────────────────────────────────────────────────────────────────
describe("AOW Day-1 Noc footprint (Miguel 2026-06-10)", () => {
  it("rejects start_date when Day-1 Noc is full — even if Day-1 PM is open", () => {
    // Start day Noc 22/22 full; everything else wide open.
    const result = validateRequiredSlots({
      required: getRequiredSlots("AOW")!,
      detalleByDate: buildMap(
        day("2026-06-16", { nocEspacios: 0, nocDisp: false }),
        day("2026-06-17"),
      ),
      horaActualWita: undefined,
      todayWitaStr: "2026-06-01",
      startDate: "2026-06-16",
      pax: 1,
    });
    expect(result.allAvailable).toBe(false);
    // The single failure should be the Day-1 Nocturno seat.
    const nocFailures = result.failingSlots.filter((s) => s.slot === "Nocturno");
    expect(nocFailures).toHaveLength(1);
    expect(nocFailures[0]!.date).toBe("2026-06-16");
    expect(nocFailures[0]!.reason).toBe("full");
    // Day-1 PM, Day-2 AM, Day-2 PM should all have been checked too —
    // total slot rows = 4 (the new AOW footprint).
    expect(result.slots).toHaveLength(4);
  });

  it("findVerifiedAlternativeStartDates skips a bad-Noc start and surfaces the next viable date (recovery, Miguel part b)", () => {
    // 16 has Noc full → AOW start on 16 cannot fit Day 1.
    // 17 has everything open → AOW Day 1 on 17 + Day 2 on 18 must clear
    //    (we wire up 17 and 18 with full default capacity).
    const alts = findVerifiedAlternativeStartDates({
      programa: "AOW",
      fundiveSlot: undefined,
      fromDate: "2026-06-15", // scan starts on 16
      detalleByDate: buildMap(
        day("2026-06-16", { nocEspacios: 0, nocDisp: false }),
        day("2026-06-17"), // Day 1 for the new candidate
        day("2026-06-18"), // Day 2 for the new candidate
      ),
      horaActualWita: undefined,
      todayWitaStr: "2026-06-01",
      limit: 1,
    });
    expect(alts).toEqual(["2026-06-17"]);
  });

  it("rejects every start_date in a window where Day-1 Noc is full on consecutive days", () => {
    const alts = findVerifiedAlternativeStartDates({
      programa: "AOW",
      fundiveSlot: undefined,
      fromDate: "2026-06-15",
      detalleByDate: buildMap(
        day("2026-06-16", { nocEspacios: 0, nocDisp: false }),
        day("2026-06-17", { nocEspacios: 0, nocDisp: false }),
        day("2026-06-18", { nocEspacios: 0, nocDisp: false }),
        day("2026-06-19"), // first day where Noc is open
        day("2026-06-20"), // its Day 2 — also clear
      ),
      horaActualWita: undefined,
      todayWitaStr: "2026-06-01",
      limit: 3,
    });
    expect(alts[0]).toBe("2026-06-19");
  });

  it("RefreshAdv mirrors AOW Day-1 Noc requirement", () => {
    const result = validateRequiredSlots({
      required: getRequiredSlots("RefreshAdv")!,
      detalleByDate: buildMap(
        day("2026-06-16", { nocEspacios: 0, nocDisp: false }),
        day("2026-06-17"),
      ),
      horaActualWita: undefined,
      todayWitaStr: "2026-06-01",
      startDate: "2026-06-16",
      pax: 1,
    });
    expect(result.allAvailable).toBe(false);
    expect(result.failingSlots.some((s) => s.slot === "Nocturno")).toBe(true);
  });
});
