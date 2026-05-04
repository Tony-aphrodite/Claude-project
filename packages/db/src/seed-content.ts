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

const SYSTEM_PROMPT_FILE = "00_SYSTEM_PROMPT.md";
const FEW_SHOTS_FILE = "FEW_SHOTS_GiliTrawangan.md";
const KB_FILES = [
  "KB01_programas_precios.md",
  "KB02_dive_sites.md",
  "KB03_payments.md",
  "KB04_sales_patterns.md",
  "KB05_operational_rules.md",
  "KB06_roster_integration.md",
] as const;

const STORAGE_BUCKET = "kb";
const KB_STORAGE_PATH = "gili-trawangan/v1/kb-bundle.md";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

async function readInfo(file: string): Promise<string> {
  return readFile(path.join(INFO_DIR, file), "utf-8");
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

export async function seedAll(): Promise<void> {
  await seedSystemPrompt();
  // KB bundle requires Supabase Storage credentials; skip silently when they
  // are missing so local dev / CI without Supabase can still run the
  // migration step.
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      await seedKbBundle();
    } catch (err) {
      console.warn(`[seed-content] KB bundle skip: ${(err as Error).message}`);
    }
  } else {
    console.log(
      "[seed-content] KB bundle skipped (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set)",
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
