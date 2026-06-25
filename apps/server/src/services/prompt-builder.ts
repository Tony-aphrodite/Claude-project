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

/**
 * Inline media the client just attached to their current turn. Already
 * fetched + base64-encoded by the caller (process-message.ts wraps the
 * shared `fetchAttachmentAsBase64`); the prompt builder stays pure / network-
 * free so tests don't need fixtures.
 *
 * `kind` decides which Anthropic block we emit:
 *   - "image"    → ImageBlockParam (jpeg / png / gif / webp).
 *   - "document" → DocumentBlockParam (PDF). Multi-page native parsing.
 */
export type InlineMedia = {
  kind: "image" | "document";
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "application/pdf";
  base64: string;
};

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
  /**
   * Inline media the customer attached to THIS turn. Emitted as Anthropic
   * vision blocks at the start of Bloque 4 so the model can actually see
   * the image (until 2026-06-25 we only stored a `[attachment:...]` text
   * placeholder in history, which is how Miguel's "AI hallucinated a
   * comprobante" bug surfaced — the model never saw the image). Empty /
   * undefined ⇒ no image blocks, exact pre-fix behaviour preserved.
   */
  incomingAttachments?: InlineMedia[] | undefined;
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
  const attachments = input.incomingAttachments ?? [];
  const dynamicText = formatDynamicBlock({
    sede: input.sede,
    roster: input.roster,
    incomingMessage: input.incomingMessage,
    detectedLanguage: input.detectedLanguage,
    suggestedCurrency: input.suggestedCurrency,
    attachmentCount: attachments.length,
  });

  const system: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: input.systemPrompt,
      cache_control: { type: "ephemeral", ttl: "1h" },
    },
  ];

  // Bloque 4 content: any vision blocks the client just attached come FIRST
  // (Anthropic best practice — model latches onto media before reasoning over
  // surrounding text), followed by the dynamic text block. NO cache_control:
  // Bloque 4 changes every request, and image data can't be cached.
  const dynamicContent: Anthropic.ContentBlockParam[] = [];
  for (const att of attachments) {
    if (att.kind === "document") {
      dynamicContent.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: att.base64,
        },
      });
    } else {
      dynamicContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: att.mediaType as
            | "image/jpeg"
            | "image/png"
            | "image/gif"
            | "image/webp",
          data: att.base64,
        },
      });
    }
  }
  dynamicContent.push({ type: "text", text: dynamicText });

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
      content: dynamicContent,
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
  /**
   * How many media blocks were prepended to Bloque 4 before this text. The
   * text references them explicitly ("the client attached N files above")
   * so the model knows to LOOK at them — without this anchor the model can
   * miss a single trailing image when the bulk of the prompt is text.
   * Defaults to 0 = no inline media this turn.
   */
  attachmentCount?: number;
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

  // Language anchor — STRONG form. 2026-05-14 (Miguel test, conv c7c7888a):
  // long Spanish chat → model drifted to Portuguese for one turn, emitted
  // its reasoning preamble + a JSON envelope using the PT key `resposta`.
  // The parser is now hardened (multi-key + reasoning-leak guard) but we
  // also reinforce the prompt: explicit "do not switch even if you are
  // reasoning in another language" — ES↔PT cognate drift is the common
  // failure mode in DPM traffic.
  const langLine = input.detectedLanguage
    ? `IDIOMA OBLIGATORIO DE TU RESPUESTA: ${input.detectedLanguage}. NO cambies de idioma bajo ninguna circunstancia. Si tu razonamiento interno empieza a fluir en otro idioma (común con español↔portugués porque son cognados), DESCARTÁ ese razonamiento y regenerá tu respuesta en ${input.detectedLanguage}. Tanto el contenido de "respuesta" como las palabras claves del JSON DEBEN estar en ${input.detectedLanguage}.`
    : // Ambiguous-signal fallback (Miguel test 2026-06-02): when the
      // detector returned no verdict, the prior generic line ("detect
      // and reply in same") was itself in Spanish, which combined with
      // the mostly-Spanish prompt pushed Claude to default to Spanish
      // even for English customers writing short greetings like "Hello".
      // This rewrite is explicit: scan THIS message for English markers,
      // then for Spanish, then default ENGLISH (not Spanish) because
      // DPM's incoming international tourist traffic is predominantly
      // English. Conservative: any clear Spanish word still wins.
      `IDIOMA — señal débil del detector. Reglas en orden:
  1) Mensaje contiene saludo/palabra inglesa clara (hi, hello, hey, want, need, please, thanks, how, what, when, where) → INGLÉS.
  2) Mensaje contiene saludo/palabra española clara (hola, buenas, gracias, quiero, necesito, por favor, cuánto, cómo, qué, dónde, cuándo) → ESPAÑOL.
  3) Botón con nombre de sede ("Koh Phi Phi", "Gili Trawangan", "Koh Tao", "Gili Air", "Nusa Penida") — no es señal de idioma, ignorar como pista de language.
  4) Si NINGUNA de las anteriores aplica (mensaje ambiguo, emoji solo, sticker) → DEFAULT INGLÉS. Los clientes internacionales de DPM son mayoritariamente angloparlantes; ante duda, inglés gana, NUNCA español.
NO mezclés idiomas dentro de una misma respuesta — verificá cada frase antes de emitir.`;

  // Currency hint resolved server-side from phone prefix (INSTRUCCIONES_PAGO §3).
  // 2026-05-11 owner feedback (Miguel from +62 number objected to the AI
  // auto-picking IDR without asking — international travelers with local SIMs
  // are common): the prefix is now only a HINT for what to PROPOSE first,
  // never an autopilot. The AI must explicitly ask the client which currency
  // they prefer BEFORE invoking solicitar_deposito.
  const currencyLine =
    input.suggestedCurrency === undefined || input.suggestedCurrency === null
      ? "MONEDA: NO DETECTADA por prefijo telefónico. ANTES de invocar solicitar_deposito, preguntá al cliente qué moneda prefiere de las 5 disponibles (EUR, GBP, AUD, USD, IDR)."
      : `MONEDA SUGERIDA POR PREFIJO TELEFÓNICO: ${input.suggestedCurrency} (solo HINT, NO automático). ANTES de invocar solicitar_deposito, preguntá al cliente qué moneda prefiere — opciones: EUR / GBP / AUD / USD / IDR. Podés MENCIONAR la sugerida en la pregunta ("normalmente la gente con tu prefijo paga en ${input.suggestedCurrency}, ¿te sirve esa o preferís otra?") pero NO asumas: un cliente con prefijo local puede tener cuenta internacional, y viceversa.`;

  return `=== CONTEXTO DINÁMICO ===
HORA ACTUAL EN LA SEDE: ${sedeNow}
ZONA HORARIA: ${input.sede.timezone}
SEDE: ${input.sede.nombre} (${input.sede.pais})
SEDE_ID: ${input.sede.id}    ← USAR ESTE UUID EXACTO como sede_id en TODA invocación de consultar_disponibilidad / solicitar_deposito / enviar_catalogo. NO inventes uno.
MONEDA LOCAL: ${input.sede.currencyCode} (${input.sede.currencySymbol})

${currencyLine}

${langLine}

=== ROSTER PRÓXIMOS 7 DÍAS ===
${rosterText}
${formatAttachmentBanner(input.attachmentCount ?? 0)}
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
  reformulá la respuesta para no afirmar ese dato.

=== RECORDATORIO CRÍTICO (LEER ANTES DE EMITIR) ===
Tu salida COMPLETA debe ser EXACTAMENTE un único objeto JSON con la clave
"respuesta" (en español, NO "resposta" ni "answer" ni "response"). NO emitas:
  • razonamiento ni análisis antes del JSON ("El cliente está frustrado…",
    "Voy a ser directo…", "Preciso analisar…", "Let me think…")
  • bloques de código markdown (\`\`\`json … \`\`\`)
  • múltiples objetos JSON
  • texto después del cierre del JSON
Si emitís cualquiera de las cosas anteriores, el cliente lo VE en su WhatsApp
y se rompe la conversación. Es un BUG visible al cliente.`;
}

