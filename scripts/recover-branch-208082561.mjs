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

function normalizeCustomFields(raw) {
  const out = {};
  if (Array.isArray(raw)) {
    for (const e of raw) {
      if (e && typeof e === "object" && typeof e.name === "string") out[e.name] = e.value;
    }
  } else if (raw && typeof raw === "object") {
    Object.assign(out, raw);
  }
  return out;
}

async function main() {
  console.log("[1/5] GET current contact state");
  const initial = await getContact();
  const c = initial?.contact ?? initial ?? {};
  const tags = Array.isArray(c.tags) ? c.tags : [];
  console.log("    current tags:", tags);
  const cfMap = normalizeCustomFields(c.customFields ?? c.fields ?? c.custom_fields);
  console.log("    existing customFields:", Object.keys(cfMap));

  // Build merged customFields = existing (non-empty) + force Branch.
  const mergedFields = { ...cfMap, Branch: "Gili Trawangan" };
  const cfArray = Object.entries(mergedFields)
    .filter(([, v]) => v !== null && v !== undefined && !(typeof v === "string" && v.length === 0))
    .map(([name, value]) => ({ name, value }));

  console.log("[2/5] PUT merged customFields (Branch + preserve all existing)");
  await put({ customFields: cfArray, tags });
  console.log("    ok — fields written:", cfArray.map((f) => f.name));

  // Tiny gap so Respond.io commits the customField write before we mess
  // with tags. The tag-update event is what triggers the workflow, so the
  // Branch filter inside Rama #2 must read the post-write contact state.
  await new Promise((r) => setTimeout(r, 2000));

  // Force a clean tag-update event by remove-then-add cycle. Even if
  // deposit_paid is not currently present, doing the remove PUT first
  // makes the second PUT an unambiguous "tag added" diff which Respond.io
  // workflows trigger off cleanly.
  const without = tags.filter((t) => t !== "deposit_paid");
  console.log("[3/5] PUT tags WITHOUT deposit_paid (clean slate)");
  await put({ tags: without });
  console.log("    ok — tags now:", without);

  await new Promise((r) => setTimeout(r, 2000));

  console.log("[4/5] PUT tags WITH deposit_paid → trigger Onboarding Piloto");
  await put({ tags: [...without, "deposit_paid"] });
  console.log("    ok — tags now:", [...without, "deposit_paid"]);

  console.log("[5/5] Verify post-state via GET");
  await new Promise((r) => setTimeout(r, 1500));
  const final = await getContact();
  const fc = final?.contact ?? final ?? {};
  const finalTags = Array.isArray(fc.tags) ? fc.tags : [];
  const finalFields = normalizeCustomFields(fc.customFields ?? fc.fields ?? fc.custom_fields);
  console.log("    final tags:", finalTags);
  console.log("    final Branch:", finalFields.Branch ?? "(empty!)");
  console.log("    final field names:", Object.keys(finalFields));

  console.log("\nDone. If workflow Rama #2 (Branch=Gili Trawangan) is met,");
  console.log("7 onboarding snippets dispatch over 15-25 min.");
  console.log("If `final Branch` above is empty, the merge PUT didn't stick.");
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
