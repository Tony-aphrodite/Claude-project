// ============================================================================
// Respond.io inbound webhook. Hot path:
//   1. Verify HMAC against the raw body.
//   2. Parse + validate the envelope (zod).
//   3. Hand off to the orchestrator (process-message).
//
// We acknowledge with 200 as soon as the orchestration completes; on errors
// we return 4xx/5xx so Respond.io's retry policy kicks in. Latency budget for
// this whole route is the project's P95 < 3s target.
// ============================================================================

import type { FastifyInstance } from "fastify";

import {
  classifyWebhook,
  normalizeRespondIoPayload,
  respondIoIncomingMessageSchema,
} from "@dpm/shared";

import { getDb } from "@dpm/db";
import { sql as drizzleSql } from "drizzle-orm";

import { loadEnv } from "../env.js";
import { processAgentMessage } from "../handlers/process-agent-message.js";
import { processIncomingMessage } from "../handlers/process-message.js";
import { handleContactStateEvent } from "../handlers/contact-state-event.js";
import { withConversationLock } from "../services/conversation-lock.js";
import {
  authenticateWebhook,
  pickSignatureHeader,
  pickWorkflowTokenHeader,
} from "../lib/hmac.js";

// Forensic debug capture (2026-06-03): writes a row to webhook_debug_log
// for every inbound webhook with the classification verdict, so we can
// see EXACTLY what event types Respond.io is sending and how our code
// routed them. Fire-and-forget — does NOT block the response. Bounded
// by the table-pruning logic in post-migration.sql.
function captureWebhookDebug(args: {
  body: unknown;
  classifiedAs: string;
}): void {
  try {
    const b = (args.body ?? {}) as Record<string, unknown>;
    const contact = (b.contact ?? {}) as Record<string, unknown>;
    const message = (b.message ?? {}) as Record<string, unknown>;
    const inner = (message.message ?? {}) as Record<string, unknown>;
    const sender =
      (b.sender as Record<string, unknown> | undefined) ??
      (message.sender as Record<string, unknown> | undefined) ??
      (message.sentBy as Record<string, unknown> | undefined);
    const textLen = (() => {
      const t = message.text ?? inner.text;
      return typeof t === "string" ? t.length : 0;
    })();
    const hasAttachment =
      !!message.attachment ||
      !!inner.attachment ||
      (Array.isArray(message.attachments) && message.attachments.length > 0);
    const direction =
      (b.direction as string | undefined) ??
      (message.direction as string | undefined) ??
      (typeof message.traffic === "string" ? (message.traffic as string) : undefined) ??
      null;
    const senderType =
      (sender?.type as string | undefined) ??
      (sender?.source as string | undefined) ??
      null;

    void getDb()
      .execute(
        drizzleSql`INSERT INTO webhook_debug_log
          (event_field, event_type, contact_id, text_len, has_attachment, direction, sender_type, classified_as, body)
          VALUES (
            ${(b.event as string | undefined) ?? null},
            ${(b.event_type as string | undefined) ?? null},
            ${(contact.id as string | number | undefined) !== undefined ? String(contact.id) : null},
            ${textLen},
            ${hasAttachment},
            ${direction},
            ${senderType},
            ${args.classifiedAs},
            ${JSON.stringify(b)}::jsonb
          )`,
      )
      .catch(() => {});
  } catch {
    // never fail the webhook because of debug logging
  }
}

