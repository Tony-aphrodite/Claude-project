// ============================================================================
// Activity → instructor-rol gating (Miguel v2.2 addendum §1, 2026-06-27).
//
// A Divemaster (DM) can ONLY guide fun dives. An Instructor can guide
// everything. The matching engine must reject any pairing of a DM with
// a course activity — otherwise the office could (manually or by mistake)
// release a sale that has no qualified leader.
//
// One source of truth here; both the walk-in form (panel UI) and the
// matching engine (server) import from this module.
// ============================================================================

/** Activities that REQUIRE a full instructor (rol='instructor'). */
const COURSE_ACTIVITIES = new Set<string>([
  "BD_CONFINADA",
  "BD_BARCO",
  "SCUBA_DIVER",   // Steve 2026-07-01
  "OW1",
  "OW2",
  "OW3",
  "BD_TO_OW",      // Steve 2026-07-01 — upgrade paths still need instructor
  "SD_TO_OW",      // Steve 2026-07-01
  "AA",
  "AA2",
  "ADV",
  "SP",
  "RES",
  "REF_FASE1",
]);

/** Activities a Divemaster can guide (in addition to all instructor-eligible activities). */
const DM_ELIGIBLE_ACTIVITIES = new Set<string>(["FD", "REF_FASE2"]);

/**
 * Returns the set of roles allowed to lead this activity:
 *   - course activities: ['instructor']
 *   - fun-dive activities: ['instructor', 'divemaster']
 *
 * Unknown activities default to instructor-only — fail-safe.
 */
export function rolesForActivity(activity: string): readonly string[] {
  if (DM_ELIGIBLE_ACTIVITIES.has(activity)) {
    return ["instructor", "divemaster"];
  }
  if (COURSE_ACTIVITIES.has(activity)) {
    return ["instructor"];
  }
  return ["instructor"];
}

/**
 * Validate that a given instructor (by role) can lead a given activity.
 * Returns null when allowed, an error message when rejected.
 *
 *   role='divemaster', activity='OW2' → "Un divemaster no puede dictar OW2"
 *   role='instructor', activity='FD'   → null
 */
export function validateActivityRol(
  activity: string,
  role: string,
): string | null {
  const allowed = rolesForActivity(activity);
  if (allowed.includes(role)) return null;
  if (role === "divemaster") {
    return `Un divemaster no puede dictar ${activity}. Los DM solo guían fun dives (FD, REF fase 2). Asigná un instructor o cambiá la actividad.`;
  }
  return `Rol ${role} no autorizado para ${activity}.`;
}

/** True if the activity is a fun-dive type (DM-eligible). */
export function isFunDiveActivity(activity: string): boolean {
  return DM_ELIGIBLE_ACTIVITIES.has(activity);
}

/** True if the activity is a cert-course type (instructor-only). */
export function isCourseActivity(activity: string): boolean {
  return COURSE_ACTIVITIES.has(activity);
}
