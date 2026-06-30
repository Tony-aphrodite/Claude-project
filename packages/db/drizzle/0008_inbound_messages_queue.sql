-- Resilience layer #1 (Miguel 2026-06-12): every webhook payload lands
-- in this queue BEFORE downstream processing. Survives a server crash
-- mid-handler — the row stays at status='received' and an operator
-- can retry it from /admin/inbound-queue.

CREATE TABLE IF NOT EXISTS "inbound_messages_queue" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "respond_io_message_id" text,
  "respond_io_contact_id" text,
  "payload" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'received',
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone,
  "fail_reason" text,
  "retry_count" integer NOT NULL DEFAULT 0,
  "last_attempt_at" timestamp with time zone
);
--> statement-breakpoint

-- Idempotency at the queue layer — Respond.io fan-out is absorbed at
-- INSERT time so duplicate webhooks don't pile up multiple rows. We
-- still keep the downstream dedup check (isDuplicateMessageId) for
-- in-memory fast-path; this is the durable backstop.
CREATE UNIQUE INDEX IF NOT EXISTS "inbound_msg_queue_respond_msgid_unique"
  ON "inbound_messages_queue" ("respond_io_message_id")
  WHERE "respond_io_message_id" IS NOT NULL;
--> statement-breakpoint

-- The /admin/inbound-queue?status=failed view sorts by recency.
CREATE INDEX IF NOT EXISTS "inbound_msg_queue_status_received_idx"
  ON "inbound_messages_queue" ("status", "received_at" DESC);