export async function webhookRoutes(app: FastifyInstance) {
  const env = loadEnv();

  app.post("/webhook/respond-io", async (req, reply) => {
    const headerSig = pickSignatureHeader(req.headers as Record<string, string | string[]>);
    const rawBody = (req.body as { __rawBody?: Buffer })?.__rawBody;

    if (!rawBody) {
      // Should never happen — content-type parser stamps __rawBody onto every
      // JSON payload. If we get here, the parser was bypassed.
      req.log.error("missing rawBody on webhook request");
      return reply.status(400).send({ error: { code: "no_body" } });
    }

    const tokenHeader = pickWorkflowTokenHeader(
      req.headers as Record<string, string | string[] | undefined>,
    );
    const verdict = authenticateWebhook({
      rawBody,
      signatureHeader: headerSig,
      tokenHeader,
      hmacSecret: env.RESPOND_IO_WEBHOOK_SECRET,
      // Sync - Ciclo de vida / Sync - Cesionario / Sync - Etiquetas each
      // ship with their own immutable Clave de firma. We accept any of
      // them so all four Respond.io webhooks can target the single
      // /webhook/respond-io endpoint.
      hmacSecretsExtra: env.RESPOND_IO_WEBHOOK_SECRETS_EXTRA,
      workflowToken: env.WEBHOOK_WORKFLOW_TOKEN || undefined,
    });
    if (!verdict.ok) {
      req.log.warn({ reason: verdict.reason }, "webhook auth rejected");
      return reply.status(401).send({ error: { code: "auth_invalid" } });
    }

    // Normalize the Respond.io v2 envelope (event_type, message.message.text,
    // message.traffic, sender.source, firstName/lastName, etc.) into the
    // shape our zod schema + downstream code expects. No-op for legacy
    // payloads.
    const normalized = normalizeRespondIoPayload(req.body);

    // PEEK event_type BEFORE running the strict message schema.
    //
    // 2026-05-12 evening incident: Respond.io auto-disabled the
    // "Sync - Ciclo de vida" webhook after too many failed requests.
    // Root cause: state events (lifecycle.updated / tag.updated /
    // assignee.updated) don't have the `message.{type,text,...}` fields
    // the message schema requires, so safeParse returned 422 for every
    // one. Respond.io counts 422s as failures and disables the webhook
    // after a threshold. Fix: branch on event_type FIRST, run the
    // strict schema only on the message path.
    const peekedEvent =
      typeof (normalized as { event?: unknown })?.event === "string"
        ? ((normalized as { event: string }).event)
        : null;
    if (peekedEvent && isContactStateEvent(peekedEvent)) {
      // Operator-side change in Respond.io (lifecycle moved, tag added/
      // removed, conversation assignee changed). The handler reads the
      // raw payload defensively — it doesn't need the message schema.
      req.log.info(
        { event: peekedEvent, contactId: (normalized as { contact?: { id?: unknown } })?.contact?.id ?? null },
        "contact-state webhook received",
      );
      try {
        const result = await handleContactStateEvent(
          normalized as Parameters<typeof handleContactStateEvent>[0],
          peekedEvent,
          req.log,
        );
        captureWebhookDebug({
          body: normalized,
          classifiedAs: `contact_state:${peekedEvent}`,
        });
        return reply.send(result);
      } catch (err) {
        req.log.error({ err, event: peekedEvent }, "contact-state event failed");
        captureWebhookDebug({
          body: normalized,
          classifiedAs: `contact_state_error:${peekedEvent}`,
        });
        // Respond with 200 so Respond.io doesn't count it as a failure
        // and disable the webhook. The error is captured in logs for ops.
        return reply.send({ ok: true, ignored: "contact_state_error" });
      }
    }

    // Message path — strict schema.
    const parsed = respondIoIncomingMessageSchema.safeParse(normalized);
    if (!parsed.success) {
      req.log.warn({ issues: parsed.error.issues }, "webhook payload invalid");
      captureWebhookDebug({
        body: normalized,
        classifiedAs: "payload_invalid_422",
      });
      return reply.status(422).send({
        error: { code: "payload_invalid", issues: parsed.error.issues },
      });
    }

    // We only act on text-message events. Other events (typing, read, etc.)
    // are acknowledged but ignored. Respond.io's "Send Test" ping omits the
    // event field entirely — return 200 so the dashboard can activate the
    // webhook.
    const event = parsed.data.event;
    // Structured, PII-safe summary of each webhook for observability. We
    // log shape — event name, message type, attachment presence — but
    // NEVER the raw body, phone, or message content (those are persisted
    // in mensajes table where access is auditable).
    req.log.info(
      {
        event,
        textLen: parsed.data.message?.text?.length ?? 0,
        hasAttachment:
          !!parsed.data.message?.attachment ||
          (Array.isArray(parsed.data.message?.attachments) &&
            parsed.data.message.attachments.length > 0),
        // Boolean only — referral body itself may carry PII (utm tokens
        // can leak ad campaign names, ctwa_clid is per-user). The full
        // referral object is preserved on the parsed payload for the
        // lead-source attribution worker to consume when implemented.
        hasReferral: !!parsed.data.message?.referral,
        contactId: parsed.data.contact?.id ?? null,
      },
      "webhook payload received",
    );
    if (!event) {
      captureWebhookDebug({ body: normalized, classifiedAs: "ignored:missing_event" });
      return reply.send({ ok: true, ignored: "missing_event" });
    }
    if (!isMessageEvent(event)) {
      captureWebhookDebug({ body: normalized, classifiedAs: `ignored:not_message_event:${event}` });
      return reply.send({ ok: true, ignored: event });
    }

    const dispatch = classifyWebhook(parsed.data);

    if (dispatch.kind === "ignored") {
      captureWebhookDebug({ body: normalized, classifiedAs: `ignored:${dispatch.reason}` });
      return reply.send({ ok: true, ignored: dispatch.reason });
    }
    if (dispatch.kind === "bot_outbound") {
      // Our own AI reply being echoed back. We already wrote the row in
      // process-message; do not double-store.
      captureWebhookDebug({ body: normalized, classifiedAs: "bot_outbound" });
      return reply.send({ ok: true, ignored: "bot_outbound" });
    }
    // Reached here: client_inbound OR agent_outbound — will be processed async
    captureWebhookDebug({ body: normalized, classifiedAs: `processing:${dispatch.kind}` });

    // Async dispatch (Phi Phi launch 2026-05-26 / Miguel "HTTP Request
    // has no timeout setting" feedback): we ack BEFORE the expensive
    // work runs, then process in the background. The customer-facing
    // reply is delivered via the Respond.io outbound API from inside
    // the handler, so it does NOT need to ride on this HTTP response.
    // Returning fast lets Miguel's workflow proceed (and time-budget
    // the human fallback) without waiting on Anthropic / Apps Script.
    //
    // Status code is 200, NOT 202 (root-cause fix 2026-06-02): Respond.io's
    // auto-disable mechanism treats any non-200 (including 202 Accepted)
    // as a delivery failure. After enough "failures" in a short window
    // it auto-disables the webhook silently, causing the freeze symptom
    // Miguel reported. Returning 200 means every successful ack counts
    // as success on their side; failures only happen for the cases that
    // SHOULD count as failures (401 / 422 / 5xx — all still return their
    // own status codes).
    //
    // What we LOSE by going async: a backend processing error no
    // longer surfaces as a non-2xx status, so the Respond.io workflow
    // can't route to the human via the "status code != 2xx → fallback"
    // branch when the failure is mid-pipeline. The fallback still
    // fires for the cases it was designed for — server fully down,
    // bad auth (401 stays sync), bad payload (422 stays sync) — and
    // backend mid-pipeline failures are caught + logged here and to
    // the `errores` table inside process-message.
    //
    // What we KEEP: per-contact serialization via withConversationLock,
    // so two rapid messages from the same customer still process in
    // order — Miguel's 2026-05-11 stale-metadata bug stays fixed.
    const handle = (async () => {
      const t0 = Date.now();
      try {
        if (dispatch.kind === "agent_outbound") {
          await processAgentMessage(parsed.data, dispatch.agentName, req.log);
          return;
        }
        await withConversationLock(parsed.data.contact.id, () =>
          processIncomingMessage(parsed.data, req.log),
        );
      } catch (err) {
        req.log.error(
          {
            err,
            elapsedMs: Date.now() - t0,
            contactId: parsed.data.contact?.id ?? null,
            dispatchKind: dispatch.kind,
          },
          "async webhook processing failed",
        );
      }
    })();
    // Detach so unhandled-promise warnings don't fire on the rare cases
    // when the async chain rejects past our try/catch.
    handle.catch(() => {});

    return reply.status(200).send({ ok: true, queued: true });
  });
}

function isMessageEvent(event: string): boolean {
  // Respond.io fires event names like "message.created", "message.received".
  // We accept anything starting with `message.` and ignore typing/presence.
  return event.startsWith("message.") || event === "incoming_message";
}

function isContactStateEvent(event: string): boolean {
  // Operator-side mutations we care about for bidirectional sync. The
  // exact Respond.io event names depend on the workspace settings; we
  // accept the v2 family + a few legacy aliases so the handler doesn't
  // miss the wrong name. Adding a new name here is a one-line change.
  return (
    event === "contact.lifecycle.updated" ||
    event === "contact.lifecycle.changed" ||
    event === "contact.tag.added" ||
    event === "contact.tag.removed" ||
    event === "contact.tag.updated" ||
    event === "conversation.assignee.changed" ||
    event === "conversation.assignee.updated"
  );
}
