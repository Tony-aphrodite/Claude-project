// Simulate Respond.io's HTTP Request node by POSTing a synthetic Phi Phi
// inbound message to the production webhook. If this returns 202, the
// server-side is fully working and any remaining issue lives in Miguel's
// Respond.io workflow configuration. If it returns 4xx/5xx, the body is
// captured below and we can fix it.
//
// Usage:
//   node --env-file=.env scripts/test-webhook-phiphi.mjs
//
// Requires WEBHOOK_WORKFLOW_TOKEN in env (read from Railway → Variables).

const TOKEN = process.env.WEBHOOK_WORKFLOW_TOKEN;
if (!TOKEN) {
  console.error("❌ WEBHOOK_WORKFLOW_TOKEN not in env.");
  console.error("   Copy the value from Railway → @dpm/server → Variables → WEBHOOK_WORKFLOW_TOKEN");
  console.error("   Then add it to your local .env as a single line:");
  console.error("     WEBHOOK_WORKFLOW_TOKEN=<paste-value-here>");
  console.error("   And re-run this script.");
  process.exit(1);
}

const URL = "https://dpmserver-production.up.railway.app/webhook/respond-io";

// Synthetic payload — same shape Miguel's HTTP Request node sends.
// Using a clearly-fake contact id so we don't pollute a real customer's
// conversation. The Branch field is what routes us to PP / Francisco.
const TEST_CONTACT_ID = "999999999-test-" + Math.floor(Date.now() / 1000);
const body = {
  event: "message.created",
  contact: {
    id: TEST_CONTACT_ID,
    phone: "+660000000000",
    name: "Test Steve",
    language: "en",
    // tags must include the value set in PILOT_REQUIRE_TAG (server env)
    // so the synthetic request passes the pilot gate. Real PP contacts get
    // the "Koh Phi Phi" tag automatically when they pick from the welcome
    // menu in Respond.io, so the synthetic test mirrors that state.
    tags: ["Koh Phi Phi"],
    customFields: { Branch: "Koh Phi Phi" },
  },
  message: {
    type: "text",
    text: "hi, info about open water please",
    timestamp: new Date().toISOString(),
    direction: "incoming",
  },
  // Deliberately omit `conversation` to mirror Miguel's workflow (which
  // can't pass a conversation id — schema accepts contact.id alone).
};

console.log(`POST ${URL}`);
console.log(`x-workflow-token: <hidden, ${TOKEN.length} chars>`);
console.log("body:");
console.log(JSON.stringify(body, null, 2));
console.log();

const t0 = Date.now();
const res = await fetch(URL, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-workflow-token": TOKEN,
  },
  body: JSON.stringify(body),
});
const elapsed = Date.now() - t0;
const text = await res.text();

console.log(`status: ${res.status} (${elapsed}ms)`);
console.log(`response body: ${text}`);
console.log();

if (res.status === 202) {
  console.log("✅ Endpoint is fully working.");
  console.log("   → Async dispatch fired. Francisco's reply will land via Respond.io API in a few seconds.");
  console.log("   → If Miguel still sees 'not working', the problem is 100% in his HTTP Request node config.");
} else if (res.status === 401) {
  console.log("❌ Auth rejected (token mismatch).");
  console.log("   → Re-copy WEBHOOK_WORKFLOW_TOKEN from Railway and check for trailing whitespace/newline.");
} else if (res.status === 422) {
  console.log("❌ Payload validation failed.");
  console.log("   → See response body above for the exact field issue.");
} else if (res.status === 400) {
  console.log("❌ Bad request (no body / malformed).");
} else {
  console.log(`⚠ Unexpected status ${res.status} — check Railway Deploy Logs for the error trace.`);
}
