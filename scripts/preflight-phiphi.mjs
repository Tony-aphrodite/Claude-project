import postgres from "/home/ph/Client/Claude-project/node_modules/.pnpm/postgres@3.4.9/node_modules/postgres/cjs/src/index.js";

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  // 1) Find Phi Phi sede
  const sedes = await sql`
    SELECT id, nombre, roster_config
      FROM sedes
     WHERE nombre ILIKE '%phi phi%' OR nombre ILIKE '%koh phi%'
  `;
  if (sedes.length === 0) {
    console.log("❌ NO SEDE FOUND matching 'phi phi'");
    process.exit(1);
  }
  const sede = sedes[0];
  console.log("✓ Sede found:");
  console.log("  id    :", sede.id);
  console.log("  nombre:", sede.nombre);
  console.log("  roster_config:", JSON.stringify(sede.roster_config, null, 2));
  console.log();

  // 2) Active system prompt for this sede
  const prompts = await sql`
    SELECT id, version_number, type, active, created_at, regression_suite_passed
      FROM prompts_versiones
     WHERE sede_id = ${sede.id} AND type = 'system'
     ORDER BY version_number DESC
     LIMIT 5
  `;
  const activePrompt = prompts.find((p) => p.active);
  if (activePrompt) {
    console.log("✓ Active system prompt:");
    console.log("  version :", activePrompt.version_number);
    console.log("  id      :", activePrompt.id);
    console.log("  regression_suite_passed:", activePrompt.regression_suite_passed);
  } else {
    console.log("❌ NO ACTIVE system prompt for", sede.nombre);
    console.log("  Recent versions:");
    for (const p of prompts) {
      console.log(`    v${p.version_number} (active=${p.active}, regression_passed=${p.regression_suite_passed})`);
    }
  }
  console.log();

  // Check if there's a global fallback system prompt (sede_id null)
  const globalSysPrompt = await sql`
    SELECT id, version_number, active FROM prompts_versiones
     WHERE sede_id IS NULL AND type = 'system' AND active = true
     LIMIT 1
  `;
  if (globalSysPrompt.length > 0) {
    console.log("  (Global fallback system prompt also active: v" + globalSysPrompt[0].version_number + ")");
  }
  console.log();

  // 3) Active KB for this sede
  const kbs = await sql`
    SELECT id, version, active, storage_path, uploaded_at
      FROM kb_documents
     WHERE sede_id = ${sede.id}
     ORDER BY version DESC
     LIMIT 5
  `;
  const activeKb = kbs.find((k) => k.active);
  if (activeKb) {
    console.log("✓ Active KB:");
    console.log("  version     :", activeKb.version);
    console.log("  id          :", activeKb.id);
    console.log("  storage_path:", activeKb.storage_path);
  } else {
    console.log("❌ NO ACTIVE KB for", sede.nombre);
    console.log("  Recent versions:", kbs.map((k) => `v${k.version}(active=${k.active})`).join(", "));
  }
  console.log();

  // 4) Roster URL inspection
  const url = sede.roster_config?.url;
  if (url) {
    console.log("✓ Roster URL configured");
    console.log("  url:", url);
    if (!/\/exec(\?|$)/.test(url)) {
      console.log("  ⚠ WARNING: URL does not end in /exec — might be /dev (test endpoint)");
    }
  } else {
    console.log("❌ NO ROSTER URL in sede.roster_config");
  }
} finally {
  await sql.end();
}
