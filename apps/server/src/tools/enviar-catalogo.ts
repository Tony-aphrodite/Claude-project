// ============================================================================
// tool_use definition for `enviar_catalogo`. Claude invokes it when the
// customer is asking about a specific program (Try Scuba, Open Water,
// Refresh, Fun Dives, AOW, OW30) and we want to forward the native
// WhatsApp Business product card from the operator's Respond.io catalog
// before (or instead of) a long text answer. The visual card converts
// dramatically better than text and matches what Patrick / Giovanni
// already do today by hand.
//
// Behavior:
//   1. The handler in process-message.ts looks up the (sede, programa)
//      mapping in catalog-registry.
//   2. If the registry has an entry, respondIoClient.sendCatalogMessage
//      forwards it. The AI then follows up with a short contextual line
//      referencing the card (NOT repeating the same prices/duration the
//      card already shows — that would look robotic).
//   3. If no mapping is configured, the handler returns
//      reason="not_configured" and the AI degrades gracefully to a fully
//      textual answer. No customer-facing failure.
// ============================================================================

import type Anthropic from "@anthropic-ai/sdk";

import {
  enviarCatalogoInputSchema,
  type EnviarCatalogoInput,
  type EnviarCatalogoResult,
} from "@dpm/shared";

export const enviarCatalogoTool: Anthropic.Tool = {
  name: "enviar_catalogo",
  description:
    "Envía la tarjeta visual (producto WhatsApp Business) de un programa " +
    "específico desde el catálogo de la sede. USAR cuando el cliente pregunta " +
    "por un programa concreto (Try Scuba, Open Water, OW30, Advanced, Refresh, " +
    "Fun Dives, etc.) y vas a darle detalle de ese programa. " +
    "El catálogo ya incluye fotos, precios y descripción; tu respuesta de texto " +
    "DEBE ser corta y contextual (ej. 'Te paso el detalle 👆 — éste es el " +
    "indicado para tu caso'), NO repitas precios o duración ya visibles en la " +
    "carta. Si la herramienta devuelve reason='not_configured' significa que " +
    "esa sede aún no tiene la carta cargada — en ese caso, respondé todo en " +
    "texto sin mencionar la carta.",
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
          "OW",
          "OW30",
          "AOW",
          "Refresh",
          "FunDive",
          "RescueDiver",
          "DMT",
        ],
        description:
          "Clave canónica del programa cuyo catálogo enviar. " +
          "Mapeo: TryScuba=Try Scuba Diving / OW=Open Water Diver / " +
          "OW30=Open Water 30h intensivo / AOW=Advanced Open Water / " +
          "Refresh=Refresh + 2 fun dives / FunDive=Fun Dives / " +
          "RescueDiver=Rescue Diver / DMT=Divemaster Trainee.",
      },
    },
    required: ["sede_id", "programa"],
  },
};

export type EnviarCatalogoHandler = (
  input: EnviarCatalogoInput,
) => Promise<EnviarCatalogoResult>;

/** Validate Claude's tool input before dispatch. */
export function parseEnviarCatalogoInput(raw: unknown): {
  ok: true;
  value: EnviarCatalogoInput;
} | {
  ok: false;
  message: string;
} {
  const result = enviarCatalogoInputSchema.safeParse(raw);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    message: `tool_use input invalid: ${result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ")}`,
  };
}
