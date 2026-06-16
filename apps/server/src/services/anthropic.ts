// ============================================================================
// Anthropic client wrapper. Single entry point for Claude calls so we can
// centralize:
//   - tool_use loop with a generic dispatcher over the registered tool set
//   - usage logging into llamadas_api
//   - cost computation + daily spend limit guard
//
// Latency notes:
//   - We reuse a single Anthropic client so the underlying HTTP/2 connection
//     pool is shared. Cold connect costs ~150ms; we want to amortize it.
//   - We do NOT stream — we want the whole response before posting to
//     Respond.io (which itself has no streaming). Streaming would only help
//     if the panel was the consumer.
// ============================================================================

import Anthropic from "@anthropic-ai/sdk";
import { sql } from "drizzle-orm";

import { getDb, llamadasApi, type NewLlamadaApi } from "@dpm/db";
import {
  ANTHROPIC_PRICING,
  TIMEOUTS,
  type AnthropicModel,
  type CostBreakdown,
} from "@dpm/shared";

import { loadEnv } from "../env.js";
import { CostLimitError, UpstreamError } from "../lib/errors.js";
import { getLogger } from "../logger.js";
import { looksLikePortuguese } from "./language.js";
import {
  consultarDisponibilidadTool,
  parseToolInput as parseConsultarDisponibilidadInput,
  type ConsultarDisponibilidadHandler,
} from "../tools/consultar-disponibilidad.js";
import {
  enviarCatalogoTool,
  parseEnviarCatalogoInput,
  type EnviarCatalogoHandler,
} from "../tools/enviar-catalogo.js";
import {
  parseSendProductCardInput,
  sendProductCardTool,
  type SendProductCardHandler,
} from "../tools/send-product-card.js";
import {
  parseSolicitarDepositoInput,
  solicitarDepositoTool,
  type SolicitarDepositoHandler,
} from "../tools/solicitar-deposito.js";

let _client: Anthropic | undefined;

function getClient(): Anthropic {
  if (_client) return _client;
  const env = loadEnv();
  _client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    timeout: TIMEOUTS.CLAUDE_API_MS,
    maxRetries: 1, // we want fast failure; orchestrator decides if to retry
  });
  return _client;
}

// All tools the platform knows. Per-sede tool sets are expressed by leaving
// the unused handlers undefined — Anthropic's tools[] array is built from
// the keys actually present on the input. John (GT) uses consultar +
// solicitar + enviar_catalogo; Colomba (GA) uses consultar + send_product_card.
export type ToolHandlers = {
  consultar_disponibilidad?: ConsultarDisponibilidadHandler;
  solicitar_deposito?: SolicitarDepositoHandler;
  enviar_catalogo?: EnviarCatalogoHandler;
  send_product_card?: SendProductCardHandler;
};

export type CallClaudeInput = {
  model?: AnthropicModel;
  maxTokens?: number;
  system: Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
  toolHandlers: ToolHandlers;
  conversacionId: string;
  sedeId: string;
  promptVersionId?: string | undefined;
  /**
   * Detected conversation language (label from services/language.ts —
   * "español" / "english" / "português" or undefined when unknown).
   * Forwarded to parseStructuredAnswer so the parser can flag PT drift
   * on Spanish conversations and replace the reply with the safe
   * fallback. Undefined disables the check.
   */
  expectedLanguage?: string | undefined;
  /**
   * Raw text of the most recent cliente message. Used by the parser's
   * exit-intent detector — if the customer wrote "vamos con otra
   * escuela", "me voy", "qué ruda tu respuesta" etc., force
   * escalation_reason=complaint regardless of how the AI replied.
   * Detecting on the input side is more reliable than detecting on
   * the AI output because the model sometimes misses the exit cue
   * and pivots to a sales reply instead of acknowledging the
   * goodbye.
   */
  incomingMessage?: string | undefined;
  /**
   * Force the model to invoke a specific tool on its FIRST tool round.
   * Tony 2026-06-16: at the deposit step (customer just confirmed
   * currency + we already have programa/start_date/pax in metadata),
   * Claude was stalling instead of invoking `solicitar_deposito`. The
   * prompt rules alone could not stop the stalling. With this set to
   * "solicitar_deposito", Anthropic forces Claude to call exactly that
   * tool — no opt-out, no stalling, no escalation. On subsequent
   * rounds tool_choice reverts to its normal value so the model can
   * finish the turn naturally.
   */
  forceToolChoice?: string | undefined;
};

// Canonical escalation_reason codes the AI may emit. Keep in sync with
// `## Casos que escalan a humano` in the system prompt and with the
// `motivo_escalation` Respond.io custom field (Text type, owner-confirmed
// 2026-05-10). Anything outside this set is downgraded to null so we never
// write garbage to the contact.
export const ESCALATION_REASONS = [
  "medical",
  "discount_over_10",
  "instructor_request",
  "human_requested",
  "payment_issue",
  "complaint",
  "prohibited_topic",
  "out_of_scope",
  // Colomba/GA addition (IMPLEMENTATION_NOTES §2): cliente writes in a
  // language we don't support (EN/ES). Triggers a sede-agnostic round-
  // robin across every online agent, not just the sede's pool.
  "language_not_supported",
] as const;
export type EscalationReason = (typeof ESCALATION_REASONS)[number];

// Canonical `descuento` values — must match the 3 List values Miguel keeps
// in Respond.io ("Sin descuento" / "5%" / "10%"). The AI never quotes >10%
// (escalates instead), so these 3 cover the full range.
export const DESCUENTO_VALUES = ["Sin descuento", "5%", "10%"] as const;
export type DescuentoValue = (typeof DESCUENTO_VALUES)[number];

