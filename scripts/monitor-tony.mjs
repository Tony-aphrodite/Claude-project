import postgres from "/home/ph/Client/Claude-project/node_modules/.pnpm/postgres@3.4.9/node_modules/postgres/cjs/src/index.js";
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const KEY = process.env.RESPOND_IO_API_KEY;

const conv = await sql`SELECT id, lead_stage, lead_metadata FROM conversaciones WHERE respond_io_contact_id = '445381935'`;
const c = conv[0];
console.log(`=== Server DB (Tony 445381935) ===`);
console.log(`lead_stage: ${c.lead_stage}`);
console.log(`lead_metadata:`, {
  programa: c.lead_metadata?.programa,
  start_date: c.lead_metadata?.start_date,
  pax: c.lead_metadata?.pax,
  deposit_amount: c.lead_metadata?.deposit_amount,
  deposit_amount_total: c.lead_metadata?.deposit_amount_total,
});

const msgs = await sql`SELECT sender, LEFT(content, 250) as content, metadata, created_at FROM mensajes WHERE conversacion_id = ${c.id} ORDER BY created_at ASC`;
console.log(`\n=== Mensajes today (${msgs.length}) ===`);
for (const m of msgs) {
  const md = m.metadata ?? {};
  const tags = [];
  if (md.toolCalls?.length) tags.push(`tools=${md.toolCalls.join(",")}`);
  if (md.latencyMs) tags.push(`${md.latencyMs}ms`);
  console.log(`[${m.created_at.toISOString()}] ${m.sender.toUpperCase()} ${tags.join(" ")}`);
  console.log(`  ${m.content.slice(0, 250)}\n`);
}

console.log(`=== Respond.io contact NOW ===`);
const r = await fetch(`https://api.respond.io/v2/contact/id:445381935`, { headers: { authorization: `Bearer ${KEY}` } });
const j = await r.json();
console.log(`language: ${j.language ?? "(empty)"}`);
console.log(`lifecycle: ${j.lifecycle}  ← BEFORE was "LOST LEAD"`);
console.log(`tags: ${JSON.stringify(j.tags)}`);
console.log(`custom_fields (non-null):`);
for (const f of (j.custom_fields ?? [])) {
  if (f.value !== null && f.value !== "") console.log(`  ${f.name} = ${JSON.stringify(f.value)}`);
}
await sql.end();
