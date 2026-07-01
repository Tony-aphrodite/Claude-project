// ============================================================================
// Conversations route layout — messenger-style 3-pane shell
// (Steve 2026-06-30 redesign).
//
// Renders the left sidebar (conversation list) once, then yields the
// remaining viewport to the active route's content:
//
//   /conversations      → <empty state> (page.tsx)
//   /conversations/[id] → chat pane + right info panel ([id]/page.tsx)
//
// FULL-BLEED ESCAPE: the parent (app)/layout.tsx wraps everything in
// `mx-auto max-w-7xl px-6 py-6`, which leaves visible side gutters on
// wide monitors. Messengers need to fill the entire available area, so
// we use `position: fixed` to escape the parent's box completely. The
// `left-60` matches the app sidebar's w-60 (240px) so we paint over
// exactly the area between the app sidebar and the right viewport edge.
//
// This approach affects ONLY /conversations — every other route renders
// with its original `max-w-7xl` chrome untouched.
// ============================================================================

import { requireUserContext } from "~/lib/auth-context";
import { listSidebarConversations } from "~/lib/conversation-sidebar-queries";

import { ConversationSidebar } from "./_sidebar";

export const dynamic = "force-dynamic";

export default async function ConversationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUserContext();
  // Office users see only their own sede; admins see everything. Sede
  // filter happens at SQL level, NOT after fetching, so the cap below
  // is "200 per sede" for office and "200 total" for admins. If that
  // proves too small we paginate, but at 200 conversations the sidebar
  // is already very long.
  const conversations = await listSidebarConversations({
    userId: user.userId,
    sedeId: user.role === "office" ? user.sedeId ?? null : null,
    limit: 200,
  });

  return (
    // Fixed positioning escapes the parent's max-w-7xl container so we
    // paint edge-to-edge. left-60 matches the app sidebar width (w-60 =
    // 15rem = 240px). On mobile the app sidebar is hidden (md:flex), so
    // below the md breakpoint we set left-0 to fill the whole viewport.
    <div className="fixed inset-y-0 left-0 right-0 z-10 flex overflow-hidden md:left-60">
      <ConversationSidebar
        conversations={conversations}
        // Miguel 2026-07-01 #7 — cross-sede oficina (role=office +
        // sedeId=null) needs the sede column too so they know which
        // center each conversation belongs to. Only single-sede
        // office users hide it (they only see one sede anyway).
        showSede={user.role === "admin" || user.sedeId === null}
      />
      <div className="flex min-w-0 flex-1">{children}</div>
    </div>
  );
}