// Canonical close_reason taxonomy (Colomba/GA — IMPLEMENTATION_NOTES §3).
// Matches DPM's official 10 closing-notes categories. When the AI emits
// one of these, the server applies tag `venta_incompleta` + moves the
// contact to lifecycle "LOST LEAD" in Respond.io.
export const CLOSE_REASONS = [
  "Just_Asking_for_Info",
  "No_Specific_Date",
  "Too_Expensive",
  "Bad_Weather",
  "Health_Issue",
  "Booked_Elsewhere",
  "Changed_Plans",
  "No_Response_After_FollowUps",
  "Wrong_Contact",
  "Spam",
] as const;
export type CloseReason = (typeof CLOSE_REASONS)[number];

export type CallClaudeResult = {
  text: string;
  fuentes: string[];
  escalationReason: EscalationReason | null;
  descuento: DescuentoValue | null;
  toolCalls: string[];
  cost: CostBreakdown;
  latencyMs: number;
  model: AnthropicModel;
  // ── Colomba/GA additions ──────────────────────────────────────────────
  /** AI-emitted close_reason (one of CLOSE_REASONS) when the convo is dead. */
  closeReason: CloseReason | null;
  /** Free-text note from the AI for the human team (Respond.io contact note). */
  notes: string | null;
  /** Card ids the AI asked to send (1 or 2). Allowlist validation happens here. */
  sendProductCardIds: string[] | null;
};

export async function callClaude(input: CallClaudeInput): Promise<CallClaudeResult> {
  const env = loadEnv();
  const log = getLogger();
  const client = getClient();

  const model = (input.model ?? env.ANTHROPIC_MODEL_PRIMARY) as AnthropicModel;
  const maxTokens = input.maxTokens ?? env.ANTHROPIC_MAX_TOKENS;

  await assertWithinDailyBudget(input.sedeId);

  const startedAt = Date.now();
  const toolCalls: string[] = [];

  // Mutable copy — we may push tool_use / tool_result turns and re-call.
  let messages: Anthropic.MessageParam[] = [...input.messages];

  // Build the tools[] from the handlers the caller actually provided so
  // John (GT) only sees consultar/solicitar/enviar_catalogo and Colomba
  // (GA) only sees consultar/send_product_card. Anthropic charges by the
  // tools-defined surface area, so trimming per sede also saves a few
  // hundred input tokens per cached request.
  const tools: Anthropic.Tool[] = [];
  if (input.toolHandlers.consultar_disponibilidad) tools.push(consultarDisponibilidadTool);
  if (input.toolHandlers.solicitar_deposito) tools.push(solicitarDepositoTool);
  if (input.toolHandlers.enviar_catalogo) tools.push(enviarCatalogoTool);
  if (input.toolHandlers.send_product_card) tools.push(sendProductCardTool);

  // Tool-call rounds budget. Bumped from 2 → 3 on 2026-06-10 after a
  // Miguel-reported "queda colgado" incident where a 6-day diving request
  // exhausted the loop without producing text. Three rounds covers:
  //   round 0  — initial response (may emit tool_use)
  //   round 1  — second response after tool_results (may emit more tools)
  //   round 2  — third response after more tool_results (may emit more)
  //   round 3  — FINAL round, tool_choice='none' forces a text synthesis
  // The final-round tool_choice flip is the load-bearing change: even if
  // the model wanted to call yet another tool, Anthropic enforces text
  // output, so the loop can NEVER return empty text again.
  const MAX_TOOL_ROUNDS = 3;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const isFinalRound = round === MAX_TOOL_ROUNDS;
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: input.system,
        tools,
        messages,
        // Final-round synthesis guard (Miguel 2026-06-10): on the last
        // round force the model to produce text instead of calling more
        // tools. Without this the loop can fall through with `rawText=""`
        // and the panel renders an empty chat bubble.
        ...(isFinalRound
          ? { tool_choice: { type: "none" as const } }
          : round === 0 && input.forceToolChoice
            ? { tool_choice: { type: "tool" as const, name: input.forceToolChoice } }
            : {}),
      });
    } catch (err) {
      const latencyMs = Date.now() - startedAt;
      await logCallToDb({
        conversacionId: input.conversacionId,
        sedeId: input.sedeId,
        model,
        promptVersionId: input.promptVersionId,
        usage: undefined,
        latencyMs,
        toolCalls,
        status: "error",
        errorMessage: (err as Error).message,
      });
      throw new UpstreamError("anthropic", (err as Error).message, {
        latencyMs,
      });
    }

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (toolUseBlocks.length === 0 || round === MAX_TOOL_ROUNDS) {
      // Final answer. The prompt instructs the model to emit a structured
      // {respuesta, fuentes, escalation_reason?, descuento?} envelope; if
      // parsing fails (older prompt versions or model dropped to plain text)
      // we fall back to raw text and record empty fuentes / null signals —
      // never block the user response on format drift.
      const rawText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      const {
        text,
        fuentes,
        escalationReason,
        descuento,
        reasoningLeak,
        closeReason,
        notes,
        sendProductCardIds,
      } = parseStructuredAnswer(rawText, {
        expectedLanguage: input.expectedLanguage,
        incomingMessage: input.incomingMessage,
      });

      // Availability-hallucination guard (2026-06-04 incident "22 de junio
      // hay lugar" sin tool call). If the model claims availability but did
      // NOT call consultar_disponibilidad in the CURRENT turn, replace the
      // reply with the safe verification fallback. Prompt rule
      // DISPONIBILIDAD—NUNCA-CAVE-A-PRESIÓN is the primary defense; this is
      // belt-and-suspenders for caving-under-customer-pressure regressions.
      let finalText = text;
      let availabilityHallucination = false;
      if (
        claimsAvailability(finalText) &&
        !toolCalls.includes("consultar_disponibilidad")
      ) {
        availabilityHallucination = true;
        finalText = availabilityFallback(input.expectedLanguage);
      }

      // Empty-text guard (Miguel 2026-06-10 "queda colgado" incident).
      // Even with tool_choice='none' on the final round, an edge case can
      // produce zero text (max_tokens hit mid-token, JSON envelope that
      // strips to empty, content blocks all non-text). Substituting a
      // localized clarifying ask is strictly better than rendering an
      // empty bubble — the customer always sees something actionable.
      let emptyTextFallbackApplied = false;
      if (!finalText.trim()) {
        emptyTextFallbackApplied = true;
        finalText = pickEmptyTextFallback({
          expectedLanguage: input.expectedLanguage,
          hadToolCalls: toolCalls.length > 0,
        });
      }

      // Append tool_use to fuentes if Claude actually invoked any. The panel
      // surfaces these so a human can audit which tool the AI relied on.
      for (const toolName of new Set(toolCalls)) {
        fuentes.push(`tool:${toolName}`);
      }

      const latencyMs = Date.now() - startedAt;
      const cost = computeCost(model, response.usage);

      await logCallToDb({
        conversacionId: input.conversacionId,
        sedeId: input.sedeId,
        model,
        promptVersionId: input.promptVersionId,
        usage: response.usage,
        latencyMs,
        toolCalls,
        status: "success",
      });

      if (reasoningLeak) {
        // Surfaces in Railway logs + the errores audit table can pick this
        // up later if we want to alert. Forcing escalation in the parser
        // ensures the customer is routed to a human even if the prompt
        // didn't include an explicit escalation_reason.
        log.warn(
          {
            sede: input.sedeId,
            conversacionId: input.conversacionId,
            rawTextPreview: rawText.slice(0, 200),
          },
          "claude reasoning-leak blocked; safe fallback sent + escalation forced",
        );
      }

      if (availabilityHallucination) {
        log.warn(
          {
            sede: input.sedeId,
            conversacionId: input.conversacionId,
            originalTextPreview: text.slice(0, 200),
            toolCalls,
          },
          "claude claimed availability without consultar_disponibilidad in current turn; replaced with safe fallback",
        );
      }

      if (emptyTextFallbackApplied) {
        log.warn(
          {
            sede: input.sedeId,
            conversacionId: input.conversacionId,
            round,
            toolCalls,
            stopReason: response.stop_reason,
            contentBlockTypes: response.content.map((b) => b.type),
            rawTextLen: rawText.length,
            wasFinalRound: isFinalRound,
          },
          "claude returned empty text — empty-text fallback applied (Miguel 2026-06-10 colgado guard)",
        );
      }

      log.info(
        {
          sede: input.sedeId,
          model,
          latencyMs,
          cacheHitRate: cost.cacheHitRate,
          costUsd: cost.totalUsd,
          toolCalls,
          fuentesCount: fuentes.length,
          escalationReason,
          descuento,
          reasoningLeak,
          closeReason,
          hasNotes: notes !== null,
          sendProductCardCount: sendProductCardIds?.length ?? 0,
          emptyTextFallbackApplied,
          rounds: round + 1,
        },
        "claude call ok",
      );

      return {
        text: finalText,
        fuentes,
        escalationReason,
        descuento,
        toolCalls,
        cost,
        latencyMs,
        model,
        closeReason,
        notes,
        sendProductCardIds,
      };
    }

    // Resolve every tool_use the model emitted this turn.
    const assistantContent = response.content;
    messages.push({ role: "assistant", content: assistantContent });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUseBlocks) {
      toolCalls.push(tu.name);
      const dispatched = await dispatchTool(tu, input.toolHandlers);
      toolResults.push(dispatched);
    }

    messages.push({ role: "user", content: toolResults });
  }

  // Unreachable — the loop returns within the final-answer branch.
  throw new Error("callClaude: tool-use loop exceeded MAX_TOOL_ROUNDS");
}

