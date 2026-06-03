// Read the most recent rows of webhook_debug_log to see EXACTLY what
// Respond.io sent us and how our code classified each event.
//
// Usage:
//   node --env-file=.env scripts/diag-webhook-debug.mjs [limit]
//
// Default: last 20 rows.

import postgres from "/home/ph/Client/Claude-project/node_modules/.pnpm/postgres@3.4.9/node_modules/postgres/cjs/src/index.js";

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const limit = Number.parseInt(process.argv[2] ?? "20", 10);

try {
  const rows = await sql`
    SELECT received_at, event_field, event_type, contact_id, text_len,
           has_attachment, direction, sender_type, classified_as,
           body
      FROM webhook_debug_log
     ORDER BY received_at DESC
     LIMIT ${limit}
  `;
  console.log(`── webhook_debug_log (last ${rows.length} rows) ──\n`);
  for (const r of rows) {
    console.log(`[${r.received_at.toISOString()}] contact=${r.contact_id ?? "—"}`);
    console.log(`  event_field=${JSON.stringify(r.event_field)} event_type=${JSON.stringify(r.event_type)}`);
    console.log(`  text_len=${r.text_len} has_attachment=${r.has_attachment} direction=${r.direction} sender_type=${r.sender_type}`);
    console.log(`  classified_as=${r.classified_as}`);
    // Dump only the keys of body so we don't drown the terminal
    const bodyKeys = r.body ? Object.keys(r.body) : [];
    console.log(`  body keys: ${bodyKeys.join(", ")}`);
    if (r.body?.message) {
      console.log(`  body.message keys: ${Object.keys(r.body.message).join(", ")}`);
      if (typeof r.body.message.text === "string") {
        console.log(`  body.message.text: "${r.body.message.text.slice(0, 100)}"`);
      }
    }
    if (r.body?.sender) {
      console.log(`  body.sender: ${JSON.stringify(r.body.sender)}`);
    }
    console.log();
  }
} finally {
  await sql.end();
}
