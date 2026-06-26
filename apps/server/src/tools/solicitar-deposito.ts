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
      pax: {
        type: "integer",
        minimum: 1,
        maximum: 20,
        description:
          "Cantidad de buzos en esta reserva. OBLIGATORIO — el servidor multiplica " +
          "el monto por persona por este valor para validar el comprobante de pago " +
          "vía OCR. Sin este valor un cliente con 2 buzos podría reutilizar un PDF " +
          "de 40 EUR (1 persona) y validar la reserva (incidente 2026-05-12).",
      },
      programas: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 10,
        description:
          "Lista de programas (keys de CatalogProgram) en esta reserva, UNO POR CADA " +
          "PROGRAMA distinto. Para grupos donde varias personas hacen el MISMO programa " +
          "no hace falta repetir el programa: pax acumula. Para grupos donde cada uno " +
          "hace algo distinto (ej: 'somos 3 — TryScuba, Refresh, AOW') pasar los 3. " +
          "Para 1 persona haciendo 1 programa, OMITIR este parámetro. El servidor " +
          "genera UN código de referencia POR programa (Miguel rule 2026-06-06) — " +
          "cada código corresponde a una fila en el master sheet.",
      },
    },
    required: ["sede_id", "cliente_idioma", "moneda_cliente", "pax"],
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

// Ref-code generator + validator moved to @dpm/shared on 2026-06-26
// so the panel's roster-engine walk-in form can mint codes in the
// SAME shape the AI uses. Re-exported here so existing callers
// (panel, follow-up scripts) that imported from this module keep
// working without changes.
export {
  generateRefCode,
  isValidRefCode,
  SEDE_REFCODE_PREFIXES,
  sedeRefCodePrefix,
} from "@dpm/shared";
