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
    // Server-side timeouts to prevent connection-hold-forever scenarios that
    // exhaust the pool (2026-06-12 + 2026-06-15 incidents — admin endpoints
    // editing prompts/KB triggered transactions that lingered, queue of new
    // requests starved waiting for free connections, /ready started hanging
    // past Railway's healthcheck timeout, customer-facing AI went dark).
    //
    //   • statement_timeout — kills any single statement that runs longer than
    //     this. Bounds worst-case query latency, so a stuck query can't tie
    //     up a connection indefinitely. 30s is well above any legitimate
    //     query in this app (longest are seed-content INSERTs ~hundreds of
    //     ms, Anthropic OCR ~10s but that's HTTP not DB).
    //   • idle_in_transaction_session_timeout — kills connections sitting in
    //     "BEGIN ... <waiting forever for COMMIT>" state. This is the actual
    //     leak shape — a transaction handler awaits something that never
    //     resolves (network, Anthropic, etc.), the postgres connection stays
    //     bound to that transaction, pool shrinks. 60s lets legitimate
    //     transactions finish (Anthropic calls inside roster-db transactions
    //     can take ~30s) but cuts genuine leaks.
    connection: {
      statement_timeout: 30_000,
      idle_in_transaction_session_timeout: 60_000,
    } as Record<string, number>,
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
