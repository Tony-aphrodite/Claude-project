// ============================================================================
// Panel user deletion script — counterpart to create-panel-user.ts.
//
// Revokes access for an office staff member (or admin) by deleting their
// Supabase Auth user. Once deleted, the email can no longer sign in and
// any active session cookie is invalidated at the next request.
//
// Miguel asked for this 2026-05-18 ("se tiene que poder sacar el permiso
// por si mañana dejan de trabajar conmigo"). Both this CLI and the
// /admin/users panel page are wired to the same Supabase admin endpoint
// — Miguel uses the panel, Tony uses the CLI for power-user cases.
//
// Idempotent: deleting a user that doesn't exist exits 0 with a note,
// so running this twice is safe.
//
// Usage:
//   pnpm tsx scripts/delete-panel-user.ts --email=ex-employee@dpmdiving.com
//
// Env required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

(function loadDotenv() {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env"), "utf-8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // No .env present — that's fine if env vars are set externally.
  }
})();

type Args = { email: string };

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = {};
  for (const a of argv.slice(2)) {
    if (a.startsWith("--email=")) args.email = a.slice("--email=".length);
  }
  if (!args.email) {
    console.error("usage: delete-panel-user --email=<addr>");
    process.exit(1);
  }
  return { email: args.email };
}

function authHeaders(): Record<string, string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    console.error("SUPABASE_SERVICE_ROLE_KEY not set in environment");
    process.exit(1);
  }
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
  };
}

function requireSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    console.error("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) not set");
    process.exit(1);
  }
  return url.replace(/\/$/, "");
}

async function findUserByEmail(email: string): Promise<string | null> {
  const url = `${requireSupabaseUrl()}/auth/v1/admin/users?email=${encodeURIComponent(email)}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    console.error(`lookup failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const json = (await res.json()) as {
    users?: Array<{ id: string; email?: string }>;
  };
  const match = json.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  return match?.id ?? null;
}

async function deleteUser(userId: string): Promise<void> {
  const url = `${requireSupabaseUrl()}/auth/v1/admin/users/${userId}`;
  const res = await fetch(url, { method: "DELETE", headers: authHeaders() });
  if (!res.ok && res.status !== 404) {
    console.error(`delete failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
}

async function main() {
  const { email } = parseArgs(process.argv);
  const id = await findUserByEmail(email);
  if (!id) {
    console.log(`(no-op) no user found with email ${email}`);
    return;
  }
  await deleteUser(id);
  console.log(`✓ revoked access for ${email} (id=${id})`);
  console.log("");
  console.log("Their session cookie is now invalid; if they had the panel");
  console.log("open in a browser they'll be redirected to /login on the");
  console.log("next request.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
