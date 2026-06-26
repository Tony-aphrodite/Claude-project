// ============================================================================
// Intelligent Roster Engine — 12 test cases from Miguel's spec §7
//
// These tests are the executable contract for the engine. Each one
// mirrors a scenario from the spec. If any of them goes red, the
// engine has drifted from Miguel's operational model.
//
// Spec source of truth: reference/roster-engine-spec-2026-06-24.md §7
// ============================================================================

import { describe, expect, it } from "vitest";

import type {
  Activity,
  ActivityDetail,
  InstructorInput,
  NivelCertificacion,
  RosterDiverInput,
  Slot,
} from "@dpm/shared";

import { buildRoster } from "../src/services/roster-engine.js";

// ─── Test helpers ─────────────────────────────────────────────────────────

let _seq = 0;
function makeDiver(input: {
  nombre: string;
  nivel: NivelCertificacion;
  activity: Activity;
  activityDetail?: ActivityDetail;
  acceptsCap?: boolean;
}): RosterDiverInput {
  _seq += 1;
  return {
    id: `d-${_seq}`,
    codigoBuceador: `DPM-TEST-${_seq.toString().padStart(6, "0")}`,
    nombre: input.nombre,
    nivelCertificacion: input.nivel,
    activity: input.activity,
    activityDetail: input.activityDetail,
    acceptsCap: input.acceptsCap ?? false,
  };
}

let _instSeq = 0;
function makeInstructor(nombre: string): InstructorInput {
  _instSeq += 1;
  return { id: `i-${_instSeq}`, nombre };
}

function runSlot(
  slot: Slot,
  divers: RosterDiverInput[],
  instructors: InstructorInput[],
  boatCapacity: number | null = 30,
) {
  return buildRoster({
    sede: "Koh Tao",
    fecha: "2026-07-01",
    slot,
    divers,
    availableInstructors: instructors,
    boatCapacity,
  });
}

// ─── Test cases ───────────────────────────────────────────────────────────

