"use server";

// Admin-only user-management server actions.
//
// Wired to the same Supabase Auth admin endpoints as
// scripts/create-panel-user.ts and scripts/delete-panel-user.ts. The CLI
// is for Tony; this surface is so Miguel can grant/revoke from the panel
// without bothering Tony every time someone joins or leaves an office.
//
// Every action runs requireAdmin() before touching the admin API so an
// office user who pokes the action URL directly (server actions are
// addressable HTTP endpoints under the hood) gets bounced. The check
// re-reads role from Supabase user_metadata each call — never trusts a
// client-supplied flag.
//
// Why we don't use a per-user Supabase API key: the admin endpoints
// require the service-role key, which only lives server-side. Putting it
// behind a role-gated server action keeps the key off the wire entirely.

import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import { requireUserContext } from "~/lib/auth-context";

type SupabaseAdminUser = {
  id: string;
  email?: string;
  created_at?: string;
  user_metadata?: Record<string, unknown>;
};

export type PanelUserRow = {
  id: string;
  email: string;
  role: "admin" | "office";
  sede: string | null;
  createdAt: string;
};

const VALID_SEDES = [
  "Gili Trawangan",
  "Gili Air",
  "Koh Tao",
  "Koh Phi Phi",
  "Nusa Penida",
] as const;

type ValidSede = (typeof VALID_SEDES)[number];

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
      "SUPABASE_SERVICE_ROLE_KEY not set — admin user-management is disabled",
    );
  }
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
  };
}

/**
 * Throws (via redirect) if the caller isn't an admin. Use as the first
 * line of every privileged action.
 */
async function requireAdmin(): Promise<void> {
  const user = await requireUserContext();
  if (user.role !== "admin") {
    // 404, not 403 — don't leak whether the route exists.
    const { notFound } = await import("next/navigation");
    notFound();
  }
}

function normalizeUser(u: SupabaseAdminUser): PanelUserRow {
  const meta = (u.user_metadata ?? {}) as { role?: unknown; sede?: unknown };
  const role: "admin" | "office" = meta.role === "office" ? "office" : "admin";
  const sede = typeof meta.sede === "string" ? meta.sede : null;
  return {
    id: u.id,
    email: u.email ?? "",
    role,
    sede,
    createdAt: u.created_at ?? "",
  };
}

export async function listPanelUsers(): Promise<PanelUserRow[]> {
  await requireAdmin();
  const res = await fetch(`${supabaseUrl()}/auth/v1/admin/users?per_page=200`, {
    headers: adminHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `Supabase admin list failed: ${res.status} ${await res.text()}`,
    );
  }
  const json = (await res.json()) as { users?: SupabaseAdminUser[] };
  return (json.users ?? [])
    .map(normalizeUser)
    .sort((a, b) => a.email.localeCompare(b.email));
}

/**
 * Provision a new panel user. Generates a strong random password server
 * side and stashes it in a short-lived httpOnly cookie that the
 * /admin/users page reads (once) to display the credentials to the
 * admin. Putting the password in a URL search param would write it to
 * browser history / proxy logs — the cookie avoids that.
 */
