// ============================================================================
// tool_use definition for `consultar_disponibilidad`. Owner spec
// (Miguel, 2026-05-06):
//
//   AI calls consultar_disponibilidad(sede_id, programa, start_date, [fundive_slot])
//   and the SERVER expands the per-program day pattern (some days are
//   pool-only; only diving days actually need boat capacity), queries the
//   Apps Script for those days, applies the same-day time-of-day cutoff
//   logic, and returns a structured verdict the AI cannot misinterpret.
//
// The AI MUST call this tool before confirming any booking date. Even if
// the answer is "available", the AI must use the per-slot list returned
// here verbatim — never invent a slot that wasn't included.
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
    "Consulta la disponibilidad REAL de plazas para un programa concreto " +
    "comenzando en una fecha. La herramienta hace dos cosas internamente: " +
    "(1) calcula qué días/turnos del programa requieren capacidad de barco " +
    "(no todos los días la requieren — algunos son solo piscina), y " +
    "(2) cruza esos slots con la hora actual WITA: la regla de Lógica " +
    "Horaria descarta slots cuyo barco ya zarpó. " +
    "USAR SIEMPRE antes de confirmar fechas. " +
    "Si ok=false (timeout / no_configurado / programa no agendable) " +
    "respondé al cliente que lo verificás con el equipo y NO inventes plazas. " +
    "Si ok=true pero available=false, mostrá cuáles slots fallaron y proponé " +
    "alternativeStartDate cuando esté presente.",
  input_schema: {
    type: "object",
    properties: {
      sede_id: {
        type: "string",
        description: "UUID de la sede (proporcionado en el bloque dinámico)",
      },
      programa: {
        type: "string",
        enum: [
          "TryScuba",
          "ScubaDiver",
          "OW",
          "OW30",
          "AOW",
          "Refresh",
          "RefreshAdv",
          "FunDive",
          "DeepAdvFD",
          "DeepSpecialty",
          "RescueDiver",
          "NitroxSpecialty",
          "ReactRight",
        ],
        description:
          "Programa que el cliente quiere reservar. " +
          "TryScuba = Try Scuba Diving / Bautizo (no certificación, máx 12m). " +
          "ScubaDiver = Scuba Diver 1 día (certificación SSI, máx 12m). " +
          "OW = Open Water 18m (3 días). " +
          "OW30 = Open Water 30m (3 días, 6 inmersiones, premium). " +
          "AOW = Advanced Adventurer (2 días, 5 inmersiones, requiere OW). " +
          "Refresh = Refresh + 2 fun dives mismo día (requiere certificación previa). " +
          "RefreshAdv = combo Refresh + Advanced (2 días). " +
          "FunDive = un fun dive (cliente elige AM o PM). " +
          "DeepAdvFD = combo Deep Adventure + Fun Dive (cliente elige slot). " +
          "DeepSpecialty = Deep Specialty 40m (deriva a humano para cronograma). " +
          "RescueDiver = Rescue Diver (deriva a humano). " +
          "NitroxSpecialty = Nitrox specialty (deriva a humano). " +
          "ReactRight = React Right (1 clase de teoría, sin barco — cualquier fecha funciona).",
      },
      start_date: {
        type: "string",
        description:
          "Fecha de inicio en formato YYYY-MM-DD (zona horaria de la sede). " +
          "Para programas multi-día, es el día 1 del programa.",
      },
      fundive_slot: {
        type: "string",
        enum: ["AM", "PM"],
        description:
          "Solo aplica a FunDive y DeepAdvFD donde el cliente elige el turno. " +
          "Omitir para los demás programas (la herramienta deduce los slots).",
      },
    },
    required: ["sede_id", "programa", "start_date"],
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
