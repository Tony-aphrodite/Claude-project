// ============================================================================
// Message batcher (Steve 2026-06-18 — "AI is firing 3 bubbles for 1 customer").
//
// Problem: WhatsApp customers naturally split one thought across 2-3 quick
// messages ("Because we both want", "theory + 2 dives", "and a license"
// — sent in 3 seconds). Today each incoming webhook fires its own
// Claude call. Even with withConversationLock serializing them, the result
// is N AI replies for N customer messages — feels like spam, breaks the
// "1 human, 1 turn" illusion.
//
// Fix: debounce + coalesce. When a text message arrives, queue it and start
// a timer. If another message for the same contact arrives during the
// window, push it onto the same queue and (re)extend the timer (capped by
// `HARD_CAP_MS` so a customer who never stops typing still gets a reply).
// When the timer expires, fire ONE call with all messages concatenated
// (joined by blank lines) as the customer's latest turn.
//
// What bypasses the batcher (processed immediately):
//   • Attachments (PDF/image) — OCR can't wait. The deposit comprobante
//     path is latency-sensitive.
//   • Sede-selector button clicks — payload.text is exactly a sede name
//     ("Gili Air"). Already short-circuited inside processIncomingMessage,
//     but we also skip the batch here so it isn't appended to a real
//     customer message that lands a few seconds later.
//   • Empty text — defensive; shouldn't happen but if it does, just pass
//     through.
//
// Process-local. Fine for the pilot (Railway numReplicas=1). If we ever
// scale horizontally we'll need a Redis-backed queue or per-conversation
// row lock with a timer table.
// ============================================================================

import type { FastifyBaseLogger } from "fastify";
import type { RespondIoIncomingMessage } from "@dpm/shared";

import { pickFirstAttachment } from "./respond-io-attachment.js";
import { AI_ENABLED_SEDE_NAMES_CONST } from "./sede.js";

// Debounce window: how long we wait after the most recent message
// before firing the batch. 5s is the sweet spot — long enough to catch
// rapid typing pauses, short enough that the customer doesn't feel
// abandoned waiting for a reply.
const DEBOUNCE_MS = 5_000;

// Hard cap on total wait time from the first message in a batch. If a
// customer types nonstop for 15s, we fire whatever we have rather than
// keep extending. Prevents pathological "AI never replies" cases.
const HARD_CAP_MS = 15_000;

// ─── Message-id dedup (Miguel 2026-06-18 feedback) ──────────────────────────
// Respond.io fires multiple webhooks per customer message because we have
// multiple subscriptions active (per-sede webhook + Sync workflow webhooks
// + the shared workspace one). webhook_debug_log confirms 3-6 webhook
// arrivals for a single customer message, sometimes spread over 6+ seconds.
//
// Customer-facing symptom (Miguel): "muchas veces repite el mensaje varias
// veces el mismo — es como si la AI recibiera el webhook varias veces y
// repite el mensaje". The batcher catches duplicates that arrive within
// its 5s window; this dedup layer catches the ones that arrive later by
// matching on `payload.message.messageId` (which is the same across every
// Respond.io duplicate webhook for one underlying message).
//
// Storage: in-memory Map<messageId, timestamp> with LRU eviction at the
// cap. Cap is generous because a duplicate ALWAYS arrives within seconds
// of the original; a one-day pilot session won't come close to filling
// 10k entries.
const SEEN_MSGID_CAP = 10_000;
const SEEN_MSGID_EVICT_PCT = 10;
const seenMessageIds = new Map<string, number>();

/**
 * True if we've already accepted this exact `message.messageId` recently.
 * Caller should drop the webhook silently (it's a duplicate fan-out from
 * Respond.io, not a real new customer message).
 *
 * Idempotent: calling this twice for the same id is fine. The first call
 * records the id; subsequent calls return `true`. Race-safe because Node
 * is single-threaded.
 *
 * No-op (returns false) when the payload has no messageId. Some Respond.io
 * payload shapes legitimately omit it; we don't want to dedupe those by
 * mistake.
 */
export function isDuplicateMessageId(
  payload: RespondIoIncomingMessage,
): boolean {
  const id = payload.message.messageId;
  if (!id) return false;
  if (seenMessageIds.has(id)) return true;

  if (seenMessageIds.size >= SEEN_MSGID_CAP) {
    const evictCount = Math.floor(
      (SEEN_MSGID_CAP * SEEN_MSGID_EVICT_PCT) / 100,
    );
    const sortedByTime = Array.from(seenMessageIds.entries()).sort(
      (a, b) => a[1] - b[1],
    );
    for (let i = 0; i < evictCount && i < sortedByTime.length; i++) {
      const [oldestId] = sortedByTime[i]!;
      seenMessageIds.delete(oldestId);
    }
  }

  seenMessageIds.set(id, Date.now());
  return false;
}

type PendingBatch = {
  payloads: RespondIoIncomingMessage[];
  timer: NodeJS.Timeout;
  firstSeenAt: number;
  log: FastifyBaseLogger;
};

