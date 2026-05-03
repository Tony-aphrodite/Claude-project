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
};

export type CallClaudeResult = {
  text: string;
  fuentes: string[];
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

  // We allow at most one tool_use round-trip per request to keep latency
  // bounded. The system prompt instructs Claude to call the tool at most once.
  const MAX_TOOL_ROUNDS = 1;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: input.system,
        tools: [consultarDisponibilidadTool, solicitarDepositoTool],
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
      // {respuesta, fuentes} envelope; if parsing fails (older prompt versions
      // or model dropped to plain text) we fall back to the raw text and
      // record empty fuentes — never block the user response on format drift.
      const rawText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      const { text, fuentes } = parseStructuredAnswer(rawText);

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

      log.info(
        {
          sede: input.sedeId,
          model,
          latencyMs,
          cacheHitRate: cost.cacheHitRate,
          costUsd: cost.totalUsd,
          toolCalls,
          fuentesCount: fuentes.length,
        },
        "claude call ok",
      );

      return { text, fuentes, toolCalls, cost, latencyMs, model };
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

  return {
    type: "tool_result",
    tool_use_id: tu.id,
    content: `Error: tool "${tu.name}" no soportada`,
    is_error: true,
  };
}

/**
 * Parse the {respuesta, fuentes} JSON envelope. Tolerates pre/post fence
 * tokens (markdown, "```json"). On any parse failure we degrade gracefully:
 * the raw text becomes the response and fuentes is empty — the panel will
 * surface the missing-citations status so we can fix the prompt.
 */
export function parseStructuredAnswer(raw: string): {
  text: string;
  fuentes: string[];
} {
  if (!raw) return { text: "", fuentes: [] };

  // Strip code fences if present.
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  // Find the first balanced JSON object. The model occasionally adds a tiny
  // pre-amble despite the instruction; we match the outermost {...} block.
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) return { text: stripped, fuentes: [] };

  try {
    const j = JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;
    const text =
      typeof j.respuesta === "string" && j.respuesta.length > 0
        ? j.respuesta
        : stripped;
    const fuentes = Array.isArray(j.fuentes)
      ? j.fuentes.filter((x): x is string => typeof x === "string")
      : [];
    return { text, fuentes };
  } catch {
    return { text: stripped, fuentes: [] };
  }
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
