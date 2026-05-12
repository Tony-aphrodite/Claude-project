// Real-time check: tail Miguel's conversation + Respond.io contact state.
// Usage: node --env-file=.env scripts/monitor-miguel.mjs
import postgres from "/home/ph/Client/Claude-project/node_modules/.pnpm/postgres@3.4.9/node_modules/postgres/cjs/src/index.js";
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const KEY = process.env.RESPOND_IO_API_KEY;

const conv = await sql`SELECT id, lead_stage, lead_metadata FROM conversaciones WHERE respond_io_contact_id = '208082561'`;
const c = conv[0];
console.log(`=== Server DB ===`);
console.log(`lead_stage: ${c.lead_stage}`);
console.log(`lead_metadata:`, {
  programa: c.lead_metadata?.programa,
  start_date: c.lead_metadata?.start_date,
  pax: c.lead_metadata?.pax,
  ref_code: c.lead_metadata?.ref_code,
  deposit_amount: c.lead_metadata?.deposit_amount,
  deposit_amount_total: c.lead_metadata?.deposit_amount_total,
  deposit_currency: c.lead_metadata?.deposit_currency,
});

const msgs = await sql`
  SELECT sender, LEFT(content, 200) as content, metadata, created_at
  FROM mensajes WHERE conversacion_id = ${c.id}
  ORDER BY created_at ASC`;
console.log(`\n=== Mensajes (${msgs.length}) ===`);
for (const m of msgs) {
  const md = m.metadata ?? {};
  const tags = [];
  if (md.toolCalls?.length) tags.push(`tools=${md.toolCalls.join(",")}`);
  if (md.latencyMs) tags.push(`${md.latencyMs}ms`);
  if (md.synthetic) tags.push("SYNTH");
  console.log(`[${m.created_at.toISOString()}] ${m.sender.toUpperCase()} ${tags.join(" ")}`);
  console.log(`  ${m.content}\n`);
}

console.log(`=== Respond.io contact ===`);
const r = await fetch(`https://api.respond.io/v2/contact/id:208082561`, { headers: { authorization: `Bearer ${KEY}` } });
const j = await r.json();
console.log(`language: ${j.language ?? "(empty)"}`);
console.log(`lifecycle: ${j.lifecycle}`);
console.log(`tags: ${JSON.stringify(j.tags)}`);
console.log(`custom_fields (non-null):`);
for (const f of (j.custom_fields ?? [])) {
  if (f.value !== null && f.value !== "") console.log(`  ${f.name} = ${JSON.stringify(f.value)}`);
}
await sql.end();
