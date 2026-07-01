// ============================================================================
// AI → roster_divers writer (Miguel 2026-06-30 — Q3 follow-up).
//
// The original roster architecture had two parallel tables:
//   • roster_bookings → AI-driven, multi-pax per row, group-level grain.
//   • roster_divers   → walk-in only, one row per diver, per-day grain.
//
// On the engine page (/roster/engine), the operator sees per-instructor
// cards built from roster_divers. AI-sold customers contributed to
// capacity (via §7 consolidated SUM) but were invisible in the per-
// instructor view — Miguel could not move them, see who was where, or
// audit which name belonged to which slot.
//
// Miguel's request (2026-06-30):
//   "si entra una reserva desde la ai si descuenta si se escribe y si
//    hay algun lugar para ver a quien se lo asigno y que dias asi si
//    necesito mover al alumno o cambiar al instructor puedo hacerlo."
//
// Fix: after `confirmBooking()` succeeds for an AI sale, this module
// writes one `roster_divers` row PER (pax × day-in-footprint). Each
// row carries the per-pax ref code from `leadMetadata.ref_codes_by_pax`
// (one code per person, per Miguel 2026-06-09 rule), the engine slot
// (POOL_AM / POOL_PM / NIGHT / AM / PM), and the activity for that
// day. `origen='AI'` distinguishes them from walk-ins; the engine
// page treats both uniformly for grouping / reassign / delete.
//
// Idempotency: skip rows that already exist for the same
// `(codigo_buceador, fecha, slot)` triple. Re-running this writer
// (e.g. OCR retry) is a no-op.
// ============================================================================

import { and, eq } from "drizzle-orm";

import {
  getDb,
  rosterDivers,
  type RosterDiver,
} from "@dpm/db";
import {
  programaToActivityFootprint,
  type ActivityDetail,
  type AvailabilityProgram,
  type NivelCertificacion,
  type SlotKey,
} from "@dpm/shared";

import { getLogger } from "../logger.js";

/**
 * Default depth ceiling per activity. Mirrors the panel walk-in helper —
 * if we drift between the two, the engine packing reads inconsistent
 * depths. Kept short and explicit; new activities should be added here
 * AND in `apps/panel/src/app/actions/roster-engine.ts` (same logic).
 */
function defaultDepthForActivity(activity: string, nivel: string): number {
  switch (activity) {
    case "BD_CONFINADA":
    case "OW1":
    case "REF_FASE1":
      return 5;
    case "BD_BARCO":
    case "OW2":
    case "SCUBA_DIVER":     // Steve 2026-07-01
      return 12;
    case "OW3":
    case "BD_TO_OW":         // Steve 2026-07-01
    case "SD_TO_OW":         // Steve 2026-07-01
      return 18;
    case "FD":
    case "REF_FASE2":
      return nivel === "OW" || nivel === "BEG" ? 18 : 30;
    case "AA":
    case "AA2":
    case "ADV":
      return 30;
    case "SP":
      return 30;
    case "RES":
      return 18;
    default:
      return 18;
  }
}

/**
 * Default `nivel_certificacion` for the divers an AI sale produces.
 * The AI doesn't capture per-pax certification yet (Miguel rule: ref
 * code per pax, single shared name/level metadata for now). We pick:
 *   - 'BEG' (sin cert) for TryScuba / ScubaDiver / Refresh / Open Water
 *     family — those programs accept beginners.
 *   - 'OW' for Advanced / Fun Dive / Specialty / Refresh-Advanced —
 *     those gate on having a certification, so OW is the safe floor.
 *   - 'AA' (Advanced) for Rescue / DMT — those gate on Advanced.
 *
 * Operator can rename + adjust per-diver via the panel walk-in edit
 * form once the rows land. Today this is a placeholder so the engine
 * has something to derive group_of_activity from.
 */
function deriveNivel(programa: string): NivelCertificacion {
  const p = programa.toUpperCase();
  if (p.includes("DM") || p.includes("RESCUE")) return "AA";
  if (
    p.includes("AOW") ||
    p.includes("ADVANCED") ||
    p.includes("FUNDIVE") ||
    p.includes("REFRESH") ||
    p.includes("SPECIALTY") ||
    p.includes("DEEP") ||
    p.includes("NITROX")
  ) {
    return "OW";
  }
  return "BEG";
}

