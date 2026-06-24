// ============================================================================
// Intelligent Roster Engine — pure function
//
// Spec:         reference/roster-engine-spec-2026-06-24.md
// Architecture: docs/roster-engine-architecture.md
// Types:        packages/shared/src/roster-engine.ts
//
// This module is the heart of the new roster system. Given a slot's
// divers + the day's available instructors, it groups divers by
// compatibility key (spec §4.3), packs them into groups bounded by the
// per-group ratio cap (4 or 6), assigns one instructor per group, and
// validates against the primary (instructor) and secondary (boat seat)
// constraints.
//
// Implementation contract:
//   - PURE function. No DB. No network. No clocks. No randomness.
//   - DETERMINISTIC. Given identical input, returns identical output.
//   - Round-robin instructor assignment (Phase 2). Multi-day affinity
//     (test case #4) lands in Phase 3.
//   - Returns ALL groups even when constraints fail — caller decides
//     how to surface the failure. `valid=false` + `unassignable` array
//     report what wasn't placed.
// ============================================================================

import type {
  ActivityProfile,
  AssignedGroup,
  BuildRosterInput,
  BuildRosterOutput,
  GrupoActividad,
  InstructorInput,
  PerfilProfundidad,
  RatioMax,
  RosterDiverInput,
  Slot,
} from "@dpm/shared";
import {
  compatibilityKey,
  deriveActivityProfile,
  resolveRatio,
} from "@dpm/shared";

// ─── Deterministic id allocator ───────────────────────────────────────────
//
// The engine assigns ids to the groups it produces. We use a
// deterministic sequence (engine-run-id + sequence) instead of
// randomness so the function stays pure and unit-tests can pin output
// shapes. The DB-layer wrapper will replace these with real uuids
// before persisting.

type DivWithProfile = RosterDiverInput & { __profile: ActivityProfile };

function annotate(divers: RosterDiverInput[], slot: Slot): DivWithProfile[] {
  return divers.map((d) => ({
    ...d,
    __profile: deriveActivityProfile(d, { slot }),
  }));
}

function groupByCompatibility(
  divers: DivWithProfile[],
): Map<string, DivWithProfile[]> {
  const map = new Map<string, DivWithProfile[]>();
  for (const diver of divers) {
    const key = compatibilityKey(diver.__profile, diver.activityDetail);
    let bucket = map.get(key);
    if (!bucket) {
      bucket = [];
      map.set(key, bucket);
    }
    bucket.push(diver);
  }
  return map;
}

/**
 * Greedy fill-open-then-open-new packer. Within a single compatibility
 * key all divers can go into the same group; we just need to split
 * into groups of at most `ratioMax`. This minimises the number of
 * groups (= minimises instructors required).
 *
 * Determinism: preserves input order — diver A always lands before
 * diver B if A appears before B in `divers`.
 */
function packGroupsForKey(
  divers: DivWithProfile[],
  ratioMax: RatioMax,
): DivWithProfile[][] {
  const groups: DivWithProfile[][] = [];
  let current: DivWithProfile[] = [];
  for (const diver of divers) {
    if (current.length >= ratioMax) {
      groups.push(current);
      current = [];
    }
    current.push(diver);
  }
  if (current.length > 0) {
    groups.push(current);
  }
  return groups;
}

/**
 * Pick the representative GrupoActividad + PerfilProfundidad for a
 * packed group. Within a compatibility key every diver has the same
 * pair, so we just take the first.
 */
function representativeProfile(
  group: DivWithProfile[],
): { grupoActividad: GrupoActividad; perfilProfundidad: PerfilProfundidad } {
  const first = group[0];
  if (!first) {
    throw new Error("representativeProfile called on empty group");
  }
  return {
    grupoActividad: first.__profile.grupoActividad,
    perfilProfundidad: first.__profile.perfilProfundidad,
  };
}

/**
 * Round-robin assignment of instructors to groups. Phase 2 baseline.
 * Phase 3 will add multi-day affinity (same OW students keep the same
 * instructor day 1 → 2 → 3, per spec test case #4).
 *
 * Determinism: instructors are consumed in input order. Caller controls
 * fairness by ordering `availableInstructors` upstream.
 */
function assignInstructors(
  packedGroups: DivWithProfile[][],
  availableInstructors: InstructorInput[],
): Array<{ group: DivWithProfile[]; instructorId: string | null }> {
  return packedGroups.map((group, idx) => {
    const instructor = availableInstructors[idx];
    return {
      group,
      instructorId: instructor ? instructor.id : null,
    };
  });
}

/**
 * Generate a stable, deterministic id for an engine-produced group.
 * Uses a synthetic prefix + position so callers can spot
 * engine-generated ids vs DB-persisted uuids.
 */
function makeGroupId(seq: number): string {
  // Synthetic id — replaced with a real uuid when persisted.
  // The "rg-eng-" prefix keeps it visibly different from a real uuid in
  // logs and tests.
  return `rg-eng-${seq.toString().padStart(4, "0")}`;
}

