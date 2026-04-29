// Loads regression cases from JSON files. The 100-case suite lives in
// fixtures/regression/cases/*.json — one file per case. We keep them as
// individual files so reviewers can edit them in PRs without merge churn
// on a single multi-thousand-line manifest.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { RegressionCase } from "./types.js";

const senderSchema = z.enum(["cliente", "ai", "agente_humano"]);

const caseFileSchema = z.object({
  id: z.string(),
  sedeId: z.string(),
  sedeName: z.string(),
  clientMessage: z.string(),
  history: z.array(
    z.object({
      sender: senderSchema,
      content: z.string(),
      agente: z.string().optional(),
    }),
  ),
  expected: z.object({
    mustInclude: z.array(z.string()).optional(),
    mustExclude: z.array(z.string()).optional(),
    judgeNotes: z.string().optional(),
    outcome: z.string().optional(),
  }),
  tags: z.array(z.string()).optional(),
});

export async function loadCasesFromDir(dir: string): Promise<RegressionCase[]> {
  const entries = await readdir(dir);
  const jsonFiles = entries.filter((f) => f.endsWith(".json"));
  const out: RegressionCase[] = [];
  for (const f of jsonFiles) {
    const fullPath = path.join(dir, f);
    const raw = JSON.parse(await readFile(fullPath, "utf-8"));
    const parsed = caseFileSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `Invalid regression case file ${f}: ${parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`,
      );
    }
    out.push({
      id: parsed.data.id,
      sedeId: parsed.data.sedeId,
      sedeName: parsed.data.sedeName,
      clientMessage: parsed.data.clientMessage,
      history: parsed.data.history,
      expected: {
        mustInclude: parsed.data.expected.mustInclude?.map((s) => new RegExp(s, "i")),
        mustExclude: parsed.data.expected.mustExclude?.map((s) => new RegExp(s, "i")),
        ...(parsed.data.expected.judgeNotes !== undefined
          ? { judgeNotes: parsed.data.expected.judgeNotes }
          : {}),
        ...(parsed.data.expected.outcome !== undefined
          ? { outcome: parsed.data.expected.outcome }
          : {}),
      },
      ...(parsed.data.tags !== undefined ? { tags: parsed.data.tags } : {}),
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
