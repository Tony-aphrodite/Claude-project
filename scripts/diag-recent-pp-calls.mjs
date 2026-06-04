// Diagnostic: pull the last 10 llamadas_api for Koh Phi Phi and surface
// tool_use_called / status / errors. Lets us see if enviar_catalogo was
// actually invoked by the model in recent test conversations, or if the AI
// is describing courses in text without calling the tool at all.
//
// Uses postgres-js directly (bypasses @dpm/db workspace resolution).
//
// Usage:
//   node --env-file=.env scripts/diag-recent-pp-calls.mjs

import postgres from "postgres";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error("DATABASE_URL or POSTGRES_URL must be set in .env");
  process.exit(1);
}

const sql = postgres(url, { max: 2, idle_timeout: 5 });

// 1) Confirm the active PP system prompt contains our new rule.
const ppSedeRows = await sql`SELECT id, nombre FROM sedes WHERE nombre = 'Koh Phi Phi' LIMIT 1`;
if (!ppSedeRows.length) {
  console.error("Koh Phi Phi sede missing");
  await sql.end();
  process.exit(1);
}
const ppSede = ppSedeRows[0];
console.log(`PP sede id = ${ppSede.id}\n`);

const promptRows = await sql`
  SELECT id, version_number, active, content
    FROM prompts_versiones
   WHERE type = 'system' AND sede_id = ${ppSede.id} AND active = true
   ORDER BY version_number DESC
   LIMIT 1
`;
if (!promptRows.length) {
  console.error("No active system prompt for PP — abort");
  await sql.end();
  process.exit(1);
}
const activePrompt = promptRows[0];
const hasNuncaCave = activePrompt.content.includes("NUNCA-CAVE-A-PRESIÓN");
const hasCatalogoCritico = activePrompt.content.includes("CATÁLOGO — CRÍTICO");
const hasPrimeraVezTrigger = activePrompt.content.includes("primera vez");
console.log("=== ACTIVE PP PROMPT ===");
console.log(`  version_number       : v${activePrompt.version_number}`);
console.log(`  active               : ${activePrompt.active}`);
console.log(`  length               : ${activePrompt.content.length} chars`);
console.log(`  contains NUNCA-CAVE  : ${hasNuncaCave ? "YES" : "NO (v6 not live!)"}`);
console.log(`  contains CATALOGO    : ${hasCatalogoCritico ? "YES" : "NO"}`);
console.log(`  contains 'primera vez' trigger : ${hasPrimeraVezTrigger ? "YES" : "NO"}`);
console.log();

// 2) Pull last 10 llamadas for PP sede.
const recent = await sql`
  SELECT id, created_at, conversacion_id, model, status, latency_ms,
         tool_use_called, error_message, prompt_version_id,
         cache_read_tokens, cache_write_tokens
    FROM llamadas_api
   WHERE sede_id = ${ppSede.id}
   ORDER BY created_at DESC
   LIMIT 10
`;
console.log(`=== LAST ${recent.length} PP LLAMADAS_API ===\n`);
for (const r of recent) {
  const ts = new Date(r.created_at).toISOString().replace("T", " ").slice(0, 19);
  const tools = Array.isArray(r.tool_use_called) ? r.tool_use_called.join(",") || "(empty)" : "(null)";
  const promptMatch = r.prompt_version_id === activePrompt.id ? `v${activePrompt.version_number}` : "OLD!";
  console.log(
    `[${ts}] conv=${(r.conversacion_id ?? "—").slice(0, 8)} prompt=${promptMatch} status=${r.status} ${r.latency_ms}ms model=${r.model}`,
  );
  console.log(`           tools: ${tools}`);
  console.log(`           cache: read=${r.cache_read_tokens ?? 0} / write=${r.cache_write_tokens ?? 0}`);
  if (r.error_message) console.log(`           ERROR: ${r.error_message}`);
  console.log();
}

// 3) Surface the most recent PP conversation's full tool_call history.
const lastConvId = recent[0]?.conversacion_id;
if (lastConvId) {
  const allInConv = await sql`
    SELECT created_at, tool_use_called, prompt_version_id, status, latency_ms, error_message
      FROM llamadas_api
     WHERE conversacion_id = ${lastConvId}
     ORDER BY created_at ASC
  `;
  console.log(`=== TOOL TIMELINE FOR LAST CONV ${lastConvId.slice(0, 8)} (${allInConv.length} rows) ===\n`);
  for (const a of allInConv) {
    const ts = new Date(a.created_at).toISOString().slice(11, 19);
    const tools = Array.isArray(a.tool_use_called) ? a.tool_use_called.join(",") || "(empty)" : "(null)";
    const tag = a.prompt_version_id === activePrompt.id ? `v${activePrompt.version_number}` : "OLD";
    console.log(`  [${ts}] ${tag} ${a.status} ${a.latency_ms ?? "?"}ms  tools=[${tools}]`);
    if (a.error_message) console.log(`            ERROR: ${a.error_message}`);
  }
  console.log();
}

// 4) Surface recent errores rows for the same conversation (Respond.io 4xx, etc).
if (lastConvId) {
  const errors = await sql`
    SELECT created_at, source, error_type, error_message
      FROM errores
     WHERE conversacion_id = ${lastConvId}
     ORDER BY created_at ASC
     LIMIT 20
  `;
  console.log(`=== ERRORES FOR LAST CONV (${errors.length} rows) ===\n`);
  for (const e of errors) {
    const ts = new Date(e.created_at).toISOString().slice(11, 19);
    console.log(`  [${ts}] ${e.source} ${e.error_type ?? ""}`);
    if (e.error_message) console.log(`           ${e.error_message.slice(0, 200)}`);
  }
}

await sql.end();
process.exit(0);