/**
 * Default name for an AI-sold diver before the operator renames.
 * Format: "Cliente N · DPM-XX-…-XXXXXX". The trailing 6 chars of the
 * ref code keep the row identifiable even if multiple "Cliente 1"
 * exist on the same day.
 */
function defaultDiverName(paxIndex: number, codigo: string): string {
  const shortCode = codigo.slice(-6);
  return `Cliente ${paxIndex + 1} (${shortCode})`;
}

export type AiRosterDiverWriteResult = {
  inserted: number;
  skipped: number;
  rows: RosterDiver[];
};

/**
 * Write per-pax × per-day roster_divers rows for an AI sale.
 *
 * Call this AFTER all `confirmBooking()` calls for the booking have
 * succeeded. We don't write divers for failed bookings — the operator
 * would see ghost rows pointing at nothing.
 *
 * The footprint is computed from (programa, startDate, fundiveSlot) —
 * same source the engine uses, so the slot values match exactly what
 * `/roster/engine` reads.
 */
export async function writeAiRosterDivers(input: {
  sedeId: string;
  conversacionId: string;
  programa: AvailabilityProgram | string;
  startDate: string;
  pax: number;
  refCodesByPax: string[];
  fundiveSlot?: SlotKey;
  /** Optional SP/ADV subtype — passed through to activityDetail. */
  detail?: ActivityDetail;
}): Promise<AiRosterDiverWriteResult> {
  const log = getLogger();
  const {
    sedeId,
    conversacionId,
    programa,
    startDate,
    pax,
    refCodesByPax,
    fundiveSlot,
    detail,
  } = input;

  // Sanity: per-pax codes must match pax count. Mismatch means the
  // upstream metadata is incoherent — abort rather than guessing.
  if (refCodesByPax.length !== pax) {
    log.warn(
      {
        conversacionId,
        pax,
        refCodesByPaxLength: refCodesByPax.length,
      },
      "writeAiRosterDivers: pax / refCodesByPax mismatch — skipping",
    );
    return { inserted: 0, skipped: 0, rows: [] };
  }

  const footprint = programaToActivityFootprint({
    programa,
    startDate,
    nivel: deriveNivel(programa),
    ...(fundiveSlot !== undefined ? { fundiveSlot } : {}),
    ...(detail !== undefined ? { detail } : {}),
  });

  if (!footprint || footprint.length === 0) {
    log.info(
      { conversacionId, programa },
      "writeAiRosterDivers: program has no schedule footprint — skipping",
    );
    return { inserted: 0, skipped: 0, rows: [] };
  }

  const nivel = deriveNivel(programa);
  const db = getDb();
  const inserted: RosterDiver[] = [];
  let skipped = 0;

  for (let paxIndex = 0; paxIndex < pax; paxIndex++) {
    const codigo = refCodesByPax[paxIndex];
    if (!codigo) {
      log.warn(
        { conversacionId, paxIndex },
        "writeAiRosterDivers: missing ref code for pax — skipping this diver",
      );
      continue;
    }

    for (const entry of footprint) {
      // Idempotency: skip if a row for this (codigo, fecha, slot) already
      // exists. The natural key is unique enough — a single diver has
      // one row per fecha+slot regardless of how many times the writer
      // runs (OCR retry, re-process, etc.).
      const existing = await db
        .select({ id: rosterDivers.id })
        .from(rosterDivers)
        .where(
          and(
            eq(rosterDivers.codigoBuceador, codigo),
            eq(rosterDivers.fecha, entry.fecha),
            eq(rosterDivers.slot, entry.slot),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        skipped++;
        continue;
      }

      const [row] = await db
        .insert(rosterDivers)
        .values({
          sedeId,
          fecha: entry.fecha,
          slot: entry.slot,
          codigoBuceador: codigo,
          nombre: defaultDiverName(paxIndex, codigo),
          nivelCertificacion: nivel,
          activity: entry.activity,
          activityDetail: entry.activityDetail ?? null,
          perfilProfundidad: defaultDepthForActivity(entry.activity, nivel),
          acceptsCap: false,
          origen: "AI",
          estadoPago: "deposit_paid",
          conversacionId,
        })
        .returning();
      if (row) inserted.push(row);
    }
  }

  log.info(
    {
      sedeId,
      conversacionId,
      programa,
      pax,
      footprintDays: footprint.length,
      insertedRows: inserted.length,
      skippedRows: skipped,
    },
    "writeAiRosterDivers: per-pax roster_divers rows written",
  );

  return { inserted: inserted.length, skipped, rows: inserted };
}
