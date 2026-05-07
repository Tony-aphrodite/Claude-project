// ============================================================================
// 4-block prompt builder (guide §7).
//
// Anthropic allows up to 4 cache_control markers per request. We use exactly
// 3 markers (Bloques 1, 2, 3) to maximize cache hits. Bloque 4 is dynamic
// and intentionally NOT cached — putting cache_control on it would cause a
// cache write on every request and never hit.
//
// Token budget guardrails:
//   - Bloque 1 (system + playbook):     ~2,000   (cached, 1h TTL)
//   - Bloque 2 (sede KB):               15-40k   (cached, 1h TTL)
//   - Bloque 3 (sliding window):        ~3,000   (cached, 5m TTL)
//   - Bloque 4 (now + roster + msg):    ~1,500   (NOT cached)
//
// Output contract: Bloque 4 instructs the model to emit a structured JSON
// envelope { respuesta, fuentes } so we can store and audit which KB sections
// / history turns / system rules backed each answer. The text we send back
// to Respond.io is `respuesta`; `fuentes` lands in mensajes.fuentes.
// ============================================================================

import type Anthropic from "@anthropic-ai/sdk";

import type { Mensaje, Sede } from "@dpm/db";
import type { AvailabilityResponse, DepositCurrency } from "@dpm/shared";

export type BuildPromptInput = {
  systemPrompt: string; // Bloque 1 content (system prompt + playbook + few-shots)
  sedeKb: string; // Bloque 2 content (sede knowledge base)
  history: Mensaje[]; // Bloque 3 source (sliding window)
  sede: Sede;
  roster: AvailabilityResponse | null;
  incomingMessage: string;
  detectedLanguage?: string | undefined;
  /**
   * Deposit currency derived server-side from the contact's phone prefix
   * per owner spec INSTRUCCIONES_PAGO §3. null when the prefix isn't in
   * the table — the AI must then ask the client to choose from the five
   * supported currencies.
   */
  suggestedCurrency?: DepositCurrency | null;
};

export type BuildPromptOutput = {
  system: Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
};

/**
 * Build the system + messages array Anthropic expects.
 *
 * Cache-control strategy:
 *   system block (Bloque 1)  → cache_control ephemeral (default 5m, opted to 1h)
 *   user msg #1 (Bloque 2)   → cache_control ephemeral 1h, KB never changes within the hour
 *   user msg #2 (Bloque 3)   → cache_control ephemeral 5m, history changes per turn
 *   user msg #3 (Bloque 4)   → no cache_control
 */
export function buildFourBlockPrompt(input: BuildPromptInput): BuildPromptOutput {
  const historyText = formatHistoryForPrompt(input.history);
  const dynamicText = formatDynamicBlock({
    sede: input.sede,
    roster: input.roster,
    incomingMessage: input.incomingMessage,
    detectedLanguage: input.detectedLanguage,
    suggestedCurrency: input.suggestedCurrency,
  });

  const system: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: input.systemPrompt,
      cache_control: { type: "ephemeral", ttl: "1h" },
    },
  ];

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `=== KB DE LA SEDE: ${input.sede.nombre} ===\n${input.sedeKb}`,
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
      ],
    },
    {
      role: "assistant",
      content: "Entendido. Tengo la base de conocimiento de la sede cargada.",
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `=== HISTORIAL RECIENTE ===\n${historyText}`,
          cache_control: { type: "ephemeral", ttl: "5m" },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: dynamicText,
          // No cache_control — Bloque 4 changes every request.
        },
      ],
    },
  ];

  return { system, messages };
}

/**
 * Format the message history as a readable transcript. We use simple role
 * labels rather than alternating role: messages because Claude has been
 * shown to follow long single-block transcripts well, and it lets us cache
 * the entire block as one unit.
 */
export function formatHistoryForPrompt(history: Mensaje[]): string {
  if (history.length === 0) return "(sin historial previo — primer mensaje)";
  return history
    .map((m) => {
      const ts = m.createdAt.toISOString();
      const who =
        m.sender === "cliente"
          ? "CLIENTE"
          : m.sender === "ai"
            ? "AI"
            : `AGENTE${m.agenteName ? ` (${m.agenteName})` : ""}`;
      // [msg-id] prefix lets the model cite a specific past turn via
      // "history:<id>" in its `fuentes` array.
      return `[${m.id}] [${ts}] ${who}: ${m.content}`;
    })
    .join("\n");
}

/**
 * Bloque 4: current sede-local time, 7-day roster summary, and the incoming
 * client message. This is the only fresh content per request.
 */
