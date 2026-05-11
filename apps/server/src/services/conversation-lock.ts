// Per-conversation lock to serialize concurrent inbound message handling.
//
// Why this exists (Miguel test 2026-05-11): the customer sends two messages
// in rapid succession ("OW", then "3" two seconds later as "3 personas").
// Both webhooks fire while the first Claude call is still in flight. The
// second invocation reads `conversation.leadMetadata` BEFORE the first one
// has finished writing the proposed program, so:
//   • First Claude run interprets "OW" + recalls earlier "2 personas" → emits
//     solicitar_deposito with pax=2.
//   • Second Claude run starts on stale history that doesn't yet include "3
//     personas" context, so it interprets the bare "3" as a confirmation of
//     the proposal it can see ("yes, OW with 2 pax") and ALSO emits
//     solicitar_deposito, this time still with pax=2 (the "3" never made it
//     to the lead_metadata reading).
//
// Result: two ref codes minted, two bank-instruction WhatsApp bursts to the
// same customer within seconds, and the second one is wrong pax. Customer
// (Miguel) was confused — "no entiende lo que pregunta".
//
// Fix: a process-local lock keyed by conversation.id. The second inbound
// waits for the first to finish (including all DB writes + Respond.io
// sends) so it reads canonical state. The lock has a generous timeout so a
// stuck Anthropic call doesn't block the whole conversation forever.
//
// This is process-local — fine for the pilot (1 server instance). If we
// ever scale to multiple Railway replicas we will need a row-level lock or
// Postgres advisory lock at conversation_id.

const inFlight = new Map<string, Promise<unknown>>();

// Hard cap so a hung Claude/Respond.io call can't permanently block a
// conversation. 60s comfortably covers the worst observed end-to-end
// latency (PDF OCR + send + transitions ≈ 15-25s).
const LOCK_TIMEOUT_MS = 60_000;

/**
 * Run `fn` exclusively for the given conversation id. If another caller is
 * already holding the lock, this call awaits its completion (or timeout)
 * before starting. Returns whatever `fn` returns. Errors propagate; the
 * lock is always released.
 */
export async function withConversationLock<T>(
  conversationId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const pending = inFlight.get(conversationId);
  if (pending) {
    const timeout = new Promise<void>((resolve) =>
      setTimeout(() => resolve(), LOCK_TIMEOUT_MS),
    );
    await Promise.race([pending.catch(() => undefined), timeout]);
  }

  let resolve!: () => void;
  const slot = new Promise<void>((r) => (resolve = r));
  inFlight.set(conversationId, slot);
  try {
    return await fn();
  } finally {
    resolve();
    if (inFlight.get(conversationId) === slot) {
      inFlight.delete(conversationId);
    }
  }
}