/**
 * Dispatch a single tool_use block to the registered handler. Validation
 * errors and handler exceptions are converted to `is_error` tool_result
 * blocks so Claude can recover within the same round, rather than tearing
 * down the request.
 */
async function dispatchTool(
  tu: Anthropic.ToolUseBlock,
  handlers: ToolHandlers,
): Promise<Anthropic.ToolResultBlockParam> {
  if (tu.name === "consultar_disponibilidad") {
    if (!handlers.consultar_disponibilidad) {
      return notSupported(tu);
    }
    const parsed = parseConsultarDisponibilidadInput(tu.input);
    if (!parsed.ok) {
      return {
        type: "tool_result",
        tool_use_id: tu.id,
        content: parsed.message,
        is_error: true,
      };
    }
    try {
      const result = await handlers.consultar_disponibilidad(parsed.value);
      return {
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(result),
      };
    } catch (err) {
      return {
        type: "tool_result",
        tool_use_id: tu.id,
        content: `Error ejecutando consulta: ${(err as Error).message}`,
        is_error: true,
      };
    }
  }

  if (tu.name === "solicitar_deposito") {
    if (!handlers.solicitar_deposito) {
      return notSupported(tu);
    }
    const parsed = parseSolicitarDepositoInput(tu.input);
    if (!parsed.ok) {
      return {
        type: "tool_result",
        tool_use_id: tu.id,
        content: parsed.message,
        is_error: true,
      };
    }
    try {
      const result = await handlers.solicitar_deposito(parsed.value);
      return {
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(result),
      };
    } catch (err) {
      return {
        type: "tool_result",
        tool_use_id: tu.id,
        content: `Error solicitando depósito: ${(err as Error).message}`,
        is_error: true,
      };
    }
  }

  if (tu.name === "enviar_catalogo") {
    if (!handlers.enviar_catalogo) {
      return notSupported(tu);
    }
    const parsed = parseEnviarCatalogoInput(tu.input);
    if (!parsed.ok) {
      return {
        type: "tool_result",
        tool_use_id: tu.id,
        content: parsed.message,
        is_error: true,
      };
    }
    try {
      const result = await handlers.enviar_catalogo(parsed.value);
      return {
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(result),
      };
    } catch (err) {
      return {
        type: "tool_result",
        tool_use_id: tu.id,
        content: `Error enviando catalog: ${(err as Error).message}`,
        is_error: true,
      };
    }
  }

  if (tu.name === "send_product_card") {
    if (!handlers.send_product_card) {
      return notSupported(tu);
    }
    const parsed = parseSendProductCardInput(tu.input);
    if (!parsed.ok) {
      return {
        type: "tool_result",
        tool_use_id: tu.id,
        content: parsed.message,
        is_error: true,
      };
    }
    try {
      const result = await handlers.send_product_card(parsed.value);
      return {
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(result),
      };
    } catch (err) {
      return {
        type: "tool_result",
        tool_use_id: tu.id,
        content: `Error enviando product card: ${(err as Error).message}`,
        is_error: true,
      };
    }
  }

  return notSupported(tu);
}