describe("roster engine — spec §7 test cases", () => {
  // ── Case 1 ──────────────────────────────────────────────────────────────
  it("case 1 — 2 OW2 + 1 BD-barco on the same AM boat → 1 group (mar_12m), ratio 4, 3 filled, 1 slot open, 1 instructor", () => {
    const result = runSlot(
      "AM",
      [
        makeDiver({ nombre: "A", nivel: "BEG", activity: "OW2" }),
        makeDiver({ nombre: "B", nivel: "BEG", activity: "OW2" }),
        makeDiver({ nombre: "C", nivel: "BEG", activity: "BD_BARCO" }),
      ],
      [makeInstructor("ARI")],
    );

    expect(result.valid).toBe(true);
    expect(result.groups).toHaveLength(1);
    const g = result.groups[0]!;
    expect(g.grupoActividad).toBe("mar_12m");
    expect(g.perfilProfundidad).toBe(12);
    expect(g.ratioMax).toBe(4);
    expect(g.divers).toHaveLength(3);
    expect(g.instructorId).toBeTruthy();
    expect(result.instructorsNeeded).toBe(1);
  });

  // ── Case 2 ──────────────────────────────────────────────────────────────
  it("case 2 — 2 OW1 + 2 BD-confinada in POOL → 1 group (pool_inicial), ratio 4, full, 1 instructor", () => {
    const result = runSlot(
      "POOL_AM",
      [
        makeDiver({ nombre: "A", nivel: "BEG", activity: "OW1" }),
        makeDiver({ nombre: "B", nivel: "BEG", activity: "OW1" }),
        makeDiver({ nombre: "C", nivel: "BEG", activity: "BD_CONFINADA" }),
        makeDiver({ nombre: "D", nivel: "BEG", activity: "BD_CONFINADA" }),
      ],
      [makeInstructor("MIGUE")],
      null, // POOL — no boat capacity
    );

    expect(result.valid).toBe(true);
    expect(result.groups).toHaveLength(1);
    const g = result.groups[0]!;
    expect(g.grupoActividad).toBe("pool_inicial");
    expect(g.perfilProfundidad).toBe(5);
    expect(g.ratioMax).toBe(4);
    expect(g.divers).toHaveLength(4);
    expect(result.instructorsNeeded).toBe(1);
  });

  // ── Case 3 ──────────────────────────────────────────────────────────────
  it("case 3 — 2 AA + 2 ADV-deep on the same boat → 1 group (profunda), ratio 4, full, 1 instructor", () => {
    const result = runSlot(
      "AM",
      [
        makeDiver({ nombre: "A", nivel: "OW", activity: "AA" }),
        makeDiver({ nombre: "B", nivel: "OW", activity: "AA" }),
        makeDiver({ nombre: "C", nivel: "AA", activity: "ADV", activityDetail: "deep" }),
        makeDiver({ nombre: "D", nivel: "AA", activity: "ADV", activityDetail: "deep" }),
      ],
      [makeInstructor("BILLY")],
    );

    expect(result.valid).toBe(true);
    expect(result.groups).toHaveLength(1);
    const g = result.groups[0]!;
    expect(g.grupoActividad).toBe("profunda");
    expect(g.ratioMax).toBe(4);
    expect(g.divers).toHaveLength(4);
    expect(result.instructorsNeeded).toBe(1);
  });

  // ── Case 4 ──────────────────────────────────────────────────────────────
  // Spec says: "Same instructor: AA2 from the original pair + AA from the
  // new pair. 1 group." That cross-day affinity is Phase 3 work. For Phase 2
  // we verify the within-day part: AA2 + AA in the same slot do form 1
  // group (both → grupo 'profunda'), 1 instructor needed.
  it("case 4 — within-day: AA2 (continuing) + 2 new AA → 1 group (profunda), 1 instructor", () => {
    const result = runSlot(
      "AM",
      [
        makeDiver({ nombre: "A", nivel: "OW", activity: "AA2" }),
        makeDiver({ nombre: "B", nivel: "OW", activity: "AA2" }),
        makeDiver({ nombre: "C", nivel: "OW", activity: "AA" }),
        makeDiver({ nombre: "D", nivel: "OW", activity: "AA" }),
      ],
      [makeInstructor("ESTE")],
    );

    expect(result.valid).toBe(true);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]!.grupoActividad).toBe("profunda");
    expect(result.instructorsNeeded).toBe(1);
  });

  // ── Case 5 ──────────────────────────────────────────────────────────────
  it("case 5 — 1 FD-OW (18m) + 1 FD-AA (30m), no cap accepted → 2 groups (different depth profiles), 2 instructors", () => {
    const result = runSlot(
      "AM",
      [
        makeDiver({ nombre: "A", nivel: "OW", activity: "FD" }),
        makeDiver({ nombre: "B", nivel: "AA", activity: "FD", acceptsCap: false }),
      ],
      [makeInstructor("TUTU"), makeInstructor("KIELE")],
    );

    expect(result.valid).toBe(true);
    expect(result.groups).toHaveLength(2);
    const grupos = result.groups.map((g) => g.grupoActividad).sort();
    expect(grupos).toEqual(["fundive_18m", "fundive_30m"]);
    expect(result.instructorsNeeded).toBe(2);
  });

  // ── Case 6 ──────────────────────────────────────────────────────────────
  it("case 6 — same as case 5 but AA acceptsCap=true → 1 group at 18m, ratio 6, 1 instructor", () => {
    const result = runSlot(
      "AM",
      [
        makeDiver({ nombre: "A", nivel: "OW", activity: "FD" }),
        makeDiver({ nombre: "B", nivel: "AA", activity: "FD", acceptsCap: true }),
      ],
      [makeInstructor("YOUNNES")],
    );

    expect(result.valid).toBe(true);
    expect(result.groups).toHaveLength(1);
    const g = result.groups[0]!;
    expect(g.grupoActividad).toBe("fundive_18m");
    expect(g.perfilProfundidad).toBe(18);
    expect(g.ratioMax).toBe(6);
    expect(g.divers).toHaveLength(2);
    expect(result.instructorsNeeded).toBe(1);
  });

  // ── Case 7 ──────────────────────────────────────────────────────────────
  it("case 7 — 8 FD same level → 2 groups (6 + 2), 2 instructors", () => {
    const divers = Array.from({ length: 8 }, (_, i) =>
      makeDiver({ nombre: `D${i + 1}`, nivel: "OW", activity: "FD" }),
    );
    const result = runSlot("AM", divers, [
      makeInstructor("ARI"),
      makeInstructor("BILLY"),
    ]);

    expect(result.valid).toBe(true);
    expect(result.groups).toHaveLength(2);
    expect(result.groups[0]!.divers).toHaveLength(6);
    expect(result.groups[1]!.divers).toHaveLength(2);
    expect(result.groups[0]!.ratioMax).toBe(6);
    expect(result.instructorsNeeded).toBe(2);
  });

  // ── Case 8 ──────────────────────────────────────────────────────────────
  it("case 8 — 1 RES + 1 FD → 2 groups (RES is dedicated), 2 instructors", () => {
    const result = runSlot(
      "AM",
      [
        makeDiver({ nombre: "R", nivel: "AA", activity: "RES" }),
        makeDiver({ nombre: "F", nivel: "OW", activity: "FD" }),
      ],
      [makeInstructor("MIGUE"), makeInstructor("ESTE")],
    );

    expect(result.valid).toBe(true);
    expect(result.groups).toHaveLength(2);
    const grupos = result.groups.map((g) => g.grupoActividad).sort();
    expect(grupos).toContain("dedicado_res");
    expect(grupos).toContain("fundive_18m");
    expect(result.instructorsNeeded).toBe(2);
  });

  // ── Case 9 ──────────────────────────────────────────────────────────────
  it("case 9 — 1 SP-nitrox + 1 SP-deep → 2 groups (each specialty is dedicated), 2 instructors", () => {
    const result = runSlot(
      "AM",
      [
        makeDiver({
          nombre: "N",
          nivel: "OW",
          activity: "SP",
          activityDetail: "nitrox",
        }),
        makeDiver({
          nombre: "D",
          nivel: "OW",
          activity: "SP",
          activityDetail: "deep",
        }),
      ],
      [makeInstructor("KIELE"), makeInstructor("TUTU")],
    );

    expect(result.valid).toBe(true);
    expect(result.groups).toHaveLength(2);
    // Both are 'dedicado_sp' grupo but with different activityDetail keys,
    // so they end up in distinct groups.
    expect(result.groups.every((g) => g.grupoActividad === "dedicado_sp")).toBe(
      true,
    );
    expect(result.instructorsNeeded).toBe(2);
  });

  // ── Case 10 ─────────────────────────────────────────────────────────────
  // Two-phase REF: phase 1 in POOL groups with pool_inicial; phase 2 (on
  // a later boat slot) groups as fundive at the diver's cert depth.
  it("case 10 — REF Fernanda phase 1 in POOL + phase 2 boat → pool_inicial + fundive_18m", () => {
    const pool = runSlot(
      "POOL_AM",
      [makeDiver({ nombre: "Fernanda", nivel: "OW", activity: "REF_FASE1" })],
      [makeInstructor("ARI")],
      null,
    );

    expect(pool.valid).toBe(true);
    expect(pool.groups).toHaveLength(1);
    expect(pool.groups[0]!.grupoActividad).toBe("pool_inicial");
    expect(pool.groups[0]!.perfilProfundidad).toBe(5);

    const boat = runSlot(
      "PM",
      [makeDiver({ nombre: "Fernanda", nivel: "OW", activity: "REF_FASE2" })],
      [makeInstructor("ARI")],
    );

    expect(boat.valid).toBe(true);
    expect(boat.groups).toHaveLength(1);
    expect(boat.groups[0]!.grupoActividad).toBe("fundive_18m");
    expect(boat.groups[0]!.perfilProfundidad).toBe(18);
  });

  // ── Case 11 ─────────────────────────────────────────────────────────────
  it("case 11 — 5 divers needing 2 groups but only 1 instructor available → blocked, no_instructor", () => {
    // 5 FD-OW divers — ratio 6 caps to 1 group of 5… but spec case 11
    // says "venta del que abre el 2º grupo". To force 2 groups we mix in
    // a BD that forces ratio-4 + a depth gap to split into two buckets.
    // Simpler: 4 FD-OW + 1 FD-AA (no cap) → 2 groups by depth profile.
    const result = runSlot(
      "AM",
      [
        makeDiver({ nombre: "A", nivel: "OW", activity: "FD" }),
        makeDiver({ nombre: "B", nivel: "OW", activity: "FD" }),
        makeDiver({ nombre: "C", nivel: "OW", activity: "FD" }),
        makeDiver({ nombre: "D", nivel: "OW", activity: "FD" }),
        makeDiver({ nombre: "E", nivel: "AA", activity: "FD", acceptsCap: false }),
      ],
      [makeInstructor("MIGUE")], // only 1 available
    );

    expect(result.valid).toBe(false);
    expect(result.validation.instructor.ok).toBe(false);
    expect(result.instructorsNeeded).toBe(2);
    expect(result.instructorsAvailable).toBe(1);
    // The group that didn't get an instructor has its divers in
    // `unassignable`. Total length depends on which bucket sized
    // bigger; at least one group's divers should be present.
    expect(result.unassignable.length).toBeGreaterThan(0);
  });

  // ── Case 12 ─────────────────────────────────────────────────────────────
  it("case 12 — instructors OK but boat capacity full → blocked on secondary check", () => {
    const divers = Array.from({ length: 4 }, (_, i) =>
      makeDiver({ nombre: `D${i + 1}`, nivel: "OW", activity: "FD" }),
    );
    const result = runSlot(
      "AM",
      divers,
      [makeInstructor("ARI"), makeInstructor("BILLY")],
      3, // boat only holds 3
    );

    expect(result.valid).toBe(false);
    expect(result.validation.boat.ok).toBe(false);
    expect(result.validation.boat.used).toBe(4);
    expect(result.validation.boat.capacity).toBe(3);
    // Instructor check should still pass — only one group needed.
    expect(result.validation.instructor.ok).toBe(true);
    // The overflow tail is reported as unassignable.
    expect(result.unassignable.length).toBe(1);
  });
});

