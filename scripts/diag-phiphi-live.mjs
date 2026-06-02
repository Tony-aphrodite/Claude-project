// Live diagnostic for Phi Phi launch. Looks for:
//   • Recent webhook hits (llamadas_api in last hour)
//   • Recent PP conversations
//   • Recent errores
//   • Conversations stuck in deposit_paid (grace window risk)
import postgres from "/home/ph/Client/Claude-project/node_modules/.pnpm/postgres@3.4.9/node_modules/postgres/cjs/src/index.js";

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  // Resolve PP sede id
  const [pp] = await sql`SELECT id, nombre FROM sedes WHERE nombre = 'Koh Phi Phi'`;
  if (!pp) {
    console.log("❌ Koh Phi Phi sede not found");
    process.exit(1);
  }
  const ppId = pp.id;
  console.log(`Phi Phi sede id: ${ppId}\n`);

  // 1) Recent errores (last 2h, any source)
  console.log("── ERRORES (last 2h) ──");
  const errs = await sql`
    SELECT created_at, source, error_type, error_message, conversacion_id
      FROM errores
     WHERE created_at > NOW() - INTERVAL '2 hours'
     ORDER BY created_at DESC
     LIMIT 20
  `;
  if (errs.length === 0) console.log("  (none) ✓");
  for (const e of errs) {
    console.log(`  [${e.created_at.toISOString()}] ${e.source}/${e.error_type ?? "?"}`);
    if (e.error_message) console.log(`    msg: ${String(e.error_message).slice(0, 200)}`);
    if (e.conversacion_id) console.log(`    conv: ${e.conversacion_id}`);
  }
  console.log();

  // 2) Recent webhook activity (any sede, last 2h) — gives a heartbeat
  console.log("── LLAMADAS_API (last 2h) ──");
  const calls = await sql`
    SELECT created_at, status, latency_ms, total_cost_usd, conversacion_id
      FROM llamadas_api
     WHERE created_at > NOW() - INTERVAL '2 hours'
     ORDER BY created_at DESC
     LIMIT 10
  `;
  if (calls.length === 0) console.log("  (none in 2h) — server may not be receiving inbound");
  for (const c of calls) {
    console.log(
      `  [${c.created_at.toISOString()}] status=${c.status} latency=${c.latency_ms}ms cost=$${c.total_cost_usd} conv=${c.conversacion_id ?? "-"}`,
    );
  }
  console.log();

  // 3) Recent PP conversations (last 2h)
  console.log("── PP CONVERSATIONS (last 2h) ──");
  const convs = await sql`
    SELECT c.id, c.respond_io_contact_id, c.lead_stage, c.lead_stage_changed_at,
           c.created_at, c.updated_at,
           cc.name AS contact_name, cc.language
      FROM conversaciones c
 LEFT JOIN chat_contacts cc ON cc.respond_io_contact_id = c.respond_io_contact_id
     WHERE c.sede_id = ${ppId}
       AND c.created_at > NOW() - INTERVAL '2 hours'
     ORDER BY c.updated_at DESC
     LIMIT 10
  `;
  if (convs.length === 0) console.log("  (no new PP conversations in 2h)");
  for (const c of convs) {
    console.log(
      `  [${c.created_at.toISOString()}] ${c.id.slice(0, 8)} contact=${c.respond_io_contact_id} ${c.contact_name ?? "—"} (${c.language ?? "?"}) stage=${c.lead_stage}`,
    );
  }
  console.log();

  // 4) Recent messages in PP convs (to see if Francisco is replying)
  console.log("── RECENT MESSAGES IN PP CONVS (last 2h) ──");
  const msgs = await sql`
    SELECT m.created_at, m.sender, m.conversacion_id, LEFT(m.content, 120) AS preview
      FROM mensajes m
      JOIN conversaciones c ON c.id = m.conversacion_id
     WHERE c.sede_id = ${ppId}
       AND m.created_at > NOW() - INTERVAL '2 hours'
     ORDER BY m.created_at DESC
     LIMIT 30
  `;
  if (msgs.length === 0) console.log("  (no messages in PP conversations in 2h)");
  for (const m of msgs) {
    console.log(
      `  [${m.created_at.toISOString()}] ${m.sender.padEnd(15)} conv=${m.conversacion_id.slice(0, 8)} :: ${m.preview}`,
    );
  }
  console.log();

  // 4b) toolCalls on recent AI replies — did `enviar_catalogo` fire?
  console.log("── LATEST AI toolCalls (last 30 min) ──");
  const lastAi = await sql`
    SELECT m.created_at, m.metadata, LEFT(m.content, 90) AS preview
      FROM mensajes m
      JOIN conversaciones c ON c.id = m.conversacion_id
     WHERE c.sede_id = ${ppId} AND m.sender = 'ai'
       AND m.created_at > NOW() - INTERVAL '30 minutes'
     ORDER BY m.created_at DESC
     LIMIT 3
  `;
  if (lastAi.length === 0) console.log("  (no AI replies in 30 min)");
  for (const m of lastAi) {
    const tc = m.metadata?.toolCalls ?? [];
    const flag = tc.length > 0 ? "✓" : "✗ NO TOOL CALL";
    console.log(`  [${m.created_at.toISOString()}] toolCalls=${JSON.stringify(tc)} ${flag}`);
    console.log(`    preview: ${m.preview}`);
  }
  console.log();

  // 5) PP conversations stuck in deposit_paid (grace window risk)
  console.log("── PP STUCK IN deposit_paid ──");
  const stuck = await sql`
    SELECT id, lead_stage_changed_at,
           EXTRACT(EPOCH FROM (NOW() - lead_stage_changed_at)) / 60 AS minutes_in_stage
      FROM conversaciones
     WHERE sede_id = ${ppId} AND lead_stage = 'deposit_paid'
     ORDER BY lead_stage_changed_at ASC
  `;
  if (stuck.length === 0) console.log("  (none) ✓");
  for (const c of stuck) {
    const min = Math.floor(c.minutes_in_stage);
    const over120 = min > 120;
    console.log(
      `  ${c.id.slice(0, 8)} in deposit_paid for ${min} min ${over120 ? "⚠ OVER GRACE (should auto-handoff)" : "(within grace)"}`,
    );
  }
} finally {
  await sql.end();
}
