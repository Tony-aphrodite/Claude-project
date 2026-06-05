// Apply ONLY migration 0002 (roster tables) directly via postgres-js.
// Bypasses the drizzle migration runner because earlier migrations
// (0000, 0001) reference columns/tables that were already applied via
// raw SQL outside Drizzle's tracker — running them again fails with
// "already exists" errors. This script targets only the new statements.

import postgres from "postgres";
import fs from "fs";
import path from "path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set in env");
  process.exit(1);
}

const migrationPath = path.join(
  "packages",
  "db",
  "drizzle",
  "0002_calm_expediter.sql",
);
if (!fs.existsSync(migrationPath)) {
  console.error(`Migration file not found: ${migrationPath}`);
  process.exit(1);
}

const migration = fs.readFileSync(migrationPath, "utf8");
const statements = migration
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);

console.log(
  `Applying ${statements.length} statement(s) from 0002_calm_expediter.sql`,
);

const sql = postgres(url, { max: 1 });

let applied = 0;
let skipped = 0;
for (const stmt of statements) {
  const preview = stmt.slice(0, 80).replace(/\s+/g, " ");
  process.stdout.write(`  • ${preview}${stmt.length > 80 ? "…" : ""}\n`);
  try {
    await sql.unsafe(stmt);
    applied++;
    process.stdout.write("    ✓ applied\n");
  } catch (err) {
    const msg = err?.message || String(err);
    if (
      msg.includes("already exists") ||
      msg.includes("duplicate") ||
      err?.code === "42P07" ||
      err?.code === "42701"
    ) {
      skipped++;
      process.stdout.write(`    ⊘ skipped (${err.code}): ${msg.slice(0, 80)}\n`);
    } else {
      console.error(`    ✗ FAILED: ${msg}`);
      await sql.end();
      process.exit(1);
    }
  }
}

console.log(
  `\nDone. Applied: ${applied}, skipped: ${skipped}, total: ${statements.length}`,
);

// Optional: record migration 0002 as applied in __drizzle_migrations so a
// future `pnpm migrate` doesn't try to re-run it. (Hash computation matches
// drizzle's: sha256 of statements joined.)
import crypto from "crypto";
const hash = crypto.createHash("sha256").update(migration).digest("hex");
try {
  await sql.unsafe(
    `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [hash, Date.now()],
  );
  console.log("Recorded 0002 hash in drizzle.__drizzle_migrations");
} catch (err) {
  console.log("(Could not record hash — non-blocking)", err?.message);
}

await sql.end();
process.exit(0);
