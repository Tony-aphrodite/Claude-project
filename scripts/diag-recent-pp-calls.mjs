// Diagnostic: pull the last 10 llamadas_api for Koh Phi Phi and surface
// tool_calls / status / errors. Lets us see if enviar_catalogo was actually
// invoked by the model in recent test conversations, or if the AI is
// describing courses in text without calling the tool at all.
//
// Usage:
//   node --env-file=.env scripts/diag-recent-pp-calls.mjs
//
// Also prints whether the current active PP system prompt contains the
// NUNCA-CAVE rule we added in v6 — sanity check that v6 is live in DB.

import { getDb, llamadasApi, promptsVersiones, sedes, conversaciones } from "@dpm/db";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

const db = getDb();

const [ppSede] = await db
  .select()
  .from(sedes)
  .where(eq(sedes.nombre, "Koh Phi Phi"))
  .limit(1);

if (!ppSede) {
  console.error("Koh Phi Phi sede missing");
  process.exit(1);
}

console.log(`PP sede id = ${ppSede.id}\n`);

// 1) Confirm the active PP system prompt contains our new rule.
const [activePrompt] = await db
  .select()
  .from(promptsVersiones)
  .where(
    and(
      eq(promptsVersiones.type, "system"),
      eq(promptsVersiones.sedeId, ppSede.id),
      eq(promptsVersiones.active, true),
    ),
  )
  .orderBy(desc(promptsVersiones.versionNumber))
  .limit(1);

if (!activePrompt) {
  console.error("No active system prompt for PP — abort");
  process.exit(1);
}

const hasNuncaCave = activePrompt.content.includes("NUNCA-CAVE-A-PRESIÓN");
const hasCatalogoCritico = activePrompt.content.includes("CATÁLOGO — CRÍTICO");
const hasPrimeraVezTrigger = activePrompt.content.includes("primera vez");
console.log("=== ACTIVE PP PROMPT ===");
console.log(`  version_number     : v${activePrompt.versionNumber}`);
console.log(`  active             : ${activePrompt.active}`);
console.log(`  length             : ${activePrompt.content.length} chars`);
console.log(`  contains NUNCA-CAVE: ${hasNuncaCave ? "✓ YES" : "✗ NO (v6 not live!)"}`);
console.log(`  contains CATÁLOGO  : ${hasCatalogoCritico ? "✓ YES" : "✗ NO"}`);
console.log(`  contains 'primera vez' trigger : ${hasPrimeraVezTrigger ? "✓ YES" : "✗ NO"}`);
console.log();

// 2) Pull last 10 llamadas for PP sede.
const recent = await db
  .select({
    id: llamadasApi.id,
    createdAt: llamadasApi.createdAt,
    conversacionId: llamadasApi.conversacionId,
    model: llamadasApi.model,
    status: llamadasApi.status,
    latencyMs: llamadasApi.latencyMs,
    toolUseCalled: llamadasApi.toolUseCalled,
    errorMessage: llamadasApi.errorMessage,
    promptVersionId: llamadasApi.promptVersionId,
    cacheRead: llamadasApi.cacheReadTokens,
    cacheWrite: llamadasApi.cacheWriteTokens,
  })
  .from(llamadasApi)
  .where(eq(llamadasApi.sedeId, ppSede.id))
  .orderBy(desc(llamadasApi.createdAt))
  .limit(10);

console.log(`=== LAST ${recent.length} PP LLAMADAS_API ===\n`);

for (const r of recent) {
  const ts = r.createdAt.toISOString().replace("T", " ").slice(0, 19);
  const tools = Array.isArray(r.toolUseCalled) ? r.toolUseCalled.join(",") : "(none)";
  const promptMatch = r.promptVersionId === activePrompt.id ? "v6" : "?(not v6)";
  console.log(
    `[${ts}] conv=${(r.conversacionId ?? "—").slice(0, 8)} prompt=${promptMatch} status=${r.status} ${r.latencyMs}ms model=${r.model}`,
  );
  console.log(`           tools: ${tools}`);
  console.log(`           cache: read=${r.cacheRead ?? 0} / write=${r.cacheWrite ?? 0}`);
  if (r.errorMessage) console.log(`           ERROR: ${r.errorMessage}`);
  console.log();
}

// 3) Surface the most recent PP conversation's full tool_call history.
const lastConvId = recent[0]?.conversacionId;
if (lastConvId) {
  const allInConv = await db
    .select({
      createdAt: llamadasApi.createdAt,
      toolUseCalled: llamadasApi.toolUseCalled,
      promptVersionId: llamadasApi.promptVersionId,
      status: llamadasApi.status,
    })
    .from(llamadasApi)
    .where(eq(llamadasApi.conversacionId, lastConvId))
    .orderBy(llamadasApi.createdAt);

  console.log(`=== TOOL TIMELINE FOR LAST CONV ${lastConvId.slice(0, 8)} ===\n`);
  for (const a of allInConv) {
    const ts = a.createdAt.toISOString().slice(11, 19);
    const tools = Array.isArray(a.toolCalls) ? a.toolCalls.join(",") : "(none)";
    const isV6 = a.promptVersionId === activePrompt.id ? "v6" : "OLD";
    console.log(`  [${ts}] ${isV6} ${a.status}  tools=[${tools}]`);
  }
}

process.exit(0);
