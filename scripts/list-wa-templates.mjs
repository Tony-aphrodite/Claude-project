// Per @respond-io/typescript-sdk@1.4.0 dist/index.js:417 — the canonical
// endpoint for WhatsApp templates is:
//   GET /v2/space/channel/{channelId}/template
//
// Also surface channel list + contact's connected channels for completeness.

const KEY = process.env.RESPOND_IO_API_KEY;
const BASE = process.env.RESPOND_IO_API_BASE_URL || "https://api.respond.io/v2";
const CHANNEL_ID = Number(process.env.RESPOND_IO_CHANNEL_ID || "274637");
const CONTACT_ID = process.argv[2] || "461474747";

if (!KEY) { console.error("RESPOND_IO_API_KEY missing"); process.exit(1); }

async function get(url) {
  const res = await fetch(url, { headers: { authorization: `Bearer ${KEY}` } });
  const txt = await res.text();
  let json = null;
  try { json = JSON.parse(txt); } catch {}
  return { status: res.status, ok: res.ok, txt, json };
}

console.log(`\n── 1) List space channels (GET /space/channel) ──`);
{
  const r = await get(`${BASE}/space/channel`);
  console.log(`  status=${r.status}`);
  if (r.ok) {
    const items = r.json?.items || r.json?.data || (Array.isArray(r.json) ? r.json : []);
    console.log(`  ${items.length} channel(s) in workspace:`);
    for (const c of items) {
      console.log(`    • id=${c.id}  name="${c.name}"  source=${c.source}`);
    }
  } else {
    console.log(`  body: ${r.txt.slice(0, 300)}`);
  }
}

console.log(`\n── 2) List channels connected to contact ${CONTACT_ID} (GET /contact/id:${CONTACT_ID}/channels) ──`);
{
  const r = await get(`${BASE}/contact/id:${CONTACT_ID}/channels`);
  console.log(`  status=${r.status}`);
  if (r.ok) {
    console.log(`  body: ${JSON.stringify(r.json).slice(0, 500)}`);
  } else {
    console.log(`  body: ${r.txt.slice(0, 300)}`);
  }
}

console.log(`\n── 3) List WhatsApp templates for channel ${CHANNEL_ID} (GET /space/channel/${CHANNEL_ID}/template) ──`);
{
  const r = await get(`${BASE}/space/channel/${CHANNEL_ID}/template`);
  console.log(`  status=${r.status}`);
  if (r.ok) {
    const items = r.json?.items || r.json?.data || (Array.isArray(r.json) ? r.json : []);
    console.log(`  ${items.length} template(s):`);
    for (const t of items) {
      const components = t.components || [];
      const buttons = components.flatMap((c) => c.buttons || []);
      const buttonTypes = buttons.map((b) => b.type).join(",") || "(no buttons)";
      console.log(`    • [${t.id}] "${t.name}" lang=${t.language || t.languageCode || "?"}  buttons=[${buttonTypes}]`);
    }
    // Highlight catalog/mpm templates which are what we need
    const catalogs = items.filter((t) =>
      (t.components || []).some((c) =>
        (c.buttons || []).some((b) => b.type === "catalog" || b.type === "mpm"),
      ),
    );
    if (catalogs.length) {
      console.log(`\n  >>> ${catalogs.length} template(s) HAVE catalog/mpm button — usable for catalog sends:`);
      for (const t of catalogs) {
        console.log(`      ✓ "${t.name}" lang=${t.language || t.languageCode}`);
      }
    } else {
      console.log(`\n  >>> NO template has catalog/mpm button. Miguel needs to register one in Meta Business Manager.`);
    }
  } else {
    console.log(`  body: ${r.txt.slice(0, 300)}`);
  }
}
