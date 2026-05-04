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

import { classifyWebhook, respondIoIncomingMessageSchema } from "@dpm/shared";

import { loadEnv } from "../env.js";
import { processAgentMessage } from "../handlers/process-agent-message.js";
import { processIncomingMessage } from "../handlers/process-message.js";
import {
  authenticateWebhook,
  pickSignatureHeader,
  pickWorkflowTokenHeader,
} from "../lib/hmac.js";

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
      workflowToken: env.WEBHOOK_WORKFLOW_TOKEN || undefined,
    });
    if (!verdict.ok) {
      req.log.warn({ reason: verdict.reason }, "webhook auth rejected");
      return reply.status(401).send({ error: { code: "auth_invalid" } });
    }

    const parsed = respondIoIncomingMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      req.log.warn({ issues: parsed.error.issues }, "webhook payload invalid");
      return reply.status(422).send({
        error: { code: "payload_invalid", issues: parsed.error.issues },
      });
    }

    // We only act on text-message events. Other events (typing, read, etc.)
    // are acknowledged but ignored.
    const event = parsed.data.event;
    if (!isMessageEvent(event)) {
      return reply.send({ ok: true, ignored: event });
    }

    const dispatch = classifyWebhook(parsed.data);

    if (dispatch.kind === "ignored") {
      return reply.send({ ok: true, ignored: dispatch.reason });
    }
    if (dispatch.kind === "bot_outbound") {
      // Our own AI reply being echoed back. We already wrote the row in
      // process-message; do not double-store.
      return reply.send({ ok: true, ignored: "bot_outbound" });
    }

    try {
      if (dispatch.kind === "agent_outbound") {
        const result = await processAgentMessage(parsed.data, dispatch.agentName, req.log);
        return reply.send(result);
      }
      const result = await processIncomingMessage(parsed.data, req.log);
      // Pilot gate / non-text rejections come back as ok:false ignored — we
      // still return HTTP 200 so Respond.io does not retry, but the body
      // surfaces the reason for ops visibility.
      return reply.send(result);
    } catch (err) {
      req.log.error({ err }, "process-message failed");
      // Re-throw so the global error handler maps AppError → status code.
      throw err;
    }
  });
}

function isMessageEvent(event: string): boolean {
  // Respond.io fires event names like "message.created", "message.received".
  // We accept anything starting with `message.` and ignore typing/presence.
  return event.startsWith("message.") || event === "incoming_message";
}
