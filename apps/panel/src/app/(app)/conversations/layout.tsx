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
// The parent (app)/layout.tsx detects /conversations and drops its
// max-w-7xl + px-6/py-6 container so we render edge-to-edge inside
// <main>. Height is pinned to the viewport so the three panes (list,
// chat, info) scroll independently.
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
    // Edge-to-edge inside <main>. The parent (app) layout has already
    // dropped its constrained container for /conversations, so we just
    // take whatever width <main> hands us.
    <div className="flex h-screen overflow-hidden">
      <ConversationSidebar
        conversations={conversations}
        showSede={user.role === "admin"}
      />
      <div className="flex min-w-0 flex-1">{children}</div>
    </div>
  );
}