function notSupported(tu: Anthropic.ToolUseBlock): Anthropic.ToolResultBlockParam {
  return {
    type: "tool_result",
    tool_use_id: tu.id,
    content: `Error: tool "${tu.name}" no soportada para esta sede`,
    is_error: true,
  };
}

// Hard-coded safe fallback the customer sees when we detect that the model's
// raw output looks like leaked reasoning (e.g. internal monologue, a partially
// emitted JSON envelope, language drift mid-stream). Bilingual lean — Spanish
// is the dominant DPM language; the apology + connect-with-team line is short
// enough that English customers also understand the intent. Pairs with a
// forced escalationReason='complaint' so the human routing fires.
//
// 2026-05-14 incident (Miguel test, contact 208082561 conv c7c7888a):
// model emitted a Portuguese reasoning preamble + a malformed JSON envelope
// using the Portuguese key "resposta" (not "respuesta"). The parser fell
// through and the ENTIRE raw output reached the customer. This fallback +
// the multi-key support below close that hole.
const SAFE_FALLBACK_TEXT =
  "Un momento por favor, te conecto con un compañero del equipo 🙏";

// Heuristics that an AI output is "leaked reasoning" rather than a clean
// customer-facing reply. Any hit forces the safe fallback + escalation.
const REASONING_LEAK_PATTERNS: RegExp[] = [
  // Markdown code-fence remnants. Legitimate output never contains a fence
  // after we've stripped the outer wrapper.
  /```\s*json/i,
  // Literal JSON keys appearing as plain text — strong signal that a JSON
  // envelope was emitted but parsing failed mid-string.
  /["']\s*(?:respuesta|resposta|answer|response)\s*["']\s*:/i,
  /["']\s*fuentes\s*["']\s*:/i,
  // Meta-commentary openers in ES / PT / EN. The list is intentionally
  // narrow: matching a phrase like "the customer is frustrated" anchored
  // to the start of the text is high-precision (a real reply almost never
  // begins this way).
  /^\s*(?:o cliente|el cliente|the customer|the user)\s+(?:está|esta|is)\s+(?:frustrado|frustrada|frustrated|confused|confuso|asking|preguntando|pidiendo)/i,
  /^\s*(?:vou ser direto|voy a ser directo|let me be direct|preciso ser honesto|necesito ser honesto|i need to be honest|i need to analyze|preciso analisar|let me analyze)/i,
  /^\s*(?:now i need to|now let me|then i will|i'll explain|i will explain|then i need to|first i'll|first let me)/i,
];

function looksLikeLeakedReasoning(text: string): boolean {
  return REASONING_LEAK_PATTERNS.some((p) => p.test(text));
}

// Availability-claim patterns. The model is supposed to ONLY claim a
// concrete slot (date confirmed / "hay lugar" / "AM disponible") when
// `consultar_disponibilidad` was called in the current turn AND returned
// real slots. Under customer pressure ("¿tenés o no?", "confirmá ya"),
// the model occasionally caves and fabricates a "yes, there's space"
// without re-calling the tool. This guard pairs with the
// DISPONIBILIDAD—NUNCA-CAVE-A-PRESIÓN prompt rule.
//
// 2026-06-04 incident: turn 5, Francisco said "Ya verifiqué disponibilidad
// para el 22 de junio y hay lugar" without invoking the tool that turn.
//
// False-positive avoidance:
//   - "Necesito verificar" / "Te confirmo en cuanto tenga" — future-tense
//     promises do NOT match (patterns target past/perfect-tense claims).
//   - "Voy a verificar" / "verificaré" — do NOT match; only "ya verifiqué"
//     and "verifiqué disponibilidad" hit.
const AVAILABILITY_CLAIM_PATTERNS: RegExp[] = [
  /\bya\s+verifiqu[eé]\b/i,
  /\bverifiqu[eé]\s+(?:la\s+)?disponibilidad\b/i,
  /\b(?:ya\s+)?confirm[eé]\s+(?:la\s+)?disponibilidad\b/i,
  /\bhay\s+(?:lugar|espacio|cupo|disponibilidad)\b/i,
  /\btu\s+(?:fecha|d[íi]a|reserva|cupo)\s+(?:est[áa]\s+(?:libre|disponible)|qued[oó]\s+confirmad[ao])\b/i,
  /\b(?:AM|PM|nocturn[oa])\s+(?:est[áa]\s+)?disponible\b/i,
  /\bte\s+(?:lo|la)\s+agendo\b/i,
  /\bqued(?:a|ó)\s+confirmad[ao]\s+(?:el\s+cupo|tu?\s+(?:lugar|fecha))\b/i,
  /\balready\s+(?:verified|confirmed)\s+(?:availability|your)\b/i,
  /\byour\s+(?:date|spot|booking)\s+is\s+confirmed\b/i,
  /\bwe\s+have\s+(?:space|availability|a\s+spot)\b/i,
  /\bgot\s+you\s+a\s+spot\b/i,
];

function claimsAvailability(text: string): boolean {
  return AVAILABILITY_CLAIM_PATTERNS.some((p) => p.test(text));
}

const AVAILABILITY_FALLBACK_TEXT: Record<string, string> = {
  es: "Sigo verificando con el equipo — apenas tenga la confirmación te aviso 🙏. Mientras tanto, ¿te paso la info del curso o arrancamos con la seña?",
  en: "Still confirming with the team — I'll write the moment I have it 🙏. Want me to send the course info or start the deposit meanwhile?",
  pt: "Estou confirmando com a equipa — aviso assim que tiver 🙏. Quer que eu envie a info do curso enquanto isso?",
};

function availabilityFallback(expectedLanguage?: string): string {
  const lang = expectedLanguage?.toLowerCase() ?? "";
  if (lang === "english" || lang === "en") return AVAILABILITY_FALLBACK_TEXT.en!;
  if (lang === "português" || lang === "portugues" || lang === "pt") {
    return AVAILABILITY_FALLBACK_TEXT.pt!;
  }
  return AVAILABILITY_FALLBACK_TEXT.es!;
}

// Empty-text fallback (Miguel 2026-06-10 incident: 6-day diving request →
// AI called consultar_disponibilidad 4 times across rounds, never produced
// text, panel rendered empty bubble = "queda colgado"). Defense in depth:
// the final-round `tool_choice: none` already forces the model to emit
// text, but if it ever emits an empty/whitespace block (max_tokens cut,
// SDK quirk, prompt bug) we substitute a clarifying ask so the customer
// gets SOMETHING instead of silence. Localized per `expectedLanguage`.
//
// Two variants depending on whether tools were called this turn:
//  - hadToolCalls=true  → AI was investigating but couldn't summarize.
//    Ask for a course + party-size disambiguation.
//  - hadToolCalls=false → AI couldn't even pick a tool. Ask to restate.
export const EMPTY_TEXT_FALLBACK: Record<
  string,
  { withTools: string; bareMessage: string }
> = {
  es: {
    withTools:
      "Disculpá, necesito más información para confirmarte. ¿Podés decirme qué curso te interesa (Try Scuba, Open Water, Advanced, Rescue, fun dives) y para cuántas personas? Así te paso disponibilidad y precios exactos 🙏",
    bareMessage:
      "Disculpá, no pude procesar tu mensaje recién. ¿Podés repetirme la consulta? Si querés podés contarme qué curso te interesa y para qué fecha 🙏",
  },
  en: {
    withTools:
      "Sorry, I need a bit more info to confirm. Could you tell me which course you're after (Try Scuba, Open Water, Advanced, Rescue, fun dives) and how many people? Then I can give you exact availability and price 🙏",
    bareMessage:
      "Sorry, I couldn't process that message. Could you repeat your question? Feel free to tell me which course you're interested in and your dates 🙏",
  },
  pt: {
    withTools:
      "Desculpa, preciso de mais info para confirmar. Podes me dizer que curso queres (Try Scuba, Open Water, Advanced, Rescue, fun dives) e para quantas pessoas? Aí te passo disponibilidade e preços 🙏",
    bareMessage:
      "Desculpa, não consegui processar a tua mensagem. Podes repetir? Se quiseres conta-me que curso te interessa e para que data 🙏",
  },
};

export function pickEmptyTextFallback(input: {
  expectedLanguage?: string | undefined;
  hadToolCalls: boolean;
}): string {
  const lang = input.expectedLanguage?.toLowerCase() ?? "";
  const bundle =
    lang === "english" || lang === "en"
      ? EMPTY_TEXT_FALLBACK.en!
      : lang === "português" || lang === "portugues" || lang === "pt"
        ? EMPTY_TEXT_FALLBACK.pt!
        : EMPTY_TEXT_FALLBACK.es!;
  return input.hadToolCalls ? bundle.withTools : bundle.bareMessage;
}

// Portuguese-only orthography + function-word patterns are imported from
// language.ts which now owns them as the single source of truth (used
// both for inbound detection and outbound drift checking). See the
// language.ts header for the full rationale.
//
// 2026-05-15 (Tony retest of Miguel scenario A): on turn 11 the model
// emitted a clean JSON envelope whose `respuesta` value started "Entendo
// perfeitamente 😊 Fazendo o Open Water, vocês vão mergulhar..." — pure
// Portuguese. The reasoning-leak guard didn't catch it (the text isn't
// internal monologue, it's a customer reply) and the prompt-level
// language anchor in Bloque 4 had been bypassed under frustration.
// This is the last line of defence for that failure mode.

// Phrases that mean "I'm handing off to a human". When any of these appears
// in the AI's reply but escalation_reason came back null, the server-side
// handoff path (apply ai_escalation tag + set motivo_escalation custom
// field) silently doesn't fire — customer reads "I'll connect you" then
// nobody contacts them. Parser auto-injects "complaint" as a safety net.
//
// 2026-05-15 (Tony retest #3, v2.4 prompt): the model emitted the escalation
// text exactly as instructed by §repeat-objection STOP-table — but
// repeatedly omitted the escalation_reason field despite an AUTO-CHECK
// subsection demanding it. LLM judgment on structured metadata is
// unreliable; the server-side fallback is deterministic.
const ESCALATION_PHRASE_PATTERNS: RegExp[] = [
  // Direct handoff phrasing — "I'm connecting you to the team".
  /\bte\s+conecto\b/i,
  /\bvoy\s+a\s+conectarte\b/i,
  /\bconectarte\s+con\s+el\s+equipo\b/i,
  /\bte\s+paso\s+a\b/i,
  /\bte\s+paso\s+al\s+equipo\b/i,
  /\bte\s+dejo\s+con\b/i,
  /\bte\s+derivo\b/i,
  /\bderivar\s+al\s+equipo\b/i,
  /\bI'?ll\s+connect\s+you\b/i,
  /\blet\s+me\s+connect\s+you\b/i,
  /\bI'?ll\s+transfer\s+you\b/i,
  // Graceful-goodbye phrasing — §sentimiento-negativo's "despedida
  // cordial" pattern. The AI says farewell without an explicit
  // handoff verb but the customer is leaving and a human should
  // still get the chance to recover the lead. Added 2026-05-15 after
  // Tony's scenario B test: AI emitted "Te entiendo, ojalá les vaya
  // genial 🙏 Si en algún momento cambian de idea, acá estamos."
  // perfectly matching the prompt template, but omitted
  // escalation_reason and the ai_escalation tag never fired.
  /\bojal[áa]\s+(?:te|le|les)\s+vaya\b/i,
  /\bsi\s+(?:en\s+alg[úu]n\s+momento\s+)?cambi(?:as|an)\s+de\s+idea\b/i,
  /\bac[áa]\s+estamos\b/i,
  /\baqu[íi]\s+estamos\s+si\b/i,
];

function mentionsHandoff(text: string): boolean {
  return ESCALATION_PHRASE_PATTERNS.some((p) => p.test(text));
}

// Client-message exit-intent patterns. When the cliente's incoming text
// matches any of these, the contact is signalling they want to leave for
// a competitor / are unhappy / are sarcastically saying goodbye —
// §sentimiento-negativo demands escalation_reason=complaint in that case
// REGARDLESS of how the AI replies. Detecting on the input side is more
// reliable than detecting on the AI output, because the model sometimes
// misses the exit cue and pivots to a sales pitch (see 2026-05-15
// scenario-B retest: AI offered Open Water upsell after "vamos con
// otra secuela" instead of acknowledging the goodbye).
const CLIENT_EXIT_INTENT_PATTERNS: RegExp[] = [
  // "Otra escuela / otra secuela (typo) / otro centro / otra empresa /
  // otro lugar / otro dive shop" — competitor switch.
  /\botra\s+(?:escuela|secuela|empresa|opci[óo]n)\b/i,
  /\botro\s+(?:centro|lugar|dive\s*shop|sitio|operador)\b/i,
  // "Me voy / nos vamos / lo dejamos / no vamos a reservar"
  /\b(?:me|nos)\s+vamos\b/i,
  /\blo\s+dejamos\b/i,
  /\bno\s+vamos\s+a\s+reservar\b/i,
  // Sarcastic / dissatisfied complaints
  /\bgracias\s+por\s+nada\b/i,
  /\bqu[ée]\s+pena\b/i,
  /\bqu[ée]\s+l[áa]stima\b/i,
  /\bqu[ée]\s+ruda?\s+(?:tu|esa)\s+respuesta\b/i,
  /\bqu[ée]\s+grosero\b/i,
  /\bno\s+me\s+ayudaste\b/i,
  // "Prefiero ir a X" / "voy a mirar otras opciones"
  /\bprefiero\s+ir\s+a\b/i,
  /\bmirar\s+otras\s+opciones\b/i,
];

function clientShowsExitIntent(text: string): boolean {
  return CLIENT_EXIT_INTENT_PATTERNS.some((p) => p.test(text));
}

/**
 * Extract the customer-facing `respuesta` string from a model output that may
 * have used any of several keys. Long Spanish-dominated conversations can
 * cause the model to drift to Portuguese (close cognate language), in which
 * case it sometimes emits the Portuguese key `resposta` — accept it. We also
 * accept English variants for forward-compat with future prompt rewrites.
 *
 * 2026-05-14: added after a single observed Portuguese-drift incident where
 * a missing `respuesta` collapsed the parser into the raw-text fallback and
 * the customer saw the model's internal monologue.
 */
function extractRespuesta(j: Record<string, unknown>): string | null {
  const keys = ["respuesta", "resposta", "answer", "response"] as const;
  for (const k of keys) {
    const v = j[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

/**
 * Parse the {respuesta, fuentes, escalation_reason?, descuento?} JSON
 * envelope. Tolerates pre/post fence tokens (markdown, "```json").
 *
 * Layered defense (added 2026-05-14):
 *   1. Multi-key extraction: accept respuesta/resposta/answer/response so a
 *      language drift in the key name doesn't collapse the parse.
 *   2. Reasoning-leak guard: if the model's text looks like internal
 *      monologue (meta-commentary, JSON key fragments, code-fence remnants),
 *      replace it with a safe fallback and force escalation=complaint. The
 *      caller sees `reasoningLeak: true` so it can log + alert.
 *   3. On full parse failure we run the same guard against the raw text; a
 *      clean plain-text reply still passes through (old prompts may legit
 *      reply without JSON), but anything matching the reasoning patterns
 *      gets the safe fallback instead of being shown to the customer.
 *
 * `escalation_reason` and `descuento` are validated against the canonical
 * sets (ESCALATION_REASONS, DESCUENTO_VALUES). Anything else collapses to
 * null so we never write junk to Respond.io custom fields.
 */
export function parseStructuredAnswer(
  raw: string,
  opts?: { expectedLanguage?: string; incomingMessage?: string },
): {
  text: string;
  fuentes: string[];
  escalationReason: EscalationReason | null;
  descuento: DescuentoValue | null;
  reasoningLeak: boolean;
  // ── Colomba/GA additions ───────────────────────────────────────────────
  closeReason: CloseReason | null;
  notes: string | null;
  sendProductCardIds: string[] | null;
} {
  // Conversation-language drift check (only fires when the caller passed
  // an expectedLanguage). Spanish is the only mismatch we currently flag
  // because that's the failure mode observed in prod.
  const flagDriftToPortuguese =
    opts?.expectedLanguage === "español" || opts?.expectedLanguage === "es";

  // L11 — exit-intent override. If the client's incoming message matches
  // any exit pattern (going to a competitor / sarcastic goodbye /
  // dissatisfaction), force escalation_reason=complaint no matter what
  // the AI replied. This is the deterministic safety net for the case
  // where the model misses the exit cue at the prompt level.
  const forceComplaintFromInput =
    opts?.incomingMessage !== undefined &&
    clientShowsExitIntent(opts.incomingMessage);

  if (!raw)
    return {
      text: "",
      fuentes: [],
      escalationReason: null,
      descuento: null,
      reasoningLeak: false,
      closeReason: null,
      notes: null,
      sendProductCardIds: null,
    };

  // Strip outer code fences if present.
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  // The model can emit MULTIPLE JSON envelopes when it self-corrects mid-
  // response (e.g. "{respuesta:'Hola'} Wait — let me retake: {respuesta:
  // 'better answer'}"). We want the LAST envelope that has a usable
  // respuesta string — that is the model's final intent.
  //
  // We scan all balanced top-level `{ ... }` blocks (depth-tracking, ignoring
  // braces inside string literals) and JSON.parse each; the last one with a
  // valid respuesta wins.
  const candidates = extractBalancedObjects(stripped);

  for (let i = candidates.length - 1; i >= 0; i--) {
    const blob = candidates[i]!;
    try {
      const j = JSON.parse(blob) as Record<string, unknown>;
      const respuesta = extractRespuesta(j);
      if (respuesta !== null) {
        if (
          looksLikeLeakedReasoning(respuesta) ||
          (flagDriftToPortuguese && looksLikePortuguese(respuesta))
        ) {
          return {
            text: SAFE_FALLBACK_TEXT,
            fuentes: [],
            escalationReason: "complaint",
            descuento: null,
            reasoningLeak: true,
            closeReason: null,
            notes: null,
            sendProductCardIds: null,
          };
        }
        const fuentes = Array.isArray(j.fuentes)
          ? j.fuentes.filter((x): x is string => typeof x === "string")
          : [];
        let escalationReason = coerceEscalationReason(j.escalation_reason);
        // L10 safety net: if the reply text announces a handoff but the
        // model forgot to set escalation_reason (observed repeatedly in
        // production even with explicit prompt instructions), force the
        // field to "complaint" so the server-side tag + custom field
        // path still fires and a human actually gets routed.
        if (escalationReason === null && mentionsHandoff(respuesta)) {
          escalationReason = "complaint";
        }
        // L11 safety net: the client's incoming message signalled exit
        // intent ("vamos con otra escuela", "me voy", "qué ruda", etc.).
        // Force complaint even if the AI's reply doesn't mention any
        // handoff verb — the model sometimes misses the exit cue and
        // pivots to a sales pitch.
        if (escalationReason === null && forceComplaintFromInput) {
          escalationReason = "complaint";
        }
        return {
          text: respuesta,
          fuentes,
          escalationReason,
          descuento: coerceDescuento(j.descuento),
          reasoningLeak: false,
          closeReason: coerceCloseReason(j.close_reason),
          notes: coerceNotes(j.notes),
          sendProductCardIds: coerceSendProductCard(j.send_product_card),
        };
      }
    } catch {
      // Try the next candidate.
    }
  }

  // No usable JSON envelope. Decide between (a) the model legitimately
  // replied in plain text — accept as-is for backwards compat with older
  // prompts — and (b) the model emitted reasoning preamble that the parser
  // couldn't extract — block with the safe fallback so the customer never
  // sees internal monologue.
  if (
    looksLikeLeakedReasoning(stripped) ||
    (flagDriftToPortuguese && looksLikePortuguese(stripped))
  ) {
    return {
      text: SAFE_FALLBACK_TEXT,
      fuentes: [],
      escalationReason: "complaint",
      descuento: null,
      reasoningLeak: true,
      closeReason: null,
      notes: null,
      sendProductCardIds: null,
    };
  }
  // L10 + L11 same safety nets for the no-JSON branch — plain-text
  // replies that announce a handoff OR client exit-intent also get the
  // auto-injected complaint reason.
  const escalationReason =
    mentionsHandoff(stripped) || forceComplaintFromInput ? "complaint" : null;
  return {
    text: stripped,
    fuentes: [],
    escalationReason,
    descuento: null,
    reasoningLeak: false,
    closeReason: null,
    notes: null,
    sendProductCardIds: null,
  };
}

function coerceEscalationReason(value: unknown): EscalationReason | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return (ESCALATION_REASONS as readonly string[]).includes(normalized)
    ? (normalized as EscalationReason)
    : null;
}

