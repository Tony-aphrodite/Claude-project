// ============================================================================
// AI tool — validar_cupo_grupo
//
// Spec: reference/roster-engine-spec-2026-06-24.md §6.1
// Arch: docs/roster-engine-architecture.md §5
//
// This tool is what the AI calls BEFORE solicitar_deposito when the
// intelligent roster engine is the source of truth. It simulates the
// engine across every day the program occupies and tells the AI
// whether the sale fits — or, if not, exactly which day fails and
// why so the AI can offer an alternative.
//
// Activation policy:
//   - This tool is DEFINED here and READY to wire into the AI's tool
//     surface, but it is NOT yet registered in process-message.ts.
//     Wiring lands in Phase 3.5 after Miguel backfills `instructors`
//     and `instructor_availability`. Without that data every call
//     returns no_instructor → all sales blocked, which is the wrong
//     default.
//   - Once data is in, Phase 3.5 adds the tool to the per-sede tool
//     surface (KT first, per spec §9 shadow-mode rollout).
// ============================================================================

import type { ValidarCupoGrupoInput, ValidarCupoGrupoResult } from "@dpm/shared";

import {
  simulateRosterFit,
  type SimulationVerdict,
} from "../services/roster-simulation.js";

interface Context {
  sedeNombre: string;
}

/**
 * Tool handler. Takes the AI's input (already validated against the
 * zod schema by the dispatch layer) plus a `sedeNombre` from the
 * tool-call context, runs the multi-day simulation, and returns a
 * customer-facing structured result.
 *
 * The handler is async (DB I/O via `simulateRosterFit`) but does NOT
 * mutate state. Safe to call repeatedly during the AI's reasoning
 * loop.
 */
export async function validarCupoGrupoHandler(
  input: ValidarCupoGrupoInput,
  ctx: Context,
): Promise<ValidarCupoGrupoResult> {
  const verdict = await simulateRosterFit({
    sedeId: input.sede_id,
    sedeName: ctx.sedeNombre,
    programa: input.programa,
    startDate: input.start_date,
    candidate: {
      nombre: input.candidato.nombre,
      nivelCertificacion: input.candidato.nivel_certificacion,
      pax: input.candidato.pax,
      acceptsCap: input.candidato.acepta_capar ?? false,
    },
    fundiveSlot: input.fundive_slot,
  });

  return verdictToResult(verdict);
}

/**
 * Map the internal SimulationVerdict to the AI-facing result shape.
 * Keeps the AI's view stable even if internal types evolve.
 */
function verdictToResult(verdict: SimulationVerdict): ValidarCupoGrupoResult {
  if (!verdict.programScheduled) {
    return {
      ok: false,
      reason: "program_not_scheduled",
      failing_days: [],
      message:
        "Este programa no tiene un patrón de roster definido — el equipo de la sede arma la disponibilidad manualmente. Pedile el contacto del cliente y derivá a la oficina.",
    };
  }

  if (verdict.ok) {
    return {
      ok: true,
      days: verdict.allDays.map((d) => ({
        fecha: d.fecha,
        slot: d.slot,
        activity: d.activity,
      })),
    };
  }

  // Determine the overall failure reason. If every failing day fails
  // for the same reason, surface that. Otherwise return "mixed".
  const reasons = new Set(verdict.failingDays.map((d) => d.reason));
  let reason: "no_instructor" | "no_boat_capacity" | "mixed_failures";
  if (reasons.size === 1) {
    // The set has exactly one element, and we know it's not null
    // because we only collected failing days.
    const sole = [...reasons][0];
    reason = sole === "no_instructor" ? "no_instructor" : "no_boat_capacity";
  } else {
    reason = "mixed_failures";
  }

  return {
    ok: false,
    reason,
    failing_days: verdict.failingDays.map((d) => ({
      fecha: d.fecha,
      slot: d.slot,
      activity: d.activity,
      reason: (d.reason === "no_instructor"
        ? "no_instructor"
        : "no_boat_capacity") as "no_instructor" | "no_boat_capacity",
    })),
    message: buildHumanMessage(verdict, reason),
  };
}

/**
 * Compose a Spanish summary the AI can quote to the customer. Tone
 * matches the WhatsApp-conversational style the rest of the prompts
 * use. The AI is encouraged to rewrite for fit; this is a fallback
 * the AI can pass through verbatim if it can't think of a better way.
 */
function buildHumanMessage(
  verdict: SimulationVerdict,
  reason: "no_instructor" | "no_boat_capacity" | "mixed_failures",
): string {
  const days = verdict.failingDays
    .map((d) => `${d.fecha} ${d.slot}`)
    .join(", ");
  if (reason === "no_instructor") {
    return `Para esas fechas no tenemos instructor disponible (días: ${days}). Necesito ofrecerte otro día.`;
  }
  if (reason === "no_boat_capacity") {
    return `Para esas fechas el barco ya está lleno (días: ${days}). Necesito ofrecerte otro día.`;
  }
  return `Hay varios días que no encajan (${days}) — por capacidad de barco y de instructor mezcladas. Te propongo revisar otra fecha.`;
}

/**
 * Anthropic tool schema. Re-exported from here so the per-sede tool
 * surface in process-message.ts has a single import path for the new
 * tool. Phase 3.5 wires this into the relevant sedes.
 */
export const validarCupoGrupoToolDefinition = {
  name: "validar_cupo_grupo",
  description:
    "Validate whether a candidate diver can be added to the roster across all days their program occupies, considering both instructor availability (primary constraint) and boat capacity (secondary). Returns ok=true with the day-by-day footprint when the sale fits, or ok=false with the failing days + reason when it doesn't. Call this BEFORE solicitar_deposito when the sede has the intelligent roster engine enabled.",
  input_schema: {
    type: "object" as const,
    properties: {
      sede_id: { type: "string", format: "uuid" },
      programa: { type: "string" },
      start_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      candidato: {
        type: "object",
        properties: {
          nombre: { type: "string" },
          nivel_certificacion: {
            type: "string",
            enum: ["BEG", "OW", "AA", "RES", "DM", "INS"],
          },
          pax: { type: "integer", minimum: 1, maximum: 20 },
          acepta_capar: { type: "boolean" },
        },
        required: ["nombre", "nivel_certificacion", "pax"],
      },
      fundive_slot: { type: "string", enum: ["AM", "PM"] },
    },
    required: ["sede_id", "programa", "start_date", "candidato"],
  },
} as const;
