// (app) route group layout. Wraps every operator page in the sidebar shell.
// Anything that should render full-bleed without the sidebar (login, auth
// callback) lives outside this group at the root of /app.

import { getCurrentUserContext } from "~/lib/auth-context";

import { Sidebar } from "../_components/sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Pass the resolved role + sede down to the (client) sidebar so it can
  // show "you are signed in as colomba@... · Gili Air" with a sign-out
  // button. getCurrentUserContext is request-cached, so calling it again
  // inside individual pages is free.
  const user = await getCurrentUserContext();

  return (
    <div className="flex min-h-screen">
      <Sidebar user={user} />
      <main className="flex-1 min-w-0">
        <div className="mx-auto w-full max-w-7xl px-6 py-6 space-y-6">
          {children}
        </div>
      </main>
    </div>
  );
}
