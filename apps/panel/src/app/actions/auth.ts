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

/**
 * Change the logged-in user's password. Requires the current password as a
 * confirmation step (re-auth) so a stolen session cookie alone can't pivot
 * to ownership of the account.
 */
export async function changePassword(formData: FormData) {
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    redirect("/account?error=fields_required");
  }
  if (newPassword.length < 8) {
    redirect("/account?error=password_too_short");
  }
  if (newPassword !== confirmPassword) {
    redirect("/account?error=passwords_dont_match");
  }
  if (currentPassword === newPassword) {
    redirect("/account?error=same_password");
  }

  const sb = await getSupabaseServer();

  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData?.user?.email) {
    redirect("/login");
  }

  // Re-auth with current password to prove ownership.
  const { error: reauthErr } = await sb.auth.signInWithPassword({
    email: userData.user.email!,
    password: currentPassword,
  });
  if (reauthErr) {
    redirect("/account?error=invalid_current_password");
  }

  const { error: updErr } = await sb.auth.updateUser({ password: newPassword });
  if (updErr) {
    redirect(`/account?error=${encodeURIComponent(updErr.message)}`);
  }

  redirect("/account?success=1");
}