/** Coerce close_reason value to canonical CLOSE_REASONS or null. */
function coerceCloseReason(value: unknown): CloseReason | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return (CLOSE_REASONS as readonly string[]).includes(trimmed)
    ? (trimmed as CloseReason)
    : null;
}

/** Free-text notes field (Colomba — used mostly for instructor_request async). */
function coerceNotes(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 2000) return null;
  return trimmed;
}

/**
 * Normalise send_product_card to a string[] of up to 2 ids, or null. The
 * allowlist (per-sede ALLOWED_PRODUCT_IDS_*) is enforced separately by the
 * tool handler — here we just shape the value.
 */
function coerceSendProductCard(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim().length > 0) return [value.trim()];
  if (Array.isArray(value)) {
    const ids = value
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim());
    if (ids.length === 0) return null;
    // Spec caps at 2 cards per turn. We TRUNCATE silently rather than
    // reject the whole call — the tool handler will report 'too_many_cards'
    // separately if it sees > 2, but at the parser level we just hand the
    // caller a clean slice and let the handler enforce.
    return ids.slice(0, 2);
  }
  return null;
}

function coerceDescuento(value: unknown): DescuentoValue | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  // Accept the canonical strings as-is. Also accept "0%" / "0" /
  // "sin descuento" (case-insensitive) as aliases for "Sin descuento" because
  // the prompt may not enforce the casing perfectly across languages.
  if ((DESCUENTO_VALUES as readonly string[]).includes(trimmed)) {
    return trimmed as DescuentoValue;
  }
  const lower = trimmed.toLowerCase();
  if (lower === "sin descuento" || lower === "0%" || lower === "0") {
    return "Sin descuento";
  }
  if (lower === "5%" || lower === "5") return "5%";
  if (lower === "10%" || lower === "10") return "10%";
  return null;
}

