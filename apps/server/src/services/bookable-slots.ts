// ============================================================================
// Time-of-day bookability for Gili Trawangan boat slots. Owner spec:
//
//   Antes de 07:15 WITA   → AM y PM mismo día
//   07:15 — 12:15 WITA    → AM ya zarpó → solo PM hoy
//   12:15 — 17:00 WITA    → PM en curso → solo mañana
//   Después de 17:00 WITA → todo cerrado hoy → solo mañana
//
// Cutoff history:
//   2026-05-06 (initial): 07:15 / 12:30 / 17:00
//   2026-05-07 (DPM_AI_LAUNCH doc): PM cutoff moved to 12:15 because
//     PM Boat now departs at 12:15-16:00 (not 12:30-16:00).
//
// `hora_actual_wita` is the source of truth (always fresh from the Apps
// Script — never cached). Future days (date != today) are unaffected: any
// slot is technically reservable in advance.
//
// Returning a *Set* of slot keys instead of booleans keeps the calling
// site readable: `bookable.has("AM")` reads correctly for both today's
// cutoffs and future-day full availability.
// ============================================================================

import type { TurnoKey } from "@dpm/shared";

/**
 * Parse "HH:mm" in 24h to a minute-of-day count. Returns null on malformed
 * input so the caller can be defensive (`null` is treated as "we don't
 * know — be conservative").
 */
function parseHHMM(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

const AM_CUTOFF = 7 * 60 + 15; // 07:15 — AM boat departs (7:15-11:00 schedule)
const PM_CUTOFF = 12 * 60 + 15; // 12:15 — PM boat departs (12:15-16:00 schedule)
const DAY_END = 17 * 60; // 17:00 — nothing more bookable today

/**
 * Decide which slot keys are still bookable on `dateStr` given the current
 * `horaActualWita`. Future days return both AM and PM. Today's set narrows
 * by the cutoffs above. Past dates return an empty set.
 *
 * `todayStr` is the date in WITA that corresponds to `horaActualWita` —
 * the caller normally derives it from the Apps Script's
 * `fecha_consultada` or computes it from the server's TZ-aware clock.
 */
export function bookableSlots(
  horaActualWita: string | null | undefined,
  todayStr: string,
  dateStr: string,
): Set<TurnoKey> {
  // Past day in WITA → nothing.
  if (dateStr < todayStr) return new Set();
  // Future day → no time-of-day constraint. Confinadas (pool) and
  // Nocturno (operator-scheduled boat) are always available on future
  // days too — boat cutoffs only matter same-day.
  if (dateStr > todayStr) return new Set(["AM", "PM", "Nocturno", "Confinadas"]);

  // Same day — apply cutoffs. Confinadas is pool training; no boat
  // departure means no time cutoff. Nocturno (night boat) operates
  // late so the AM/PM cutoffs don't apply to it either — kept
  // bookable until DAY_END (17:00) which is when the pre-night
  // operator window closes.
  if (horaActualWita == null) {
    // Sede that doesn't return hora_actual_wita (Nusa Penida, Koh Tao,
    // Koh Phi Phi as of 2026-05-06). Conservative fallback: only PM is
    // bookable today since AM almost always departs before the operator
    // can react. Better to miss a sale than oversell a boat that left.
    // Confinadas and Nocturno stay bookable — they don't have an AM cutoff.
    return new Set(["PM", "Nocturno", "Confinadas"]);
  }
  const minutes = parseHHMM(horaActualWita);
  if (minutes === null) {
    return new Set(["PM", "Nocturno", "Confinadas"]);
  }
  // Past DAY_END (17:00) the operator window closes — nothing more today
  // (including Confinadas and Nocturno, both need operator coordination
  // to start).
  if (minutes >= DAY_END) return new Set();
  if (minutes >= PM_CUTOFF) return new Set(["Nocturno", "Confinadas"]);
  if (minutes >= AM_CUTOFF) return new Set(["PM", "Nocturno", "Confinadas"]);
  return new Set(["AM", "PM", "Nocturno", "Confinadas"]);
}
