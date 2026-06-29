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
  /**
   * Conversation state signals for IMAGE CLASSIFICATION (Miguel 2026-06-26 #3).
   * When the customer attaches an image, the AI must decide whether it's a
   * deposit comprobante or something else (cert card, ad screenshot, etc).
   * The signals here let the AI gate that decision on the conversation's
   * actual state — without them the AI was hallucinating "revisé tu
   * comprobante y no coincide" for non-comprobante images.
   *
   *   bankDataSent  — true after the AI has already shared bank details
   *                   (i.e. `solicitar_deposito` ran and the message was
   *                   emitted). Until this is true a deposit screenshot
   *                   simply cannot exist yet.
   *   depositExpected — true when lead_metadata carries the full triplet
   *                     (ref_code + amount + currency), i.e. the customer
   *                     was told what to send. The OCR path keys off this.
   *   leadStage     — the current conversation stage from our state
   *                   machine ("new" / "qualified" / "proposed" /
   *                   "deposit_pending" / "deposit_paid" / "handed_off" /
   *                   "lost" / "closed"). Helps the AI distinguish
   *                   pre-quote from post-quote interactions.
   */
  conversationState?: {
    bankDataSent?: boolean;
    depositExpected?: boolean;
    leadStage?: string | null;
  };
  /**
   * One-shot internal notes left by an operator in Respond.io with the
   * sede AI user @-mentioned (Miguel 2026-06-29 M1). Each entry is its
   * own line in the prompt — the AI is instructed to factor the notes
   * into THIS turn's reply and then forget them (process-message clears
   * the consumed IDs after the response is sent). Empty / undefined ⇒
   * no block is emitted.
   */
  pendingInternalNotes?: ReadonlyArray<{
    text: string;
    by?: string | null;
    at: string;
  }>;
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
    conversationState: input.conversationState,
    pendingInternalNotes: input.pendingInternalNotes,
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
  conversationState?: BuildPromptInput["conversationState"];
  pendingInternalNotes?: BuildPromptInput["pendingInternalNotes"];
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

🚨 HORA ACTUAL—REGLA ABSOLUTA (Miguel 2026-06-26 — caso David NP ofreció 1pm cuando era 5pm):
- La hora arriba ("HORA ACTUAL EN LA SEDE") es la HORA LOCAL VERDADERA de esta sede AHORA. Es la única referencia válida.
- NUNCA ofrezcas un slot/horario que ya pasó respecto a HORA ACTUAL. Si HORA ACTUAL es 17:00, no podés ofrecer "hoy a la 1pm" — ese slot ya pasó.
- Cuando el cliente dice "hoy" / "esta tarde" / "ahora" / "today" / "this afternoon" → razoná SIEMPRE contra HORA ACTUAL arriba, NO contra la hora del teléfono del cliente ni la zona horaria del cliente. El cliente puede estar en otro país físicamente, pero opera contra la sede que vas a vender.
- Antes de proponer cualquier horario del día actual: comparar el horario propuesto vs HORA ACTUAL. Si pasado → ofrecé el siguiente disponible (mañana, o el primer slot futuro de hoy si hay).
- "Boat AM" / "barco AM" en general arranca temprano (7-8am). Si ya pasaron las 10-11am del día, AM de HOY no es viable — ofrecé PM o mañana AM.

${currencyLine}

${langLine}

