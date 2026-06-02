// Inspect a real Respond.io contact via the API to figure out what's
// actually happening in the workflow. Specifically check:
//   • All tags currently on the contact
//   • All custom fields (especially Branch)
//   • Lifecycle status
//   • Recent messages and which agent/bot sent them
//   • Whether they're assigned to a human or to "Asistente IA"
//
// Usage:
//   node --env-file=.env scripts/inspect-respondio-contact.mjs <contactId>

const KEY = process.env.RESPOND_IO_API_KEY;
if (!KEY) {
  console.error("RESPOND_IO_API_KEY missing");
  process.exit(1);
}
const contactId = process.argv[2] ?? "460478348";

console.log(`Inspecting Respond.io contact ${contactId}\n`);

const headers = { authorization: `Bearer ${KEY}` };

// 1) Contact full state
const r1 = await fetch(`https://api.respond.io/v2/contact/id:${contactId}`, { headers });
if (!r1.ok) {
  console.error(`Contact fetch failed: ${r1.status}`, await r1.text());
  process.exit(1);
}
const c = await r1.json();

console.log("── CONTACT STATE ──");
console.log("name      :", `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || "(none)");
console.log("phone     :", c.phone ?? "(none)");
console.log("language  :", c.language ?? "(none)");
console.log("country   :", c.country ?? "(none)");
console.log("lifecycle :", c.lifecycle ?? "(none)");
console.log("assignee  :", c.assignee?.firstName, c.assignee?.lastName, "(id:", c.assignee?.id, ")");
console.log("tags      :", JSON.stringify(c.tags));
console.log();

console.log("── CUSTOM FIELDS (non-null) ──");
for (const f of (c.custom_fields ?? c.customFields ?? [])) {
  if (f.value !== null && f.value !== "" && f.value !== undefined) {
    console.log(`  ${f.name} = ${JSON.stringify(f.value)}`);
  }
}
console.log();

// 2) Recent messages — see what was sent, by whom
const r2 = await fetch(
  `https://api.respond.io/v2/contact/id:${contactId}/message?limit=20`,
  { headers },
);
if (r2.ok) {
  const msgs = await r2.json();
  const list = Array.isArray(msgs) ? msgs : msgs.data ?? msgs.items ?? [];
  console.log(`── LAST ${list.length} MESSAGES ──`);
  for (const m of list.reverse()) {
    const ts = m.createdAt ? new Date(m.createdAt).toISOString() : "?";
    const dir = m.direction ?? m.type ?? "?";
    const senderType = m.sender?.type ?? m.sentBy?.type ?? m.from?.type ?? "?";
    const senderName = m.sender?.name ?? m.sentBy?.name ?? "?";
    const text = (m.message?.text ?? m.text ?? "").slice(0, 80);
    console.log(`  [${ts}] ${dir.padEnd(8)} ${senderType.padEnd(10)} ${senderName.padEnd(20)} :: ${text}`);
  }
} else {
  console.log("messages fetch failed:", r2.status, await r2.text());
}
