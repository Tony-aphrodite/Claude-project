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

export type ToolHandlers = {
  consultar_disponibilidad: ConsultarDisponibilidadHandler;
  solicitar_deposito: SolicitarDepositoHandler;
  enviar_catalogo: EnviarCatalogoHandler;
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
] as const;
export type EscalationReason = (typeof ESCALATION_REASONS)[number];

// Canonical `descuento` values — must match the 3 List values Miguel keeps
// in Respond.io ("Sin descuento" / "5%" / "10%"). The AI never quotes >10%
// (escalates instead), so these 3 cover the full range.
export const DESCUENTO_VALUES = ["Sin descuento", "5%", "10%"] as const;
export type DescuentoValue = (typeof DESCUENTO_VALUES)[number];

export type CallClaudeResult = {
  text: string;
  fuentes: string[];
  escalationReason: EscalationReason | null;
  descuento: DescuentoValue | null;
  toolCalls: string[];
  cost: CostBreakdown;
  latencyMs: number;
  model: AnthropicModel;
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

  // We allow up to two tool_use round-trips per request. Two is enough for
  // common combos (e.g. enviar_catalogo + solicitar_deposito on the same
  // turn) without unbounded latency. The system prompt still encourages
  // at most one functional tool per turn.
  const MAX_TOOL_ROUNDS = 2;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: input.system,
        tools: [
          consultarDisponibilidadTool,
          solicitarDepositoTool,
          enviarCatalogoTool,
        ],
        messages,
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
      const { text, fuentes, escalationReason, descuento, reasoningLeak } =
        parseStructuredAnswer(rawText, {
          expectedLanguage: input.expectedLanguage,
        });

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
        },
        "claude call ok",
      );

      return {
        text,
        fuentes,
        escalationReason,
        descuento,
        toolCalls,
        cost,
        latencyMs,
        model,
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

  return {
    type: "tool_result",
    tool_use_id: tu.id,
    content: `Error: tool "${tu.name}" no soportada`,
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

// Portuguese-only orthography + function-word patterns. These rarely appear
// in Spanish prose, so when the conversation is detected as Spanish but the
// AI reply hits one of these, it's drift — block + escalate.
//
// 2026-05-15 (Tony retest of Miguel scenario A): on turn 11 the model
// emitted a clean JSON envelope whose `respuesta` value started "Entendo
// perfeitamente 😊 Fazendo o Open Water, vocês vão mergulhar..." — pure
// Portuguese. The reasoning-leak guard didn't catch it (the text isn't
// internal monologue, it's a customer reply) and the prompt-level
// language anchor in Bloque 4 had been bypassed under frustration.
// This is the last line of defence for that failure mode.
const PT_ONLY_PATTERNS: RegExp[] = [
  /\bmergulh/i, // mergulhar / mergulho (ES: bucear / buceo)
  /\bentendo\b/i, // PT 1st-person; ES is "entiendo" with an i
  /\bfazendo\b/i, // PT; ES is "haciendo"
  /\binstrutor\b/i, // PT spelling; ES is "instructor"
  /\bobrigad[ao]\b/i, // PT thanks; ES is "gracias"
  /ç[ãa]o\b/i, // PT "-ção" ending (atenção, opção); ES uses "-ción"
  // Catch-all on PT-only graphemes. JS regex `\b` doesn't treat
  // diacritic chars as word boundaries (ASCII-only), which made the
  // word-boundary version of vocês / você miss in tests. The bare
  // grapheme set is the most robust check — these letters don't appear
  // in any Spanish word.
  /[ãõê]/,
];

function looksLikePortuguese(text: string): boolean {
  return PT_ONLY_PATTERNS.some((p) => p.test(text));
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
  opts?: { expectedLanguage?: string },
): {
  text: string;
  fuentes: string[];
  escalationReason: EscalationReason | null;
  descuento: DescuentoValue | null;
  reasoningLeak: boolean;
} {
  // Conversation-language drift check (only fires when the caller passed
  // an expectedLanguage). Spanish is the only mismatch we currently flag
  // because that's the failure mode observed in prod.
  const flagDriftToPortuguese =
    opts?.expectedLanguage === "español" || opts?.expectedLanguage === "es";

  if (!raw)
    return {
      text: "",
      fuentes: [],
      escalationReason: null,
      descuento: null,
      reasoningLeak: false,
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
          };
        }
        const fuentes = Array.isArray(j.fuentes)
          ? j.fuentes.filter((x): x is string => typeof x === "string")
          : [];
        return {
          text: respuesta,
          fuentes,
          escalationReason: coerceEscalationReason(j.escalation_reason),
          descuento: coerceDescuento(j.descuento),
          reasoningLeak: false,
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
    };
  }
  return {
    text: stripped,
    fuentes: [],
    escalationReason: null,
    descuento: null,
    reasoningLeak: false,
  };
}

function coerceEscalationReason(value: unknown): EscalationReason | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return (ESCALATION_REASONS as readonly string[]).includes(normalized)
    ? (normalized as EscalationReason)
    : null;
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
