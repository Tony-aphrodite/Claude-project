// ============================================================================
// First-message cache (Miguel 2026-06-22 — English customers still getting
// Spanish welcome despite the 2026-06-20 fix).
//
// Root cause: the auto-welcome in contact-state-event runs BEFORE any
// conversation exists in our DB for new contacts (the first inbound is
// rejected with branch_empty before we persist). So the language-detection
// path that reads `mensajes` came back empty and we fell through to
// contact.language — which Respond.io leaves as a default ("Spanish") for
// freshly created contacts. Result: an English customer typing "Good day!"
// got "¡Hola! Soy Colomba…".
//
// Fix: stash the first-message text in this tiny in-memory cache on the
// branch_empty rejection path. The welcome step reads it back, runs
// quickGuessFirstMessageLanguage, and picks the right welcome variant.
//
// The cache is intentionally simple — branch_empty → assignee.changed
// happens within seconds in production, so we just need transient memory.
// Restarts lose the cache; the next welcome falls back to contact.language
// (= the pre-fix behavior), which is no worse than today.
// ============================================================================

const FIRST_MESSAGE_TTL_MS = 10 * 60 * 1000;  // 10 minutes
const FIRST_MESSAGE_MAX_ENTRIES = 1000;

type CacheEntry = {
  text: string;
  ts: number;
};

const cache = new Map<string, CacheEntry>();

export function stashFirstMessage(contactId: string, text: string): void {
  if (!contactId || !text) return;
  cache.set(contactId, { text, ts: Date.now() });
  if (cache.size > FIRST_MESSAGE_MAX_ENTRIES) {
    // FIFO eviction — drop the oldest 10% of entries.
    const evictCount = Math.ceil(FIRST_MESSAGE_MAX_ENTRIES * 0.1);
    let evicted = 0;
    for (const key of cache.keys()) {
      cache.delete(key);
      if (++evicted >= evictCount) break;
    }
  }
}

export function peekFirstMessage(contactId: string): string | null {
  const entry = cache.get(contactId);
  if (!entry) return null;
  if (Date.now() - entry.ts > FIRST_MESSAGE_TTL_MS) {
    cache.delete(contactId);
    return null;
  }
  return entry.text;
}

export function clearFirstMessage(contactId: string): void {
  cache.delete(contactId);
}
