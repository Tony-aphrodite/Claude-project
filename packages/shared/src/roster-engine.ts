// ============================================================================
// Intelligent Roster Engine — Shared types + Activity dictionary
//
// Spec: reference/roster-engine-spec-2026-06-24.md (Miguel v2.1)
// Architecture: docs/roster-engine-architecture.md
//
// This module is the contract shared between the server engine
// (apps/server/src/services/roster-engine.ts), the panel UI
// (apps/panel), and the test suite. It has zero runtime dependencies on
// DB / network — it's pure types + the Activity dictionary used by
// deriveActivityProfile().
// ============================================================================

// ─── Enums ─────────────────────────────────────────────────────────────────

/**
 * Time-of-day slot. Matches the AM/PM/POOL_AM/POOL_PM/NIGHT blocks in
 * Miguel's Google Sheet.
 *
 * History:
 *   - "Confinadas" → renamed "POOL" on 2026-06-24 (engine v2.1 spec).
 *   - "POOL" (single) → split into "POOL_AM" + "POOL_PM" on 2026-06-26
 *     after Miguel confirmed Gili Air (and other sedes) run morning and
 *     afternoon pool sessions as operationally separate slots — collapsing
 *     them under one POOL was masking real schedule conflicts.
 *
 * Naming convention: POOL_AM and POOL_PM intentionally use underscores
 * to stay parseable from text columns and distinguish them at a glance
 * from the boat-slot AM / PM. NIGHT was renamed from "Nocturno" on
 * 2026-06-24.
 */
export type Slot = "AM" | "PM" | "POOL_AM" | "POOL_PM" | "NIGHT";

export const ALL_SLOTS: readonly Slot[] = [
  "AM",
  "PM",
  "POOL_AM",
  "POOL_PM",
  "NIGHT",
];

/**
 * Diver's certification level. Determines the depth ceiling that an
 * FD activity allows.
 *   BEG — beginner / uncertified (Try Scuba, OW students before OW3 cert)
 *   OW  — SSI Open Water Diver (18 m)
 *   AA  — SSI Advanced Adventurer (30 m default)
 *   RES — SSI Rescue Diver
 *   DM  — Divemaster (no Refresh needed even after long gap)
 *   INS — Instructor
 */
export type NivelCertificacion = "BEG" | "OW" | "AA" | "RES" | "DM" | "INS";

export const ALL_NIVELES: readonly NivelCertificacion[] = [
  "BEG",
  "OW",
  "AA",
  "RES",
  "DM",
  "INS",
];

/**
 * What a diver does on a given dive-day. The dictionary that drives the
 * engine. See spec §3 for the canonical table.
 *
 * - BD_CONFINADA / BD_BARCO: same business object (Try Scuba / Baptism)
 *   split into two codes because their group affinity changes with slot
 *   (pool vs boat). Engine derivation handles the switch.
 * - REF_FASE1 / REF_FASE2: same business object (Refresh) split into
 *   two codes because the pool phase and the FD phase are scheduled in
 *   different slots and group with different activities.
 */
export type Activity =
  | "BD_CONFINADA"   // baptism in pool
  | "BD_BARCO"       // baptism on boat (max 12m)
  | "SCUBA_DIVER"    // SSI/PADI Scuba Diver cert (short cert, 2-day program) — Steve 2026-07-01
  | "OW1"            // OW day 1 — pool
  | "OW2"            // OW day 2 — 12m boat dives
  | "OW3"            // OW day 3 — 18m boat dives
  | "BD_TO_OW"       // upgrade day — customer already did BD, converting to OW — Steve 2026-07-01
  | "SD_TO_OW"       // upgrade day — customer already did Scuba Diver, converting to OW — Steve 2026-07-01
  | "FD"             // fun dive (depth derives from nivel + acceptsCap)
  | "AA"             // Advanced course day 1
  | "AA2"            // Advanced course day 2
  | "ADV"            // standalone adventure dive (wreck / deep / night / buoyancy / nav / fish-id)
  | "SP"             // specialty (deep / nitrox / wreck / buoyancy etc.)
  | "RES"            // rescue
  | "REF_FASE1"      // refresh phase 1 — pool skills review
  | "REF_FASE2";     // refresh phase 2 — fun dive at customer's cert level

