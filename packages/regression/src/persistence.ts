// ============================================================================
// Persist regression suite results so the panel can render before/after diffs
// without re-running the suite. We use two tables that we add via the post-
// migration SQL of @dpm/db: regression_runs (suite-level) and
// regression_case_results (per-case).
// ============================================================================

import { sql } from "drizzle-orm";

import { getDb } from "@dpm/db";

import type { SuiteResult } from "./types.js";

export async function persistSuiteResult(suite: SuiteResult): Promise<string> {
  const db = getDb();
  // Use raw SQL because the regression tables live in post-migration.sql
  // (extension-scoped, not modelled in Drizzle so we don't pollute the main
  // app's type surface with operational telemetry tables).
  const inserted = await db.execute<{ id: string }>(sql`
    INSERT INTO regression_runs (
      prompt_version_id,
      started_at,
      finished_at,
      total_cases,
      pass_rate,
      avg_tone,
      avg_accuracy,
      avg_relevance,
      avg_anti_hallucination,
      avg_effectiveness,
      avg_overall,
      total_cost_usd,
      avg_latency_ms,
      review_queue_size
    ) VALUES (
      ${suite.promptVersionId},
      ${suite.startedAt}::timestamptz,
      ${suite.finishedAt}::timestamptz,
      ${suite.totalCases},
      ${suite.passRate},
      ${suite.averageScores.tone},
      ${suite.averageScores.accuracy},
      ${suite.averageScores.relevance},
      ${suite.averageScores.antiHallucination},
      ${suite.averageScores.effectiveness},
      ${suite.averageScores.overall},
      ${suite.totalCostUsd},
      ${suite.averageLatencyMs},
      ${suite.reviewQueueSize}
    )
    RETURNING id::text AS id
  `);
  const runId = (inserted as unknown as { id: string }[])[0]?.id;
  if (!runId) throw new Error("regression_runs insert returned no id");

  for (const r of suite.results) {
    await db.execute(sql`
      INSERT INTO regression_case_results (
        run_id,
        case_id,
        generated_response,
        latency_ms,
        cost_usd,
        cache_hit_rate,
        deterministic_passed,
        deterministic_failures,
        judge_scores,
        needs_human_review,
        review_reason
      ) VALUES (
        ${runId}::uuid,
        ${r.caseId},
        ${r.generatedResponse},
        ${r.latencyMs},
        ${r.costUsd},
        ${r.cacheHitRate},
        ${r.deterministic.passed},
        ${JSON.stringify(r.deterministic.failures)}::jsonb,
        ${r.judge ? JSON.stringify(r.judge) : null}::jsonb,
        ${r.needsHumanReview},
        ${r.reviewReason}
      )
    `);
  }

  return runId;
}
