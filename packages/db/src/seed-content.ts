// ============================================================================
// Content-package seeder.
//
// The owner-authored content lives as Markdown files in /information at the
// repo root: 00_SYSTEM_PROMPT.md (John v1.1), FEW_SHOTS_GiliTrawangan.md
// (8 anonymized real conversations), KB01..KB06 (knowledge base sections).
//
// We seed two database surfaces from these files:
//   1. prompts_versiones: a single global row for type='system' with the
//      John prompt + few-shots concatenated as one cacheable block.
//   2. kb_documents + Supabase Storage: the six KB files concatenated and
//      uploaded as the active KB blob for the Gili Trawangan sede.
//
// Both upserts are idempotent. Re-running this seeder against a database
// that already has v1 promotes a v2 only if the content changed; otherwise
// it's a no-op. The `sha256(content)` is stamped onto created_by so we can
// detect drift between the file system and the database.
// ============================================================================

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { eq, sql } from "drizzle-orm";

import { getDb, getRawClient, kbDocuments, promptsVersiones, sedes } from "./index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const INFO_DIR = path.resolve(REPO_ROOT, "information");
// Per-sede Miguel hand-off drops. Each delivery lives in its own
// numbered subfolder under information/ so the originals stay traceable
// (we never edit them in place — new versions go in a new numbered dir).
//   • Colomba/Gili Air — 2026-05-15
//   • Emma/Koh Tao — 2026-05-16
//   • Francisco Emilio/Koh Phi Phi — 2026-05-17
//   • David/Nusa Penida — 2026-05-17
const GA_INFO_DIR = path.resolve(REPO_ROOT, "information/15-information");
const KT_INFO_DIR = path.resolve(REPO_ROOT, "information/16-information-koh-tao");
const PP_INFO_DIR = path.resolve(REPO_ROOT, "information/17-information-phi-phi");
const NP_INFO_DIR = path.resolve(REPO_ROOT, "information/18-information");

const SYSTEM_PROMPT_FILE = "00_SYSTEM_PROMPT.md";
const FEW_SHOTS_FILE = "FEW_SHOTS_GiliTrawangan.md";
const KB_FILES = [
  "KB01_programas_precios.md",
  "KB02_dive_sites.md",
  "KB03_payments.md",
  "KB04_sales_patterns.md",
  "KB05_operational_rules.md",
  "KB06_roster_integration.md",
  // Snippet textos cargados literalmente desde Respond.io. Permite
  // que John conozca el wording oficial sin duplicarlo (las reglas
  // de invocación están en 00_SYSTEM_PROMPT.md §post-confirm-workflow).
  "snippetstextosmdgilitai.md",
] as const;

// Colomba bundle for Gili Air (per Miguel 2026-05-15 spec). Unlike John,
// the FEW_SHOTS_50_conversations.md (~100k tokens) is CONCATENATED into
// the system prompt block per Miguel's explicit instruction — he wants to
// test whether full-corpus few-shots improve answer quality vs the
// curated subset we use for John.
const GA_SYSTEM_PROMPT_FILE = "COLOMBA_SYSTEM_PROMPT.md";
const GA_FEW_SHOTS_FILE = "FEW_SHOTS_50_conversations.md";
// Miguel's v2.0 delivery format (2026-05-16): the 8 KBs come pre-
// concatenated as a single file, mirroring how the bundle ends up in
// storage anyway. Preferred path is to read this single file directly;
// the individual KB files below are kept as fallback in case future
// deliveries revert to the multi-file shape.
const GA_KB_BUNDLE_FILE = "COLOMBA_KB_BUNDLE.md";
const GA_KB_FILES = [
  "KB01_programas_precios.md",
  "KB02_pagos_cuentas.md",
  "KB03_calificacion_ventas.md",
  "KB04_sitios_buceo.md",
  "KB05_politicas_reglas.md",
  "KB06_ubicacion_transporte.md",
  "KB07_catalogo_meta.md",
  "KB08_casos_especiales.md",
] as const;

// Emma bundle for Koh Tao (Miguel 2026-05-16 delivery, v1.0). Same shape
// as GA's v1.x multi-file layout — 12 KB files in numbered order, system
// prompt as a separate file. KB-11 (PATRONES_VENTAS_REALES) carries the
// 12 closed-conversation patterns Miguel mined from the Koh Tao corpus;
// no separate few-shots file like GA's 50-conv bundle.
const KT_SYSTEM_PROMPT_FILE = "EMMA_PROMPT_NEW.txt";
const KT_KB_FILES = [
  "KB01_PROGRAMS_AND_PRICES.txt",
  "KB02_SCHEDULES_AND_LOGISTICS.txt",
  "KB03_ACCOMMODATION.txt",
  "KB04_DIVE_SITES.txt",
  "KB05_SALES_AND_CUSTOMER_SERVICE.txt",
  "KB06_PAYMENTS_AND_DEPOSITS.txt",
  "KB07_FAQS_AND_SPECIAL_CASES.txt",
  "KB08_QUICK_REPLIES.txt",
  "KB09_PROGRAM_DESCRIPTIONS.txt",
  "KB10_INTELLIGENT_SALES_MANUAL.txt",
  "KB11_PATRONES_VENTAS_REALES.md",
  "KB12_OFERTAS_ESTACIONALES.md",
] as const;

// Francisco Emilio bundle for Koh Phi Phi (Miguel 2026-05-17 delivery,
// v1.3). Multi-file shape with KB-01..KB-07 + a separate compressed
// system prompt; no separate few-shots — the empirical sales manual
// (KB-06, 36 KB) carries the closed-conversation patterns inline.
const PP_SYSTEM_PROMPT_FILE = "system_prompt_phi_phi.md";
const PP_KB_FILES = [
  "kb_01_programas_y_precios.md",
  "kb_02_dive_sites_operativa.md",
  "kb_03_pagos_y_reservas.md",
  "kb_04_objeciones_upselling.md",
  "kb_05_snippets_quick_replies.md",
  "kb_06_manual_ventas_empirico.md",
  "kb_07_ofertas_estacionales.md",
] as const;

