// ============================================================================
// Suite runner. Walks every case in parallel (capped concurrency), invokes
// the SUT (system under test — usually the production handler with a fresh
// prompt version), runs both layers, marks cases for human review, persists
// results.
//
// The runner is deliberately decoupled from the production webhook: it talks
// directly to the prompt builder + Anthropic so we can swap the version
// under test without restarting the server.
// ============================================================================

import Anthropic from "@anthropic-ai/sdk";

import {
  ANTHROPIC_PRICING,
  CONCURRENCY,
  REGRESSION,
  TIMEOUTS,
  type AnthropicModel,
} from "@dpm/shared";

import { checkDeterministic } from "./layers/deterministic.js";
import { LlmJudge } from "./layers/llm-judge.js";
import type {
  CaseResult,
  JudgeScores,
  RegressionCase,
  SuiteDiff,
  SuiteResult,
} from "./types.js";

export type RunSuiteOptions = {
  apiKey: string;
  promptVersionId: string;
  systemPrompt: string;
  sedeKbByName: Record<string, string>;
  cases: RegressionCase[];
  modelUnderTest?: AnthropicModel;
  judgeModel?: string;
  concurrency?: number;
  // Skip the LLM judge (Layer 2) for cheap deterministic-only sanity runs.
  skipJudge?: boolean;
};

export async function runSuite(opts: RunSuiteOptions): Promise<SuiteResult> {
  const startedAt = new Date().toISOString();
  const concurrency = opts.concurrency ?? CONCURRENCY.REGRESSION_WORKERS;
  const modelUT = (opts.modelUnderTest ?? "claude-sonnet-4-6") as AnthropicModel;

  const sut = new Anthropic({
    apiKey: opts.apiKey,
    timeout: TIMEOUTS.CLAUDE_API_MS,
    maxRetries: 1,
  });
  const judge = opts.skipJudge
    ? null
    : new LlmJudge({
        apiKey: opts.apiKey,
        model: opts.judgeModel ?? "claude-sonnet-4-6",
      });

  const results: CaseResult[] = new Array(opts.cases.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, opts.cases.length) }, async () => {
      while (cursor < opts.cases.length) {
        const idx = cursor++;
        const c = opts.cases[idx];
        if (!c) continue;
        results[idx] = await runOneCase(c, opts, sut, judge, modelUT);
      }
    }),
  );

  const finishedAt = new Date().toISOString();

  const cleanResults = results.filter(Boolean);
  const passedDet = cleanResults.filter((r) => r.deterministic.passed).length;
  const judged = cleanResults.filter((r) => r.judge !== null) as (CaseResult & {
    judge: JudgeScores;
  })[];
  const passRate = cleanResults.length === 0 ? 0 : passedDet / cleanResults.length;

  const avgScores = averageScores(judged.map((r) => r.judge));
  const totalCostUsd = cleanResults.reduce((s, r) => s + r.costUsd, 0);
  const averageLatencyMs =
    cleanResults.length === 0
      ? 0
      : cleanResults.reduce((s, r) => s + r.latencyMs, 0) / cleanResults.length;

  return {
    promptVersionId: opts.promptVersionId,
    startedAt,
    finishedAt,
    totalCases: cleanResults.length,
    results: cleanResults,
    passRate,
    averageScores: avgScores,
    totalCostUsd,
    averageLatencyMs,
    reviewQueueSize: cleanResults.filter((r) => r.needsHumanReview).length,
  };
}

