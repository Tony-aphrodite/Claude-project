"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSupabaseServer } from "~/lib/supabase";

/**
 * Build the absolute callback URL Supabase should embed in the magic-link
 * email. We try, in order:
 *   1. NEXT_PUBLIC_PANEL_URL (explicit override, useful for local dev)
 *   2. Forwarded-host headers from the deployment platform (Vercel, Railway)
 *   3. Plain Host header
 * Falls back to "/auth/callback" relative — Supabase will then resolve it
 * against the project Site URL configured in the dashboard.
 */
async function resolveCallbackUrl(): Promise<string> {
  const envUrl = process.env.NEXT_PUBLIC_PANEL_URL;
  if (envUrl) return `${envUrl.replace(/\/$/, "")}/auth/callback`;

  const h = await headers();
  const forwardedHost = h.get("x-forwarded-host");
  const forwardedProto = h.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}/auth/callback`;
  }

  const host = h.get("host");
  if (host) {
    const proto = host.startsWith("localhost") ? "http" : "https";
    return `${proto}://${host}/auth/callback`;
  }

  // Last-ditch: relative path. Supabase resolves against Site URL.
  return "/auth/callback";
}

export async function signInWithEmail(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) redirect("/login?error=email_required");

  const callbackUrl = await resolveCallbackUrl();

  const sb = await getSupabaseServer();
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callbackUrl },
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
