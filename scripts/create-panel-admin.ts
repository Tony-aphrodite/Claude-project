// ============================================================================
// One-off provisioning script: create the panel admin user in Supabase Auth.
// Uses the service-role key to call /auth/v1/admin/users with email_confirm
// = true so the user can log in immediately without an email round-trip.
//
// Idempotent: if the user already exists with the same email, we update the
// password instead of failing. Safe to re-run.
//
// Usage:
//   pnpm tsx scripts/create-panel-admin.ts \
//     --email=admin@dpmdiving.com \
//     --password='NrefbasUEMSE3fN1A4Bm'
//
// Env required:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// ============================================================================

// Tiny standalone .env loader — avoids pulling in `dotenv` as a workspace
// dependency just for one provisioning script. Reads .env from the current
// working directory if present, parses KEY=VALUE lines (ignoring comments),
// and assigns to process.env without overriding anything already set.
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

type Args = { email: string; password: string };

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = {};
  for (const a of argv.slice(2)) {
    if (a.startsWith("--email=")) args.email = a.slice("--email=".length);
    else if (a.startsWith("--password=")) args.password = a.slice("--password=".length);
  }
  if (!args.email || !args.password) {
    console.error("usage: create-panel-admin --email=<addr> --password=<pwd>");
    process.exit(1);
  }
  return { email: args.email, password: args.password };
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
  const json = (await res.json()) as { users?: Array<{ id: string; email?: string }> };
  const match = json.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  return match?.id ?? null;
}

async function createUser(email: string, password: string): Promise<string> {
  const url = `${requireSupabaseUrl()}/auth/v1/admin/users`;
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: "panel_admin" },
    }),
  });
  if (!res.ok) {
    console.error(`create failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const json = (await res.json()) as { id: string };
  return json.id;
}

async function updatePassword(userId: string, password: string): Promise<void> {
  const url = `${requireSupabaseUrl()}/auth/v1/admin/users/${userId}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ password, email_confirm: true }),
  });
  if (!res.ok) {
    console.error(`update failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
}

async function main() {
  const { email, password } = parseArgs(process.argv);
  const existing = await findUserByEmail(email);
  if (existing) {
    await updatePassword(existing, password);
    console.log(`✓ updated password for existing user ${email} (id=${existing})`);
  } else {
    const id = await createUser(email, password);
    console.log(`✓ created new admin user ${email} (id=${id})`);
  }
  console.log("");
  console.log("Login at: https://claude-project-panel.vercel.app/login");
  console.log(`Email:    ${email}`);
  console.log(`Password: ${password}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
