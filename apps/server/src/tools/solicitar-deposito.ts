// ============================================================================
// tool_use definition for `solicitar_deposito`. Claude invokes it once it
// detects clear booking intent. The handler:
//   1. Generates a unique reference code (DPM-XXXXXX, 6-char alnum) so the
//      sede team can match the inbound transfer in Wise/Revolut/bank/cash.
//   2. Advances lead_stage to "deposit_pending" and snapshots the payment
//      instructions onto lead_metadata for audit.
//   3. Returns sede-specific instructions in the client's language so Claude
//      can fold them into the next outbound message.
//
// Payment automation differs by sede (owner-confirmed 2026-04-30):
//   • Koh Tao: Stripe + Wise + Revolut + Thai bank   (Stripe → automatic)
//   • Koh Phi Phi: Wise + Revolut + Thai bank        (manual verification)
//   • Gili Air / Gili Trawangan / Nusa Penida: Wise + Revolut + Indonesian
//     bank (cash IDR or transfer; Stripe NO disponible en Indonesia)
//
// The actual instruction copy is owner-authored and lives in
// `services/deposit-instructions.ts`. The tool here is a thin orchestrator —
// no business copy is hard-coded into the schema or the prompt.
// ============================================================================

import type Anthropic from "@anthropic-ai/sdk";

import {
  solicitarDepositoInputSchema,
  type SolicitarDepositoInput,
  type SolicitarDepositoResult,
} from "@dpm/shared";

export const solicitarDepositoTool: Anthropic.Tool = {
  name: "solicitar_deposito",
  description:
    "Solicita el depósito obligatorio de 40 unidades de la moneda local del cliente para confirmar la reserva. " +
    "USAR SOLO cuando el cliente manifiesta intención clara de reservar (no para sondeos ni preguntas exploratorias). " +
    "El depósito es OBLIGATORIO para confirmar la reserva, NO REEMBOLSABLE, y se descuenta del precio total del curso. " +
    "La herramienta devuelve un código de referencia único y las instrucciones de pago de la sede; tu respuesta debe " +
    "incluir el código de referencia textual y el monto en la moneda del cliente. NO inventes códigos ni instrucciones " +
    "alternativas; usá literalmente lo que devuelve la herramienta.",
  input_schema: {
    type: "object",
    properties: {
      sede_id: {
        type: "string",
        description: "UUID de la sede (proporcionado en el bloque dinámico)",
      },
      cliente_idioma: {
        type: "string",
        description:
          "Código ISO del idioma del cliente (es, en, it, fr, de, pt, nl, ru). " +
          "Las instrucciones se devuelven en ese idioma cuando hay traducción disponible.",
      },
      moneda_cliente: {
        type: "string",
        enum: ["EUR", "USD", "GBP", "THB", "IDR"],
        description:
          "Moneda en la que el cliente prefiere pagar el depósito. Wise/Revolut convierten automáticamente.",
      },
    },
    required: ["sede_id", "cliente_idioma", "moneda_cliente"],
  },
};

export type SolicitarDepositoHandler = (
  input: SolicitarDepositoInput,
) => Promise<SolicitarDepositoResult>;

/** Validate Claude's tool input before dispatch. */
export function parseSolicitarDepositoInput(raw: unknown): {
  ok: true;
  value: SolicitarDepositoInput;
} | {
  ok: false;
  message: string;
} {
  const result = solicitarDepositoInputSchema.safeParse(raw);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    message: `tool_use input invalid: ${result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ")}`,
  };
}

/**
 * Generate a 6-char alphanumeric reference code with a `DPM-` prefix.
 * Excludes ambiguous chars (0/O, 1/I/L) so a sede agent reading it off a
 * Wise transfer can match it without errors.
 */
export function generateRefCode(): string {
  const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(Math.random() * ALPHABET.length);
    code += ALPHABET[idx];
  }
  return `DPM-${code}`;
}
