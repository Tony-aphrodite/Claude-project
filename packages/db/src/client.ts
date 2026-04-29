// ============================================================================
// Postgres connection pool. We use `postgres` (not pg) because it's faster,
// has native prepared statement caching, and pairs well with Drizzle.
// One pool per process — Railway runs us as a single container so we don't
// fight other workers for connections.
// ============================================================================

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.js";

let _client: postgres.Sql | undefined;
let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb(databaseUrl?: string) {
  if (_db) return _db;

  const url = databaseUrl ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL not set; cannot initialize Postgres client");
  }

  // Supabase pooler accepts up to ~60 connections on the free tier; we keep a
  // conservative limit so the follow-up scanner + webhook handler + panel can
  // coexist. Tune via DATABASE_POOL_MAX if needed.
  const max = Number(process.env.DATABASE_POOL_MAX ?? 10);

  _client = postgres(url, {
    max,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: true,
    // Supabase requires SSL; postgres-js auto-detects from sslmode= in URL.
  });

  _db = drizzle(_client, { schema, logger: process.env.DB_LOG === "1" });
  return _db;
}

export function getRawClient(): postgres.Sql {
  if (!_client) {
    getDb();
  }
  return _client!;
}

export async function closeDb(): Promise<void> {
  if (_client) {
    await _client.end({ timeout: 5 });
    _client = undefined;
    _db = undefined;
  }
}

export type Database = ReturnType<typeof getDb>;
