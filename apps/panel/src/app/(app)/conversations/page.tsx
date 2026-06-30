// ============================================================================
// Empty state — shown when the sidebar is visible but no conversation
// is selected (Steve 2026-06-30 messenger redesign).
//
// The old table-style list page moved into the sidebar (see _sidebar.tsx).
// This file just renders a friendly "pick something" placeholder so the
// right pane isn't blank.
// ============================================================================

export const dynamic = "force-dynamic";

export default function ConversationsEmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center bg-ink-100/10">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/10">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="h-8 w-8 text-brand-300"
            aria-hidden="true"
          >
            <path
              d="M21 12a8.96 8.96 0 0 1-1.05 4.2L21 21l-4.9-1.05A9 9 0 1 1 21 12Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className="h-section text-ink-700">Seleccioná una conversación</h2>
        <p className="mt-2 text-sm text-ink-500">
          Elegí un hilo en la lista de la izquierda para ver los mensajes,
          herramientas y replay.
        </p>
      </div>
    </div>
  );
}