// David bundle for Nusa Penida (Miguel 2026-05-17 delivery). 12 KB files
// (KB01..KB12), compressed system prompt as its own block — same shape
// as the PP delivery. KB-10 + KB-11 carry the empirical sales manual
// inline; no separate few-shots file.
const NP_SYSTEM_PROMPT_FILE = "DAVID_PROMPT.md";
const NP_KB_FILES = [
  "KB01_David_NusaPenida.md",
  "KB02_David_NusaPenida.md",
  "KB03_David_NusaPenida.md",
  "KB04_David_NusaPenida.md",
  "KB05_David_NusaPenida.md",
  "KB06_David_NusaPenida.md",
  "KB07_David_NusaPenida.md",
  "KB08_David_NusaPenida.md",
  "KB09_David_NusaPenida.md",
  "KB10_David_NusaPenida.md",
  "KB11_David_NusaPenida.md",
  "KB12_David_NusaPenida.md",
] as const;

const STORAGE_BUCKET = "kb";
const KB_STORAGE_PATH = "gili-trawangan/v1/kb-bundle.md";
const GA_KB_STORAGE_PATH = "gili-air/v1/kb-bundle.md";
const KT_KB_STORAGE_PATH = "koh-tao/v1/kb-bundle.md";
const PP_KB_STORAGE_PATH = "koh-phi-phi/v1/kb-bundle.md";
const NP_KB_STORAGE_PATH = "nusa-penida/v1/kb-bundle.md";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

async function readInfo(file: string): Promise<string> {
  return readFile(path.join(INFO_DIR, file), "utf-8");
}

async function readGaInfo(file: string): Promise<string> {
  return readFile(path.join(GA_INFO_DIR, file), "utf-8");
}

async function readKtInfo(file: string): Promise<string> {
  return readFile(path.join(KT_INFO_DIR, file), "utf-8");
}

async function readPpInfo(file: string): Promise<string> {
  return readFile(path.join(PP_INFO_DIR, file), "utf-8");
}

async function readNpInfo(file: string): Promise<string> {
  return readFile(path.join(NP_INFO_DIR, file), "utf-8");
}

/** Concatenate John v1.1 + 8 few-shots with a clear delimiter. */
async function buildSystemPromptContent(): Promise<string> {
  const sysPrompt = (await readInfo(SYSTEM_PROMPT_FILE)).trim();
  const fewShots = (await readInfo(FEW_SHOTS_FILE)).trim();
  return [
    sysPrompt,
    "",
    "═══════════════════════════════════════════════════════════════════════",
    "EJEMPLOS DE CONVERSACIÓN (FEW-SHOTS)",
    "Estos son ejemplos REALES de conversaciones cerradas exitosamente.",
    "Imitá el TONO, RITMO y PATRONES — no el contenido literal.",
    "═══════════════════════════════════════════════════════════════════════",
    "",
    fewShots,
  ].join("\n");
}

/** Concatenate the 6 KB files with section headers. */
async function buildKbBundle(): Promise<string> {
  const parts: string[] = [];
  for (const file of KB_FILES) {
    const content = (await readInfo(file)).trim();
    parts.push(content);
    parts.push("");
    parts.push("---");
    parts.push("");
  }
  return parts.join("\n");
}

export async function seedSystemPrompt(): Promise<{
  versionId: string;
  versionNumber: number;
  contentHash: string;
  unchanged: boolean;
}> {
  const db = getDb();
  const content = await buildSystemPromptContent();
  const contentHash = sha256(content);

  // Look up the active global system prompt.
  const [existing] = await db
    .select()
    .from(promptsVersiones)
    .where(
      sql`${promptsVersiones.type} = 'system' AND ${promptsVersiones.sedeId} IS NULL AND ${promptsVersiones.active} = true`,
    )
    .limit(1);

  if (existing && existing.createdBy === `seed:${contentHash}`) {
    console.log(
      `[seed-content] system prompt v${existing.versionNumber} already up to date (hash=${contentHash})`,
    );
    return {
      versionId: existing.id,
      versionNumber: existing.versionNumber,
      contentHash,
      unchanged: true,
    };
  }

  // Pick the next version number across the (system, NULL) tuple.
  const [{ nextVer }] = (await db.execute<{ nextVer: number }>(sql`
    SELECT COALESCE(MAX(version_number), 0) + 1 AS "nextVer"
      FROM prompts_versiones
     WHERE type = 'system' AND sede_id IS NULL
  `)) as unknown as [{ nextVer: number }];

  // Deactivate previous active row, activate new one in a transaction.
  const [created] = await db.transaction(async (tx) => {
    await tx
      .update(promptsVersiones)
      .set({ active: false })
      .where(
        sql`${promptsVersiones.type} = 'system' AND ${promptsVersiones.sedeId} IS NULL`,
      );
    return tx
      .insert(promptsVersiones)
      .values({
        versionNumber: nextVer,
        type: "system",
        sedeId: null,
        content,
        active: true,
        createdBy: `seed:${contentHash}`,
        regressionSuitePassed: false,
      })
      .returning();
  });

  if (!created) throw new Error("failed to insert system prompt");
  console.log(
    `[seed-content] system prompt seeded as v${created.versionNumber} (hash=${contentHash}, ${content.length} chars)`,
  );
  return {
    versionId: created.id,
    versionNumber: created.versionNumber,
    contentHash,
    unchanged: false,
  };
}

/**
 * Upload the KB bundle to Supabase Storage and create / update the active
 * kb_documents row for Gili Trawangan. Requires SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY in the environment.
 */
