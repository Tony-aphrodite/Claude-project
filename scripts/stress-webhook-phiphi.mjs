// Burst-stress the PP webhook to simulate the conditions that triggered
// the auto-disable in real Miguel tests (multiple parallel customer
// messages within a short window). After the 202→200 fix this should
// NEVER cause Respond.io to disable the webhook, because every response
// is now counted as success by their auto-disable heuristic.
//
// Usage:
//   node --env-file=.env scripts/stress-webhook-phiphi.mjs [count] [interval_ms]
//
// Defaults: 15 messages, 800ms apart (simulates real customer typing burst).

const TOKEN = process.env.WEBHOOK_WORKFLOW_TOKEN;
if (!TOKEN) {
  console.error("WEBHOOK_WORKFLOW_TOKEN not set in .env");
  process.exit(1);
}

const URL = "https://dpmserver-production.up.railway.app/webhook/respond-io";
const COUNT = Number.parseInt(process.argv[2] ?? "15", 10);
const INTERVAL = Number.parseInt(process.argv[3] ?? "800", 10);

const messageVariations = [
  "Hello",
  "Hi I want to dive",
  "What's the price for Open Water?",
  "Try scuba info please",
  "First time diving",
  "How many days for OW course?",
  "Where is the dive shop?",
  "Can I do night dive?",
  "I have my license already",
  "I want fun dives",
  "Open Water + Advanced combo?",
  "Are you available next week?",
  "What about accommodation?",
  "Do you do nitrox specialty?",
  "How to pay?",
];

console.log(`Stress test: ${COUNT} messages, ${INTERVAL}ms apart\n`);
const results = { ok: 0, error: 0, by_status: {} };
const baseId = Math.floor(Date.now() / 1000);

for (let i = 0; i < COUNT; i++) {
  const contactId = `999999999-stress-${baseId}-${i}`;
  const body = {
    event: "message.created",
    contact: {
      id: contactId,
      phone: "+660000000000",
      name: `Stress ${i}`,
      language: "en",
      tags: ["Koh Phi Phi"],
      customFields: { Branch: "Koh Phi Phi" },
    },
    message: {
      type: "text",
      text: messageVariations[i % messageVariations.length],
      timestamp: new Date().toISOString(),
      direction: "incoming",
    },
  };

  const t0 = Date.now();
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-workflow-token": TOKEN,
      },
      body: JSON.stringify(body),
    });
    const elapsed = Date.now() - t0;
    const status = res.status;
    results.by_status[status] = (results.by_status[status] ?? 0) + 1;
    if (res.ok) results.ok++;
    else results.error++;
    const icon = res.ok ? "✓" : "✗";
    console.log(`${icon} [${i + 1}/${COUNT}] status=${status} (${elapsed}ms) contact=${contactId.slice(-12)}`);
  } catch (err) {
    results.error++;
    console.log(`✗ [${i + 1}/${COUNT}] CONNECTION_ERROR — ${err.message}`);
  }

  if (i < COUNT - 1) await new Promise((r) => setTimeout(r, INTERVAL));
}

console.log(`\n── SUMMARY ──`);
console.log(`Total: ${COUNT}`);
console.log(`OK:    ${results.ok}`);
console.log(`Error: ${results.error}`);
console.log(`By status:`, results.by_status);
console.log(`\nIf ALL ${COUNT} returned 200, the 202→200 fix held under burst.`);
console.log(`Now wait 5 minutes and check if Respond.io's Developer Webhook 1 stayed active.`);
