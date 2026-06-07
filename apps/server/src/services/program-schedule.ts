// Per-program roster schedule. Moved into @dpm/shared (2026-06-07) so the
// panel's seed-booking form can expand it client-side without duplicating
// the data. This file is a thin re-export shim for backward compatibility
// with the dozen-ish call sites inside apps/server that still import from
// "./program-schedule.js".

export {
  addDays,
  computeTurno,
  getRequiredSlots,
  isClosureDay,
  maxDayOffset,
  type RequiredSlot,
} from "@dpm/shared";
