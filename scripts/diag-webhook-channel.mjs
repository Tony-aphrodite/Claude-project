// Diag: pull the last 5 inbound webhook payloads for contact 461474747
// from webhook_debug_log and surface `message.channelId` + `channel.id`.
// The hypothesis we want to test: env.RESPOND_IO_CHANNEL_ID="274637" might
// not match the channelId Respond.io sends with the actual message.
//
// Usage: node --env-file=.env scripts/diag-webhook-channel.mjs [contactId]

import postgres from "postgres";

const contactId = process.argv[2] || "461474747";
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) { console.error("DATABASE_URL missing"); process.exit(1); }

const sql = postgres(url, { max: 2, idle_timeout: 5 });

// webhook_debug_log columns (per schema): id, received_at, body (jsonb),
// classified_as, conversation_id, contact_id (text).
const rows = await sql`
  SELECT received_at, body, classified_as, contact_id
    FROM webhook_debug_log
   WHERE body->'contact'->>'id' = ${contactId}
      OR body->'message'->>'contactId' = ${contactId}
      OR contact_id = ${contactId}
   ORDER BY received_at DESC
   LIMIT 5
`;

console.log(`Last ${rows.length} inbound webhook(s) for contact ${contactId}:\n`);

for (const r of rows) {
  const body = r.body;
  const ts = new Date(r.received_at).toISOString().replace("T", " ").slice(0, 19);
  console.log(`── [${ts}] classified=${r.classified_as ?? "?"} ──`);

  const event = body?.event ?? body?.event_type;
  const messageChannelId = body?.message?.channelId;
  const channelObjId = body?.channel?.id;
  const conversationId = body?.conversation?.id;
  const messageText = body?.message?.message?.text ?? body?.message?.text;

  console.log(`  event              : ${event}`);
  console.log(`  conversation.id    : ${conversationId ?? "(absent)"}`);
  console.log(`  message.channelId  : ${messageChannelId ?? "(absent)"}`);
  console.log(`  channel.id         : ${channelObjId ?? "(absent)"}`);
  console.log(`  message.text       : ${typeof messageText === "string" ? messageText.slice(0, 80) : "(non-text)"}`);
  console.log(`  body keys          : ${Object.keys(body ?? {}).join(", ")}`);
  console.log();
}

console.log(`Env RESPOND_IO_CHANNEL_ID (compare to above): ${process.env.RESPOND_IO_CHANNEL_ID ?? "(not set, defaults to 274637)"}`);

await sql.end();
process.exit(0);
