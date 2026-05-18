// ============================================================================
// Panel user provisioning script — successor to create-panel-admin.ts.
//
// Creates (or updates) a Supabase Auth user with role + sede assignment so
// the panel can scope UI to each office's data. Two roles:
//
//   • role=admin  — full access (Steve, Miguel, dev team). Sees every sede.
//   • role=office — sede-scoped. Sees only conversations / prompts / KB /
//                   simulator for the sede passed via --sede. Can sign
//                   in, change their own password, view their conversations,
//                   take over a chat — but can't see or edit other sedes.
//
// Role + sede are stored in `user_metadata` so the panel can read them from
// the session without a separate users table. Idempotent: re-running with
// the same --email updates password + role + sede.
//
// Usage:
//   pnpm tsx scripts/create-panel-user.ts \
//     --email=colomba@dpmdiving.com \
//     --password='generated-passphrase' \
//     --role=office \
//     --sede='Gili Air'
//
//   pnpm tsx scripts/create-panel-user.ts \
//     --email=steve@dpmdiving.com \
//     --password='generated-passphrase' \
//     --role=admin
//
// Env required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// (Or NEXT_PUBLIC_SUPABASE_URL for the URL.)
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

type Role = "admin" | "office";
type Args = {
  email: string;
  password: string;
  role: Role;
  sede: string | null;
};

// Must match the canonical Branch/DB names in services/sede.ts and the
// post-migration seed. If Miguel renames a sede, update both places.
const VALID_SEDES = [
  "Gili Trawangan",
  "Gili Air",
  "Koh Tao",
  "Koh Phi Phi",
  "Nusa Penida",
] as const;

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = {};
  for (const a of argv.slice(2)) {
    if (a.startsWith("--email=")) args.email = a.slice("--email=".length);
    else if (a.startsWith("--password=")) args.password = a.slice("--password=".length);
    else if (a.startsWith("--role=")) args.role = a.slice("--role=".length) as Role;
    else if (a.startsWith("--sede=")) args.sede = a.slice("--sede=".length);
  }
  if (!args.email || !args.password) {
    console.error("usage: create-panel-user --email=<addr> --password=<pwd> --role=admin|office [--sede='Gili Air']");
    process.exit(1);
  }
  const role: Role = args.role ?? "admin";
  if (role !== "admin" && role !== "office") {
    console.error(`invalid --role=${role}. Must be admin or office.`);
    process.exit(1);
  }
  if (role === "office") {
    if (!args.sede) {
      console.error("--sede is required when --role=office");
      process.exit(1);
    }
    if (!VALID_SEDES.includes(args.sede as (typeof VALID_SEDES)[number])) {
      console.error(`invalid --sede='${args.sede}'. Must be one of: ${VALID_SEDES.join(", ")}`);
      process.exit(1);
    }
  }
  return {
    email: args.email,
    password: args.password,
    role,
    sede: role === "office" ? args.sede! : null,
  };
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

type UserMetadata = { role: Role; sede: string | null };

async function createUser(args: Args): Promise<string> {
  const url = `${requireSupabaseUrl()}/auth/v1/admin/users`;
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      email: args.email,
      password: args.password,
      email_confirm: true,
      user_metadata: { role: args.role, sede: args.sede } satisfies UserMetadata,
    }),
  });
  if (!res.ok) {
    console.error(`create failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const json = (await res.json()) as { id: string };
  return json.id;
}

async function updateUser(userId: string, args: Args): Promise<void> {
  const url = `${requireSupabaseUrl()}/auth/v1/admin/users/${userId}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({
      password: args.password,
      email_confirm: true,
      user_metadata: { role: args.role, sede: args.sede } satisfies UserMetadata,
    }),
  });
  if (!res.ok) {
    console.error(`update failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const existing = await findUserByEmail(args.email);
  if (existing) {
    await updateUser(existing, args);
    console.log(`✓ updated user ${args.email} (id=${existing})`);
  } else {
    const id = await createUser(args);
    console.log(`✓ created user ${args.email} (id=${id})`);
  }
  console.log("");
  console.log("Login at: https://claude-project-panel.vercel.app/login");
  console.log(`Email:    ${args.email}`);
  console.log(`Password: ${args.password}`);
  console.log(`Role:     ${args.role}${args.sede ? ` (sede: ${args.sede})` : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