/**
 * Banner inserted into Bloque 4 right above the customer message so the model
 * can't miss that media is attached. Says nothing when there's no media.
 *
 * The banner also classifies the image so the model doesn't auto-guess "this
 * must be a comprobante": it must identify the content first, then decide how
 * to react. Closes Miguel 2026-06-25 bug #2 (model said "revisé tu
 * comprobante y no coincide" when the client had sent an ad screenshot).
 */
function formatAttachmentBanner(count: number): string {
  if (count <= 0) return "";
  const plural = count === 1 ? "" : "s";
  return `
=== ARCHIVO${plural.toUpperCase()} ADJUNTO${plural.toUpperCase()} (${count}) ===
El cliente acaba de enviar ${count} archivo${plural} (imagen/PDF) en su turno actual. Está${plural ? "n" : ""} embebido${plural} ARRIBA de este texto como bloques de visión — MIRÁ${plural ? "LOS" : "LA"} antes de redactar tu respuesta.

REGLAS — IMÁGENES Y PDFs (Miguel 2026-06-25):
1) IDENTIFICÁ primero qué muestra cada archivo (carnet de buceo, foto de un pez/sitio, captura de un anuncio, comprobante bancario, captura de chat, foto del cliente, etc.) ANTES de decidir cómo responder.
2) NUNCA asumas que es un comprobante de depósito a menos que VEAS claramente: un banco/Wise/Revolut + monto + moneda + fecha + beneficiario. Las capturas de "Top Rated Dive Center", anuncios de Instagram/Meta, fotos genéricas → NO son comprobantes.
3) NUNCA respondas "revisé tu comprobante y algo no coincide" salvo que la imagen sea efectivamente un comprobante (regla 2). Si no estás seguro de qué es, PREGUNTÁ al cliente qué quería mostrarte.
4) NO arranques con tu saludo de presentación solo porque entró un archivo — la conversación ya está en curso, seguila desde el último turno del HISTORIAL.
5) Si el cliente mandó VARIOS archivos en este turno, respondé UNA SOLA vez tratándolos en conjunto. No emitas N respuestas separadas.
`;
}

function formatRoster(roster: AvailabilityResponse): string {
  if (!Array.isArray(roster.detalle) || roster.detalle.length === 0) {
    return "(roster vacío)";
  }
  const horaPart = roster.hora_actual_wita
    ? `hora_actual_wita: ${roster.hora_actual_wita}`
    : "hora_actual_wita: no provista por la sede";
  const header = `${horaPart} · primer_dia_disponible: ${roster.primer_dia_disponible}`;
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
