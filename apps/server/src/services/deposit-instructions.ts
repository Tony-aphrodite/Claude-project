// ============================================================================
// Deposit payment instruction templates per sede + currency + language.
//
// PLACEHOLDER COPY: the live text is owner-authored (Miguel) and arrives as
// part of the Pieza 1 launch checklist. The structure here mirrors what the
// owner's payments matrix demands:
//
//                Stripe   Wise   Revolut   Local Bank
//   Koh Tao        ✓       ✓      ✓        Thai (THB)
//   Koh Phi Phi            ✓      ✓        Thai (THB)
//   Gili Air               ✓      ✓        Indonesian (IDR cash/transfer)
//   Gili Trawangan         ✓      ✓        Indonesian
//   Nusa Penida            ✓      ✓        Indonesian
//
// Stripe NO opera en Indonesia, by owner statement.
//
// Until Miguel sends the production copy, these placeholders are good enough
// for end-to-end testing: they reference the sede, the currency, the
// reference code, and explicitly say "(texto provisional pendiente de copy
// final)" so nobody confuses placeholder for production text.
// ============================================================================

import type { DepositCurrency } from "@dpm/shared";
import { DEPOSIT_AMOUNT } from "@dpm/shared";

export type SedeKey =
  | "Koh Tao"
  | "Koh Phi Phi"
  | "Gili Trawangan"
  | "Gili Air"
  | "Nusa Penida";

export type PaymentChannel = "stripe" | "wise" | "revolut" | "local_bank" | "cash";

const SEDE_CHANNELS: Record<SedeKey, PaymentChannel[]> = {
  "Koh Tao": ["stripe", "wise", "revolut", "local_bank"],
  "Koh Phi Phi": ["wise", "revolut", "local_bank"],
  "Gili Trawangan": ["wise", "revolut", "local_bank", "cash"],
  "Gili Air": ["wise", "revolut", "local_bank", "cash"],
  "Nusa Penida": ["wise", "revolut", "local_bank", "cash"],
};

/** Whether this sede has at least one channel that confirms via webhook. */
export function sedeHasAutomaticGateway(sede: SedeKey): boolean {
  return SEDE_CHANNELS[sede].includes("stripe");
}

/** Whether this sede operates in Indonesia (different bank account guidance). */
function isIndonesianSede(sede: SedeKey): boolean {
  return (
    sede === "Gili Trawangan" || sede === "Gili Air" || sede === "Nusa Penida"
  );
}

export type BuildInstructionsInput = {
  sedeNombre: string;
  language: string;
  currency: DepositCurrency;
  refCode: string;
};

/**
 * Render the instruction block. We default to Spanish; English used when the
 * detected language starts with "en". Other languages fall back to English
 * (Miguel will provide proper translations later).
 */
export function buildPaymentInstructions(input: BuildInstructionsInput): string {
  const sede = input.sedeNombre as SedeKey;
  const channels = SEDE_CHANNELS[sede] ?? ["wise", "revolut"];
  const isEnglish = input.language.toLowerCase().startsWith("en");

  const lines: string[] = [];
  if (isEnglish) {
    lines.push(`To confirm your booking, please send the deposit of ${DEPOSIT_AMOUNT} ${input.currency} (non-refundable, deducted from total) using ONE of the options below:`);
  } else {
    lines.push(`Para confirmar tu reserva, envía el depósito de ${DEPOSIT_AMOUNT} ${input.currency} (no reembolsable, se descuenta del total) usando UNA de estas opciones:`);
  }

  for (const ch of channels) {
    lines.push(renderChannel(ch, sede, isEnglish));
  }

  if (isEnglish) {
    lines.push(`IMPORTANT: include the reference code in the transfer concept so we can match the payment to your booking: ${input.refCode}`);
    lines.push(`(Provisional text — final copy pending owner sign-off)`);
  } else {
    lines.push(`IMPORTANTE: incluí este código de referencia en el concepto de la transferencia para que podamos identificar tu pago: ${input.refCode}`);
    lines.push(`(Texto provisional — copy definitivo pendiente del cliente)`);
  }

  return lines.join("\n");
}

function renderChannel(ch: PaymentChannel, sede: SedeKey, isEnglish: boolean): string {
  switch (ch) {
    case "stripe":
      return isEnglish
        ? `• Stripe: payment link will be sent in a follow-up message (automatic confirmation)`
        : `• Stripe: te enviamos el link de pago en un mensaje aparte (confirmación automática)`;
    case "wise":
      return isEnglish
        ? `• Wise: bank details for ${sede} will be provided on request`
        : `• Wise: datos bancarios de ${sede} a pedido`;
    case "revolut":
      return isEnglish
        ? `• Revolut: account details for ${sede} on request`
        : `• Revolut: datos de la cuenta de ${sede} a pedido`;
    case "local_bank":
      if (isIndonesianSede(sede)) {
        return isEnglish
          ? `• Indonesian bank transfer (IDR equivalent): account details on request`
          : `• Transferencia bancaria local Indonesia (equivalente IDR): datos a pedido`;
      }
      return isEnglish
        ? `• Thai bank transfer (THB equivalent): account details on request`
        : `• Transferencia bancaria local Tailandia (equivalente THB): datos a pedido`;
    case "cash":
      return isEnglish
        ? `• Cash IDR upon arrival at ${sede} (only for clients arriving within 48 hours)`
        : `• Efectivo IDR al llegar a ${sede} (solo para clientes que llegan en menos de 48 horas)`;
  }
}
