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

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

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
import { sedeSlugToName, SEDE_SLUGS } from "../services/sede.js";
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

/**
 * Pull the Branch custom field out of a Respond.io payload so we can
 * compare it against an expected sede when the request hit a per-sede
 * URL. Defensive against shape variation — branch can live on
 * `contact.customFields` (legacy) or `contact.customFields[]` (v2 array)
 * depending on Respond.io's webhook version. Returns null when the
 * field is absent (we'll let the downstream sede gate make the final
 * decision in that case).
 */
function extractBranchFromPayload(body: unknown): string | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const contact = (b.contact ?? {}) as Record<string, unknown>;
  const cf = contact.customFields;

  // Shape A: object map (legacy v1 + simulator).
  if (cf && typeof cf === "object" && !Array.isArray(cf)) {
    const branch = (cf as Record<string, unknown>).Branch ?? (cf as Record<string, unknown>).branch;
    if (typeof branch === "string" && branch.trim() !== "") return branch.trim();
  }

  // Shape B: array of { name, value } (v2).
  if (Array.isArray(cf)) {
    for (const entry of cf) {
      if (entry && typeof entry === "object") {
        const e = entry as Record<string, unknown>;
        const name = typeof e.name === "string" ? e.name : null;
        const value = typeof e.value === "string" ? e.value : null;
        if (name && (name === "Branch" || name === "branch") && value && value.trim() !== "") {
          return value.trim();
        }
      }
    }
  }

  return null;
}