export const ALL_ACTIVITIES: readonly Activity[] = [
  "BD_CONFINADA",
  "BD_BARCO",
  "SCUBA_DIVER",
  "OW1",
  "OW2",
  "OW3",
  "BD_TO_OW",
  "SD_TO_OW",
  "FD",
  "AA",
  "AA2",
  "ADV",
  "SP",
  "RES",
  "REF_FASE1",
  "REF_FASE2",
];

/**
 * SP and ADV are umbrellas — the specific underwater task is held in
 * `activity_detail`. Used to keep `dedicado_sp` groups dedicated PER
 * specialty type (nitrox-deep diver does NOT join a nitrox-only group).
 */
export type ActivityDetail =
  | "nitrox"
  | "deep"
  | "wreck"
  | "night"
  | "buoyancy"
  | "navigation"
  | "fish_id"
  | "react_right";

/**
 * The compatibility-group key (spec §4.3). The engine groups divers
 * who share the same `GrupoActividad` + `perfilProfundidad` together,
 * up to the ratio cap.
 */
export type GrupoActividad =
  | "pool_inicial"   // BD_CONFINADA + OW1 + REF_FASE1
  | "mar_12m"        // BD_BARCO + OW2
  | "ow_18m"         // OW3
  | "fundive_18m"    // FD@OW + REF_FASE2@OW (or AA capped to 18m)
  | "fundive_30m"    // FD@AA + REF_FASE2@AA
  | "fundive_40m"    // FD@Deep-Specialty-certified
  | "profunda"       // AA + AA2 + ADV-deep
  | "dedicado_sp"    // each SP type gets its own group (subtype on activity_detail)
  | "dedicado_res";  // RES is dedicated, never mixes

export const ALL_GRUPOS_ACTIVIDAD: readonly GrupoActividad[] = [
  "pool_inicial",
  "mar_12m",
  "ow_18m",
  "fundive_18m",
  "fundive_30m",
  "fundive_40m",
  "profunda",
  "dedicado_sp",
  "dedicado_res",
];

/**
 * Depth ceiling in meters. Pool = 5m (the pool depth limit treated as
 * a depth like any other so the type works uniformly).
 *   5  — pool / confined water
 *   12 — BD on boat, OW2
 *   18 — OW3, FD@OW, Advanced 18m wreck/night/etc.
 *   30 — FD@AA, profunda (AA / AA2 / ADV-deep at the standard 30m)
 *   40 — FD with Deep Specialty certification
 */
export type PerfilProfundidad = 5 | 12 | 18 | 30 | 40;

/**
 * Max divers per instructor for a group.
 *   4 — any group containing a non-FD activity (the restrictive default)
 *   6 — only when every member is FD (or REF_FASE2 which behaves as FD)
 */
export type RatioMax = 4 | 6;

/**
 * Source of a roster row. AI = booked through a conversation;
 * Manual = walk-in entered by office staff.
 */
export type RosterOrigen = "AI" | "Manual";

/**
 * Payment state mirrored from `conversaciones.leadStage` for AI-origin
 * rows. For Manual rows, set by office.
 */
export type EstadoPago = "pending" | "deposit_paid" | "full_paid" | "cancelled";

// ─── Engine input/output types ─────────────────────────────────────────────

/**
 * Minimal diver record the engine consumes. The DB table
 * `roster_divers` carries more (timestamps, fk, etc.) — the engine only
 * needs these fields.
 */
export interface RosterDiverInput {
  /** Unique diver-day id (uuid). The engine carries this through unchanged. */
  id: string;
  codigoBuceador: string;
  nombre: string;
  nivelCertificacion: NivelCertificacion;
  activity: Activity;
  activityDetail?: ActivityDetail;
  acceptsCap?: boolean;
}

/**
 * Output of deriveActivityProfile() — the engine annotates each input
 * diver with this before grouping.
 */