const pendingBatches = new Map<string, PendingBatch>();

/**
 * Caller passes the actual processing function (typically a closure that
 * wraps processIncomingMessage in withConversationLock). The batcher
 * invokes it with a single merged payload when the timer fires.
 */
export type BatchProcessor = (
  merged: RespondIoIncomingMessage,
  log: FastifyBaseLogger,
) => Promise<void>;

/**
 * True if this message should go through the batch (= regular text). False
 * for things that need immediate processing.
 */
export function isBatchEligible(payload: RespondIoIncomingMessage): boolean {
  const text = (payload.message.text ?? "").trim();
  if (text.length === 0) return false;
  if (pickFirstAttachment(payload.message) !== null) return false;
  // Sede-selector button click — the text is exactly a sede name. Skip
  // the batch so this synthetic payload doesn't contaminate a real
  // customer message that may arrive seconds later (the click triggers
  // a separate Respond.io workflow that handles routing).
  if ((AI_ENABLED_SEDE_NAMES_CONST as readonly string[]).includes(text)) {
    return false;
  }
  return true;
}

/**
 * Enqueue a payload. If there's an existing batch for this contact, the
 * new message is appended and the timer is extended (capped by HARD_CAP_MS
 * from the first message). If not, a fresh batch is started.
 *
 * Always returns immediately — the actual `processor` runs later when the
 * timer fires. Errors during processing are caught and logged by the
 * caller's closure (we don't re-throw across the timer boundary).
 */
export function enqueueOrBatch(
  payload: RespondIoIncomingMessage,
  log: FastifyBaseLogger,
  processor: BatchProcessor,
): void {
  const key = String(payload.contact.id);
  const existing = pendingBatches.get(key);

  if (existing) {
    existing.payloads.push(payload);
    clearTimeout(existing.timer);

    const elapsed = Date.now() - existing.firstSeenAt;
    const remaining = Math.max(0, HARD_CAP_MS - elapsed);
    const waitMs = Math.min(DEBOUNCE_MS, remaining);

    log.info(
      {
        contactId: key,
        batchSize: existing.payloads.length,
        elapsedMs: elapsed,
        nextWaitMs: waitMs,
      },
      "message-batcher: appended to existing batch",
    );

    if (waitMs <= 0) {
      // Hard cap hit — fire synchronously on next tick instead of resetting.
      setImmediate(() => fireBatch(key, processor));
    } else {
      existing.timer = setTimeout(() => fireBatch(key, processor), waitMs);
    }
    return;
  }

  // New batch.
  const batch: PendingBatch = {
    payloads: [payload],
    firstSeenAt: Date.now(),
    log,
    timer: setTimeout(() => fireBatch(key, processor), DEBOUNCE_MS),
  };
  pendingBatches.set(key, batch);
  log.info(
    { contactId: key, debounceMs: DEBOUNCE_MS },
    "message-batcher: new batch started",
  );
}

function fireBatch(key: string, processor: BatchProcessor): void {
  const batch = pendingBatches.get(key);
  if (!batch) return;
  pendingBatches.delete(key);

  const merged = mergePayloads(batch.payloads);
  batch.log.info(
    {
      contactId: key,
      mergedFromCount: batch.payloads.length,
      totalWaitMs: Date.now() - batch.firstSeenAt,
    },
    "message-batcher: firing batched message",
  );

  // Fire-and-forget; errors logged by the processor closure.
  void processor(merged, batch.log).catch((err) =>
    batch.log.error(
      { err, contactId: key },
      "message-batcher: processor threw",
    ),
  );
}

/**
 * Combine N payloads into one. Strategy: keep the LATEST payload's metadata
 * (timestamps, ids, contact snapshot) but replace `message.text` with the
 * blank-line-joined concatenation of every payload's text. Empty texts
 * filtered out. Order preserved.
 *
 * Why use the latest payload as base: the customer's last-state Branch /
 * tags / customFields reflect the most current Respond.io view. The first
 * payload's contact info may already be stale by the time the batch fires.
 */
function mergePayloads(
  payloads: RespondIoIncomingMessage[],
): RespondIoIncomingMessage {
  if (payloads.length === 1) return payloads[0]!;

  const latest = payloads[payloads.length - 1]!;
  const allTexts = payloads
    .map((p) => (p.message.text ?? "").trim())
    .filter((t) => t.length > 0);

  return {
    ...latest,
    message: {
      ...latest.message,
      text: allTexts.join("\n\n"),
    },
  };
}

/**
 * Test/admin helper — drain everything pending and process immediately.
 * Not wired anywhere yet but handy if we ever expose a "fire pending
 * batches" admin endpoint or in unit tests.
 */
export function flushAll(processor: BatchProcessor): void {
  const keys = Array.from(pendingBatches.keys());
  for (const key of keys) {
    const batch = pendingBatches.get(key);
    if (batch) clearTimeout(batch.timer);
    fireBatch(key, processor);
  }
}
