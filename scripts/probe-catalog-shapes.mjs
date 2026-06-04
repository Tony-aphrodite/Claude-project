// Send 3 distinct catalog-message wire shapes to a SINGLE test contact in
// Respond.io to determine which one (if any) actually renders a WhatsApp
// catalog card on the customer's device.
//
// Evidence-only experiment. Each variant is a different `message.type` value
// our server has been emitting (or candidate alternatives from the Respond.io
// v2 public SDK / WhatsApp Cloud API). Output:
//   - HTTP status from each call
//   - The full response body from Respond.io
//   - The probe operator (Miguel) reports which variant produces a visible
//     WhatsApp card on his device. The one that returns 2xx AND renders a
//     card is the correct wire shape.
//
// Usage:
//   node --env-file=.env scripts/probe-catalog-shapes.mjs <contact_id> <test_id>
//
// Example (Miguel's tester contact):
//   node --env-file=.env scripts/probe-catalog-shapes.mjs 461410707 xini7rpxbl
//
// IMPORTANT: this sends up to 3 real WhatsApp messages to the test contact.
// Use a contact that is INSIDE the workspace AND that you have explicit
// authorization to message (e.g. Miguel's own number, or a throwaway tester
// number). Do NOT run against a real customer.

// Node 20 has global fetch — no need to import undici explicitly.

const KEY = process.env.RESPOND_IO_API_KEY;
const BASE = process.env.RESPOND_IO_API_BASE_URL || "https://api.respond.io/v2";
const CHANNEL_ID = process.env.RESPOND_IO_CHANNEL_ID || "274637";
const META_CATALOG_ID = process.env.META_CATALOG_ID || ""; // empty if not configured

const contactId = process.argv[2];
const testId = process.argv[3] || "xini7rpxbl"; // Try Scuba Diving EN per Miguel's 2026-06-02 list

if (!contactId) {
  console.error("Usage: node scripts/probe-catalog-shapes.mjs <contact_id> [test_id]");
  process.exit(1);
}
if (!KEY) {
  console.error("RESPOND_IO_API_KEY missing in env");
  process.exit(1);
}

const URL = `${BASE}/contact/id:${contactId}/message`;
const HEADERS = {
  "content-type": "application/json",
  authorization: `Bearer ${KEY}`,
};

console.log(`Probe target: contact=${contactId}, test_id=${testId}`);
console.log(`Endpoint: POST ${URL}`);
console.log(`META_CATALOG_ID env: ${META_CATALOG_ID ? "SET (" + META_CATALOG_ID.slice(0, 6) + "…)" : "NOT SET — variant B/C will use the test_id as catalog_id placeholder"}`);
console.log();

// Use test_id as a placeholder catalog_id if META_CATALOG_ID is not configured.
// This lets the probe still run; the response will tell us if catalog_id is
// required and what error message comes back if it's wrong.
const catalogIdForProbe = META_CATALOG_ID || testId;

// Round 2 probe (2026-06-03): round 1 proved (a) fragment is rejected
// outright and (b) channelId is invalid on the /contact endpoint. These
// 4 variants test what works when channelId is dropped and other shape
// candidates.
const variants = [
  {
    name: "D_interactive_catalog_item_no_channelId",
    note: "GA shape but without channelId (round 1 said channelId is rejected by /contact endpoint)",
    body: {
      message: {
        type: "interactive_catalog_item",
        content: {
          catalogId: catalogIdForProbe,
          productRetailerId: testId,
        },
      },
    },
  },
  {
    name: "E_custom_payload_no_channelId",
    note: "Meta-native WA interactive product wrapped in custom_payload — without channelId",
    body: {
      message: {
        type: "custom_payload",
        payload: {
          type: "interactive",
          interactive: {
            type: "product",
            body: { text: "Probe E — interactive product" },
            action: {
              catalog_id: catalogIdForProbe,
              product_retailer_id: testId,
            },
          },
        },
      },
    },
  },
  {
    name: "F_attachment_with_product_link",
    note: "Treat the catalog as an attachment shape — see if Respond.io has a documented WhatsApp catalog attachment",
    body: {
      message: {
        type: "attachment",
        attachment: {
          type: "product",
          catalogId: catalogIdForProbe,
          productRetailerId: testId,
        },
      },
    },
  },
  {
    name: "G_quick_reply_with_product",
    note: "Try the quick_reply message type to see how Respond.io validates it",
    body: {
      message: {
        type: "quick_reply",
        title: "Try Scuba",
        replies: [{ title: "Quote", payload: testId }],
      },
    },
  },
];

const results = [];

for (const v of variants) {
  console.log(`── ${v.name} ──`);
  console.log(`  ${v.note}`);
  const t0 = Date.now();
  let status, responseText;
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(v.body),
    });
    status = res.status;
    responseText = await res.text();
  } catch (err) {
    status = "ERROR";
    responseText = err && err.message ? err.message : String(err);
  }
  const elapsed = Date.now() - t0;
  console.log(`  status: ${status} (${elapsed}ms)`);
  console.log(`  body sent: ${JSON.stringify(v.body)}`);
  console.log(`  response: ${(responseText || "").slice(0, 500)}`);
  console.log();
  results.push({ name: v.name, status, elapsed, response: responseText });
  // Small delay between variants so the customer can identify which message
  // corresponds to which variant in WhatsApp order.
  await new Promise((r) => setTimeout(r, 1500));
}

console.log("── SUMMARY ──");
for (const r of results) {
  console.log(`  ${r.name}: status=${r.status} (${r.elapsed}ms)`);
}
console.log();
console.log("OPERATOR VERIFICATION REQUIRED:");
console.log("  Ask the test contact (Miguel) to open WhatsApp on his phone.");
console.log("  He should report which of the 3 messages (in order) produces:");
console.log("    (i)  a visible interactive product card (image + price + Reserve button), OR");
console.log("    (ii) plain text / nothing visible at all.");
console.log("  The variant that BOTH returned 2xx above AND produced (i) on his phone");
console.log("  is the correct wire shape. Update buildCatalogMessageBody() accordingly.");
