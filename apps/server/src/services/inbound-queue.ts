// ============================================================================
// Inbound queue — Miguel 2026-06-12 resilience layer #1.
//
// Every webhook payload that survives signature verification + JSON
// parsing lands in `inbound_messages_queue` BEFORE the dedup check,
// the message batcher, or process-message. The row stays even when
// downstream code crashes; an operator can retry it from
// /admin/inbound-queue.
//
// Three lifecycle calls a webhook handler needs:
//
//   enqueue(payload)       → INSERT (idempotent on respond_io_message_id)
//                            returns the queue row id, or "duplicate" if
//                            the message was already enqueued (fan-out).
//   markProcessing(id)     → status='received' → 'processing'
//   markProcessed(id)      → status='processing' → 'processed'
//   markFailed(id, reason) → status → 'failed' + reason
//
// Plus admin paths:
//
//   listFailed(opts)       → operator's failed-queue table
//   retry(id, handler)     → re-feed the payload through `handler`
//
// Idempotency:
//   `respond_io_message_id` has a unique index. INSERT uses ON CONFLICT
//   DO NOTHING; if the second INSERT loses, we read the existing row
//   to return its id. This means the webhook fan-out + the queue layer
//   absorb duplicates without the caller needing extra logic.
// ============================================================================

import { and, desc, eq, sql } from "drizzle-orm";

import { getDb, inboundMessagesQueue } from "@dpm/db";

import { getLogger } from "../logger.js";

export type EnqueueInput = {
  /** Full normalised webhook body, JSON-serialisable. */
  payload: Record<string, unknown>;
  /** Respond.io message id (natural dedup key); pass undefined when absent. */
  respondIoMessageId?: string | null;
  respondIoContactId?: string | null;
};

export type EnqueueResult =
  | { ok: true; id: string; duplicate: false }
  | { ok: true; id: string; duplicate: true }
  | { ok: false; error: string };

/**
 * INSERT the payload at status='received'. Returns the queue row id.
 *
 * Idempotent: if a row with this `respondIoMessageId` already exists
 * (Respond.io fan-out), we return the existing id and `duplicate:true`
 * so the caller can skip downstream processing.
 *
 * Never throws — returns `{ok:false}` on DB error. The caller's webhook
 * MUST still reply 200 to Respond.io (otherwise Respond.io retries and
 * floods us); the queue row is the secondary safety net, not the primary.
 */
export async function enqueue(input: EnqueueInput): Promise<EnqueueResult> {
  const log = getLogger();
  const db = getDb();
  try {
    const [inserted] = await db
      .insert(inboundMessagesQueue)
      .values({
        respondIoMessageId: input.respondIoMessageId ?? null,
        respondIoContactId: input.respondIoContactId ?? null,
        payload: input.payload,
        status: "received",
      })
      .onConflictDoNothing({
        target: inboundMessagesQueue.respondIoMessageId,
      })
      .returning({ id: inboundMessagesQueue.id });

    if (inserted) {
      return { ok: true, id: inserted.id, duplicate: false };
    }

    // ON CONFLICT skipped the INSERT → there's an existing row. Fetch it.
    if (input.respondIoMessageId) {
      const [existing] = await db
        .select({ id: inboundMessagesQueue.id })
        .from(inboundMessagesQueue)
        .where(eq(inboundMessagesQueue.respondIoMessageId, input.respondIoMessageId))
        .limit(1);
      if (existing) {
        return { ok: true, id: existing.id, duplicate: true };
      }
    }
    // We hit conflict but couldn't find the existing row — shouldn't
    // happen under the unique index, but treat defensively.
    return {
      ok: false,
      error: "conflict but existing row not found (should be impossible)",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message }, "inbound-queue: enqueue failed");
    return { ok: false, error: message };
  }
}

/**
 * Move the row to status='processing' + stamp last_attempt_at. Called
 * before the downstream handler runs.
 */
export async function markProcessing(id: string): Promise<void> {
  const db = getDb();
  await db
    .update(inboundMessagesQueue)
    .set({ status: "processing", lastAttemptAt: new Date() })
    .where(eq(inboundMessagesQueue.id, id));
}

/**
 * Mark the row as completed. Fire-and-forget — the message has already
 * been processed at this point; a failure to UPDATE just means the
 * row stays at 'processing' (operator will see it as stale and can retry,
 * which is harmless because process-message is idempotent).
 */
export async function markProcessed(id: string): Promise<void> {
  const log = getLogger();
  const db = getDb();
  try {
    await db
      .update(inboundMessagesQueue)
      .set({ status: "processed", processedAt: new Date() })
      .where(eq(inboundMessagesQueue.id, id));
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err), id },
      "inbound-queue: markProcessed failed (non-blocking)",
    );
  }
}

/**
 * Mark the row as failed with a short error reason.
 * Bumps retry_count so the operator can see how many attempts have
 * been made before they decide to abandon.
 */
export async function markFailed(id: string, reason: string): Promise<void> {
  const log = getLogger();
  const db = getDb();
  try {
    await db
      .update(inboundMessagesQueue)
      .set({
        status: "failed",
        failReason: reason.slice(0, 1000),
        retryCount: sql`${inboundMessagesQueue.retryCount} + 1`,
      })
      .where(eq(inboundMessagesQueue.id, id));
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err), id },
      "inbound-queue: markFailed failed (non-blocking)",
    );
  }
}

/**
 * List failed rows ordered by recency. Used by /admin/inbound-queue
 * for the operator's "what's broken?" table.
 */
export async function listFailed(opts: {
  limit?: number;
}): Promise<
  Array<{
    id: string;
    respondIoContactId: string | null;
    payload: Record<string, unknown>;
    failReason: string | null;
    retryCount: number;
    receivedAt: Date;
    lastAttemptAt: Date | null;
  }>
> {
  const db = getDb();
  const rows = await db
    .select()
    .from(inboundMessagesQueue)
    .where(eq(inboundMessagesQueue.status, "failed"))
    .orderBy(desc(inboundMessagesQueue.receivedAt))
    .limit(opts.limit ?? 50);
  return rows.map((r) => ({
    id: r.id,
    respondIoContactId: r.respondIoContactId,
    payload: r.payload as Record<string, unknown>,
    failReason: r.failReason,
    retryCount: r.retryCount,
    receivedAt: r.receivedAt,
    lastAttemptAt: r.lastAttemptAt,
  }));
}

/**
 * Re-feed a failed row through a caller-provided handler. The handler
 * receives the original payload + the queue row id; it's responsible
 * for calling `markProcessed` or `markFailed`. Returns the result of
 * the handler so the caller can surface it to the panel.
 */
export async function retry(
  id: string,
  handler: (payload: Record<string, unknown>, queueId: string) => Promise<void>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(inboundMessagesQueue)
    .where(
      and(
        eq(inboundMessagesQueue.id, id),
        eq(inboundMessagesQueue.status, "failed"),
      ),
    )
    .limit(1);
  if (!row) {
    return { ok: false, error: "row not found or not in 'failed' state" };
  }
  await markProcessing(id);
  try {
    await handler(row.payload as Record<string, unknown>, id);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(id, message);
    return { ok: false, error: message };
  }
}
