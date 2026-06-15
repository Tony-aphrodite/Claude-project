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
  const max = Number(process.env.DATABASE_POOL_MAX ?? 20);

  _client = postgres(url, {
    max,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: true,
    // NOTE on server-side timeouts (statement_timeout /
    // idle_in_transaction_session_timeout): we used to set these via the
    // `connection: {...}` startup-parameter block, but Supabase's transaction
    // pooler (PgBouncer in front of Postgres) rejects unknown startup
    // params with "08P01 unsupported startup parameter" (seed-content
    // crashed on 2026-06-15 with exactly this error).
    //
    // Fix: set the timeouts at the DATABASE level instead, so EVERY
    // connection — including pooler-routed ones — inherits them without
    // needing a startup-time handshake. Run this ONCE in the Supabase SQL
    // Editor (production + any other env):
    //
    //   ALTER DATABASE postgres
    //     SET statement_timeout = '30s';
    //   ALTER DATABASE postgres
    //     SET idle_in_transaction_session_timeout = '60s';
    //
    // The 30s/60s budget is the same logic as before — bounds runaway
    // queries and leaked-transaction connection holds, prevents pool
    // exhaustion (root cause of the 06-12 and 06-15 outages).
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
