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

/**
 * Sede identifier prefix used in `DPM-<PREFIX>-MMDD-XXXXXX` reference
 * codes. Miguel feedback 2026-06-06: before this map, every code came
 * out tagged `GT` regardless of sede — Phi Phi bookings showed up in
 * Gili Trawangan's bucket and confused the office. The prefix lets a
 * human reading a Wise / bank transfer concept identify the sede
 * instantly.
 *
 * Defaults to `GT` only as a safety net when a sede name doesn't match
 * any known key (shouldn't happen — falls back to the legacy behavior).
 */
export const SEDE_REFCODE_PREFIXES: Record<string, string> = {
  "Koh Phi Phi": "PP",
  "Gili Trawangan": "GT",
  "Gili Air": "GA",
  "Koh Tao": "KT",
  "Nusa Penida": "NP",
};

export function sedeRefCodePrefix(sedeNombre: string | undefined): string {
  if (!sedeNombre) return "GT";
  return SEDE_REFCODE_PREFIXES[sedeNombre] ?? "GT";
}

/**
 * Sede-local timezone used to compute the MMDD slug. Codes generated at
 * 23:30 in Phi Phi must use that local day, not UTC. Falls back to
 * Asia/Makassar (Gili Trawangan) when sede unknown.
 */
const SEDE_TIMEZONES: Record<string, string> = {
  "Koh Phi Phi": "Asia/Bangkok",
  "Koh Tao": "Asia/Bangkok",
  "Gili Trawangan": "Asia/Makassar",
  "Gili Air": "Asia/Makassar",
  "Nusa Penida": "Asia/Makassar",
};

/**
 * Generate a reference code in the owner-specified format
 * `DPM-<SEDE_PREFIX>-MMDD-XXXXXX` (DPM_AI_LAUNCH doc, 2026-05-07,
 * updated 2026-06-06 to be per-sede):
 *   - `DPM-<PREFIX>` identifies the brand + sede (PP, GT, GA, KT, NP)
 *   - `MMDD` is the sede-local month/day so an operator scanning Wise
 *     transfers can quickly bucket by week
 *   - `XXXXXX` is 6 random alphanumeric chars (ambiguous chars 0/O/1/I/L
 *     excluded) so the customer can't mis-key it
 *
 * The MMDD prefix is computed in the sede's local timezone so the bucket
 * matches the operator's wall clock. Phi Phi / Koh Tao = Asia/Bangkok,
 * Gili Trawangan / Gili Air / Nusa Penida = Asia/Makassar.
 *
 * @param sedeNombre Sede display name from the `sedes` table. When omitted,
 *                   defaults to the legacy "GT" prefix + Asia/Makassar so
 *                   pre-2026-06-06 callers still work.
 */
export function generateRefCode(
  sedeNombre?: string,
  now: Date = new Date(),
): string {
  const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const prefix = sedeRefCodePrefix(sedeNombre);
  const tz = sedeNombre
    ? (SEDE_TIMEZONES[sedeNombre] ?? "Asia/Makassar")
    : "Asia/Makassar";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const month = parts.find((p) => p.type === "month")?.value ?? "00";
  const day = parts.find((p) => p.type === "day")?.value ?? "00";
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(Math.random() * ALPHABET.length);
    suffix += ALPHABET[idx];
  }
  return `DPM-${prefix}-${month}${day}-${suffix}`;
}

/**
 * Validate that an externally-stored ref_code still matches our shape.
 * Accepts:
 *   - `DPM-XXXXXX` (legacy, pre-2026-05-07)
 *   - `DPM-<2-letter sede prefix>-MMDD-XXXXXX` (current; matches any
 *     existing or future sede prefix without code changes)
 *
 * The 2-letter regex broadening means adding a new sede to
 * `SEDE_REFCODE_PREFIXES` doesn't require updating the validator.
 */
export function isValidRefCode(code: string): boolean {
  const ALPHA = "[A-HJKMNPQRSTUVWXYZ23456789]";
  return (
    new RegExp(`^DPM-[A-Z]{2}-\\d{4}-${ALPHA}{6}$`).test(code) ||
    new RegExp(`^DPM-${ALPHA}{6}$`).test(code)
  );
}
