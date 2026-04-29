"use server";

import { redirect } from "next/navigation";

import { getSupabaseServer } from "~/lib/supabase";

export async function signInWithEmail(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) redirect("/login?error=email_required");

  const sb = await getSupabaseServer();
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_PANEL_URL}/auth/callback` },
  });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/login?sent=1");
}

export async function signOut() {
  const sb = await getSupabaseServer();
  await sb.auth.signOut();
  redirect("/login");
}
