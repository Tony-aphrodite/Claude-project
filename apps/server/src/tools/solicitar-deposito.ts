// ============================================================================
// tool_use definition for `solicitar_deposito`. Claude invokes it once it
// detects clear booking intent. The handler in process-message:
//   1. Reuses the existing reference code if this conversation already has
//      one in lead_metadata.ref_code (owner spec — never mint twice for the
//      same lead, even on currency change).
//   2. Otherwise generates a new DPM-XXXXXX code (6 chars; ambiguous chars
//      0/O/1/I/L excluded so a sede agent reading it off a Wise transfer
//      cannot mis-key it).
//   3. Advances lead_stage to "deposit_pending" and snapshots the rendered
//      instructions onto lead_metadata for audit.
//   4. Returns sede-specific instructions in the client's language.
//
// Currency matrix (owner-confirmed): EUR / GBP / AUD / USD all 40 units;
// IDR is 700,000. Stripe is NOT enabled in Gili Trawangan — every deposit
// requires human verification from the panel.
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
    "Solicita el depósito obligatorio para confirmar la reserva. " +
    "USAR SOLO cuando el cliente manifiesta intención clara de reservar (no para sondeos). " +
    "El depósito es OBLIGATORIO, NO REEMBOLSABLE, y se descuenta del precio total. " +
    "Monto: 40 EUR / 40 GBP / 40 AUD / 40 USD por persona, o 700,000 IDR (solo con cuenta bancaria local indonesia). " +
    "La herramienta devuelve un código de referencia único y las instrucciones de pago; " +
    "tu respuesta debe incluir el código y el monto literalmente y en mensaje SEPARADO " +
    "(precio en mensaje 1, datos bancarios en mensaje 2, pregunta de cierre en mensaje 3). " +
    "Si la herramienta indica reused_existing=true, NO menciones que el código fue 'reusado' " +
    "— simplemente repetí los datos con naturalidad.",
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
        enum: ["EUR", "GBP", "AUD", "USD", "IDR"],
        description:
          "Moneda en la que el cliente prefiere pagar el depósito. " +
          "IDR SOLO si el cliente tiene cuenta bancaria local indonesia.",
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

/** Validate that an externally-stored ref_code still matches our shape. */
export function isValidRefCode(code: string): boolean {
  return /^DPM-[A-HJKMNPQRSTUVWXYZ23456789]{6}$/.test(code);
}
