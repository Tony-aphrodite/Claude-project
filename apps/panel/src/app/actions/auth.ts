"use server";

import { redirect } from "next/navigation";

import { getSupabaseServer } from "~/lib/supabase";

/**
 * Email + password login via Supabase Auth. The admin user is provisioned
 * out-of-band (see scripts/create-panel-admin.ts) so signups are not exposed
 * from the panel itself.
 */
export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    redirect("/login?error=credentials_required");
  }

  const sb = await getSupabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/");
}

export async function signOut() {
  const sb = await getSupabaseServer();
  await sb.auth.signOut();
  redirect("/login");
}
