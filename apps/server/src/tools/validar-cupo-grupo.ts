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

import type Anthropic from "@anthropic-ai/sdk";

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
 * Anthropic tool schema. Wired into anthropic.ts so it shows up in the
 * AI's `tools[]` array when the per-sede handler is registered.
 *
 * The description is written so the AI knows to call this BEFORE
 * `solicitar_deposito` — instructor availability is the primary
 * constraint, so we'd rather discover "no instructor" before the
 * deposit step than after.
 */
export const validarCupoGrupoTool: Anthropic.Tool = {
  name: "validar_cupo_grupo",
  description:
    "Verifica si un buceador candidato puede agregarse al roster en TODOS los días que ocupa su programa, considerando la disponibilidad de instructores (restricción primaria) y la capacidad del barco (secundaria). " +
    "USAR SIEMPRE antes de solicitar_deposito cuando esta tool esté disponible para tu sede. " +
    "Si ok=true devuelve el cronograma por día (fecha + slot + activity). " +
    "Si ok=false devuelve los días que no encajan + el motivo (no_instructor / no_boat_capacity / program_not_scheduled / mixed_failures). " +
    "Cuando un día falle por no_instructor, ofrecé otra fecha al cliente — no negocies el cupo. " +
    "Cuando reason=program_not_scheduled (Divemaster/Instructor/Specialty sin agendamiento), escalá a la oficina — no calcules disponibilidad.",
  input_schema: {
    type: "object",
    properties: {
      sede_id: {
        type: "string",
        description: "UUID de la sede (provisto en el bloque dinámico)",
      },
      programa: {
        type: "string",
        description: "Programa vendido (TryScuba / ScubaDiver / OW / OW30 / AOW / FunDive / DeepAdvFD / Refresh / RefreshAdv / ReactRight / etc.)",
      },
      start_date: {
        type: "string",
        description: "Fecha de inicio en formato YYYY-MM-DD",
      },
      candidato: {
        type: "object",
        description: "Datos del buceador a verificar",
        properties: {
          nombre: { type: "string", description: "Nombre del cliente" },
          nivel_certificacion: {
            type: "string",
            enum: ["BEG", "OW", "AA", "RES", "DM", "INS"],
            description: "Nivel de certificación. BEG = sin certificar (Try Scuba o futuro alumno OW)",
          },
          pax: {
            type: "integer",
            minimum: 1,
            maximum: 20,
            description: "Cantidad de personas (todas con el mismo nivel)",
          },
          acepta_capar: {
            type: "boolean",
            description: "Solo true cuando explícitamente preguntaste y el cliente AA aceptó bucear a 18m para juntarse con un grupo OW. Default false.",
          },
        },
        required: ["nombre", "nivel_certificacion", "pax"],
      },
      fundive_slot: {
        type: "string",
        enum: ["AM", "PM"],
        description: "Para FunDive / DeepAdvFD donde el cliente elige turno. Ignorado para programas con cronograma fijo.",
      },
    },
    required: ["sede_id", "programa", "start_date", "candidato"],
  },
};