async function runOneCase(
  c: RegressionCase,
  opts: RunSuiteOptions,
  sut: Anthropic,
  judge: LlmJudge | null,
  modelUT: AnthropicModel,
): Promise<CaseResult> {
  const t0 = Date.now();
  const kb = opts.sedeKbByName[c.sedeName] ?? "(KB no provista para esta sede)";
  const historyTranscript = c.history
    .map((m) => `${labelOf(m.sender)}${m.agente ? ` (${m.agente})` : ""}: ${m.content}`)
    .join("\n");

  const dynamic = `=== CONTEXTO DINÁMICO ===
SEDE: ${c.sedeName}
HORA ACTUAL EN LA SEDE: ${new Date().toISOString()}

=== HISTORIAL ===
${historyTranscript || "(sin historial — primer mensaje)"}

=== MENSAJE DEL CLIENTE ===
${c.clientMessage}`;

  let response = "";
  let cost = 0;
  let cacheHitRate = 0;
  try {
    const res = await sut.messages.create({
      model: modelUT,
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: opts.systemPrompt,
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `=== KB DE LA SEDE: ${c.sedeName} ===\n${kb}`,
              cache_control: { type: "ephemeral", ttl: "1h" },
            },
          ],
        },
        { role: "assistant", content: "Entendido." },
        { role: "user", content: dynamic },
      ],
    });
    response = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    cost = computeCost(modelUT, res.usage);
    const cacheRead = res.usage.cache_read_input_tokens ?? 0;
    const denom = cacheRead + (res.usage.input_tokens ?? 0);
    cacheHitRate = denom === 0 ? 0 : cacheRead / denom;
  } catch (err) {
    return {
      caseId: c.id,
      generatedResponse: `[ERROR] ${(err as Error).message}`,
      latencyMs: Date.now() - t0,
      costUsd: 0,
      cacheHitRate: 0,
      deterministic: {
        passed: false,
        failures: [{ rule: "sut_error", detail: (err as Error).message }],
      },
      judge: null,
      needsHumanReview: true,
      reviewReason: "SUT call failed",
    };
  }

  const deterministic = checkDeterministic(c, response);
  const judgeScores = judge ? await judge.judge(c, response) : null;
  const needsReview =
    !deterministic.passed ||
    (judgeScores !== null &&
      (judgeScores.confidence < REGRESSION.HUMAN_REVIEW_CONFIDENCE_THRESHOLD ||
        judgeScores.overall <= 2));

  return {
    caseId: c.id,
    generatedResponse: response,
    latencyMs: Date.now() - t0,
    costUsd: cost,
    cacheHitRate,
    deterministic,
    judge: judgeScores,
    needsHumanReview: needsReview,
    reviewReason: needsReview
      ? !deterministic.passed
        ? "deterministic_failed"
        : judgeScores && judgeScores.overall <= 2
          ? "low_judge_score"
          : "low_judge_confidence"
      : null,
  };
}

function computeCost(model: AnthropicModel, usage: Anthropic.Message["usage"]): number {
  const p = ANTHROPIC_PRICING[model];
  const input = usage.input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  return (
    (input * p.inputUsdPerMTok +
      cacheRead * p.cacheReadUsdPerMTok +
      cacheWrite * p.cacheWriteUsdPerMTok +
      output * p.outputUsdPerMTok) /
    1_000_000
  );
}

function averageScores(
  scores: JudgeScores[],
): SuiteResult["averageScores"] {
  if (scores.length === 0) {
    return {
      tone: 0,
      accuracy: 0,
      relevance: 0,
      antiHallucination: 0,
      effectiveness: 0,
      overall: 0,
    };
  }
  const sum = scores.reduce(
    (acc, s) => ({
      tone: acc.tone + s.tone,
      accuracy: acc.accuracy + s.accuracy,
      relevance: acc.relevance + s.relevance,
      antiHallucination: acc.antiHallucination + s.antiHallucination,
      effectiveness: acc.effectiveness + s.effectiveness,
      overall: acc.overall + s.overall,
    }),
    { tone: 0, accuracy: 0, relevance: 0, antiHallucination: 0, effectiveness: 0, overall: 0 },
  );
  return {
    tone: sum.tone / scores.length,
    accuracy: sum.accuracy / scores.length,
    relevance: sum.relevance / scores.length,
    antiHallucination: sum.antiHallucination / scores.length,
    effectiveness: sum.effectiveness / scores.length,
    overall: sum.overall / scores.length,
  };
}

function labelOf(sender: "cliente" | "ai" | "agente_humano"): string {
  return sender === "cliente" ? "CLIENTE" : sender === "ai" ? "AI" : "AGENTE";
}

// ── Diff computation ────────────────────────────────────────────────────────
export function computeDiff(before: SuiteResult, after: SuiteResult): SuiteDiff {
  const beforeById = new Map(before.results.map((r) => [r.caseId, r]));
  const afterById = new Map(after.results.map((r) => [r.caseId, r]));

  const newRegressions: string[] = [];
  const newFixes: string[] = [];
  for (const [id, b] of beforeById) {
    const a = afterById.get(id);
    if (!a) continue;
    const bPassed = b.deterministic.passed && (b.judge?.overall ?? 0) >= 3;
    const aPassed = a.deterministic.passed && (a.judge?.overall ?? 0) >= 3;
    if (bPassed && !aPassed) newRegressions.push(id);
    if (!bPassed && aPassed) newFixes.push(id);
  }

  const sd: SuiteDiff["scoreDeltas"] = {
    tone: after.averageScores.tone - before.averageScores.tone,
    accuracy: after.averageScores.accuracy - before.averageScores.accuracy,
    relevance: after.averageScores.relevance - before.averageScores.relevance,
    antiHallucination:
      after.averageScores.antiHallucination - before.averageScores.antiHallucination,
    effectiveness: after.averageScores.effectiveness - before.averageScores.effectiveness,
    overall: after.averageScores.overall - before.averageScores.overall,
  };

  return { before, after, scoreDeltas: sd, newRegressions, newFixes };
}
