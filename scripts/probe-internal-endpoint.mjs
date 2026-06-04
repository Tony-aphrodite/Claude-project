// Probe Respond.io's INTERNAL /messaging/ajax/message/send endpoint (which
// is what their own "Catálogo de productos Meta" button uses) with our
// public API Bearer token. If it works, we have the path. If not, fall
// back to trying alternate message.type values on the public API.

const KEY = process.env.RESPOND_IO_API_KEY;
const CHANNEL_ID = Number(process.env.RESPOND_IO_CHANNEL_ID || "274637");
const META_CATALOG_ID = process.env.META_CATALOG_ID || "843708400728480";
const contactId = process.argv[2] || "461474747";
const productRetailerId = process.argv[3] || "xini7rpxbl";

if (!KEY) { console.error("RESPOND_IO_API_KEY missing"); process.exit(1); }

const variants = [
  {
    name: "A_internal_messaging_ajax",
    url: "https://app.respond.io/messaging/ajax/message/send",
    body: {
      contactId: Number(contactId),
      channelId: CHANNEL_ID,
      message: {
        type: "whatsapp_interactive",
        interactive: {
          type: "product",
          action: { catalog_id: META_CATALOG_ID, product_retailer_id: productRetailerId },
        },
      },
    },
  },
  {
    name: "B_public_type_product",
    url: `https://api.respond.io/v2/contact/id:${contactId}/message`,
    body: {
      channelId: CHANNEL_ID,
      message: {
        type: "product",
        interactive: {
          type: "product",
          action: { catalog_id: META_CATALOG_ID, product_retailer_id: productRetailerId },
        },
      },
    },
  },
  {
    name: "C_public_type_interactive",
    url: `https://api.respond.io/v2/contact/id:${contactId}/message`,
    body: {
      channelId: CHANNEL_ID,
      message: {
        type: "interactive",
        interactive: {
          type: "product",
          action: { catalog_id: META_CATALOG_ID, product_retailer_id: productRetailerId },
        },
      },
    },
  },
  {
    name: "D_public_type_product_message",
    url: `https://api.respond.io/v2/contact/id:${contactId}/message`,
    body: {
      channelId: CHANNEL_ID,
      message: {
        type: "product_message",
        product: { catalog_id: META_CATALOG_ID, product_retailer_id: productRetailerId },
      },
    },
  },
  {
    name: "E_internal_with_message_array",
    url: "https://app.respond.io/messaging/ajax/message/send",
    body: {
      contactId: Number(contactId),
      channelId: CHANNEL_ID,
      payload: [{
        message: {
          type: "whatsapp_interactive",
          interactive: {
            type: "product",
            action: { catalog_id: META_CATALOG_ID, product_retailer_id: productRetailerId },
          },
        },
      }],
    },
  },
];

const results = [];
for (const v of variants) {
  console.log(`── ${v.name} ──`);
  console.log(`  ${v.url}`);
  const t0 = Date.now();
  let status, txt;
  try {
    const res = await fetch(v.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${KEY}`,
      },
      body: JSON.stringify(v.body),
    });
    status = res.status;
    txt = await res.text();
  } catch (err) {
    status = "ERROR";
    txt = err?.message || String(err);
  }
  const elapsed = Date.now() - t0;
  console.log(`  status: ${status} (${elapsed}ms)`);
  console.log(`  body: ${(txt || "").slice(0, 350)}`);
  console.log();
  results.push({ name: v.name, status, elapsed });
  await new Promise(r => setTimeout(r, 800));
}

console.log("── SUMMARY ──");
for (const r of results) {
  const mark = typeof r.status === "number" && r.status >= 200 && r.status < 300 ? "✓ 2xx" : "✗";
  console.log(`  ${mark} ${r.name}: ${r.status} (${r.elapsed}ms)`);
}