=== ROSTER PRÓXIMOS 7 DÍAS ===
${rosterText}
${formatAttachmentBanner(input.attachmentCount ?? 0, input.conversationState)}${formatInternalNotesBlock(input.pendingInternalNotes)}
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
 * to react. Closes Miguel 2026-06-25 bug #2 + 2026-06-26 #3 (model said
 * "revisé tu comprobante y no coincide" when the client had sent an ad
 * screenshot OR a certification card — neither were comprobantes).
 *
 * The conversationState parameter (Miguel 2026-06-26 #3) makes the
 * "is this a comprobante?" gate state-aware. If we haven't even sent the
 * bank details yet, a comprobante is IMPOSSIBLE — the AI should never
 * interpret an image as one in that state.
 */
function formatAttachmentBanner(
  count: number,
  conversationState?: BuildPromptInput["conversationState"],
): string {
  if (count <= 0) return "";
  const plural = count === 1 ? "" : "s";

  const bankDataSent = conversationState?.bankDataSent === true;
  const depositExpected = conversationState?.depositExpected === true;
  const leadStage = conversationState?.leadStage ?? null;

  // State-aware preamble for the comprobante gate (Miguel 2026-06-26 #3).
  // Three regimes:
  //   1. bankDataSent=false  → comprobante IMPOSSIBLE. The customer hasn't
  //      been told where to transfer yet; anything they sent is something
  //      else (cert, ad, fish photo, random screenshot).
  //   2. bankDataSent=true but depositExpected=false → bank details were
  //      shared but the triplet isn't fully stamped. A comprobante is
  //      POSSIBLE but not strongly expected.
  //   3. depositExpected=true (lead_stage typically deposit_pending) →
  //      a comprobante is what we're waiting for. OCR will run upstream
  //      and the AI's role is the polite acknowledgment.
  const comprobanteGate = bankDataSent
    ? depositExpected
      ? `ESTADO DE PAGO: depósito ESPERADO (datos bancarios enviados + monto/moneda/ref code en metadata). Es plausible que esta imagen sea un comprobante bancario REAL — verificá los 4 elementos (banco/monto/moneda/fecha/beneficiario) antes de afirmar nada. lead_stage actual: ${leadStage ?? "?"}.`
      : `ESTADO DE PAGO: datos bancarios YA fueron compartidos en esta conversación, pero el depósito todavía NO está stampado en metadata. Una imagen PUEDE ser un comprobante, pero también puede ser otra cosa — clasificá primero. lead_stage actual: ${leadStage ?? "?"}.`
    : `ESTADO DE PAGO: en esta conversación TODAVÍA NO se enviaron datos bancarios al cliente — un "comprobante de depósito" es IMPOSIBLE en este estado. Si la imagen parece un recibo bancario, lo más probable es que sea de OTRO contexto (otra compra del cliente, una pantalla de su banco, etc.) — NUNCA respondas "revisé tu comprobante y no coincide". lead_stage actual: ${leadStage ?? "?"}.`;

  return `
=== ARCHIVO${plural.toUpperCase()} ADJUNTO${plural.toUpperCase()} (${count}) ===
El cliente acaba de enviar ${count} archivo${plural} (imagen/PDF) en su turno actual. Está${plural ? "n" : ""} embebido${plural} ARRIBA de este texto como bloques de visión — MIRÁ${plural ? "LOS" : "LA"} antes de redactar tu respuesta.

${comprobanteGate}

REGLAS — IMÁGENES Y PDFs (Miguel 2026-06-25 + 2026-06-26):
1) IDENTIFICÁ primero qué muestra cada archivo (carnet de buceo, foto de un pez/sitio, captura de un anuncio, comprobante bancario, captura de chat, foto del cliente, etc.) ANTES de decidir cómo responder.
2) NUNCA asumas que es un comprobante de depósito a menos que VEAS claramente: un banco/Wise/Revolut + monto + moneda + fecha + beneficiario. Las capturas de "Top Rated Dive Center", anuncios de Instagram/Meta, fotos genéricas, tarjetas de certificación SSI/PADI → NO son comprobantes.
3) NUNCA respondas "revisé tu comprobante y algo no coincide" salvo que (a) la imagen sea efectivamente un comprobante (regla 2) Y (b) el ESTADO DE PAGO arriba confirme que el depósito era esperado. Si no estás seguro de qué es, PREGUNTÁ al cliente qué quería mostrarte.
4) NO arranques con tu saludo de presentación solo porque entró un archivo — la conversación ya está en curso, seguila desde el último turno del HISTORIAL.
5) Si el cliente mandó VARIOS archivos en este turno, respondé UNA SOLA vez tratándolos en conjunto. No emitas N respuestas separadas.
6) El IDIOMA de tu respuesta se mantiene igual al que ya venías usando — un archivo sin texto NUNCA cambia el idioma (Miguel 2026-06-26 #2).
`;
}

/**
 * Render the one-shot internal-note block (Miguel 2026-06-29 M1). The
 * operator dropped a note in Respond.io with the sede AI @-mentioned;
 * process-message read the pending queue and is passing the unconsumed
 * entries here. The note overrides nothing — the AI still follows its
 * normal playbook — but it adds situational context for THIS turn.
 *
 * Layout choices:
 *   - Block lives right before "=== MENSAJE DEL CLIENTE ===" so the AI
 *     reads the operator's note immediately BEFORE the customer text.
 *   - "by" / "at" are folded into the line so the AI knows who said
 *     what and when (useful when an older note pre-dates the customer
 *     reply by an hour and is no longer applicable).
 *   - The closing instruction is explicit: USE THIS for THIS reply,
 *     don't surface that you got an internal note. Without that, Claude
 *     occasionally narrates "tengo una nota de Patrick que dice…".
 */
function formatInternalNotesBlock(
  notes?: BuildPromptInput["pendingInternalNotes"],
): string {
  if (!notes || notes.length === 0) return "";
  const lines = notes
    .map((n, i) => {
      const who = n.by ? ` — ${n.by}` : "";
      const when = n.at ? ` @ ${n.at}` : "";
      return `${i + 1}. (${n.at ? "interna" : "interna"}${who}${when}) ${n.text}`;
    })
    .join("\n");
  return `
=== NOTA INTERNA DEL EQUIPO (no la cita el cliente, NO la repitas textualmente) ===
${lines}

REGLAS sobre la nota interna:
- Tu equipo te dejó esta info AHORA para que la uses en TU PRÓXIMA respuesta. Aplicala con criterio (precio, tono, info específica, etc.).
- NUNCA escribas "tengo una nota interna que dice…" ni reveles que existe esta indicación. Hablale al cliente naturalmente, incorporando la info como si la supieras vos.
- Si la nota contradice lo que el cliente acaba de pedir, priorizá la nota — tu equipo sabe algo que vos (AI) no podés ver.
- Si la nota es ambigua o incompleta, seguí con tu respuesta normal sin inventar detalles.
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