/**
 * Extract every top-level balanced `{...}` substring from `s`. Ignores braces
 * that appear inside string literals so a JSON value like `"a } b"` cannot
 * close the object prematurely. Handles backslash-escaped quotes.
 */
function extractBalancedObjects(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push(s.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return out;
}

function computeCost(model: AnthropicModel, usage: Anthropic.Message["usage"]): CostBreakdown {
  const pricing = ANTHROPIC_PRICING[model];
  const input = usage.input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;

  const totalUsd =
    (input * pricing.inputUsdPerMTok +
      cacheRead * pricing.cacheReadUsdPerMTok +
      cacheWrite * pricing.cacheWriteUsdPerMTok +
      output * pricing.outputUsdPerMTok) /
    1_000_000;

  const denominator = cacheRead + input;
  const cacheHitRate = denominator === 0 ? 0 : cacheRead / denominator;

  return {
    inputTokens: input,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    outputTokens: output,
    totalUsd,
    cacheHitRate,
  };
}

async function logCallToDb(args: {
  conversacionId: string;
  sedeId: string;
  model: string;
  promptVersionId?: string | undefined;
  usage: Anthropic.Message["usage"] | undefined;
  latencyMs: number;
  toolCalls: string[];
  status: "success" | "error" | "timeout";
  errorMessage?: string;
}): Promise<void> {
  try {
    const db = getDb();
    const cost = args.usage
      ? computeCost(args.model as AnthropicModel, args.usage)
      : undefined;
    const row: NewLlamadaApi = {
      conversacionId: args.conversacionId,
      sedeId: args.sedeId,
      model: args.model,
      promptVersionId: args.promptVersionId ?? null,
      inputTokens: args.usage?.input_tokens ?? null,
      cacheReadTokens: args.usage?.cache_read_input_tokens ?? null,
      cacheWriteTokens: args.usage?.cache_creation_input_tokens ?? null,
      outputTokens: args.usage?.output_tokens ?? null,
      totalCostUsd: cost ? cost.totalUsd.toFixed(6) : null,
      latencyMs: args.latencyMs,
      cacheHit: cost ? cost.cacheReadTokens > 0 : null,
      toolUseCalled: args.toolCalls.length > 0 ? args.toolCalls : null,
      status: args.status,
      errorMessage: args.errorMessage ?? null,
    };
    await db.insert(llamadasApi).values(row);
  } catch (err) {
    // Logging failure must not propagate to the user response.
    getLogger().error({ err }, "failed to log llamadas_api row");
  }
}

/**
 * Best-effort daily spend guard. Sums today's totalCostUsd from llamadas_api
 * for this sede and refuses the call if the cap is hit. We accept the small
 * race between read and insert because the cost cap is a soft ceiling, not a
 * security boundary; Anthropic's own org-level hard limit is the real cap.
 */
async function assertWithinDailyBudget(sedeId: string): Promise<void> {
  const env = loadEnv();
  const limit = env.ANTHROPIC_DAILY_SPEND_LIMIT_USD;
  if (limit <= 0) return;

  const db = getDb();
  let spent = 0;
  try {
    const rows = await db.execute<{ spent: string }>(sql`
      SELECT COALESCE(SUM(total_cost_usd), 0)::text AS spent
        FROM llamadas_api
       WHERE sede_id = ${sedeId}
         AND created_at >= date_trunc('day', NOW())
    `);
    // postgres-js returns an array-like; Drizzle's `execute` returns the
    // driver's native result. We accept either shape.
    const first = (rows as unknown as { spent: string }[])[0];
    spent = Number(first?.spent ?? "0");
  } catch (err) {
    // If the budget query fails we let the call through rather than block
    // user replies — the Anthropic-side hard limit remains the true ceiling.
    getLogger().warn({ err }, "budget guard query failed; allowing call");
    return;
  }

  if (spent >= limit) {
    throw new CostLimitError(limit, spent);
  }
}
