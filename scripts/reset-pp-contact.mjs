// Direct-DB version of POST /admin/reset-conversation. Bypasses the auth
// dance — connects to Supabase Postgres via DATABASE_URL (same path the
// diag and seed-content scripts use).
//
// Does the same 3 things the admin endpoint does:
//   1. DELETE all mensajes rows for the contact's conversaciones
//   2. UPDATE conversaciones → lead_stage='new', metadata cleared, status='active'
//   3. (Does NOT touch Respond.io tags — that requires the API key and is
//       optional for testing. If you want a fully clean slate, manually
//       remove the "Koh Phi Phi" / "ai_escalation" / etc tags in
//       Respond.io's contact panel.)
//
// Usage:
//   node --env-file=.env scripts/reset-pp-contact.mjs <contactId>
//
// Example (Tony's tester):
//   node --env-file=.env scripts/reset-pp-contact.mjs 461474747

import postgres from "postgres";

const contactId = process.argv[2];
if (!contactId) {
  console.error("Usage: node scripts/reset-pp-contact.mjs <contactId>");
  process.exit(1);
}

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error("DATABASE_URL or POSTGRES_URL must be set in .env");
  process.exit(1);
}

const sql = postgres(url, { max: 2, idle_timeout: 5 });

// 1) Find conversaciones for this contact.
const convs = await sql`
  SELECT id, respond_io_conversation_id, lead_stage, status, follow_up_state, closed_at
    FROM conversaciones
   WHERE respond_io_contact_id = ${contactId}
`;

if (convs.length === 0) {
  console.log(`No conversaciones found for contact ${contactId} — nothing to reset.`);
  await sql.end();
  process.exit(0);
}

console.log(`Found ${convs.length} conversacion(es) for contact ${contactId}:`);
for (const c of convs) {
  console.log(`  - ${c.id.slice(0, 8)}  lead_stage=${c.lead_stage}  status=${c.status}`);
}

const convIds = convs.map((c) => c.id);

// 2) Delete all mensajes for those conversaciones.
const deleted = await sql`
  DELETE FROM mensajes
   WHERE conversacion_id = ANY(${convIds})
  RETURNING id
`;
console.log(`\nDeleted ${deleted.length} mensajes row(s).`);

// 3) Reset conversaciones state.
await sql`
  UPDATE conversaciones
     SET lead_stage = 'new',
         lead_metadata = NULL,
         lead_stage_changed_at = NOW(),
         status = 'active',
         follow_up_state = NULL,
         closed_at = NULL,
         updated_at = NOW()
   WHERE id = ANY(${convIds})
`;
console.log(`Reset ${convIds.length} conversacion(es) → lead_stage='new', status='active'.`);

console.log(`\nDone. Contact ${contactId} now has zero message history.`);
console.log(`Next inbound message from that WhatsApp will start a fresh dialogue.`);
console.log(`\nReminder: Respond.io tags ('Koh Phi Phi', etc) were NOT touched.`);
console.log(`The "Koh Phi Phi" tag is OK to keep — it tells the workflow to skip menu and go straight to Francisco.`);
console.log(`If you want to retest the welcome menu too, remove the "Koh Phi Phi" tag manually in Respond.io.`);

await sql.end();
process.exit(0);