export interface ActivityProfile {
  grupoActividad: GrupoActividad;
  perfilProfundidad: PerfilProfundidad;
  ratioCap: RatioMax;
}

export interface InstructorInput {
  id: string;
  nombre: string;
  languages?: string[];
  /**
   * Miguel v2.2 addendum §1 (2026-06-27).
   *   'instructor' (default) — can lead courses + fun dives.
   *   'divemaster'           — fun dives only.
   * Matching engine packs DMs into fun-dive groups FIRST so instructors
   * stay free for course groups (spec §1 "el orden de asignación importa").
   */
  role?: "instructor" | "divemaster";
}

export interface AssignedGroup {
  /** Stable id assigned by the engine for this run. */
  id: string;
  grupoActividad: GrupoActividad;
  perfilProfundidad: PerfilProfundidad;
  ratioMax: RatioMax;
  divers: RosterDiverInput[];
  /** NULL when the engine couldn't assign (capacity short). */
  instructorId: string | null;
}

export interface BuildRosterValidation {
  instructor: {
    ok: boolean;
    needed: number;
    available: number;
  };
  boat: {
    ok: boolean;
    used: number;
    capacity: number | null;
  };
}

export interface BuildRosterInput {
  sede: string;
  fecha: string;
  slot: Slot;
  divers: RosterDiverInput[];
  /** Already filtered to this sede + fecha + slot. */
  availableInstructors: InstructorInput[];
  /** Boat capacity for the slot. NULL = no boat (e.g. POOL slot) or unknown — skips secondary check. */
  boatCapacity?: number | null;
}

export interface BuildRosterOutput {
  groups: AssignedGroup[];
  instructorsNeeded: number;
  instructorsAvailable: number;
  valid: boolean;
  validation: BuildRosterValidation;
  /** Empty when valid=true. Populated when constraints fail. */
  unassignable: RosterDiverInput[];
}

// ─── Activity dictionary ──────────────────────────────────────────────────

/**
 * Compute the activity profile for a single diver. This is the entry
 * point that resolves the BD / REF special cases (which switch group
 * based on slot or phase) and applies the depth + ratio rules from
 * spec §3-§4.
 *
 * Pure function — no I/O, deterministic, used by both the engine and
 * the validation helpers.
 *
 * @param diver The diver row (with activity + nivel + acceptsCap)
 * @param ctx   Slot context — needed to disambiguate BD_CONFINADA vs
 *              BD_BARCO when the spec says "BD changes group by slot".
 */
