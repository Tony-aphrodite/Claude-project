// Round 3 probe (2026-06-04). Round 1 + 2 used a placeholder catalog_id;
// now we have real META_CATALOG_ID + real product_retailer_id. This round
// tests channelId-format variants AND the /conversation endpoint path to
// find what Respond.io v2 actually accepts for a custom_payload catalog
// send on production data.
//
// Usage:
//   node --env-file=.env scripts/probe-catalog-v3.mjs <contact_id>
//
// Example (Tony's tester):
//   node --env-file=.env scripts/probe-catalog-v3.mjs 461474747
//
// Required env (defaults shown):
//   RESPOND_IO_API_KEY      — required, no default
//   RESPOND_IO_API_BASE_URL = https://api.respond.io/v2
//   RESPOND_IO_CHANNEL_ID   = 274637
//   META_CATALOG_ID         = 843708400728480

const KEY = process.env.RESPOND_IO_API_KEY;
const BASE = process.env.RESPOND_IO_API_BASE_URL || "https://api.respond.io/v2";
const CHANNEL_ID_STR = process.env.RESPOND_IO_CHANNEL_ID || "274637";
const CHANNEL_ID_NUM = Number(CHANNEL_ID_STR);
const META_CATALOG_ID = process.env.META_CATALOG_ID || "843708400728480";
const TEST_PRODUCT_ID = "xini7rpxbl"; // Try Scuba EN per respondio_catalogs_phi_phi.md

const contactId = process.argv[2];
if (!contactId) {
  console.error("Usage: node scripts/probe-catalog-v3.mjs <contact_id>");
  process.exit(1);
}
if (!KEY) {
  console.error("RESPOND_IO_API_KEY missing in env");
  process.exit(1);
}

const URL_CONTACT = `${BASE}/contact/id:${contactId}/message`;
const HEADERS = {
  "content-type": "application/json",
  authorization: `Bearer ${KEY}`,
};

console.log(`Probe round 3 — finding the catalog wire shape that Respond.io accepts`);
console.log(`  contact_id     : ${contactId}`);
console.log(`  channel_id     : ${CHANNEL_ID_STR}`);
console.log(`  meta_catalog_id: ${META_CATALOG_ID}`);
console.log(`  product_id     : ${TEST_PRODUCT_ID}`);
console.log(`  URL            : POST ${URL_CONTACT}`);
console.log();

const innerInteractive = {
  type: "interactive",
  interactive: {
    type: "product",
    action: {
      catalog_id: META_CATALOG_ID,
      product_retailer_id: TEST_PRODUCT_ID,
    },
  },
};

const variants = [
  {
    name: "V1_channelId_string",
    note: "current production shape — channelId as STRING",
    body: {
      channelId: CHANNEL_ID_STR,
      message: { type: "custom_payload", payload: innerInteractive },
    },
  },
  {
    name: "V2_channelId_number",
    note: "channelId as NUMBER (not string)",
    body: {
      channelId: CHANNEL_ID_NUM,
      message: { type: "custom_payload", payload: innerInteractive },
    },
  },
  {
    name: "V3_no_channelId",
    note: "no channelId at all (inferred from contact)",
    body: {
      message: { type: "custom_payload", payload: innerInteractive },
    },
  },
  {
    name: "V4_channel_nested_in_message",
    note: "channelId moved INSIDE message object (different nesting)",
    body: {
      message: {
        channelId: CHANNEL_ID_STR,
        type: "custom_payload",
        payload: innerInteractive,
      },
    },
  },
  {
    name: "V5_attachment_product",
    note: "alt shape — type='attachment' with product type",
    body: {
      message: {
        type: "attachment",
        attachment: {
          type: "product",
          catalogId: META_CATALOG_ID,
          productRetailerId: TEST_PRODUCT_ID,
        },
      },
    },
  },
  {
    name: "V6_interactive_message_type",
    note: "alt shape — type='interactive' top-level (not custom_payload wrapper)",
    body: {
      message: {
        type: "interactive",
        interactive: {
          type: "product",
          action: {
            catalog_id: META_CATALOG_ID,
            product_retailer_id: TEST_PRODUCT_ID,
          },
        },
      },
    },
  },
];

const results = [];

for (const v of variants) {
  console.log(`── ${v.name} ──`);
  console.log(`  ${v.note}`);
  console.log(`  body: ${JSON.stringify(v.body)}`);
  const t0 = Date.now();
  let status, responseText;
  try {
    const res = await fetch(URL_CONTACT, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(v.body),
    });
    status = res.status;
    responseText = await res.text();
  } catch (err) {
    status = "ERROR";
    responseText = err?.message || String(err);
  }
  const elapsed = Date.now() - t0;
  const isOk = typeof status === "number" && status >= 200 && status < 300;
  const mark = isOk ? "✓ 2xx" : "✗";
  console.log(`  ${mark} status=${status} (${elapsed}ms)`);
  console.log(`  response: ${(responseText || "").slice(0, 400)}`);
  console.log();
  results.push({ name: v.name, status, elapsed, isOk });
  // Sleep between variants so the operator can match WhatsApp messages to
  // variant order if multiple succeed.
  await new Promise((r) => setTimeout(r, 1200));
}

console.log("── SUMMARY ──");
for (const r of results) {
  const mark = r.isOk ? "✓ 2xx" : "✗";
  console.log(`  ${mark}  ${r.name}: status=${r.status} (${r.elapsed}ms)`);
}
console.log();
const ok = results.filter((r) => r.isOk);
if (ok.length === 0) {
  console.log("NO VARIANT RETURNED 2XX. We need to inspect Respond.io docs or contact support.");
} else {
  console.log(`${ok.length} variant(s) returned 2xx:`);
  for (const r of ok) console.log(`   • ${r.name}`);
  console.log();
  console.log("OPERATOR ACTION: ask the test contact (Tony's WhatsApp) to report which of");
  console.log("the variants produced a visible catalog card (image + price + button).");
  console.log("That variant is the canonical wire shape — update buildCatalogMessageBody.");
}
