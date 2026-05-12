// Pull contact 208082561's (Miguel) full conversation activity for today
// (2026-05-12) so we can diagnose what worked vs what still has bugs.
// Read-only — no mutations.
import postgres from "/home/ph/Client/Claude-project/node_modules/.pnpm/postgres@3.4.9/node_modules/postgres/cjs/src/index.js";
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const conv = await sql`
  SELECT id, lead_stage, lead_stage_changed_at, lead_metadata, created_at
  FROM conversaciones WHERE respond_io_contact_id = '208082561'`;
console.log("=== Conversation state ===");
console.log("lead_stage:", conv[0].lead_stage);
console.log("changed_at:", conv[0].lead_stage_changed_at?.toISOString());

const msgs = await sql`
  SELECT sender, content, metadata, created_at
  FROM mensajes
  WHERE conversacion_id = ${conv[0].id}
    AND created_at::date = '2026-05-12'::date
  ORDER BY created_at ASC`;
console.log(`\n=== Messages today (${msgs.length}) ===`);
for (const m of msgs) {
  const md = m.metadata ?? {};
  const tags = [];
  if (md.toolCalls?.length) tags.push(`tools=${md.toolCalls.join(",")}`);
  if (md.synthetic) tags.push("SYNTH");
  if (md.reason) tags.push(`reason=${md.reason}`);
  if (md.latencyMs) tags.push(`${md.latencyMs}ms`);
  console.log(`\n[${m.created_at.toISOString()}] ${m.sender.toUpperCase()} ${tags.join(" ")}`);
  console.log(m.content);
}

console.log("\n=== Lead stage transitions (today) ===");
const transitions = (conv[0].lead_metadata?.history ?? []).filter(t => t.at?.startsWith("2026-05-12"));
for (const t of transitions) console.log(`  [${t.at}] ${t.from ?? '?'} → ${t.to} by ${t.by}: ${t.note ?? ''}`);

console.log("\n=== Final lead_metadata ===");
const md = conv[0].lead_metadata ?? {};
console.log({
  programa: md.programa, ref_code: md.ref_code, start_date: md.start_date,
  deposit_amount: md.deposit_amount, deposit_currency: md.deposit_currency,
  ocr_validated: md.ocr_result?.validated, ocr_mismatches: md.ocr_result?.mismatches,
});

await sql.end();