export function deriveActivityProfile(
  diver: RosterDiverInput,
  ctx: { slot: Slot },
): ActivityProfile {
  const { activity, nivelCertificacion, acceptsCap } = diver;
  const { slot } = ctx;

  switch (activity) {
    // ─── Pool-side activities (group_actividad = pool_inicial) ───
    case "BD_CONFINADA":
    case "OW1":
    case "REF_FASE1":
      return {
        grupoActividad: "pool_inicial",
        perfilProfundidad: 5,
        ratioCap: 4,
      };

    // ─── 12-m boat (group_actividad = mar_12m) ───
    case "BD_BARCO":
    case "OW2":
      return {
        grupoActividad: "mar_12m",
        perfilProfundidad: 12,
        ratioCap: 4,
      };

    // ─── 18-m OW final day ───
    case "OW3":
      return {
        grupoActividad: "ow_18m",
        perfilProfundidad: 18,
        ratioCap: 4,
      };

    // ─── Fun dive — depth follows certification ───
    case "FD":
    case "REF_FASE2": {
      // REF_FASE2 behaves identically to FD for grouping; only the
      // pricing / sale path differs upstream.
      //
      // - BEG / OW → 18m always
      // - AA / RES / DM / INS → 30m by default
      // - acceptsCap on an AA-level diver → manually caps to 18m so
      //   they can group with OW fun divers (spec case 6).
      let depth: PerfilProfundidad = 18;
      if (nivelCertificacion === "AA" || nivelCertificacion === "RES" ||
          nivelCertificacion === "DM" || nivelCertificacion === "INS") {
        depth = acceptsCap ? 18 : 30;
      }
      const grupo: GrupoActividad =
        depth === 18 ? "fundive_18m" : depth === 30 ? "fundive_30m" : "fundive_40m";
      return {
        grupoActividad: grupo,
        perfilProfundidad: depth,
        ratioCap: 6,
      };
    }

    // ─── Advanced course days + standalone ADV ───
    case "AA":
    case "AA2":
    case "ADV":
      return {
        grupoActividad: "profunda",
        perfilProfundidad: 30,
        ratioCap: 4,
      };

    // ─── Specialty — dedicated per subtype ───
    case "SP":
      // The subtype distinction (nitrox vs deep vs wreck) is enforced
      // downstream in groupByCompatibilityKey() by including
      // activity_detail in the key. We keep grupoActividad uniform
      // ('dedicado_sp') so the schema is simple.
      return {
        grupoActividad: "dedicado_sp",
        perfilProfundidad: 30,  // most specialties go to ~30; refined per subtype later
        ratioCap: 4,
      };

    // ─── Rescue — dedicated ───
    case "RES":
      return {
        grupoActividad: "dedicado_res",
        perfilProfundidad: 18,
        ratioCap: 4,
      };

    // ─── Steve 2026-07-01 — Scuba Diver + upgrade activities ───
    // These are additive placeholders so the walk-in operator can
    // classify a diver on these programs; engine grouping treats them
    // as compatible with the equivalent OW day-type they parallel.
    // Once Miguel provides the exact day-by-day footprint (see
    // reference/2026-07-01-miguel-feedback-followups.md #10) we may
    // refine the depth caps / ratios, but this baseline is safe.
    case "SCUBA_DIVER":
      // Scuba Diver mimics OW2 in the water — 12m boat dives without
      // the third-day 18m depth. Group with mar_12m so an SD student
      // and an OW2 student can share an instructor safely.
      return {
        grupoActividad: "mar_12m",
        perfilProfundidad: 12,
        ratioCap: 4,
      };
    case "BD_TO_OW":
      // BD→OW upgrade: customer already did the BD pool + first shallow
      // dive; they need the remaining OW work. Behaves like OW3 (18m
      // open-water day) for capacity + grouping. Operator can log
      // additional day if needed.
      return {
        grupoActividad: "ow_18m",
        perfilProfundidad: 18,
        ratioCap: 4,
      };
    case "SD_TO_OW":
      // SD→OW upgrade: only the final 18m OW day is missing. Same
      // grouping as OW3.
      return {
        grupoActividad: "ow_18m",
        perfilProfundidad: 18,
        ratioCap: 4,
      };

    default: {
      // Exhaustiveness check — TS will error if a new Activity is added
      // without a case here.
      const _exhaustive: never = activity;
      throw new Error(`deriveActivityProfile: unhandled activity ${String(_exhaustive)}`);
    }
  }
}

// ─── Compatibility key ────────────────────────────────────────────────────

/**
 * Compose the compatibility key two divers must share to group together.
 * Spec §4.3:
 *   key = (sede, fecha, slot, group_of_activity, depth_profile)
 *
 * The engine groups by this key. SP groups additionally include
 * `activity_detail` so a nitrox student and a deep-specialty student
 * don't share an instructor.
 */
export function compatibilityKey(
  profile: ActivityProfile,
  activityDetail?: ActivityDetail,
): string {
  if (profile.grupoActividad === "dedicado_sp") {
    return `${profile.grupoActividad}:${profile.perfilProfundidad}:${activityDetail ?? "unspecified"}`;
  }
  return `${profile.grupoActividad}:${profile.perfilProfundidad}`;
}

// ─── Ratio resolution ─────────────────────────────────────────────────────

/**
 * Given a candidate group of divers (all with the same compatibility
 * key), return the effective ratio cap. Spec §4.1: a single
 * ratio-4 member caps the whole group to 4.
 */
export function resolveRatio(profiles: ActivityProfile[]): RatioMax {
  return profiles.some((p) => p.ratioCap === 4) ? 4 : 6;
}
