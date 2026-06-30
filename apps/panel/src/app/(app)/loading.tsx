// ============================================================================
// Generic (app) loading skeleton (Steve 2026-06-30).
//
// Used as the fallback while ANY (app) route is fetching server data.
// More specific routes (conversations/[id], etc.) define their own
// loading.tsx that takes priority over this one.
//
// Visual: a stack of card-shaped pulses mirroring the typical dashboard /
// pipeline / roster layout.
// ============================================================================

export default function AppLoading() {
  return (
    <div className="space-y-4">
      {/* Hero card */}
      <div className="h-36 animate-pulse rounded-2xl bg-ink-200/40" />
      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="h-28 animate-pulse rounded-xl bg-ink-200/40" />
        <div className="h-28 animate-pulse rounded-xl bg-ink-200/40" />
        <div className="h-28 animate-pulse rounded-xl bg-ink-200/40" />
        <div className="h-28 animate-pulse rounded-xl bg-ink-200/40" />
      </div>
      {/* Table */}
      <div className="h-64 animate-pulse rounded-2xl bg-ink-200/40" />
    </div>
  );
}
