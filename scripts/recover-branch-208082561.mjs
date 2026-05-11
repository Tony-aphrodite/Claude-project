// One-shot recovery for contact 208082561 (Miguel's test contact, stuck
// on 2026-05-11 because Branch field was empty when deposit_paid tag was
// applied, causing the Onboarding Piloto workflow to fall into Otra
// fallback). This script:
//   1. PUT customFields with Branch="Gili Trawangan" (preserve tags)
//   2. PUT tags WITHOUT deposit_paid (forces a tag-updated event)
//   3. PUT tags WITH deposit_paid restored + Branch still set
//      → workflow trigger fires, Rama #2 condition now passes, 7 snippets
//        dispatch.
//
// Run from repo root: node --env-file=.env scripts/recover-branch-208082561.mjs

const CONTACT_ID = "208082561";
const BASE = process.env.RESPOND_IO_API_BASE_URL ?? "https://api.respond.io/v2";
const KEY = process.env.RESPOND_IO_API_KEY;
if (!KEY) {
  console.error("RESPOND_IO_API_KEY missing in env");
  process.exit(1);
}

const headers = {
  authorization: `Bearer ${KEY}`,
  "content-type": "application/json",
};
const url = `${BASE}/contact/id:${CONTACT_ID}`;

async function getContact() {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`GET failed ${r.status}: ${await r.text()}`);
  return r.json();
}

async function put(body) {
  const r = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PUT failed ${r.status}: ${await r.text()}`);
  return r.json().catch(() => ({}));
}

async function main() {
  console.log("[1/4] GET current contact state");
  const initial = await getContact();
  const tags = Array.isArray(initial?.contact?.tags)
    ? initial.contact.tags
    : Array.isArray(initial?.tags)
      ? initial.tags
      : [];
  console.log("    current tags:", tags);
  const existingCf = initial?.contact?.customFields ?? initial?.customFields ?? [];
  console.log("    customFields count:", Array.isArray(existingCf) ? existingCf.length : "n/a");

  console.log("[2/4] Set Branch=Gili Trawangan, preserve all current tags");
  await put({
    customFields: [{ name: "Branch", value: "Gili Trawangan" }],
    tags,
  });
  console.log("    ok");

  // To force a workflow re-fire, briefly remove deposit_paid then restore.
  const without = tags.filter((t) => t !== "deposit_paid");
  if (tags.includes("deposit_paid")) {
    console.log("[3/4] Remove deposit_paid temporarily (forces tag-updated event)");
    await put({ tags: without });
    console.log("    ok — tags now:", without);

    // Tiny gap so Respond.io processes the first event before the second.
    await new Promise((r) => setTimeout(r, 1500));

    console.log("[4/4] Restore deposit_paid → triggers Onboarding Piloto workflow");
    await put({ tags: [...without, "deposit_paid"] });
    console.log("    ok — tags now:", [...without, "deposit_paid"]);
  } else {
    console.log("[3/4] deposit_paid not present — adding fresh");
    await put({ tags: [...tags, "deposit_paid"] });
    console.log("    ok");
  }

  console.log("\nDone. 7 onboarding snippets should begin arriving over 15-25 min.");
  console.log("Check Respond.io → Workflows → 'DPM GT - Onboarding Piloto' → Historial.");
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
