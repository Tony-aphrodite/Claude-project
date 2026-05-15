// ============================================================================
// tool_use definition for `send_product_card` — Colomba's product-card sender.
//
// Distinct from `enviar_catalogo` (John/GT): Colomba addresses Meta WhatsApp
// Business catalog products by their raw retailer id (e.g. "eb8phdq04n") and
// may send 1 OR 2 cards per turn for side-by-side comparison. Spec lives at
// 15-information/SPEC_send_product_card.md (v1.1, 2026-05-15).
//
// Defense in depth: the prompt embeds the allowlist, but the server also
// enforces it via ALLOWED_PRODUCT_IDS_GA below. A hallucinated id never
// reaches Meta — handler returns reason='not_in_allowlist' and Colomba is
// instructed (in the prompt) to fall back to a textual description.
// ============================================================================

import type Anthropic from "@anthropic-ai/sdk";

import {
  sendProductCardInputSchema,
  type SendProductCardInput,
  type SendProductCardResult,
} from "@dpm/shared";

// Allowlist of 12 Meta product retailer IDs confirmed for Gili Air as of
// 2026-05-15 (per Miguel's SPEC v1.1). 7 additional IDs are pending DPM
// identification — add them here and bump the prompt version when ready.
export const ALLOWED_PRODUCT_IDS_GA = new Set<string>([
  // EN cards
  "eb8phdq04n", // Try Scuba Diving EN
  "dh8865lxuc", // Refresh + 2 Dives EN
  "v50zmrpgyy", // Open Water 30 EN
  "9296zkgo1w", // Advanced Adventurer EN  (paired with prompt §puente-nocturno)
  "sij8s9jaot", // Fun Dives 2 Dives EN
  "bvsdwsstj7", // Nitrox Specialty EN
  // ES cards
  "jvp0z08jy7", // Bautizo de Buceo ES
  "hppagembqp", // Refresh + 2 inmersiones ES
  "v1u97orycb", // Open Water 30 ES
  "mvse75migl", // Curso Avanzado ES        (paired with prompt §puente-nocturno)
  "qhra0pdpvr", // Fun Dives 2 Inmersiones ES
  "uqgwx0sd9n", // Deep Adventure + Fun Dive ES
]);

export const sendProductCardTool: Anthropic.Tool = {
  name: "send_product_card",
  description:
    "Envía 1 o 2 tarjetas interactivas del catálogo Meta de WhatsApp " +
    "Business al cliente (Gili Air). USAR cuando el cliente pregunta por " +
    "un programa específico (Try Scuba, OW30, Advanced, Fun Dives, Refresh, " +
    "Nitrox, etc.) — la tarjeta muestra foto, precio y descripción nativa, " +
    "convierte mucho mejor que texto. Acompañá SIEMPRE con un texto corto " +
    "que cierre con pregunta (NO repitas precio/duración ya visibles en la " +
    "tarjeta). Si la herramienta devuelve reason='not_in_allowlist' o " +
    "'channel_not_supported', degradá a texto desde KB-07.",
  input_schema: {
    type: "object",
    properties: {
      sede_id: {
        type: "string",
        description: "UUID de la sede (proporcionado en el bloque dinámico)",
      },
      card_id: {
        description:
          "Product retailer id de Meta (string) o array de 1-2 ids para " +
          "comparación. Los ids válidos viven en KB-07 y deben estar en " +
          "ALLOWED_PRODUCT_IDS_GA del server.",
        oneOf: [
          { type: "string", minLength: 1 },
          {
            type: "array",
            items: { type: "string", minLength: 1 },
            minItems: 1,
            maxItems: 2,
          },
        ],
      },
    },
    required: ["sede_id", "card_id"],
  },
};

export type SendProductCardHandler = (
  input: SendProductCardInput,
) => Promise<SendProductCardResult>;

/** Validate Claude's tool input before dispatch. */
export function parseSendProductCardInput(raw: unknown): {
  ok: true;
  value: SendProductCardInput;
} | {
  ok: false;
  message: string;
} {
  const result = sendProductCardInputSchema.safeParse(raw);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    message: `tool_use input invalid: ${result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ")}`,
  };
}

/**
 * Normalise card_id to an array AND enforce the per-sede allowlist. Returns
 * either the validated list or a result object the handler can return
 * straight to Claude.
 *
 * Currently only Gili Air is supported (the only sede that uses this tool).
 * When/if Koh Tao or others get their own catalog allowlists, add them here.
 */
export function validateProductCardIds(input: SendProductCardInput):
  | { ok: true; ids: string[] }
  | (Extract<SendProductCardResult, { ok: false }>) {
  const raw = Array.isArray(input.card_id) ? input.card_id : [input.card_id];
  if (raw.length === 0) {
    return {
      ok: false,
      reason: "send_failed",
      message: "card_id list is empty",
    };
  }
  if (raw.length > 2) {
    return {
      ok: false,
      reason: "too_many_cards",
      message: `max 2 cards per turn, got ${raw.length}`,
      rejected: raw.slice(2),
    };
  }
  const rejected = raw.filter((id) => !ALLOWED_PRODUCT_IDS_GA.has(id));
  if (rejected.length > 0) {
    return {
      ok: false,
      reason: "not_in_allowlist",
      message: `${rejected.length}/${raw.length} ids not in ALLOWED_PRODUCT_IDS_GA: ${rejected.join(", ")}`,
      rejected,
    };
  }
  return { ok: true, ids: raw };
}