export async function webhookRoutes(app: FastifyInstance) {
  const env = loadEnv();

  // Shared post-auth handler. Both the sede-agnostic
  // `/webhook/respond-io` route AND each per-sede route
  // `/webhook/respond-io/<slug>` call this after they've authenticated
  // and (for per-sede routes) confirmed the Branch matches.
  // Keeping this as an inner function so it shares the `env` capture
  // without re-loading it on every call.
  async function handleVerifiedWebhook(
    req: FastifyRequest,
    reply: FastifyReply,
    normalized: unknown,
    peekedEvent: string | null,
  ): Promise<unknown> {
    req.log.info(
      {
        event: peekedEvent,
        contactId: (normalized as { contact?: { id?: unknown } })?.contact?.id ?? null,
        isContactState: peekedEvent ? isContactStateEvent(peekedEvent) : false,
        isMessage: peekedEvent ? isMessageEvent(peekedEvent) : false,
      },
      "WEBHOOK_EVENT received",
    );

    if (peekedEvent && isContactStateEvent(peekedEvent)) {
      req.log.info(
        { event: peekedEvent, contactId: (normalized as { contact?: { id?: unknown } })?.contact?.id ?? null },
        "contact-state webhook received",
      );
      reply.send({ ok: true, queued: true });
      const handleContactState = async (): Promise<void> => {
        try {
          await handleContactStateEvent(
            normalized as Parameters<typeof handleContactStateEvent>[0],
            peekedEvent,
            req.log,
          );
          captureWebhookDebug({
            body: normalized,
            classifiedAs: `contact_state:${peekedEvent}`,
          });
        } catch (err) {
          req.log.error({ err, event: peekedEvent }, "contact-state event failed (async)");
          captureWebhookDebug({
            body: normalized,
            classifiedAs: `contact_state_error:${peekedEvent}`,
          });
        }
      };
      void handleContactState();
      return;
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

    const event = parsed.data.event;
    req.log.info(
      {
        event,
        textLen: parsed.data.message?.text?.length ?? 0,
        hasAttachment:
          !!parsed.data.message?.attachment ||
          (Array.isArray(parsed.data.message?.attachments) &&
            parsed.data.message.attachments.length > 0),
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
      captureWebhookDebug({ body: normalized, classifiedAs: "bot_outbound" });
      return reply.send({ ok: true, ignored: "bot_outbound" });
    }
    captureWebhookDebug({ body: normalized, classifiedAs: `processing:${dispatch.kind}` });

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
    handle.catch(() => {});

    return reply.status(200).send({ ok: true, queued: true });
  }

  // Per-sede webhook routes (Miguel 2026-06-15). Same handler logic as
  // the shared route below, plus a guard that enforces the URL slug
  // matches the payload's Branch field. Goal: Miguel can register one
  // webhook per sede in Respond.io and toggle them independently — if
  // Gili Air starts misbehaving, deactivating its webhook silences GA
  // without affecting Phi Phi/Koh Tao/GT/NP. The route is mounted for
  // every sede in SEDE_SLUGS so adding a future sede only needs a new
  // entry in the slug map.
  for (const slug of SEDE_SLUGS) {
    const expectedSedeName = sedeSlugToName(slug);
    if (!expectedSedeName) continue; // unreachable; guards typings
    app.post(`/webhook/respond-io/${slug}`, async (req, reply) => {
      // 1. Authenticate first (same logic as the shared route — we run
      //    HMAC before peeking at the payload to make the rejection
      //    cost the same as a bare-URL attack would).
      const headerSig = pickSignatureHeader(req.headers as Record<string, string | string[]>);
      const rawBody = (req.body as { __rawBody?: Buffer })?.__rawBody;
      if (!rawBody) {
        req.log.error({ sedeSlug: slug }, "missing rawBody on per-sede webhook request");
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
        hmacSecretsExtra: env.RESPOND_IO_WEBHOOK_SECRETS_EXTRA,
        workflowToken: env.WEBHOOK_WORKFLOW_TOKEN || undefined,
      });
      if (!verdict.ok) {
        req.log.warn(
          { sedeSlug: slug, reason: verdict.reason },
          "per-sede webhook auth rejected",
        );
        return reply.status(401).send({ error: { code: "auth_invalid" } });
      }

      const normalized = normalizeRespondIoPayload(req.body);
      const peekedEvent =
        typeof (normalized as { event?: unknown })?.event === "string"
          ? (normalized as { event: string }).event
          : null;

      // 2. Sede match check — the URL slug commits us to ONE sede; if
      //    the payload's Branch says otherwise, reject. This is what
      //    gives Miguel the toggle-one-sede property: a payload meant
      //    for sede A that somehow leaks into sede B's URL is rejected
      //    instead of silently being processed against the wrong KB.
      //
      //    Contact-state events (lifecycle/tag/assignee updates) can
      //    legitimately arrive without a Branch (Respond.io fires them
      //    on any contact mutation); for those we skip the check and
      //    let the inbound state handler do its own sede lookup.
      const isStateEvent = peekedEvent ? isContactStateEvent(peekedEvent) : false;
      if (!isStateEvent) {
        const payloadBranch = extractBranchFromPayload(normalized);
        if (payloadBranch && payloadBranch !== expectedSedeName) {
          req.log.warn(
            {
              sedeSlug: slug,
              expectedSedeName,
              payloadBranch,
              event: peekedEvent,
              contactId:
                (normalized as { contact?: { id?: unknown } })?.contact?.id ?? null,
            },
            "per-sede webhook rejected: branch/url mismatch",
          );
          captureWebhookDebug({
            body: normalized,
            classifiedAs: `rejected:branch_mismatch:${slug}:${payloadBranch}`,
          });
          // 200 so Respond.io doesn't count this as a delivery failure
          // (we don't want to auto-disable the webhook over a workflow
          // misconfiguration on Miguel's side — log + drop instead).
          return reply.send({ ok: true, ignored: "branch_mismatch" });
        }

        // NOTE (Tony rule 2026-06-16, post-mortem of the GA test):
        // We do NOT inject Branch from the URL slug. Earlier we tried to
        // — assuming the URL commits to one sede. The assumption is
        // wrong: Respond.io's per-sede webhook integration fires for
        // ALL incoming messages workspace-wide unless filtered, so the
        // URL slug only tells us which integration shipped the event,
        // not which sede the customer chose. Injecting from URL caused
        // two bugs:
        //   1. The customer's first "Hola" (before any sede pick) got
        //      tagged as Gili Air → Colomba responded prematurely.
        //   2. The "<Sede>" button-click message got AI-processed →
        //      priorAiCount went to 1 → workflow's subsequent "assign
        //      to human" was misread as a real takeover → AI silenced.
        // The correct architecture: let messages without Branch fall
        // through to branch_empty rejection. The post-workflow
        // `assignee.updated` event drives the sede AI greeting via
        // contact-state-event.maybeSendWorkflowAutoWelcome (which
        // fetches the now-set Branch from Respond.io).
      }

      // 3. Delegate to the shared handler with the already-verified
      //    payload + classification. We re-use the same downstream
      //    fan-out (contact-state branch vs message branch) by calling
      //    the same processor functions directly.
      return handleVerifiedWebhook(req, reply, normalized, peekedEvent);
    });
  }

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
    // 2026-05-12 incident: state events without message fields caused
    // safeParse 422s in bulk; branch on event_type FIRST.
    const peekedEvent =
      typeof (normalized as { event?: unknown })?.event === "string"
        ? ((normalized as { event: string }).event)
        : null;

    return handleVerifiedWebhook(req, reply, normalized, peekedEvent);
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
  //
  // Tony 2026-06-07 debug: Respond.io's UI shows the webhook event as
  // "Cesionario de contactos actualizado" (Spanish: "Contacts assignee
  // updated"). The actual event_type sent over the wire is either
  // `contact.assignee.updated` (matching the Spanish) or
  // `conversation.assignee.updated` (matching the legacy docs). We
  // accept BOTH plus a generic prefix match below so we don't miss
  // whichever Respond.io actually sends.
  return (
    event === "contact.lifecycle.updated" ||
    event === "contact.lifecycle.changed" ||
    event === "contact.tag.added" ||
    event === "contact.tag.removed" ||
    event === "contact.tag.updated" ||
    event === "conversation.assignee.changed" ||
    event === "conversation.assignee.updated" ||
    event === "contact.assignee.changed" ||
    event === "contact.assignee.updated" ||
    // Generic prefix catches any future renaming (e.g. assignment.assignee.X).
    /assignee/i.test(event)
  );
}
