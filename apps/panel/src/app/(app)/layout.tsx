// (app) route group layout. Wraps every operator page in the sidebar shell.
// Anything that should render full-bleed without the sidebar (login, auth
// callback) lives outside this group at the root of /app.

import { Sidebar } from "../_components/sidebar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <div className="mx-auto w-full max-w-7xl px-6 py-6 space-y-6">
          {children}
        </div>
      </main>
    </div>
  );
}
