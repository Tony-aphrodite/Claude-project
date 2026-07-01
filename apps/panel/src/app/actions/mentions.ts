// ============================================================================
// Panel-user directory for @-mention autocomplete (Steve 2026-07-01).
//
// The internal-note composer needs to look up panel users by email to
// build the @-mention picker. The existing `listPanelUsers` action is
// admin-gated (it exposes the credential-management surface); we don't
// want office users to trigger a 404 just for the mention dropdown.
//
// This lighter helper:
//   - Runs behind `requireUserContext` (any signed-in user).
//   - Returns email + role + sede — enough for the picker to render
//     labels; no createdAt / audit info.
//   - Uses the same Supabase Admin API as listPanelUsers because that
//     is the source of truth for panel accounts (no `users` table in
//     Drizzle). SUPABASE_SERVICE_ROLE_KEY is server-only; the fetch
//     never reaches the browser.
// ============================================================================

"use server";

import { requireUserContext } from "~/lib/auth-context";

export type MentionUser = {
  id: string;
  email: string;
  role: "admin" | "office";
  sede: string | null;
};

type SupabaseAdminUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

function supabaseUrl(): string {
  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) not set");
  }
  return url.replace(/\/$/, "");
}

function adminHeaders(): Record<string, string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY not set — mention autocomplete disabled",
    );
  }
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
  };
}

export async function listPanelUsersForMention(): Promise<MentionUser[]> {
  // Any signed-in user can pull this list — it's just for the mention
  // picker. Bail with an empty list if the service key isn't set so
  // the caller can render "no mentions available" gracefully.
  await requireUserContext();
  try {
    const res = await fetch(`${supabaseUrl()}/auth/v1/admin/users?per_page=200`, {
      headers: adminHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { users?: SupabaseAdminUser[] };
    return (data.users ?? [])
      .filter((u): u is SupabaseAdminUser & { email: string } =>
        typeof u.email === "string" && u.email.length > 0,
      )
      .map((u) => {
        const meta = (u.user_metadata ?? {}) as {
          role?: unknown;
          sede?: unknown;
        };
        const role: "admin" | "office" =
          meta.role === "office" ? "office" : "admin";
        const sede = typeof meta.sede === "string" ? meta.sede : null;
        return { id: u.id, email: u.email, role, sede };
      })
      .sort((a, b) => a.email.localeCompare(b.email));
  } catch {
    return [];
  }
}