describe("roster engine — derivation edge cases", () => {
  it("FD with DM-level cert defaults to 30m (DM never needs cap)", () => {
    const result = runSlot(
      "AM",
      [makeDiver({ nombre: "Z", nivel: "DM", activity: "FD" })],
      [makeInstructor("ARI")],
    );
    expect(result.groups[0]!.perfilProfundidad).toBe(30);
    expect(result.groups[0]!.grupoActividad).toBe("fundive_30m");
  });

  it("FD with INS-level cert defaults to 30m", () => {
    const result = runSlot(
      "AM",
      [makeDiver({ nombre: "Z", nivel: "INS", activity: "FD" })],
      [makeInstructor("ARI")],
    );
    expect(result.groups[0]!.perfilProfundidad).toBe(30);
  });

  it("empty diver list returns valid output with zero groups", () => {
    const result = runSlot("AM", [], [makeInstructor("ARI")]);
    expect(result.valid).toBe(true);
    expect(result.groups).toHaveLength(0);
    expect(result.instructorsNeeded).toBe(0);
  });

  it("deterministic output: same input twice → same group ids", () => {
    const divers = [
      makeDiver({ nombre: "A", nivel: "OW", activity: "FD" }),
      makeDiver({ nombre: "B", nivel: "OW", activity: "FD" }),
    ];
    const instructors = [makeInstructor("ARI")];
    const r1 = buildRoster({
      sede: "KT",
      fecha: "2026-07-01",
      slot: "AM",
      divers,
      availableInstructors: instructors,
    });
    const r2 = buildRoster({
      sede: "KT",
      fecha: "2026-07-01",
      slot: "AM",
      divers,
      availableInstructors: instructors,
    });
    expect(r1.groups[0]!.id).toBe(r2.groups[0]!.id);
  });

  it("preserves diver order within a group (the Sheet's Ratio 1/2/3/4 column)", () => {
    const divers = [
      makeDiver({ nombre: "first", nivel: "OW", activity: "FD" }),
      makeDiver({ nombre: "second", nivel: "OW", activity: "FD" }),
      makeDiver({ nombre: "third", nivel: "OW", activity: "FD" }),
    ];
    const result = runSlot("AM", divers, [makeInstructor("ARI")]);
    expect(result.groups[0]!.divers.map((d) => d.nombre)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });
});