/**
 * Convert the engine's internal DivWithProfile back to a clean
 * RosterDiverInput (drops the __profile annotation).
 */
function stripProfile(d: DivWithProfile): RosterDiverInput {
  const { __profile: _drop, ...rest } = d;
  return rest;
}

// ─── Engine entry point ───────────────────────────────────────────────────

/**
 * Build a slot's roster. Pure function — see file header for contract.
 *
 * Algorithm (spec §6):
 *   1. Annotate each diver with their activity profile.
 *   2. Group by compatibility key (spec §4.3).
 *   3. Pack each compatibility bucket into ratio-bounded groups.
 *   4. Resolve the effective ratio per group (one ratio-4 member caps
 *      the whole group — spec §4.1 mixed-group rule).
 *   5. Round-robin assign instructors.
 *   6. Validate: instructors ≥ groups (primary), boat seats ≥ divers
 *      (secondary).
 *
 * If validation fails, the function still returns a fully assigned
 * output — `valid=false` plus an `unassignable` array tells the
 * caller which divers can't be placed. This lets the AI / panel
 * surface a precise "missing 1 instructor" message instead of a
 * blanket failure.
 */
export function buildRoster(input: BuildRosterInput): BuildRosterOutput {
  const {
    slot,
    divers: rawDivers,
    availableInstructors,
    boatCapacity = null,
  } = input;

  // Stage 1 — annotate.
  const annotated = annotate(rawDivers, slot);

  // Stage 2 — group by compat key.
  const byKey = groupByCompatibility(annotated);

  // Stage 3+4 — pack each bucket using the resolved ratio.
  // (Within a single compat key all members already share ratioCap, so
  // resolveRatio() just confirms it; the mixed-group rule across a key
  // boundary is already enforced by the key itself — two divers with
  // different ratioCaps live in different keys.)
  const packed: DivWithProfile[][] = [];
  for (const bucket of byKey.values()) {
    const profiles = bucket.map((d) => d.__profile);
    const ratio = resolveRatio(profiles);
    const split = packGroupsForKey(bucket, ratio);
    packed.push(...split);
  }

  // Stage 5 — assign instructors round-robin.
  const assigned = assignInstructors(packed, availableInstructors);

  // Stage 6 — validate.
  const instructorsNeeded = assigned.length;
  const instructorsAvailable = availableInstructors.length;
  const instructorOk = instructorsNeeded <= instructorsAvailable;

  const totalDivers = rawDivers.length;
  const boatUsed = totalDivers;
  // Spec §6.6 — secondary check only matters for slots that use a
  // boat. POOL is land-based, so we skip when boatCapacity is null.
  // For boat-using slots (AM/PM/NIGHT) with a capacity given, enforce
  // it.
  const boatOk =
    boatCapacity === null
      ? true
      : slot === "POOL"
        ? true
        : boatUsed <= boatCapacity;

  const valid = instructorOk && boatOk;

  // Build the output groups. Even when validation fails we surface
  // every group — the operator panel needs to see what the engine
  // computed.
  const outGroups: AssignedGroup[] = assigned.map(({ group, instructorId }, idx) => {
    const profile = representativeProfile(group);
    const ratio = resolveRatio(group.map((d) => d.__profile));
    return {
      id: makeGroupId(idx + 1),
      grupoActividad: profile.grupoActividad,
      perfilProfundidad: profile.perfilProfundidad,
      ratioMax: ratio,
      divers: group.map(stripProfile),
      instructorId,
    };
  });

  // Build the unassignable list. We mark divers of groups that didn't
  // get an instructor as unassignable, plus — if the boat overflows —
  // the excess divers (tail) flagged.
  const unassignableSet = new Set<string>();
  for (const g of outGroups) {
    if (g.instructorId === null) {
      for (const d of g.divers) {
        unassignableSet.add(d.id);
      }
    }
  }
  if (!boatOk && boatCapacity !== null) {
    // Mark the tail of divers that exceed the boat capacity as
    // unassignable. The tail is calculated AFTER instructor-driven
    // unassignables so the caller can distinguish reasons via
    // validation.instructor.ok vs validation.boat.ok.
    const overflow = boatUsed - boatCapacity;
    if (overflow > 0) {
      // Tail of the input list (deterministic — last N divers).
      const tail = rawDivers.slice(-overflow);
      for (const d of tail) {
        unassignableSet.add(d.id);
      }
    }
  }
  const unassignable: RosterDiverInput[] = rawDivers.filter((d) =>
    unassignableSet.has(d.id),
  );

  return {
    groups: outGroups,
    instructorsNeeded,
    instructorsAvailable,
    valid,
    validation: {
      instructor: {
        ok: instructorOk,
        needed: instructorsNeeded,
        available: instructorsAvailable,
      },
      boat: {
        ok: boatOk,
        used: boatUsed,
        capacity: boatCapacity,
      },
    },
    unassignable,
  };
}
