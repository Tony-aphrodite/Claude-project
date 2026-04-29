// ============================================================================
// tool_use definition for `consultar_disponibilidad`. Claude is required to
// invoke this before quoting any availability — guide §10 anti-hallucination
// rule. The handler routes to Apps Script (with cache + 2s timeout) and
// returns a structured payload that Claude folds into its final answer.
// ============================================================================

import type Anthropic from "@anthropic-ai/sdk";

import {
  consultarDisponibilidadInputSchema,
  type ConsultarDisponibilidadInput,
  type ConsultarDisponibilidadResult,
} from "@dpm/shared";

export const consultarDisponibilidadTool: Anthropic.Tool = {
  name: "consultar_disponibilidad",
  description:
    "Consulta la disponibilidad real de plazas para un curso en una fecha específica en una sede. " +
    "USAR SIEMPRE antes de confirmar al cliente que hay plazas o de proponer fechas concretas. " +
    "Si la herramienta devuelve ok=false (timeout, no_configurado), responde al cliente que " +
    "lo verificarás con el equipo y NO inventes disponibilidad.",
  input_schema: {
    type: "object",
    properties: {
      sede_id: {
        type: "string",
        description: "UUID de la sede (proporcionado en el bloque dinámico)",
      },
      curso: {
        type: "string",
        enum: ["TryScuba", "OW", "AOW", "RescueDiver", "DMT", "FunDive", "NightDive", "Otro"],
        description: "Código del curso o actividad",
      },
      fecha: {
        type: "string",
        description: "Fecha objetivo en formato YYYY-MM-DD (zona de la sede)",
      },
      horario: {
        type: "string",
        enum: ["AM", "PM", "Night"],
        description: "Franja horaria (opcional, omitir si el cliente no especificó)",
      },
    },
    required: ["sede_id", "curso", "fecha"],
  },
};

export type ConsultarDisponibilidadHandler = (
  input: ConsultarDisponibilidadInput,
) => Promise<ConsultarDisponibilidadResult>;

/**
 * Validate Claude's tool input. Claude usually emits valid JSON but we never
 * trust it — a malformed call should produce a structured error tool_result
 * rather than throw and tear down the request.
 */
export function parseToolInput(raw: unknown): {
  ok: true;
  value: ConsultarDisponibilidadInput;
} | {
  ok: false;
  message: string;
} {
  const result = consultarDisponibilidadInputSchema.safeParse(raw);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    message: `tool_use input invalid: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
  };
}
