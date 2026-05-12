const KEY = process.env.RESPOND_IO_API_KEY;
const r = await fetch(`https://api.respond.io/v2/contact/id:208082561`, { headers: { authorization: `Bearer ${KEY}` } });
const j = await r.json();
console.log("language:", j.language);
console.log("tags:", j.tags);
console.log("lifecycle:", j.lifecycle);
console.log("custom_fields with values:");
for (const f of (j.custom_fields ?? [])) {
  if (f.value !== null && f.value !== "" && f.value !== undefined) {
    console.log(`  ${f.name} = ${JSON.stringify(f.value)}`);
  }
}
