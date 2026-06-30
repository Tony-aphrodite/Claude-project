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
// We break out of the (app) layout's max-width container (-mx-6 -my-6)
// because messenger UIs need full-bleed width — the constrained padding
// looks ridiculous when there's a chat pane involved. The height is
// pinned to the viewport so the sidebar list scrolls independently of
// the chat pane.
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
    // Negative margins undo the parent (app)/layout.tsx's px-6/py-6 so
    // we can paint edge-to-edge. The height calc leaves room for the
    // parent's top safe area (none, but reserves padding-equivalent).
    <div className="-mx-6 -my-6 flex h-[calc(100vh)] overflow-hidden">
      <ConversationSidebar
        conversations={conversations}
        showSede={user.role === "admin"}
      />
      <div className="flex min-w-0 flex-1">{children}</div>
    </div>
  );
}
