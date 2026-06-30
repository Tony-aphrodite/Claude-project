// (app) route group layout. Wraps every operator page in the sidebar shell.
// Anything that should render full-bleed without the sidebar (login, auth
// callback) lives outside this group at the root of /app.
//
// Per-route chrome: routes that need full-bleed canvas (messenger-style
// /conversations, future ones) opt out of the max-w-7xl container by
// matching a path prefix in FULL_BLEED_PREFIXES below. The pathname is
// read from the `x-pathname` request header set in middleware.ts.

import { headers } from "next/headers";

import { getCurrentUserContext } from "~/lib/auth-context";

import { Sidebar } from "../_components/sidebar";

/** Path prefixes whose pages render edge-to-edge inside <main>. */
const FULL_BLEED_PREFIXES = ["/conversations"];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Pass the resolved role + sede down to the (client) sidebar so it can
  // show "you are signed in as colomba@... · Gili Air" with a sign-out
  // button. getCurrentUserContext is request-cached, so calling it again
  // inside individual pages is free.
  const [user, h] = await Promise.all([getCurrentUserContext(), headers()]);
  const pathname = h.get("x-pathname") ?? "";
  const fullBleed = FULL_BLEED_PREFIXES.some((p) => pathname.startsWith(p));

  return (
    <div className="flex min-h-screen">
      <Sidebar user={user} />
      <main className="flex-1 min-w-0">
        {fullBleed ? (
          children
        ) : (
          <div className="mx-auto w-full max-w-7xl px-6 py-6 space-y-6">
            {children}
          </div>
        )}
      </main>
    </div>
  );
}
