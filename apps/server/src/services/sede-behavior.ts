// ============================================================================
// Per-sede behavior config resolver.
//
// Reads `sedes.behavior_config` (JSONB) and applies global defaults so
// callers get a fully-populated config struct without scattering
// "??-fallback" logic across the codebase.
//
// Today the resolver supports two knobs (both added 2026-05-26 for the Phi
// Phi flip):
//   • follow_up_hours[] — overrides the global 5-level cadence
//   • post_purchase_grace_minutes — how long the AI keeps handling logistics
//     after a deposit is confirmed before silencing for the human team
//
// Empty fields fall back to the global defaults. A sede that has no row in
// `behavior_config` (or `{}`) behaves exactly like before this feature
// landed — the change is opt-in per-sede.
// ============================================================================

import { eq } from "drizzle-orm";

import { getDb, sedes } from "@dpm/db";
import { FOLLOW_UP_LEVELS, type SedeBehaviorConfig } from "@dpm/shared";

/**
 * Same shape as `SedeBehaviorConfig` but with every field present (defaults
 * filled in). Use this from callers so they don't need to re-implement
 * fallbacks.
 */
export type ResolvedSedeBehavior = {
  /** Hours per follow-up level. Length === number of levels for this sede. */
  followUpHours: number[];
  /** 0 = no grace (legacy behavior; silence immediately at deposit_paid). */
  postPurchaseGraceMinutes: number;
};

const GLOBAL_FOLLOW_UP_HOURS: number[] = [
  FOLLOW_UP_LEVELS.LEVEL_1.hours,
  FOLLOW_UP_LEVELS.LEVEL_2.hours,
  FOLLOW_UP_LEVELS.LEVEL_3.hours,
  FOLLOW_UP_LEVELS.LEVEL_4.hours,
  FOLLOW_UP_LEVELS.LEVEL_5.hours,
];

export const DEFAULT_BEHAVIOR: ResolvedSedeBehavior = {
  followUpHours: GLOBAL_FOLLOW_UP_HOURS,
  postPurchaseGraceMinutes: 0,
};

function resolve(raw: SedeBehaviorConfig | null | undefined): ResolvedSedeBehavior {
  const followUpHours =
    Array.isArray(raw?.follow_up_hours) && raw!.follow_up_hours!.length > 0
      ? raw!.follow_up_hours!.filter((n) => Number.isFinite(n) && n > 0)
      : GLOBAL_FOLLOW_UP_HOURS;
  const postPurchaseGraceMinutes =
    typeof raw?.post_purchase_grace_minutes === "number" &&
    raw.post_purchase_grace_minutes >= 0
      ? raw.post_purchase_grace_minutes
      : 0;
  return { followUpHours, postPurchaseGraceMinutes };
}

/** Resolve the behavior config for a sede UUID. Hits the DB. */
export async function getSedeBehavior(
  sedeId: string,
): Promise<ResolvedSedeBehavior> {
  const db = getDb();
  const [row] = await db
    .select({ behaviorConfig: sedes.behaviorConfig })
    .from(sedes)
    .where(eq(sedes.id, sedeId))
    .limit(1);
  if (!row) return DEFAULT_BEHAVIOR;
  return resolve(row.behaviorConfig as SedeBehaviorConfig | null);
}

/** Same, but caller already has the raw config in hand. */
export function resolveSedeBehavior(
  raw: SedeBehaviorConfig | null | undefined,
): ResolvedSedeBehavior {
  return resolve(raw);
}
