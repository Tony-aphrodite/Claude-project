// ============================================================================
// Deposit-confirmation handoff message. Owner spec
// information/INSTRUCCIONES_PAGO_GiliTrawangansteve.md §7
// (mensaje-deposito-confirmado).
//
// Triggered when an operator clicks "Confirm" in the panel — the panel server
// action calls this helper to render the message that goes back to the
// customer through Respond.io. We render the program + first dive date when
// lead_metadata captured them via consultar_disponibilidad; otherwise we
// drop those references so we never emit a literal "[PROGRAMA]" / "[FECHA]"
// string in front of a customer.
// ============================================================================

const SCHOOL_MAPS_URL = "https://maps.app.goo.gl/9e7PLpg1WU8b8S9R9";

export type HandoffContext = {
  programa: string | null;
  fecha: string | null;
};

export function buildHandoffText(
  language: string | null | undefined,
  ctx: HandoffContext,
): string {
  const lang = (language ?? "es").slice(0, 2).toLowerCase();
  const isEn = lang === "en";

  const lead =
    ctx.programa && ctx.fecha
      ? isEn
        ? `Deposit confirmed ✅ Your spot is locked in for ${ctx.programa} on ${ctx.fecha}.`
        : `¡Depósito confirmado ✅! Tu lugar está reservado para ${ctx.programa} el ${ctx.fecha}.`
      : isEn
        ? "Deposit confirmed ✅ Your spot is locked in."
        : "¡Depósito confirmado ✅! Tu lugar está reservado.";

  if (isEn) {
    return [
      lead,
      "",
      "To finish your booking, please share:",
      "• Full name (as on your ID)",
      "• T-shirt size (XS to 4XL)",
      "• European shoe size",
      "",
      `Also, please drop by the school the day before your program between 8am and 6pm for registration. Here's the location: ${SCHOOL_MAPS_URL}`,
      "",
      "My colleague from Gili Trawangan will message you shortly to coordinate the rest 🤿",
    ].join("\n");
  }

  return [
    lead,
    "",
    "Para terminar la reserva, mandame por favor:",
    "• Nombre completo (como figura en tu documento)",
    "• Talla de camiseta (XS a 4XL)",
    "• Talla de calzado europeo",
    "",
    `Además, pasá por la escuela el día anterior a tu programa entre 8am y 6pm para el registro. La ubicación: ${SCHOOL_MAPS_URL}`,
    "",
    "Mi compañero/a de Gili Trawangan te escribe en breve para coordinar el resto 🤿",
  ].join("\n");
}
