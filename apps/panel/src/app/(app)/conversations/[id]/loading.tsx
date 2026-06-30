// ============================================================================
// Conversation detail loading skeleton (Steve 2026-06-30).
//
// Renders instantly when the user clicks a conversation in the sidebar.
// Mimics the real layout's three-region structure (chat header, message
// scroll area, composer) so the visual difference between "loading" and
// "loaded" is minimal — no layout jumps.
// ============================================================================

export default function ConversationDetailLoading() {
  return (
    <div className="flex min-w-0 flex-1">
      {/* Center chat pane skeleton */}
      <section className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center justify-between gap-4 border-b border-ink-300/40 bg-ink-100/30 px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-ink-200/60" />
            <div className="flex flex-col gap-1.5">
              <div className="h-4 w-40 animate-pulse rounded bg-ink-200/60" />
              <div className="h-3 w-56 animate-pulse rounded bg-ink-200/40" />
            </div>
          </div>
        </header>

        {/* Messages area */}
        <div className="min-h-0 flex-1 overflow-hidden bg-ink-100/10 px-5 py-4">
          <div className="space-y-3">
            {/* Incoming bubble */}
            <div className="flex items-end gap-2">
              <div className="mb-1 h-7 w-7 shrink-0 animate-pulse rounded-full bg-ink-200/60" />
              <div className="h-14 w-64 animate-pulse rounded-2xl bg-ink-200/60" />
            </div>
            {/* Outgoing bubble */}
            <div className="flex justify-end">
              <div className="h-20 w-80 animate-pulse rounded-2xl bg-brand-500/30" />
            </div>
            {/* Incoming */}
            <div className="flex items-end gap-2">
              <div className="mb-1 h-7 w-7 shrink-0 animate-pulse rounded-full bg-ink-200/60" />
              <div className="h-12 w-72 animate-pulse rounded-2xl bg-ink-200/60" />
            </div>
            {/* Outgoing */}
            <div className="flex justify-end">
              <div className="h-16 w-96 animate-pulse rounded-2xl bg-brand-500/30" />
            </div>
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-ink-300/40 bg-ink-100/30 px-5 py-3">
          <div className="h-20 w-full animate-pulse rounded-lg bg-ink-200/40" />
        </div>
      </section>

      {/* Right panel skeleton */}
      <aside className="flex h-full w-[340px] flex-col border-l border-ink-200/70 bg-abyss-rail">
        <div className="flex border-b border-ink-200/70">
          <div className="flex-1 px-3 py-2.5">
            <div className="mx-auto h-4 w-16 animate-pulse rounded bg-ink-200/40" />
          </div>
          <div className="flex-1 px-3 py-2.5">
            <div className="mx-auto h-4 w-20 animate-pulse rounded bg-ink-200/40" />
          </div>
          <div className="flex-1 px-3 py-2.5">
            <div className="mx-auto h-4 w-14 animate-pulse rounded bg-ink-200/40" />
          </div>
        </div>
        <div className="flex flex-col gap-4 p-4">
          <div className="h-32 animate-pulse rounded-xl bg-ink-200/40" />
          <div className="h-24 animate-pulse rounded-xl bg-ink-200/40" />
          <div className="h-20 animate-pulse rounded-xl bg-ink-200/40" />
        </div>
      </aside>
    </div>
  );
}
