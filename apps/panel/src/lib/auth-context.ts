// User-context helper.
//
// Reads the role + sede assignment stamped onto the user by
// scripts/create-panel-user.ts (Supabase user_metadata) and resolves the
// sede *name* to a sedeId from the live DB so page queries can filter
// directly. Cached per request via React's cache() so multiple pages on
// one render share one DB roundtrip.
//
// Two roles exist:
//   • admin  — no sede scoping (sedeId === null). Sees everything.
//   • office — sede-scoped (sedeId === <uuid>). The DPM front-desk role.

import { cache } from "react";

import { getDb, sedes } from "@dpm/db";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { getSupabaseServer } from "./supabase";

export type UserRole = "admin" | "office";

export type UserContext = {
  userId: string;
  email: string;
  role: UserRole;
  // Null for admins. For office users, the sede they're scoped to.
  sedeId: string | null;
  sedeName: string | null;
};

type RawMetadata = { role?: unknown; sede?: unknown };

/**
 * Returns the current user's context or `null` if not signed in. Callers
 * that require a signed-in user should call `requireUserContext()` instead.
 */
export const getCurrentUserContext = cache(async (): Promise<UserContext | null> => {
  const sb = await getSupabaseServer();
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) return null;

  const meta = (data.user.user_metadata ?? {}) as RawMetadata;

  // Default to admin if metadata is missing — protects legacy users
  // created by the old create-panel-admin.ts which set
  // role="panel_admin" (a string we now normalize away). Anything that
  // isn't "office" maps to admin.
  const role: UserRole = meta.role === "office" ? "office" : "admin";
  const sedeName = typeof meta.sede === "string" ? meta.sede : null;

  if (role === "admin" || !sedeName) {
    return {
      userId: data.user.id,
      email: data.user.email ?? "",
      role: "admin",
      sedeId: null,
      sedeName: null,
    };
  }

  // Resolve sedeId from name. If the sede has been renamed / deleted
  // we still let the user sign in but with no scope — they'll see
  // empty pages. Fail-open here vs. blocking sign-in: Miguel would
  // rather have someone log in and see a confused empty state than
  // get a 500 because we couldn't reach the DB.
  const db = getDb();
  const [row] = await db
    .select({ id: sedes.id, nombre: sedes.nombre })
    .from(sedes)
    .where(eq(sedes.nombre, sedeName))
    .limit(1);

  return {
    userId: data.user.id,
    email: data.user.email ?? "",
    role: "office",
    sedeId: row?.id ?? null,
    sedeName: row?.nombre ?? sedeName,
  };
});

/**
 * Sentinel UUID for "no sede assigned." Used when an office user's
 * metadata.sede did not resolve to a real `sedes` row — we still need a
 * syntactically-valid UUID for the WHERE clauses on `sede_id` columns
 * (Postgres rejects free-form strings like "__no_sede__" with a UUID
 * cast error). This value cannot match any real row because it's the
 * RFC 4122 nil UUID; the query simply returns zero rows, which is the
 * intended "show nothing until ops fixes the assignment" behavior.
 */
export const NIL_SEDE_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Same as getCurrentUserContext() but redirects to /login if the user
 * isn't signed in. Use this in page components instead of letting the
 * middleware handle redirects when you need a typed context object.
 */
export async function requireUserContext(): Promise<UserContext> {
  const ctx = await getCurrentUserContext();
  if (!ctx) {
    // Mirror what middleware does for unauthenticated requests. `redirect`
    // is typed as `never` so TS narrows `ctx` to non-null after this block.
    redirect("/login");
  }
  return ctx;
}

/**
 * Gate a route to admin only. Office users get a 404 (we 404 rather than
 * 403 so the URL leaks no information about the existence of the route).
 * Use as the first await in page components that office users must never
 * see — prompts/KB/regression/simulator/admin surfaces.
 */
export async function requireAdminContext(): Promise<UserContext> {
  const ctx = await requireUserContext();
  if (ctx.role !== "admin") {
    const { notFound } = await import("next/navigation");
    notFound();
  }
  return ctx;
}

/**
 * Gate a write action to either:
 *   - admin (no scope check — admins can mutate any sede), OR
 *   - office user whose assigned sede matches `targetSedeId`.
 *
 * Office users cannot mutate other sedes. Anything outside that bound
 * throws — the caller (a Server Action) will surface it as a server
 * error rather than 404 because Server Actions can't redirect to a 404
 * page mid-form-submit cleanly.
 *
 * Miguel 2026-06-26 feedback: sede office accounts (phiphi@/nusapenida@/
 * giliair@) couldn't change the roster of THEIR OWN sede because every
 * write action was gated behind requireAdminContext(). They had to use
 * Miguel's admin login, which was unsafe. This helper lifts the gate
 * to "admin OR matching-sede office" so each sede can manage its own
 * roster without touching the others.
 */
export async function requireSedeWriteAccess(
  targetSedeId: string | null | undefined,
): Promise<UserContext> {
  const ctx = await requireUserContext();
  if (ctx.role === "admin") return ctx;
  if (!targetSedeId) {
    throw new Error("forbidden: target sede required for office user");
  }
  if (ctx.sedeId !== targetSedeId) {
    throw new Error(
      `forbidden: office user (sede ${ctx.sedeName ?? "?"}) cannot write to a different sede`,
    );
  }
  return ctx;
}