export async function seedKbBundle(): Promise<{
  storagePath: string;
  contentHash: string;
  documentId: string;
  unchanged: boolean;
}> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required to seed KB bundle to storage",
    );
  }

  const db = getDb();
  const content = await buildKbBundle();
  const contentHash = sha256(content);

  // Find the Gili Trawangan sede.
  const [sede] = await db
    .select()
    .from(sedes)
    .where(eq(sedes.nombre, "Gili Trawangan"))
    .limit(1);
  if (!sede) {
    throw new Error("Gili Trawangan sede missing — run post-migration.sql first");
  }

  // Skip upload if the active doc has the same hash already.
  const [activeDoc] = await db
    .select()
    .from(kbDocuments)
    .where(
      sql`${kbDocuments.sedeId} = ${sede.id} AND ${kbDocuments.active} = true`,
    )
    .limit(1);
  if (activeDoc && activeDoc.uploadedBy === `seed:${contentHash}`) {
    console.log(
      `[seed-content] KB bundle for Gili Trawangan already up to date (hash=${contentHash})`,
    );
    return {
      storagePath: activeDoc.storagePath,
      contentHash,
      documentId: activeDoc.id,
      unchanged: true,
    };
  }

  // Upload via Supabase Storage REST API. The bucket must already exist;
  // we don't auto-create it because that requires admin scope and we want
  // the operator to provision it once.
  //
  // Header dance: Storage authenticates via TWO mechanisms depending on key
  // format. Legacy `eyJ...` JWTs go in `Authorization: Bearer`; the new
  // `sb_secret_...` keys go in `apikey`. We send both so the same code path
  // works regardless of which format the operator pasted into env.
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${KB_STORAGE_PATH}`;
  const upload = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "content-type": "text/markdown",
      "x-upsert": "true",
    },
    body: content,
  });
  if (!upload.ok) {
    const body = await upload.text().catch(() => "");
    throw new Error(`KB upload failed: ${upload.status} ${body.slice(0, 200)}`);
  }

  // Bump version, deactivate old active doc, insert new active row.
  const [{ nextVer }] = (await db.execute<{ nextVer: number }>(sql`
    SELECT COALESCE(MAX(version), 0) + 1 AS "nextVer"
      FROM kb_documents
     WHERE sede_id = ${sede.id}
  `)) as unknown as [{ nextVer: number }];

  const [created] = await db.transaction(async (tx) => {
    await tx
      .update(kbDocuments)
      .set({ active: false })
      .where(eq(kbDocuments.sedeId, sede.id));
    return tx
      .insert(kbDocuments)
      .values({
        sedeId: sede.id,
        storagePath: `${STORAGE_BUCKET}/${KB_STORAGE_PATH}`,
        version: nextVer,
        active: true,
        uploadedBy: `seed:${contentHash}`,
      })
      .returning();
  });

  if (!created) throw new Error("failed to insert kb_documents row");
  // Also update sede.kb_document_id so the prompts service finds it via the
  // FK rather than scanning kb_documents on every load.
  await db
    .update(sedes)
    .set({ kbDocumentId: created.id })
    .where(eq(sedes.id, sede.id));

  console.log(
    `[seed-content] KB bundle uploaded as v${created.version} (hash=${contentHash}, ${content.length} chars)`,
  );
  return {
    storagePath: created.storagePath,
    contentHash,
    documentId: created.id,
    unchanged: false,
  };
}

// ─── Colomba / Gili Air ─────────────────────────────────────────────────────
//
// Per Miguel 2026-05-15: GA gets ALL 50 few-shot conversations concatenated
// into the cached system block. This is a deliberate experiment vs the
// curated subset used for John (GT) — Miguel wants to measure whether the
// fuller context produces better answers, accepting the ~3.5x token cost
// per cached read in exchange.
async function buildGaSystemPromptContent(): Promise<string> {
  const sysPrompt = (await readGaInfo(GA_SYSTEM_PROMPT_FILE)).trim();
  const fewShots = (await readGaInfo(GA_FEW_SHOTS_FILE)).trim();
  return [
    sysPrompt,
    "",
    "═══════════════════════════════════════════════════════════════════════",
    "EJEMPLOS DE CONVERSACIÓN — CORPUS COMPLETO (50 cierres reales)",
    "Estas son 50 conversaciones reales del corpus Respond.io de DPM",
    "Gili Air (abril 2025 → marzo 2026) que terminaron en depósito",
    "confirmado. Imitá el TONO, RITMO y PATRONES — no copies frases",
    "literalmente. Los precios reales viven en KB-01.",
    "═══════════════════════════════════════════════════════════════════════",
    "",
    fewShots,
  ].join("\n");
}

async function buildGaKbBundle(): Promise<string> {
  // v2.0+ delivery path: Miguel sends a single pre-concatenated bundle.
  // Prefer it when present; the shape Miguel delivers is identical to
  // what the old multi-file loop produced (KB-01 .. KB-08 in order with
  // hairline dividers), so the SHA-based version bump in seedGaKbBundle
  // still picks up genuine content changes correctly.
  try {
    const bundle = await readGaInfo(GA_KB_BUNDLE_FILE);
    return bundle.trim();
  } catch {
    // Fallback to the v1.x multi-file shape if the bundle isn't present
    // (older corpora or test fixtures).
    const parts: string[] = [];
    for (const file of GA_KB_FILES) {
      const content = (await readGaInfo(file)).trim();
      parts.push(content);
      parts.push("");
      parts.push("---");
      parts.push("");
    }
    return parts.join("\n");
  }
}

// Apps Script roster endpoint for Gili Air, per Miguel's
// SPEC_consultar_disponibilidad.md v1.3 (2026-05-15). Stored on the sede
// row so the existing AppsScriptService (services/apps-script.ts) picks
// it up via `sede.rosterConfig.url` — no per-sede service forks needed.
const GA_ROSTER_URL =
  "https://script.google.com/macros/s/AKfycby5DCwi-X_Gcx-VX7bYKeLQ5I7uotSADINxIO4BAkU/exec";

// Nusa Penida roster URL — Miguel 2026-05-18 (Web App deployment, /exec).
// Different deployment ID than the earlier /dev URL he sent before
// understanding the deployment step — that one's superseded. Same shape
// as GA_ROSTER_URL: AppsScriptService reads it via sede.rosterConfig.url.
const NP_ROSTER_URL =
  "https://script.google.com/macros/s/AKfycbz8tCjLt-oY7r5AqCBcL_kJkBps-SQMNCkESMSbmxQjYeDsedLWXZ0yswCB9vW7ZNCwZg/exec";

// Koh Phi Phi roster URL — Miguel 2026-05-18 (Web App deployment, /exec).
// Different deployment ID than the earlier /dev URL he sent before
// understanding the deployment step — that one's superseded. Same shape
// as GA_ROSTER_URL: AppsScriptService reads it via sede.rosterConfig.url.
const PP_ROSTER_URL =
  "https://script.google.com/macros/s/AKfycbyF4bGoz8ep2jFf9k7xLTxSO_g6HAZtBUfK95xINvMBsTNgEcof9xnoq1g5waEBS4Hg/exec";

// Koh Tao roster URL — Miguel 2026-05-18 (Web App deployment, /exec).
// Completes the 5-of-5 roster wiring: KT was the last sede whose
// consultar_disponibilidad calls were returning timeout because no URL
// was configured. With this constant set, Emma can verify capacity for
// boat slots against the live Koh Tao schedule.
const KT_ROSTER_URL =
  "https://script.google.com/macros/s/AKfycbyJ7sQ_Xu7ZA3ESLcdBJ4T06dW0ujgKZ_CcQcMxQD34mQUPOAHUAzLXPuq2IvWUbftM/exec";

export async function seedGaSedeConfig(): Promise<{ updated: boolean } | null> {
  const db = getDb();
  const [gaSede] = await db
    .select()
    .from(sedes)
    .where(eq(sedes.nombre, "Gili Air"))
    .limit(1);
  if (!gaSede) {
    console.warn("[seed-content] Gili Air sede missing — skipping config seed");
    return null;
  }

  const currentUrl = (gaSede.rosterConfig as { url?: string } | null)?.url;
  if (currentUrl === GA_ROSTER_URL) {
    console.log("[seed-content] Gili Air roster_config already set");
    return { updated: false };
  }

  await db
    .update(sedes)
    .set({
      rosterConfig: { url: GA_ROSTER_URL },
      updatedAt: new Date(),
    })
    .where(eq(sedes.id, gaSede.id));

  console.log(
    `[seed-content] Gili Air roster_config updated → ${GA_ROSTER_URL.slice(0, 60)}…`,
  );
  return { updated: true };
}

export async function seedGaSystemPrompt(): Promise<{
  versionId: string;
  versionNumber: number;
  contentHash: string;
  unchanged: boolean;
} | null> {
  const db = getDb();
  const [gaSede] = await db
    .select()
    .from(sedes)
    .where(eq(sedes.nombre, "Gili Air"))
    .limit(1);
  if (!gaSede) {
    console.warn(
      "[seed-content] Gili Air sede missing — skipping Colomba prompt seed",
    );
    return null;
  }

  const content = await buildGaSystemPromptContent();
  const contentHash = sha256(content);

  const [existing] = await db
    .select()
    .from(promptsVersiones)
    .where(
      sql`${promptsVersiones.type} = 'system' AND ${promptsVersiones.sedeId} = ${gaSede.id} AND ${promptsVersiones.active} = true`,
    )
    .limit(1);

  if (existing && existing.createdBy === `seed:${contentHash}`) {
    console.log(
      `[seed-content] Colomba prompt v${existing.versionNumber} already up to date (hash=${contentHash})`,
    );
    return {
      versionId: existing.id,
      versionNumber: existing.versionNumber,
      contentHash,
      unchanged: true,
    };
  }

  const [{ nextVer }] = (await db.execute<{ nextVer: number }>(sql`
    SELECT COALESCE(MAX(version_number), 0) + 1 AS "nextVer"
      FROM prompts_versiones
     WHERE type = 'system' AND sede_id = ${gaSede.id}
  `)) as unknown as [{ nextVer: number }];

  const [created] = await db.transaction(async (tx) => {
    await tx
      .update(promptsVersiones)
      .set({ active: false })
      .where(
        sql`${promptsVersiones.type} = 'system' AND ${promptsVersiones.sedeId} = ${gaSede.id}`,
      );
    return tx
      .insert(promptsVersiones)
      .values({
        versionNumber: nextVer,
        type: "system",
        sedeId: gaSede.id,
        content,
        active: true,
        createdBy: `seed:${contentHash}`,
        regressionSuitePassed: false,
      })
      .returning();
  });

  if (!created) throw new Error("failed to insert Colomba system prompt");
  console.log(
    `[seed-content] Colomba prompt seeded as v${created.versionNumber} (hash=${contentHash}, ${content.length} chars / ~${Math.round(content.length / 4)} tokens)`,
  );
  return {
    versionId: created.id,
    versionNumber: created.versionNumber,
    contentHash,
    unchanged: false,
  };
}

export async function seedGaKbBundle(): Promise<{
  storagePath: string;
  contentHash: string;
  documentId: string;
  unchanged: boolean;
} | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required to seed GA KB bundle",
    );
  }

  const db = getDb();
  const content = await buildGaKbBundle();
  const contentHash = sha256(content);

  const [sede] = await db
    .select()
    .from(sedes)
    .where(eq(sedes.nombre, "Gili Air"))
    .limit(1);
  if (!sede) {
    console.warn("[seed-content] Gili Air sede missing — skipping KB seed");
    return null;
  }

  const [activeDoc] = await db
    .select()
    .from(kbDocuments)
    .where(
      sql`${kbDocuments.sedeId} = ${sede.id} AND ${kbDocuments.active} = true`,
    )
    .limit(1);
  if (activeDoc && activeDoc.uploadedBy === `seed:${contentHash}`) {
    console.log(
      `[seed-content] KB bundle for Gili Air already up to date (hash=${contentHash})`,
    );
    return {
      storagePath: activeDoc.storagePath,
      contentHash,
      documentId: activeDoc.id,
      unchanged: true,
    };
  }

  const uploadUrl = `${supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${GA_KB_STORAGE_PATH}`;
  const upload = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "content-type": "text/markdown",
      "x-upsert": "true",
    },
    body: content,
  });
  if (!upload.ok) {
    const body = await upload.text().catch(() => "");
    throw new Error(`GA KB upload failed: ${upload.status} ${body.slice(0, 200)}`);
  }

  const [{ nextVer }] = (await db.execute<{ nextVer: number }>(sql`
    SELECT COALESCE(MAX(version), 0) + 1 AS "nextVer"
      FROM kb_documents
     WHERE sede_id = ${sede.id}
  `)) as unknown as [{ nextVer: number }];

  const [created] = await db.transaction(async (tx) => {
    await tx
      .update(kbDocuments)
      .set({ active: false })
      .where(eq(kbDocuments.sedeId, sede.id));
    return tx
      .insert(kbDocuments)
      .values({
        sedeId: sede.id,
        storagePath: `${STORAGE_BUCKET}/${GA_KB_STORAGE_PATH}`,
        version: nextVer,
        active: true,
        uploadedBy: `seed:${contentHash}`,
      })
      .returning();
  });

  if (!created) throw new Error("failed to insert GA kb_documents row");
  await db
    .update(sedes)
    .set({ kbDocumentId: created.id })
    .where(eq(sedes.id, sede.id));

  console.log(
    `[seed-content] GA KB bundle uploaded as v${created.version} (hash=${contentHash}, ${content.length} chars / ~${Math.round(content.length / 4)} tokens)`,
  );
  return {
    storagePath: created.storagePath,
    contentHash,
    documentId: created.id,
    unchanged: false,
  };
}

// ─── Emma / Koh Tao ─────────────────────────────────────────────────────────
//
// Miguel v1.0 delivery (2026-05-16). Unlike GA, no separate few-shots
// bundle — the closed-conversation patterns live inside KB-11
// (PATRONES_VENTAS_REALES.md, ~12k tokens with 12 analyzed conversations).
// Same multi-file shape as GA's v1.x delivery: 12 KB files concatenated
// into the cached KB block, prompt as its own block.
async function buildKtSystemPromptContent(): Promise<string> {
  const sysPrompt = (await readKtInfo(KT_SYSTEM_PROMPT_FILE)).trim();
  return sysPrompt;
}

export async function seedKtSedeConfig(): Promise<{ updated: boolean } | null> {
  const db = getDb();
  const [ktSede] = await db
    .select()
    .from(sedes)
    .where(eq(sedes.nombre, "Koh Tao"))
    .limit(1);
  if (!ktSede) {
    console.warn("[seed-content] Koh Tao sede missing — skipping config");
    return null;
  }

  // Same /dev → /exec guard as the other sedes. We refuse to write the
  // broken endpoint type instead of silently pushing it and letting
  // Railway hit 401s.
  if (KT_ROSTER_URL.endsWith("/dev")) {
    console.warn(
      "[seed-content] Koh Tao roster URL still ends in /dev — refusing to seed. " +
        "Ask Miguel to redeploy the Apps Script as a Web App (Execute as: Me, " +
        "Who has access: Anyone) and replace KT_ROSTER_URL with the /exec URL.",
    );
    return { updated: false };
  }

  const currentUrl = (ktSede.rosterConfig as { url?: string } | null)?.url;
  if (currentUrl === KT_ROSTER_URL) {
    console.log("[seed-content] Koh Tao roster_config already set");
    return { updated: false };
  }

  await db
    .update(sedes)
    .set({ rosterConfig: { url: KT_ROSTER_URL }, updatedAt: new Date() })
    .where(eq(sedes.id, ktSede.id));
  console.log(
    `[seed-content] Koh Tao roster_config updated → ${KT_ROSTER_URL.slice(0, 60)}…`,
  );
  return { updated: true };
}

async function buildKtKbBundle(): Promise<string> {
  const parts: string[] = [];
  for (const file of KT_KB_FILES) {
    const content = (await readKtInfo(file)).trim();
    parts.push(content);
    parts.push("");
    parts.push("---");
    parts.push("");
  }
  return parts.join("\n");
}

export async function seedKtSystemPrompt(): Promise<{
  versionId: string;
  versionNumber: number;
  contentHash: string;
  unchanged: boolean;
} | null> {
  const db = getDb();
  const [ktSede] = await db
    .select()
    .from(sedes)
    .where(eq(sedes.nombre, "Koh Tao"))
    .limit(1);
  if (!ktSede) {
    console.warn(
      "[seed-content] Koh Tao sede missing — skipping Emma prompt seed",
    );
    return null;
  }

  const content = await buildKtSystemPromptContent();
  const contentHash = sha256(content);

  const [existing] = await db
    .select()
    .from(promptsVersiones)
    .where(
      sql`${promptsVersiones.type} = 'system' AND ${promptsVersiones.sedeId} = ${ktSede.id} AND ${promptsVersiones.active} = true`,
    )
    .limit(1);

  if (existing && existing.createdBy === `seed:${contentHash}`) {
    console.log(
      `[seed-content] Emma prompt v${existing.versionNumber} already up to date (hash=${contentHash})`,
    );
    return {
      versionId: existing.id,
      versionNumber: existing.versionNumber,
      contentHash,
      unchanged: true,
    };
  }

  const [{ nextVer }] = (await db.execute<{ nextVer: number }>(sql`
    SELECT COALESCE(MAX(version_number), 0) + 1 AS "nextVer"
      FROM prompts_versiones
     WHERE type = 'system' AND sede_id = ${ktSede.id}
  `)) as unknown as [{ nextVer: number }];

  const [created] = await db.transaction(async (tx) => {
    await tx
      .update(promptsVersiones)
      .set({ active: false })
      .where(
        sql`${promptsVersiones.type} = 'system' AND ${promptsVersiones.sedeId} = ${ktSede.id}`,
      );
    return tx
      .insert(promptsVersiones)
      .values({
        versionNumber: nextVer,
        type: "system",
        sedeId: ktSede.id,
        content,
        active: true,
        createdBy: `seed:${contentHash}`,
        regressionSuitePassed: false,
      })
      .returning();
  });

  if (!created) throw new Error("failed to insert Emma system prompt");
  console.log(
    `[seed-content] Emma prompt seeded as v${created.versionNumber} (hash=${contentHash}, ${content.length} chars / ~${Math.round(content.length / 4)} tokens)`,
  );
  return {
    versionId: created.id,
    versionNumber: created.versionNumber,
    contentHash,
    unchanged: false,
  };
}

export async function seedKtKbBundle(): Promise<{
  storagePath: string;
  contentHash: string;
  documentId: string;
  unchanged: boolean;
} | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required to seed KT KB bundle",
    );
  }

  const db = getDb();
  const content = await buildKtKbBundle();
  const contentHash = sha256(content);

  const [sede] = await db
    .select()
    .from(sedes)
    .where(eq(sedes.nombre, "Koh Tao"))
    .limit(1);
  if (!sede) {
    console.warn("[seed-content] Koh Tao sede missing — skipping KB seed");
    return null;
  }

  const [activeDoc] = await db
    .select()
    .from(kbDocuments)
    .where(
      sql`${kbDocuments.sedeId} = ${sede.id} AND ${kbDocuments.active} = true`,
    )
    .limit(1);
  if (activeDoc && activeDoc.uploadedBy === `seed:${contentHash}`) {
    console.log(
      `[seed-content] KB bundle for Koh Tao already up to date (hash=${contentHash})`,
    );
    return {
      storagePath: activeDoc.storagePath,
      contentHash,
      documentId: activeDoc.id,
      unchanged: true,
    };
  }

  const uploadUrl = `${supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${KT_KB_STORAGE_PATH}`;
  const upload = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "content-type": "text/markdown",
      "x-upsert": "true",
    },
    body: content,
  });
  if (!upload.ok) {
    const body = await upload.text().catch(() => "");
    throw new Error(`KT KB upload failed: ${upload.status} ${body.slice(0, 200)}`);
  }

  const [{ nextVer }] = (await db.execute<{ nextVer: number }>(sql`
    SELECT COALESCE(MAX(version), 0) + 1 AS "nextVer"
      FROM kb_documents
     WHERE sede_id = ${sede.id}
  `)) as unknown as [{ nextVer: number }];

  const [created] = await db.transaction(async (tx) => {
    await tx
      .update(kbDocuments)
      .set({ active: false })
      .where(eq(kbDocuments.sedeId, sede.id));
    return tx
      .insert(kbDocuments)
      .values({
        sedeId: sede.id,
        storagePath: `${STORAGE_BUCKET}/${KT_KB_STORAGE_PATH}`,
        version: nextVer,
        active: true,
        uploadedBy: `seed:${contentHash}`,
      })
      .returning();
  });

  if (!created) throw new Error("failed to insert KT kb_documents row");
  await db
    .update(sedes)
    .set({ kbDocumentId: created.id })
    .where(eq(sedes.id, sede.id));

  console.log(
    `[seed-content] KT KB bundle uploaded as v${created.version} (hash=${contentHash}, ${content.length} chars / ~${Math.round(content.length / 4)} tokens)`,
  );
  return {
    storagePath: created.storagePath,
    contentHash,
    documentId: created.id,
    unchanged: false,
  };
}

// ─── Francisco Emilio / Koh Phi Phi ─────────────────────────────────────────
//
// Miguel v1.3 delivery (2026-05-17). KB-01..KB-07 concatenated into the
// cached KB block; system prompt as its own block. KB-06 carries the
// empirical sales manual (5,772 contacts / 241k messages corpus, 302
// confirmed closures) so no separate few-shots file is needed.
//
// Naming note: the original pilot SQL seed used nombre='Phi Phi' but the
// Respond.io Branch custom field writes the verbatim string "Koh Phi
// Phi". The post-migration SQL now renames the row so SedeService can
// match the Branch value directly. seedPpSedeConfig below also performs
// the rename idempotently in case it ran before the SQL migration.
async function buildPpSystemPromptContent(): Promise<string> {
  const sysPrompt = (await readPpInfo(PP_SYSTEM_PROMPT_FILE)).trim();
  return sysPrompt;
}

async function buildPpKbBundle(): Promise<string> {
  const parts: string[] = [];
  for (const file of PP_KB_FILES) {
    const content = (await readPpInfo(file)).trim();
    parts.push(content);
    parts.push("");
    parts.push("---");
    parts.push("");
  }
  return parts.join("\n");
}

export async function seedPpSedeConfig(): Promise<{
  renamed: boolean;
  rosterUpdated: boolean;
  warning?: string;
} | null> {
  const db = getDb();
  // Find by respond_io_tag (stable key) since the nombre might still be
  // the legacy 'Phi Phi' on older DBs.
  const [ppSede] = await db
    .select()
    .from(sedes)
    .where(eq(sedes.respondIoTag, "sede:phi_phi"))
    .limit(1);
  if (!ppSede) {
    console.warn("[seed-content] Koh Phi Phi sede missing — skipping config");
    return null;
  }

  let renamed = false;
  if (ppSede.nombre !== "Koh Phi Phi") {
    await db
      .update(sedes)
      .set({ nombre: "Koh Phi Phi", updatedAt: new Date() })
      .where(eq(sedes.id, ppSede.id));
    console.log(
      `[seed-content] Koh Phi Phi sede renamed '${ppSede.nombre}' → 'Koh Phi Phi'`,
    );
    renamed = true;
  }

  // Roster URL handling: refuse to seed while still /dev (script-owner-
  // only endpoint that 401s when called from Railway). Same guard as NP.
  if (PP_ROSTER_URL.endsWith("/dev")) {
    console.warn(
      "[seed-content] Koh Phi Phi roster URL still ends in /dev — refusing to seed. " +
        "Ask Miguel to redeploy the Apps Script as a Web App (Execute as: Me, " +
        "Who has access: Anyone) and replace PP_ROSTER_URL with the /exec URL.",
    );
    return {
      renamed,
      rosterUpdated: false,
      warning: "PP_ROSTER_URL ends in /dev (script-owner-only endpoint)",
    };
  }

  const currentUrl = (ppSede.rosterConfig as { url?: string } | null)?.url;
  if (currentUrl === PP_ROSTER_URL) {
    console.log("[seed-content] Koh Phi Phi roster_config already set");
    return { renamed, rosterUpdated: false };
  }

  await db
    .update(sedes)
    .set({
      rosterConfig: { url: PP_ROSTER_URL },
      updatedAt: new Date(),
    })
    .where(eq(sedes.id, ppSede.id));
  console.log(
    `[seed-content] Koh Phi Phi roster_config updated → ${PP_ROSTER_URL.slice(0, 60)}…`,
  );
  return { renamed, rosterUpdated: true };
}

export async function seedPpSystemPrompt(): Promise<{
  versionId: string;
  versionNumber: number;
  contentHash: string;
  unchanged: boolean;
} | null> {
  const db = getDb();
  const [ppSede] = await db
    .select()
    .from(sedes)
    .where(eq(sedes.nombre, "Koh Phi Phi"))
    .limit(1);
  if (!ppSede) {
    console.warn(
      "[seed-content] Koh Phi Phi sede missing — skipping Francisco Emilio prompt seed",
    );
    return null;
  }

  const content = await buildPpSystemPromptContent();
  const contentHash = sha256(content);

  const [existing] = await db
    .select()
    .from(promptsVersiones)
    .where(
      sql`${promptsVersiones.type} = 'system' AND ${promptsVersiones.sedeId} = ${ppSede.id} AND ${promptsVersiones.active} = true`,
    )
    .limit(1);

  if (existing && existing.createdBy === `seed:${contentHash}`) {
    console.log(
      `[seed-content] Francisco Emilio prompt v${existing.versionNumber} already up to date (hash=${contentHash})`,
    );
    return {
      versionId: existing.id,
      versionNumber: existing.versionNumber,
      contentHash,
      unchanged: true,
    };
  }

  const [{ nextVer }] = (await db.execute<{ nextVer: number }>(sql`
    SELECT COALESCE(MAX(version_number), 0) + 1 AS "nextVer"
      FROM prompts_versiones
     WHERE type = 'system' AND sede_id = ${ppSede.id}
  `)) as unknown as [{ nextVer: number }];

  const [created] = await db.transaction(async (tx) => {
    await tx
      .update(promptsVersiones)
      .set({ active: false })
      .where(
        sql`${promptsVersiones.type} = 'system' AND ${promptsVersiones.sedeId} = ${ppSede.id}`,
      );
    return tx
      .insert(promptsVersiones)
      .values({
        versionNumber: nextVer,
        type: "system",
        sedeId: ppSede.id,
        content,
        active: true,
        createdBy: `seed:${contentHash}`,
        regressionSuitePassed: false,
      })
      .returning();
  });

  if (!created) throw new Error("failed to insert Francisco Emilio system prompt");
  console.log(
    `[seed-content] Francisco Emilio prompt seeded as v${created.versionNumber} (hash=${contentHash}, ${content.length} chars / ~${Math.round(content.length / 4)} tokens)`,
  );
  return {
    versionId: created.id,
    versionNumber: created.versionNumber,
    contentHash,
    unchanged: false,
  };
}

export async function seedPpKbBundle(): Promise<{
  storagePath: string;
  contentHash: string;
  documentId: string;
  unchanged: boolean;
} | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required to seed PP KB bundle",
    );
  }

  const db = getDb();
  const content = await buildPpKbBundle();
  const contentHash = sha256(content);

  const [sede] = await db
    .select()
    .from(sedes)
    .where(eq(sedes.nombre, "Koh Phi Phi"))
    .limit(1);
  if (!sede) {
    console.warn("[seed-content] Koh Phi Phi sede missing — skipping KB seed");
    return null;
  }

  const [activeDoc] = await db
    .select()
    .from(kbDocuments)
    .where(
      sql`${kbDocuments.sedeId} = ${sede.id} AND ${kbDocuments.active} = true`,
    )
    .limit(1);
  if (activeDoc && activeDoc.uploadedBy === `seed:${contentHash}`) {
    console.log(
      `[seed-content] KB bundle for Koh Phi Phi already up to date (hash=${contentHash})`,
    );
    return {
      storagePath: activeDoc.storagePath,
      contentHash,
      documentId: activeDoc.id,
      unchanged: true,
    };
  }

  const uploadUrl = `${supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${PP_KB_STORAGE_PATH}`;
  const upload = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "content-type": "text/markdown",
      "x-upsert": "true",
    },
    body: content,
  });
  if (!upload.ok) {
    const body = await upload.text().catch(() => "");
    throw new Error(`PP KB upload failed: ${upload.status} ${body.slice(0, 200)}`);
  }

  const [{ nextVer }] = (await db.execute<{ nextVer: number }>(sql`
    SELECT COALESCE(MAX(version), 0) + 1 AS "nextVer"
      FROM kb_documents
     WHERE sede_id = ${sede.id}
  `)) as unknown as [{ nextVer: number }];

  const [created] = await db.transaction(async (tx) => {
    await tx
      .update(kbDocuments)
      .set({ active: false })
      .where(eq(kbDocuments.sedeId, sede.id));
    return tx
      .insert(kbDocuments)
      .values({
        sedeId: sede.id,
        storagePath: `${STORAGE_BUCKET}/${PP_KB_STORAGE_PATH}`,
        version: nextVer,
        active: true,
        uploadedBy: `seed:${contentHash}`,
      })
      .returning();
  });

  if (!created) throw new Error("failed to insert PP kb_documents row");
  await db
    .update(sedes)
    .set({ kbDocumentId: created.id })
    .where(eq(sedes.id, sede.id));

  console.log(
    `[seed-content] PP KB bundle uploaded as v${created.version} (hash=${contentHash}, ${content.length} chars / ~${Math.round(content.length / 4)} tokens)`,
  );
  return {
    storagePath: created.storagePath,
    contentHash,
    documentId: created.id,
    unchanged: false,
  };
}

// ─── David / Nusa Penida ────────────────────────────────────────────────────
//
// Miguel 2026-05-17 delivery. The Nusa Penida sede row already exists in
// the pilot seed under nombre='Nusa Penida' (which matches the Branch
// custom field verbatim) so no rename step is needed — just prompt + KB
// bundle, then add 'Nusa Penida' to AI_ENABLED_SEDE_NAMES in
// services/sede.ts. With David in place, all 5 DPM sedes are AI-enabled.
async function buildNpSystemPromptContent(): Promise<string> {
  const sysPrompt = (await readNpInfo(NP_SYSTEM_PROMPT_FILE)).trim();
  return sysPrompt;
}

export async function seedNpSedeConfig(): Promise<{
  updated: boolean;
  warning?: string;
} | null> {
  const db = getDb();
  const [npSede] = await db
    .select()
    .from(sedes)
    .where(eq(sedes.nombre, "Nusa Penida"))
    .limit(1);
  if (!npSede) {
    console.warn("[seed-content] Nusa Penida sede missing — skipping config");
    return null;
  }

  // Refuse to seed a `/dev` URL. Apps Script `/dev` endpoints only
  // authorize the script owner's Google session — Railway calls hit a
  // 401 and the AI degrades to "no_configurado". Writing the broken
  // value to the DB would make David look like he's failing when the
  // real fix is a redeploy on Miguel's side.
  if (NP_ROSTER_URL.endsWith("/dev")) {
    console.warn(
      "[seed-content] Nusa Penida roster URL still ends in /dev — refusing to seed. " +
        "Ask Miguel to redeploy the Apps Script as a Web App (Execute as: Me, " +
        "Who has access: Anyone) and replace NP_ROSTER_URL with the /exec URL.",
    );
    return {
      updated: false,
      warning: "NP_ROSTER_URL ends in /dev (script-owner-only endpoint)",
    };
  }

  const currentUrl = (npSede.rosterConfig as { url?: string } | null)?.url;
  if (currentUrl === NP_ROSTER_URL) {
    console.log("[seed-content] Nusa Penida roster_config already set");
    return { updated: false };
  }

  await db
    .update(sedes)
    .set({
      rosterConfig: { url: NP_ROSTER_URL },
      updatedAt: new Date(),
    })
    .where(eq(sedes.id, npSede.id));

  console.log(
    `[seed-content] Nusa Penida roster_config updated → ${NP_ROSTER_URL.slice(0, 60)}…`,
  );
  return { updated: true };
}

async function buildNpKbBundle(): Promise<string> {
  const parts: string[] = [];
  for (const file of NP_KB_FILES) {
    const content = (await readNpInfo(file)).trim();
    parts.push(content);
    parts.push("");
    parts.push("---");
    parts.push("");
  }
  return parts.join("\n");
}

export async function seedNpSystemPrompt(): Promise<{
  versionId: string;
  versionNumber: number;
  contentHash: string;
  unchanged: boolean;
} | null> {
  const db = getDb();
  const [npSede] = await db
    .select()
    .from(sedes)
    .where(eq(sedes.nombre, "Nusa Penida"))
    .limit(1);
  if (!npSede) {
    console.warn(
      "[seed-content] Nusa Penida sede missing — skipping David prompt seed",
    );
    return null;
  }

  const content = await buildNpSystemPromptContent();
  const contentHash = sha256(content);

  const [existing] = await db
    .select()
    .from(promptsVersiones)
    .where(
      sql`${promptsVersiones.type} = 'system' AND ${promptsVersiones.sedeId} = ${npSede.id} AND ${promptsVersiones.active} = true`,
    )
    .limit(1);

  if (existing && existing.createdBy === `seed:${contentHash}`) {
    console.log(
      `[seed-content] David prompt v${existing.versionNumber} already up to date (hash=${contentHash})`,
    );
    return {
      versionId: existing.id,
      versionNumber: existing.versionNumber,
      contentHash,
      unchanged: true,
    };
  }

  const [{ nextVer }] = (await db.execute<{ nextVer: number }>(sql`
    SELECT COALESCE(MAX(version_number), 0) + 1 AS "nextVer"
      FROM prompts_versiones
     WHERE type = 'system' AND sede_id = ${npSede.id}
  `)) as unknown as [{ nextVer: number }];

  const [created] = await db.transaction(async (tx) => {
    await tx
      .update(promptsVersiones)
      .set({ active: false })
      .where(
        sql`${promptsVersiones.type} = 'system' AND ${promptsVersiones.sedeId} = ${npSede.id}`,
      );
    return tx
      .insert(promptsVersiones)
      .values({
        versionNumber: nextVer,
        type: "system",
        sedeId: npSede.id,
        content,
        active: true,
        createdBy: `seed:${contentHash}`,
        regressionSuitePassed: false,
      })
      .returning();
  });

  if (!created) throw new Error("failed to insert David system prompt");
  console.log(
    `[seed-content] David prompt seeded as v${created.versionNumber} (hash=${contentHash}, ${content.length} chars / ~${Math.round(content.length / 4)} tokens)`,
  );
  return {
    versionId: created.id,
    versionNumber: created.versionNumber,
    contentHash,
    unchanged: false,
  };
}

export async function seedNpKbBundle(): Promise<{
  storagePath: string;
  contentHash: string;
  documentId: string;
  unchanged: boolean;
} | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required to seed NP KB bundle",
    );
  }

  const db = getDb();
  const content = await buildNpKbBundle();
  const contentHash = sha256(content);

  const [sede] = await db
    .select()
    .from(sedes)
    .where(eq(sedes.nombre, "Nusa Penida"))
    .limit(1);
  if (!sede) {
    console.warn("[seed-content] Nusa Penida sede missing — skipping KB seed");
    return null;
  }

  const [activeDoc] = await db
    .select()
    .from(kbDocuments)
    .where(
      sql`${kbDocuments.sedeId} = ${sede.id} AND ${kbDocuments.active} = true`,
    )
    .limit(1);
  if (activeDoc && activeDoc.uploadedBy === `seed:${contentHash}`) {
    console.log(
      `[seed-content] KB bundle for Nusa Penida already up to date (hash=${contentHash})`,
    );
    return {
      storagePath: activeDoc.storagePath,
      contentHash,
      documentId: activeDoc.id,
      unchanged: true,
    };
  }

  const uploadUrl = `${supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${NP_KB_STORAGE_PATH}`;
  const upload = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "content-type": "text/markdown",
      "x-upsert": "true",
    },
    body: content,
  });
  if (!upload.ok) {
    const body = await upload.text().catch(() => "");
    throw new Error(`NP KB upload failed: ${upload.status} ${body.slice(0, 200)}`);
  }

  const [{ nextVer }] = (await db.execute<{ nextVer: number }>(sql`
    SELECT COALESCE(MAX(version), 0) + 1 AS "nextVer"
      FROM kb_documents
     WHERE sede_id = ${sede.id}
  `)) as unknown as [{ nextVer: number }];

  const [created] = await db.transaction(async (tx) => {
    await tx
      .update(kbDocuments)
      .set({ active: false })
      .where(eq(kbDocuments.sedeId, sede.id));
    return tx
      .insert(kbDocuments)
      .values({
        sedeId: sede.id,
        storagePath: `${STORAGE_BUCKET}/${NP_KB_STORAGE_PATH}`,
        version: nextVer,
        active: true,
        uploadedBy: `seed:${contentHash}`,
      })
      .returning();
  });

  if (!created) throw new Error("failed to insert NP kb_documents row");
  await db
    .update(sedes)
    .set({ kbDocumentId: created.id })
    .where(eq(sedes.id, sede.id));

  console.log(
    `[seed-content] NP KB bundle uploaded as v${created.version} (hash=${contentHash}, ${content.length} chars / ~${Math.round(content.length / 4)} tokens)`,
  );
  return {
    storagePath: created.storagePath,
    contentHash,
    documentId: created.id,
    unchanged: false,
  };
}

export async function seedAll(): Promise<void> {
  await seedSystemPrompt();
  await seedGaSedeConfig();
  await seedGaSystemPrompt();
  await seedKtSystemPrompt();
  await seedKtSedeConfig();
  await seedPpSedeConfig();
  await seedPpSystemPrompt();
  await seedNpSedeConfig();
  await seedNpSystemPrompt();
  // KB bundle requires Supabase Storage credentials; skip silently when they
  // are missing so local dev / CI without Supabase can still run the
  // migration step.
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      await seedKbBundle();
    } catch (err) {
      console.warn(`[seed-content] KB bundle skip: ${(err as Error).message}`);
    }
    try {
      await seedGaKbBundle();
    } catch (err) {
      console.warn(`[seed-content] GA KB bundle skip: ${(err as Error).message}`);
    }
    try {
      await seedKtKbBundle();
    } catch (err) {
      console.warn(`[seed-content] KT KB bundle skip: ${(err as Error).message}`);
    }
    try {
      await seedPpKbBundle();
    } catch (err) {
      console.warn(`[seed-content] PP KB bundle skip: ${(err as Error).message}`);
    }
    try {
      await seedNpKbBundle();
    } catch (err) {
      console.warn(`[seed-content] NP KB bundle skip: ${(err as Error).message}`);
    }
  } else {
    console.log(
      "[seed-content] KB bundles skipped (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set)",
    );
  }
  // Best-effort connection cleanup if invoked standalone.
  await getRawClient().end({ timeout: 5 }).catch(() => {});
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  seedAll().catch((err) => {
    console.error("[seed-content] failed:", err);
    process.exit(1);
  });
}
