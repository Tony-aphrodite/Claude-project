// Gate every route except /login and /auth/* behind Supabase Auth.

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

type CookieEntry = { name: string; value: string; options?: CookieOptions };

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // Supabase magic-link safety net: if a verification code lands on any path
  // other than /auth/callback (e.g. an old email pointing at the project's
  // Site URL root, or a redirect_to that wasn't set), forward it to the
  // callback route so the session can be exchanged. Without this, a stray
  // ?code= just gets stripped on a normal page load.
  const code = searchParams.get("code");
  if (code && !pathname.startsWith("/auth/callback")) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/callback";
    url.searchParams.set("next", pathname === "/" ? "/" : pathname);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/login") || pathname.startsWith("/auth")) {
    return NextResponse.next();
  }

  // Dev escape hatch: lets us boot the panel for UI-only smoke tests without
  // a real Supabase project. Refuses to honor the flag in production so a
  // misconfigured deploy can never expose the panel publicly.
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_AUTH_BYPASS === "1"
  ) {
    return NextResponse.next({ request: { headers: req.headers } });
  }

  const res = NextResponse.next({ request: { headers: req.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (entries: CookieEntry[]) => {
          for (const { name, value, options } of entries) {
            res.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  if (!data?.user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = {
  matcher: [
    // skip _next, static files, and api/auth callback
    "/((?!_next/|favicon.ico|api/auth/).*)",
  ],
};
