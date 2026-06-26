// ============================================================================
// Reference code generator + validator.
//
// Originally lived in apps/server/src/tools/solicitar-deposito.ts (where the
// AI tool that mints codes for deposit invoices needed it). Lifted here to
// @dpm/shared on 2026-06-26 (Miguel feedback on walk-ins) so the panel's
// roster engine walk-in form can mint codes in the SAME format the AI uses.
//
// Why share format: when the SSI / DPM registration system goes live, a
// diver authenticates with the code they received at sale time. AI sales
// and walk-in sales both need codes from the same alphabet so the
// registration system doesn't care which path the booking came from.
//
// Format: DPM-<SEDE_PREFIX>-MMDD-XXXXXX
//   - DPM      brand prefix
//   - <PREFIX> 2-letter sede id (PP / KT / GA / GT / NP)
//   - MMDD     sede-local month + day (so Phi Phi at 23:30 Bangkok lands
//              on the same day the operator sees on their wall clock)
//   - XXXXXX   6 random chars from an unambiguous alphabet (no 0/O/1/I/L)
//
// The legacy `DPM-XXXXXX` shape (pre-2026-05-07) still validates because
// some pre-migration rows exist in the DB.
// ============================================================================

/**
 * Sede identifier prefix used in `DPM-<PREFIX>-MMDD-XXXXXX` reference
 * codes. Miguel feedback 2026-06-06: before this map, every code came
 * out tagged `GT` regardless of sede — Phi Phi bookings showed up in
 * Gili Trawangan's bucket and confused the office. The prefix lets a
 * human reading a Wise / bank transfer concept identify the sede
 * instantly.
 *
 * Defaults to `GT` only as a safety net when a sede name doesn't match
 * any known key (shouldn't happen — falls back to the legacy behavior).
 */
export const SEDE_REFCODE_PREFIXES: Record<string, string> = {
  "Koh Phi Phi": "PP",
  "Gili Trawangan": "GT",
  "Gili Air": "GA",
  "Koh Tao": "KT",
  "Nusa Penida": "NP",
};

export function sedeRefCodePrefix(sedeNombre: string | undefined): string {
  if (!sedeNombre) return "GT";
  return SEDE_REFCODE_PREFIXES[sedeNombre] ?? "GT";
}

/**
 * Sede-local timezone used to compute the MMDD slug. Codes generated at
 * 23:30 in Phi Phi must use that local day, not UTC. Falls back to
 * Asia/Makassar (Gili Trawangan) when sede unknown.
 */
const SEDE_TIMEZONES: Record<string, string> = {
  "Koh Phi Phi": "Asia/Bangkok",
  "Koh Tao": "Asia/Bangkok",
  "Gili Trawangan": "Asia/Makassar",
  "Gili Air": "Asia/Makassar",
  "Nusa Penida": "Asia/Makassar",
};

/**
 * Generate a reference code in the owner-specified format
 * `DPM-<SEDE_PREFIX>-MMDD-XXXXXX` (DPM_AI_LAUNCH doc, 2026-05-07,
 * updated 2026-06-06 to be per-sede):
 *   - `DPM-<PREFIX>` identifies the brand + sede (PP, GT, GA, KT, NP)
 *   - `MMDD` is the sede-local month/day so an operator scanning Wise
 *     transfers can quickly bucket by week
 *   - `XXXXXX` is 6 random alphanumeric chars (ambiguous chars 0/O/1/I/L
 *     excluded) so the customer can't mis-key it
 *
 * The MMDD prefix is computed in the sede's local timezone so the bucket
 * matches the operator's wall clock. Phi Phi / Koh Tao = Asia/Bangkok,
 * Gili Trawangan / Gili Air / Nusa Penida = Asia/Makassar.
 *
 * @param sedeNombre Sede display name from the `sedes` table. When omitted,
 *                   defaults to the legacy "GT" prefix + Asia/Makassar so
 *                   pre-2026-06-06 callers still work.
 */
export function generateRefCode(
  sedeNombre?: string,
  now: Date = new Date(),
): string {
  const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const prefix = sedeRefCodePrefix(sedeNombre);
  const tz = sedeNombre
    ? (SEDE_TIMEZONES[sedeNombre] ?? "Asia/Makassar")
    : "Asia/Makassar";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const month = parts.find((p) => p.type === "month")?.value ?? "00";
  const day = parts.find((p) => p.type === "day")?.value ?? "00";
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(Math.random() * ALPHABET.length);
    suffix += ALPHABET[idx];
  }
  return `DPM-${prefix}-${month}${day}-${suffix}`;
}

/**
 * Validate that an externally-stored ref_code still matches our shape.
 * Accepts:
 *   - `DPM-XXXXXX` (legacy, pre-2026-05-07)
 *   - `DPM-<2-letter sede prefix>-MMDD-XXXXXX` (current; matches any
 *     existing or future sede prefix without code changes)
 *
 * The 2-letter regex broadening means adding a new sede to
 * `SEDE_REFCODE_PREFIXES` doesn't require updating the validator.
 */
export function isValidRefCode(code: string): boolean {
  const ALPHA = "[A-HJKMNPQRSTUVWXYZ23456789]";
  return (
    new RegExp(`^DPM-[A-Z]{2}-\\d{4}-${ALPHA}{6}$`).test(code) ||
    new RegExp(`^DPM-${ALPHA}{6}$`).test(code)
  );
}
