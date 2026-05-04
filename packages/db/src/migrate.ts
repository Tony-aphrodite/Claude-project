// Apply Drizzle-generated migrations, then the hand-written
// sql/post-migration.sql (RLS, partial indexes, seeds), then seed the
// owner-authored content (John v1.1 prompt, KB bundle). Idempotent — safe
// to run on every deploy. Invoked by `pnpm --filter @dpm/db run migrate`.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { migrate } from "drizzle-orm/postgres-js/migrator";

import { closeDb, getDb, getRawClient } from "./client.js";
import { seedKbBundle, seedSystemPrompt } from "./seed-content.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POST_MIGRATION_SQL = path.resolve(__dirname, "../sql/post-migration.sql");
const DRIZZLE_DIR = path.resolve(__dirname, "../drizzle");

async function main() {
  const db = getDb();

  console.log(`[db:migrate] running drizzle migrations from ${DRIZZLE_DIR} ...`);
  await migrate(db, { migrationsFolder: DRIZZLE_DIR });
  console.log("[db:migrate] drizzle migrations done");

  console.log(`[db:migrate] applying post-migration SQL ${POST_MIGRATION_SQL} ...`);
  const sqlText = await readFile(POST_MIGRATION_SQL, "utf-8");
  const client = getRawClient();
  await client.unsafe(sqlText);
  console.log("[db:migrate] post-migration SQL applied");

  console.log("[db:migrate] seeding owner content (John v1.1 + KB bundle) ...");
  await seedSystemPrompt();
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      await seedKbBundle();
    } catch (err) {
      console.warn(`[db:migrate] KB bundle skipped: ${(err as Error).message}`);
    }
  } else {
    console.log(
      "[db:migrate] KB bundle skipped (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set)",
    );
  }
  console.log("[db:migrate] content seed done");

  await closeDb();
}

main().catch(async (err) => {
  console.error("[db:migrate] failed:", err);
  await closeDb().catch(() => {});
  process.exit(1);
});
