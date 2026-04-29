// Supabase OTP callback: exchanges the magic link's `code` for a session
// cookie set on this domain.

import { type NextRequest, NextResponse } from "next/server";

import { getSupabaseServer } from "~/lib/supabase";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  if (code) {
    const sb = await getSupabaseServer();
    await sb.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