export function formatDynamicBlock(input: {
  sede: Sede;
  roster: AvailabilityResponse | null;
  incomingMessage: string;
  detectedLanguage?: string | undefined;
  suggestedCurrency?: DepositCurrency | null;
}): string {
  const sedeNow = new Date().toLocaleString("en-US", {
    timeZone: input.sede.timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const rosterText = input.roster
    ? formatRoster(input.roster)
    : "(roster no disponible — usá tool_use consultar_disponibilidad si necesitás)";

  const langLine = input.detectedLanguage
    ? `IDIOMA DETECTADO DEL CLIENTE: ${input.detectedLanguage} (responde en ese idioma)`
    : "IDIOMA: detectá automáticamente del mensaje y responde en el mismo idioma";

  // Currency hint resolved server-side from phone prefix (INSTRUCCIONES_PAGO §3).
  // The AI passes this to solicitar_deposito unless the client explicitly
  // asks for a different currency.
  const currencyLine =
    input.suggestedCurrency === undefined || input.suggestedCurrency === null
      ? "MONEDA SUGERIDA: NO DETECTADA por prefijo telefónico — al activar solicitar_deposito, primero preguntá al cliente qué moneda prefiere de las 5 disponibles (EUR, GBP, AUD, USD, IDR)."
      : `MONEDA SUGERIDA POR PREFIJO TELEFÓNICO: ${input.suggestedCurrency} — usala como moneda_cliente al invocar solicitar_deposito, salvo que el cliente pida explícitamente otra.`;

  return `=== CONTEXTO DINÁMICO ===
HORA ACTUAL EN LA SEDE: ${sedeNow}
ZONA HORARIA: ${input.sede.timezone}
SEDE: ${input.sede.nombre} (${input.sede.pais})
MONEDA LOCAL: ${input.sede.currencyCode} (${input.sede.currencySymbol})

${currencyLine}

${langLine}

=== ROSTER PRÓXIMOS 7 DÍAS ===
${rosterText}

=== MENSAJE DEL CLIENTE ===
${input.incomingMessage}

=== FLUJO DE VENTA Y CIERRE ===
Tu objetivo es llevar al cliente desde el primer mensaje hasta el
depósito confirmado. Las fases:
  1. CALIFICAR: entendé fechas, certificación previa, miedo, presupuesto.
  2. PROPONER: cuando el cliente está listo para fechas concretas, usá
     consultar_disponibilidad ANTES de afirmar plazas.
  3. COBRAR DEPÓSITO: cuando el cliente confirma intención de reservar
     (palabras clave: "lo reservo", "me anoto", "dale", "I'll book it",
     "let's go ahead"), invocá la herramienta solicitar_deposito. El
     sistema te devolverá un código de referencia + instrucciones de
     pago. INCLUÍ el código y el monto literalmente en tu respuesta.
  4. POST-DEPÓSITO: NO seguir vendiendo otras cosas; despedite cordial
     y deciste que el equipo de la sede contactará pronto. El handoff
     a humano lo hace el sistema cuando el equipo verifica el pago.

REGLAS DEL DEPÓSITO:
- Es OBLIGATORIO para confirmar reserva, NO REEMBOLSABLE, se descuenta
  del precio total. Monto fijo: 40 unidades de moneda local del cliente.
- Nunca prometas reserva confirmada sin haber invocado solicitar_deposito.
- Nunca inventes códigos de referencia ni datos bancarios — usá lo que
  devuelve la herramienta literalmente.

=== FORMATO DE SALIDA OBLIGATORIO ===
Devolvé EXCLUSIVAMENTE un JSON con esta forma exacta, sin texto antes ni
después:

{
  "respuesta": "<el texto que va al cliente, en su idioma>",
  "fuentes": ["kb:<seccion-id>", "history:<id-msg>", "rule:<n>", "tool:consultar_disponibilidad", "tool:solicitar_deposito"]
}

REGLAS PARA "fuentes":
- Si afirmás un precio, capacidad, fecha, política o cualquier dato concreto,
  añadí en "fuentes" el id de la sección de la KB que lo respalda
  (formato: "kb:<id-de-la-seccion>"; los headings de la KB usan IDs estables).
- Si referenciaste algo dicho antes en la conversación, citá el mensaje:
  "history:<msg-id>" usando el id que aparece entre corchetes en el HISTORIAL.
- Si invocaste consultar_disponibilidad o solicitar_deposito, el sistema
  agrega automáticamente la entrada "tool:..." correspondiente; podés
  igualmente declararla.
- Si la respuesta es solo conversacional (saludo, cortesía), "fuentes" puede
  ser un array vacío [].
- NO inventes ids. Si no encontrás respaldo en la KB para algo factual,
  reformulá la respuesta para no afirmar ese dato.`;
}

function formatRoster(roster: AvailabilityResponse): string {
  if (!Array.isArray(roster.detalle) || roster.detalle.length === 0) {
    return "(roster vacío)";
  }
  const header = `hora_actual_wita: ${roster.hora_actual_wita} · primer_dia_disponible: ${roster.primer_dia_disponible}`;
  const days = roster.detalle
    .map((d) => {
      const am = d.turno_manana;
      const pm = d.turno_tarde;
      return `  ${d.fecha}: AM ${am.espacios}/${am.capacidad}${
        am.disponible ? "" : " (cerrado)"
      } | PM ${pm.espacios}/${pm.capacidad}${pm.disponible ? "" : " (cerrado)"}`;
    })
    .join("\n");
  return `${header}\n${days}`;
}
