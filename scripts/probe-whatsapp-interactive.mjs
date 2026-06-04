// Definitive probe: send a Meta WhatsApp Catalog product card via Respond.io
// using message.type="whatsapp_interactive" + interactive.type="product".
// This is the EXACT shape Respond.io's own frontend uses for the "Catálogo
// de productos Meta" button (discovered by reading cdn.respond.io main JS
// schema SD/TD/yD around offset 904k).
//
// Usage: node --env-file=.env scripts/probe-whatsapp-interactive.mjs [contactId] [productRetailerId]

const KEY = process.env.RESPOND_IO_API_KEY;
const BASE = process.env.RESPOND_IO_API_BASE_URL || "https://api.respond.io/v2";
const CHANNEL_ID = Number(process.env.RESPOND_IO_CHANNEL_ID || "274637");
const META_CATALOG_ID = process.env.META_CATALOG_ID || "843708400728480";
const contactId = process.argv[2] || "461474747";
const productRetailerId = process.argv[3] || "xini7rpxbl";

if (!KEY) { console.error("RESPOND_IO_API_KEY missing"); process.exit(1); }

const url = `${BASE}/contact/id:${contactId}/message`;

const body = {
  channelId: CHANNEL_ID,
  message: {
    type: "whatsapp_interactive",
    interactive: {
      type: "product",
      action: {
        catalog_id: META_CATALOG_ID,
        product_retailer_id: productRetailerId,
      },
    },
  },
};

console.log(`POST ${url}`);
console.log(`body: ${JSON.stringify(body, null, 2)}\n`);

const t0 = Date.now();
const res = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${KEY}`,
  },
  body: JSON.stringify(body),
});
const txt = await res.text();
const elapsed = Date.now() - t0;
console.log(`status: ${res.status}  (${elapsed}ms)`);
console.log(`response: ${txt}`);
console.log();

if (res.ok) {
  console.log("✓✓✓ 2xx — SHAPE ACCEPTED! Check your WhatsApp now for the catalog card.");
  console.log("    If the card renders → wire this into sendCatalogMessage immediately.");
} else {
  console.log("✗ Still failing — response body above tells us the next constraint.");
}
