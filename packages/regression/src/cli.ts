#!/usr/bin/env node
// ============================================================================
// Regression suite CLI.
//
// Usage:
//   pnpm dpm-regression run \
//     --version=v2.4 \
//     --cases=fixtures/regression/cases \
//     --kb-dir=fixtures/regression/kb \
//     [--skip-judge] [--concurrency=5]
//
// Exit codes:
//   0 — pass rate >= MIN_PASS_RATE (95%)
//   1 — runtime error
//   2 — pass rate below threshold (regression detected)
// ============================================================================

import { readFile } from "node:fs/promises";
import path from "node:path";

import { and, desc, eq, isNull } from "drizzle-orm";

import { closeDb, getDb, promptsVersiones, sedes } from "@dpm/db";
import { REGRESSION } from "@dpm/shared";

import { loadCasesFromDir } from "./case-loader.js";
import { persistSuiteResult } from "./persistence.js";
import { runSuite } from "./runner.js";

type Args = {
  version: string;
  casesDir: string;
  kbDir: string;
  concurrency: number;
  skipJudge: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = { skipJudge: false };
  for (const a of argv.slice(2)) {
    if (a.startsWith("--version=")) args.version = a.slice("--version=".length);
    else if (a.startsWith("--cases=")) args.casesDir = a.slice("--cases=".length);
    else if (a.startsWith("--kb-dir=")) args.kbDir = a.slice("--kb-dir=".length);
    else if (a.startsWith("--concurrency=")) args.concurrency = Number(a.slice("--concurrency=".length));
    else if (a === "--skip-judge") args.skipJudge = true;
  }
  if (!args.version || !args.casesDir || !args.kbDir) {
    console.error("usage: dpm-regression run --version=<id|tag> --cases=<dir> --kb-dir=<dir>");
    process.exit(1);
  }
  return {
    version: args.version,
    casesDir: args.casesDir,
    kbDir: args.kbDir,
    concurrency: args.concurrency ?? 5,
    skipJudge: args.skipJudge ?? false,
  };
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY required");
    process.exit(1);
  }
  const args = parseArgs(process.argv);
  const db = getDb();

  const promptVersion = await resolvePromptVersion(db, args.version);
  if (!promptVersion) {
    console.error(`prompt version "${args.version}" not found`);
    process.exit(1);
  }

  console.log(`[regression] running suite against prompt v${promptVersion.versionNumber} (${promptVersion.id})`);

  const cases = await loadCasesFromDir(args.casesDir);
  console.log(`[regression] loaded ${cases.length} cases from ${args.casesDir}`);

  const sedeNames = await db.select({ name: sedes.nombre }).from(sedes);
  const sedeKbByName: Record<string, string> = {};
  for (const s of sedeNames) {
    const kbPath = path.join(args.kbDir, `${s.name.toLowerCase().replace(/\s+/g, "_")}.md`);
    try {
      sedeKbByName[s.name] = await readFile(kbPath, "utf-8");
    } catch {
      sedeKbByName[s.name] = `(KB no encontrada en ${kbPath})`;
    }
  }

  const startedAt = Date.now();
  const result = await runSuite({
    apiKey,
    promptVersionId: promptVersion.id,
    systemPrompt: promptVersion.content,
    sedeKbByName,
    cases,
    concurrency: args.concurrency,
    skipJudge: args.skipJudge,
  });

  const runId = await persistSuiteResult(result);
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log("");
  console.log(`[regression] run ${runId}`);
  console.log(`[regression] elapsed ${elapsed}s`);
  console.log(`[regression] pass rate: ${(result.passRate * 100).toFixed(1)}%`);
  console.log(`[regression] avg overall: ${result.averageScores.overall.toFixed(2)}`);
  console.log(`[regression] cost: $${result.totalCostUsd.toFixed(4)}`);
  console.log(`[regression] review queue: ${result.reviewQueueSize}`);

  // Auto-promote: if pass rate >= threshold, mark prompt version
  // regression_suite_passed=true; otherwise leave it false.
  const passed = result.passRate >= REGRESSION.MIN_PASS_RATE;
  await db
    .update(promptsVersiones)
    .set({ regressionSuitePassed: passed, regressionReportId: runId })
    .where(eq(promptsVersiones.id, promptVersion.id));
  console.log(`[regression] prompt version updated: regression_suite_passed=${passed}`);

  await closeDb();
  process.exit(passed ? 0 : 2);
}

async function resolvePromptVersion(
  db: ReturnType<typeof getDb>,
  versionRef: string,
) {
  // Accept either a UUID, a "v<n>" literal, or "active".
  if (versionRef === "active") {
    const [row] = await db
      .select()
      .from(promptsVersiones)
      .where(and(eq(promptsVersiones.type, "system"), eq(promptsVersiones.active, true)))
      .orderBy(desc(promptsVersiones.versionNumber))
      .limit(1);
    return row ?? null;
  }
  const isUuid = /^[0-9a-f-]{36}$/i.test(versionRef);
  if (isUuid) {
    const [row] = await db
      .select()
      .from(promptsVersiones)
      .where(eq(promptsVersiones.id, versionRef))
      .limit(1);
    return row ?? null;
  }
  const m = versionRef.match(/^v(\d+)$/i);
  if (!m || !m[1]) return null;
  const num = Number(m[1]);
  // We resolve the GLOBAL version (sede_id IS NULL); sede-specific overrides
  // must be addressed by UUID.
  const [row] = await db
    .select()
    .from(promptsVersiones)
    .where(
      and(
        eq(promptsVersiones.type, "system"),
        eq(promptsVersiones.versionNumber, num),
        isNull(promptsVersiones.sedeId),
      ),
    )
    .orderBy(desc(promptsVersiones.createdAt))
    .limit(1);
  return row ?? null;
}

main().catch(async (err) => {
  console.error("[regression] failed:", err);
  await closeDb().catch(() => {});
  process.exit(1);
});