export async function createPanelUserAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "").trim() as
    | "admin"
    | "office";
  const sedeRaw = String(formData.get("sede") ?? "").trim();

  if (!email || !/^.+@.+\..+$/.test(email)) {
    redirect("/admin/users?error=invalid_email");
  }
  if (role !== "admin" && role !== "office") {
    redirect("/admin/users?error=invalid_role");
  }
  // Miguel 2026-07-01 #7 — "todas" is a magic sede value that promotes
  // an office user to cross-sede access (24/7 remote team). Stored
  // verbatim in user_metadata.sede; auth-context.getCurrentUserContext
  // reads it and returns `sedeId=null` while keeping `role="office"`.
  let sede: ValidSede | "todas" | null = null;
  if (role === "office") {
    if (!sedeRaw) {
      redirect("/admin/users?error=invalid_sede");
    }
    if (sedeRaw === "todas") {
      sede = "todas";
    } else if (VALID_SEDES.includes(sedeRaw as ValidSede)) {
      sede = sedeRaw as ValidSede;
    } else {
      redirect("/admin/users?error=invalid_sede");
    }
  }

  // 24 bytes → 32 chars base64 → comfortable strength + readable to copy
  // out of the success panel. Same shape as openssl rand -base64 24.
  const password = randomBytes(24).toString("base64");

  // Idempotent: if email already exists, update password/role/sede
  // (matches CLI behavior). Otherwise create.
  const lookupRes = await fetch(
    `${supabaseUrl()}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
    { headers: adminHeaders(), cache: "no-store" },
  );
  const lookupJson = (await lookupRes.json()) as {
    users?: SupabaseAdminUser[];
  };
  const existing = lookupJson.users?.find(
    (u) => u.email?.toLowerCase() === email,
  );

  const body = JSON.stringify({
    email,
    password,
    email_confirm: true,
    user_metadata: { role, sede },
  });

  let userId: string;
  if (existing) {
    const updateRes = await fetch(
      `${supabaseUrl()}/auth/v1/admin/users/${existing.id}`,
      { method: "PUT", headers: adminHeaders(), body },
    );
    if (!updateRes.ok) {
      redirect(`/admin/users?error=update_failed`);
    }
    userId = existing.id;
  } else {
    const createRes = await fetch(`${supabaseUrl()}/auth/v1/admin/users`, {
      method: "POST",
      headers: adminHeaders(),
      body,
    });
    if (!createRes.ok) {
      const text = await createRes.text();
      const reason = encodeURIComponent(text.slice(0, 100));
      redirect(`/admin/users?error=create_failed&detail=${reason}`);
    }
    const created = (await createRes.json()) as { id: string };
    userId = created.id;
  }

  // Stash the password + email in a short-lived httpOnly cookie so the
  // landing render can show it. 30s lifetime: long enough for the admin
  // to read + copy, short enough that a refresh after copying clears it.
  // We never store plaintext anywhere — Supabase only keeps a bcrypt hash.
  //
  // Note: we deliberately do NOT delete the cookie from the page's render
  // path. In Next.js 15 cookie mutations are only allowed inside a Server
  // Action invoked from a form (or a Route Handler) — calling `.delete()`
  // during a Server Component render throws and the page renders an
  // application-error digest. The 30s expiry is the cleanup mechanism.
  const c = await cookies();
  c.set(
    "panel-user-new",
    JSON.stringify({ email, password, role, sede, userId }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/admin/users",
      maxAge: 30,
    },
  );

  redirect("/admin/users?created=1");
}

export async function deletePanelUserAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) {
    redirect("/admin/users?error=missing_id");
  }

  // Don't allow an admin to delete THEIR OWN account by mistake — they'd
  // sign themselves out and lose the ability to manage others. The CLI
  // doesn't have this guard (Tony can always recover via service-role
  // key from the terminal) but the UI should be safe-by-default.
  const me = await requireUserContext();
  if (me.userId === userId) {
    redirect("/admin/users?error=cannot_delete_self");
  }

  const res = await fetch(`${supabaseUrl()}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  if (!res.ok && res.status !== 404) {
    redirect("/admin/users?error=delete_failed");
  }
  redirect("/admin/users?deleted=1");
}

/**
 * Read the one-time new-user cookie. Called by the page server component
 * on render to display the just-created credentials.
 *
 * In Next.js 15, cookie *writes* are only legal inside Server Actions
 * invoked from a form / Route Handlers. Calling `.delete()` from a Server
 * Component render throws — which is exactly what was producing the
 * "Application error" digest after creating a user. So this function only
 * READS; the cookie cleans itself up via the short maxAge set at write
 * time (30s — long enough to copy, short enough that a refresh clears it).
 */
export async function consumeNewUserFlash(): Promise<{
  email: string;
  password: string;
  role: "admin" | "office";
  sede: string | null;
  userId: string;
} | null> {
  const c = await cookies();
  const raw = c.get("panel-user-new")?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as {
      email: string;
      password: string;
      role: "admin" | "office";
      sede: string | null;
      userId: string;
    };
  } catch {
    return null;
  }
}
