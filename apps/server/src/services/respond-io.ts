// ============================================================================
// Respond.io REST client. We use undici directly (not the SDK) because:
//  1. We only need 2 endpoints (sendMessage, getContact) — pulling a full
//     SDK is overkill.
//  2. undici lets us share a global Agent with HTTP/2 keep-alive, shaving
//     ~150ms off each call vs. the global fetch's per-request connect.
// ============================================================================

import { Agent, fetch as undiciFetch } from "undici";

import { TIMEOUTS } from "@dpm/shared";

import { loadEnv } from "../env.js";
import { UpstreamError } from "../lib/errors.js";
import { getLogger } from "../logger.js";

const keepAliveAgent = new Agent({
  keepAliveTimeout: TIMEOUTS.KEEP_ALIVE_MS,
  keepAliveMaxTimeout: TIMEOUTS.KEEP_ALIVE_MS,
  connect: { timeout: 5_000 },
});

export type SendMessageInput = {
  conversationId: string;
  text: string;
  // Optional fallback: when the conversation_id is missing or looks like an
  // unresolved Respond.io workflow template literal (e.g. "$conversation.id"),
  // we cannot send via /conversation/{id}/message. The send path tries this
  // contact identifier instead via /contact/id:{contactId}/message.
  contactId?: string | undefined;
  // Optional explicit channel id from the webhook payload (e.g. "274637" for
  // Gili Trawangan WAP EN main). Some Respond.io v2 send paths require this
  // to disambiguate when a contact has multiple channels — Meta returns
  // generic "Something went wrong" when the channel is implicit and the
  // session/window state on Respond.io's side disagrees with Meta.
  channelId?: string | undefined;
};

export type SendCatalogInput = {
  conversationId: string;
  contactId?: string | undefined;
  /** Payload object built by catalog-registry; forwarded as the message body. */
  payload:
    | { type: "fragment"; fragmentId: string }
    | { type: "product"; product_retailer_id: string; catalog_id?: string }
    | {
        type: "template";
        name: string;
        language: string;
        components?: unknown[];
      }
    | { type: "raw"; payload: Record<string, unknown> };
};

export type SendTemplateInput = {
  conversationId: string;
  templateName: string;
  language: string;
  variables: string[];
  /** Used as fallback when conversationId is a `tmp_*` placeholder. */
  contactId?: string | undefined;
};

export class RespondIoClient {
  async sendTemplate(input: SendTemplateInput): Promise<void> {
    const env = loadEnv();
    const log = getLogger();
    // Same conversation-vs-contact fallback as sendMessage. The v2 webhook
    // payload doesn't include a real conversation id, so the follow-up
    // scheduler (which stamps `tmp_*` placeholders) needs the contact
    // endpoint to actually deliver.
    const useContactFallback =
      isUnresolvedTemplate(input.conversationId) && !!input.contactId;
    const url = useContactFallback
      ? `${env.RESPOND_IO_API_BASE_URL}/contact/id:${encodeURIComponent(input.contactId!)}/message`
      : `${env.RESPOND_IO_API_BASE_URL}/conversation/${encodeURIComponent(
          input.conversationId,
        )}/message`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUTS.RESPOND_IO_MS);

    try {
      const res = await undiciFetch(url, {
        method: "POST",
        dispatcher: keepAliveAgent,
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${env.RESPOND_IO_API_KEY}`,
        },
        body: JSON.stringify({
          message: {
            type: "template",
            template: {
              name: input.templateName,
              language: { code: input.language },
              components: [
                {
                  type: "body",
                  parameters: input.variables.map((v) => ({ type: "text", text: v })),
                },
              ],
            },
          },
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        log.warn(
          { status: res.status, body: body.slice(0, 500), template: input.templateName },
          "respond_io send_template non-2xx",
        );
        throw new UpstreamError("respond_io", `Template send returned ${res.status}`, {
          template: input.templateName,
        });
      }
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") {
        throw new UpstreamError("respond_io", "Send template timed out", {
          timeoutMs: TIMEOUTS.RESPOND_IO_MS,
        });
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async sendMessage(input: SendMessageInput): Promise<void> {
    const env = loadEnv();
    const log = getLogger();

    const useContactFallback =
      isUnresolvedTemplate(input.conversationId) && !!input.contactId;

    const url = useContactFallback
      ? `${env.RESPOND_IO_API_BASE_URL}/contact/id:${encodeURIComponent(input.contactId!)}/message`
      : `${env.RESPOND_IO_API_BASE_URL}/conversation/${encodeURIComponent(
          input.conversationId,
        )}/message`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUTS.RESPOND_IO_MS);

    try {
      const res = await undiciFetch(url, {
        method: "POST",
        dispatcher: keepAliveAgent,
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${env.RESPOND_IO_API_KEY}`,
        },
        body: JSON.stringify({
          // 2026-05-10 finding: Respond.io v2 /contact/id:{id}/message
          // endpoint REJECTS `channelId` as an invalid field
          // (`{"code":400,"message":"Invalid field(s) : channelId = 274637"}`).
          // Channel disambiguation happens implicitly via the contact's
          // primary channel. Do not include channelId here.
          message: { type: "text", text: input.text },
        }),
      });

      // Capture full response body for diagnostics. Respond.io's API
      // returns 200/202 even when the underlying Meta push will fail
      // asynchronously; sometimes the success body carries delivery
      // status / message id we can subsequently query.
      const bodyText = await res.text().catch(() => "");

      if (!res.ok) {
        log.warn(
          {
            status: res.status,
            body: bodyText.slice(0, 1500),
            via: useContactFallback ? "contact" : "conversation",
            url,
          },
          "respond_io send_message non-2xx",
        );
        throw new UpstreamError(
          "respond_io",
          `Respond.io returned ${res.status}`,
          {
            status: res.status,
            conversationId: input.conversationId,
            contactId: input.contactId ?? null,
            via: useContactFallback ? "contact" : "conversation",
          },
        );
      }
      log.info(
        {
          status: res.status,
          via: useContactFallback ? "contact" : "conversation",
          // TEMP DEBUG (2026-05-10 Meta-delivery investigation): log full
          // 2xx body so we can see the message id + any inline status.
          bodyHead: bodyText.slice(0, 1500),
          textLen: input.text.length,
        },
        "respond_io send_message ok",
      );

      // TEMP DEBUG (2026-05-10): poll the message status 8s after the send
      // so we can see whether Meta accepted, queued, or rejected the
      // outbound — and capture the Meta error code surfaced by Respond.io
      // ("Something went wrong" in the UI is the generic catch-all; the
      // structured error like 131047 / 132001 is what we need).
      try {
        const parsed = JSON.parse(bodyText) as {
          messageId?: number | string;
          contactId?: number | string;
        };
        const messageId =
          parsed.messageId !== undefined ? String(parsed.messageId) : null;
        const contactId =
          parsed.contactId !== undefined
            ? String(parsed.contactId)
            : (input.contactId ?? null);
        if (messageId && contactId) {
          setTimeout(() => {
            this.diagnoseMessageDelivery({ messageId, contactId }).catch((err) =>
              log.warn({ err, messageId }, "diagnose_message_delivery failed"),
            );
          }, 8_000);
        }
      } catch {
        // Body wasn't JSON or didn't have messageId — skip diagnostics.
      }
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") {
        throw new UpstreamError("respond_io", "Send message timed out", {
          timeoutMs: TIMEOUTS.RESPOND_IO_MS,
        });
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * TEMP DEBUG (2026-05-10): try several Respond.io v2 endpoint shapes to
   * pull the delivery status of a recently-sent outbound message. We do
   * NOT know the canonical URL ahead of time so we probe a few patterns
   * and log every response that doesn't 404. The first non-404 response
   * is logged in full so we can see the Meta error code embedded by
   * Respond.io after async push to Meta.
   */
  async diagnoseMessageDelivery(input: {
    messageId: string;
    contactId: string;
  }): Promise<void> {
    const env = loadEnv();
    const log = getLogger();
    const candidates = [
      `${env.RESPOND_IO_API_BASE_URL}/message/id:${encodeURIComponent(input.messageId)}`,
      `${env.RESPOND_IO_API_BASE_URL}/contact/id:${encodeURIComponent(input.contactId)}/message/${encodeURIComponent(input.messageId)}`,
      `${env.RESPOND_IO_API_BASE_URL}/contact/id:${encodeURIComponent(input.contactId)}/messages?limit=3`,
      `${env.RESPOND_IO_API_BASE_URL}/contact/id:${encodeURIComponent(input.contactId)}/conversations?limit=1`,
    ];
    for (const url of candidates) {
      try {
        const res = await undiciFetch(url, {
          method: "GET",
          dispatcher: keepAliveAgent,
          headers: {
            authorization: `Bearer ${env.RESPOND_IO_API_KEY}`,
          },
        } as RequestInit);
        const body = await res.text().catch(() => "");
        if (res.status === 404) {
          log.info({ url, status: 404 }, "diagnose_message_delivery: 404 (endpoint shape not supported)");
          continue;
        }
        log.warn(
          {
            url,
            status: res.status,
            bodyHead: body.slice(0, 2000),
            messageId: input.messageId,
            contactId: input.contactId,
          },
          "diagnose_message_delivery: response captured",
        );
        // Stop at first non-404 — that's our endpoint shape.
        return;
      } catch (err) {
        log.info(
          { url, err: (err as Error).message },
          "diagnose_message_delivery: probe error",
        );
      }
    }
    log.warn(
      { messageId: input.messageId, contactId: input.contactId },
      "diagnose_message_delivery: no endpoint accepted the request",
    );
  }

  /**
   * Send a native WhatsApp Business product card / template / fragment from
   * the operator's Respond.io catalog. Shape is decided per-payload because
   * Respond.io accepts several flavors:
   *   • product       → interactive product card from Meta Commerce catalog
   *   • template      → Meta-approved WhatsApp Business template
   *   • fragment      → Respond.io "Fragmento" (snippet) with rich content
   *   • raw           → escape hatch — forwarded verbatim under `message`
   *
   * Same conversation-vs-contact fallback as sendMessage.
   */
  async sendCatalogMessage(input: SendCatalogInput): Promise<void> {
    const env = loadEnv();
    const log = getLogger();

    const useContactFallback =
      isUnresolvedTemplate(input.conversationId) && !!input.contactId;

    const url = useContactFallback
      ? `${env.RESPOND_IO_API_BASE_URL}/contact/id:${encodeURIComponent(input.contactId!)}/message`
      : `${env.RESPOND_IO_API_BASE_URL}/conversation/${encodeURIComponent(
          input.conversationId,
        )}/message`;

    const messageBody = buildCatalogMessageBody(input.payload);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUTS.RESPOND_IO_MS);

    try {
      const res = await undiciFetch(url, {
        method: "POST",
        dispatcher: keepAliveAgent,
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${env.RESPOND_IO_API_KEY}`,
        },
        body: JSON.stringify(messageBody),
      });

      if (!res.ok) {
        const bodyText = await res.text().catch(() => "");
        log.warn(
          {
            status: res.status,
            body: bodyText.slice(0, 500),
            payloadType: input.payload.type,
            via: useContactFallback ? "contact" : "conversation",
          },
          "respond_io send_catalog non-2xx",
        );
        throw new UpstreamError(
          "respond_io",
          `Respond.io catalog send returned ${res.status}`,
          {
            status: res.status,
            payloadType: input.payload.type,
            conversationId: input.conversationId,
            contactId: input.contactId ?? null,
          },
        );
      }
      log.info(
        {
          payloadType: input.payload.type,
          via: useContactFallback ? "contact" : "conversation",
        },
        "respond_io send_catalog ok",
      );
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") {
        throw new UpstreamError("respond_io", "Catalog send timed out", {
          timeoutMs: TIMEOUTS.RESPOND_IO_MS,
        });
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Fetch full contact details (tags + custom fields) from the Respond.io
   * REST API. The webhook payload v2 (observed 2026-05-10) does NOT carry
   * tags or customFields, so the pilot gate has to look them up here to
   * decide whether to engage the AI.
   *
   * Returns null on 404 (contact deleted between webhook fire + our
   * lookup) so callers can fall back to "treat as untagged".
   */
  async getContact(contactId: string): Promise<{
    id: string;
    tags: string[];
    customFields: Record<string, unknown>;
  } | null> {
    const env = loadEnv();
    const log = getLogger();
    const url = `${env.RESPOND_IO_API_BASE_URL}/contact/id:${encodeURIComponent(contactId)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUTS.RESPOND_IO_MS);
    try {
      const res = await undiciFetch(url, {
        method: "GET",
        signal: controller.signal,
        dispatcher: keepAliveAgent,
        headers: {
          authorization: `Bearer ${env.RESPOND_IO_API_KEY}`,
        },
      } as RequestInit);
      if (res.status === 404) return null;
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new UpstreamError("respond_io", `get_contact ${res.status}`, {
          status: res.status,
          body: body.slice(0, 500),
        });
      }
      const json = (await res.json()) as Record<string, unknown>;
      // Respond.io wraps the contact in {data: {...}} or returns it flat
      // depending on endpoint version. Handle both.
      const c = (
        typeof json.data === "object" && json.data !== null ? json.data : json
      ) as Record<string, unknown>;
      const tags = Array.isArray(c.tags)
        ? c.tags.filter((t): t is string => typeof t === "string")
        : [];
      const customFields =
        typeof c.customFields === "object" && c.customFields !== null
          ? (c.customFields as Record<string, unknown>)
          : typeof c.fields === "object" && c.fields !== null
            ? (c.fields as Record<string, unknown>)
            : typeof c.custom_fields === "object" && c.custom_fields !== null
              ? (c.custom_fields as Record<string, unknown>)
              : {};
      log.info(
        { contactId, tagCount: tags.length, fieldCount: Object.keys(customFields).length },
        "respond_io get_contact ok",
      );
      return { id: contactId, tags, customFields };
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") {
        throw new UpstreamError("respond_io", "get_contact timed out", {
          timeoutMs: TIMEOUTS.RESPOND_IO_MS,
        });
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Add a tag to a Respond.io contact. Owner spec DPM_AI_LAUNCH +
   * 2026-05-07 reply: tag-based handoff. The Respond.io workflow that
   * Miguel maintains listens for these tags and assigns the conversation
   * to the "Agents" team (id 21595, Round Robin) — we just emit the
   * signal.
   *
   * Common tags we apply:
   *   • `deposit_paid`     → triggers post-venta workflow + agent assignment
   *   • `ai_escalation`    → pre-deposit handoff (medical, >10% discount,
   *                          prohibited topic) — same Round Robin
   */
  async addContactTag(input: { contactId: string; tag: string }): Promise<void> {
    const env = loadEnv();
    const log = getLogger();
    const baseUrl = `${env.RESPOND_IO_API_BASE_URL}/contact/id:${encodeURIComponent(input.contactId)}`;

    // Respond.io v2 changed the add-tag endpoint between docs and reality:
    // the legacy `{tags: ["..."]}` body returns 400 "Tags: Cannot be empty"
    // in production. We probe the most likely v2 shapes in order until one
    // returns 2xx, then log the winning shape so subsequent calls can be
    // hardcoded to it once confirmed.
    const variants: Array<{
      url: string;
      method: "POST" | "PUT" | "PATCH";
      body: Record<string, unknown>;
      label: string;
    }> = [
      // First try the pattern that worked for custom fields: PUT root contact.
      {
        url: baseUrl,
        method: "PUT",
        body: { tags: [input.tag] },
        label: "PUT-root-contact-tags",
      },
      {
        url: baseUrl,
        method: "PUT",
        body: { tags: [{ name: input.tag }] },
        label: "PUT-root-contact-tags-objects",
      },
      {
        url: baseUrl,
        method: "PUT",
        body: { Tags: [input.tag] },
        label: "PUT-root-contact-capital-Tags",
      },
      {
        url: `${baseUrl}/tag`,
        method: "POST",
        body: { Tags: [input.tag] },
        label: "POST-tag-capital-Tags",
      },
      // The legacy variants that returned 400 — keep last as confirmation.
      {
        url: `${baseUrl}/tag`,
        method: "POST",
        body: { tags: [input.tag] },
        label: "legacy-POST-tag",
      },
    ];

    let lastErr: { status: number; body: string; label: string } | null = null;
    for (const variant of variants) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUTS.RESPOND_IO_MS);
      try {
        const res = await undiciFetch(variant.url, {
          method: variant.method,
          signal: controller.signal,
          dispatcher: keepAliveAgent,
          headers: {
            authorization: `Bearer ${env.RESPOND_IO_API_KEY}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(variant.body),
        } as RequestInit);
        const respBody = await res.text().catch(() => "");
        if (res.ok) {
          log.info(
            {
              contactId: input.contactId,
              tag: input.tag,
              winningVariant: variant.label,
              status: res.status,
            },
            "respond_io add_tag ok",
          );
          return;
        }
        lastErr = { status: res.status, body: respBody.slice(0, 300), label: variant.label };
        log.warn(
          {
            variant: variant.label,
            status: res.status,
            body: respBody.slice(0, 300),
          },
          "respond_io add_tag variant failed",
        );
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") {
          throw new UpstreamError("respond_io", "add_tag timed out", {
            timeoutMs: TIMEOUTS.RESPOND_IO_MS,
          });
        }
        // Keep probing on non-timeout errors.
        lastErr = { status: 0, body: (err as Error).message, label: variant.label };
      } finally {
        clearTimeout(timer);
      }
    }
    throw new UpstreamError(
      "respond_io",
      `add_tag exhausted all ${variants.length} variants`,
      lastErr ?? {},
    );
  }

  /**
   * Patch contact custom fields. Owner spec DPM_AI_LAUNCH 2026-05-07
   * reply §2: Miguel created 8 fields (`programa`, `turno`, `pax`,
   * `moneda`, `monto`, `descuento`, `start_date`, `codigo_referencia`).
   * The AI populates them as it captures info during the conversation —
   * Miguel's existing Sheet Logger reads from these fields when the
   * conversation closes, so the sales row gets written automatically.
   *
   * Caller passes only the fields it has; server merges into Respond.io.
   */
  async updateContactCustomFields(input: {
    contactId: string;
    fields: Record<string, string | number | null>;
  }): Promise<void> {
    const env = loadEnv();
    const log = getLogger();
    const entries = Object.entries(input.fields).filter(([, v]) => v !== null && v !== undefined);
    if (entries.length === 0) return;

    const baseUrl = `${env.RESPOND_IO_API_BASE_URL}/contact/id:${encodeURIComponent(input.contactId)}`;
    const customFields = entries.map(([name, value]) => ({ name, value }));

    // Probe v2 variants — the PATCH /contact/id:{id} root resource returns
    // AWS WAF 403 in production. Try alternative endpoints + methods until
    // one succeeds.
    const variants: Array<{
      url: string;
      method: "POST" | "PUT" | "PATCH";
      body: Record<string, unknown>;
      label: string;
    }> = [
      // Confirmed working variant (2026-05-11 logs): PUT /contact/id:{id}
      // body {customFields: [...]} returns 200. Keep as primary.
      {
        url: baseUrl,
        method: "PUT",
        body: { customFields },
        label: "PUT-root-contact",
      },
      {
        url: `${baseUrl}/customField`,
        method: "POST",
        body: { customField: customFields },
        label: "POST-customField-subresource",
      },
      {
        url: baseUrl,
        method: "PATCH",
        body: { customFields },
        label: "legacy-PATCH-root",
      },
    ];

    let lastErr: { status: number; body: string; label: string } | null = null;
    for (const variant of variants) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUTS.RESPOND_IO_MS);
      try {
        const res = await undiciFetch(variant.url, {
          method: variant.method,
          signal: controller.signal,
          dispatcher: keepAliveAgent,
          headers: {
            authorization: `Bearer ${env.RESPOND_IO_API_KEY}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(variant.body),
        } as RequestInit);
        const respBody = await res.text().catch(() => "");
        if (res.ok) {
          log.info(
            {
              contactId: input.contactId,
              fields: entries.map(([k]) => k),
              winningVariant: variant.label,
              status: res.status,
            },
            "respond_io update_custom_fields ok",
          );
          return;
        }
        lastErr = { status: res.status, body: respBody.slice(0, 300), label: variant.label };
        log.warn(
          {
            variant: variant.label,
            status: res.status,
            body: respBody.slice(0, 300),
          },
          "respond_io update_custom_fields variant failed",
        );
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") {
          throw new UpstreamError("respond_io", "update_custom_fields timed out", {
            timeoutMs: TIMEOUTS.RESPOND_IO_MS,
          });
        }
        lastErr = { status: 0, body: (err as Error).message, label: variant.label };
      } finally {
        clearTimeout(timer);
      }
    }
    throw new UpstreamError(
      "respond_io",
      `update_custom_fields exhausted all ${variants.length} variants`,
      lastErr ?? {},
    );
  }
}

/**
 * Translate a registry catalog payload into the JSON body Respond.io's send
 * endpoint expects. The body shape is intentionally close to Meta's
 * WhatsApp Business message schema since Respond.io passes that through.
 * Operators can override the wire shape by storing a `raw` payload — that
 * one is forwarded verbatim.
 */
function buildCatalogMessageBody(
  payload: SendCatalogInput["payload"],
): Record<string, unknown> {
  switch (payload.type) {
    case "fragment":
      return {
        message: { type: "fragment", fragmentId: payload.fragmentId },
      };
    case "product":
      return {
        message: {
          type: "interactive",
          interactive: {
            type: "product",
            ...(payload.catalog_id ? { catalog_id: payload.catalog_id } : {}),
            product_retailer_id: payload.product_retailer_id,
          },
        },
      };
    case "template":
      return {
        message: {
          type: "template",
          template: {
            name: payload.name,
            language: { code: payload.language },
            ...(payload.components ? { components: payload.components } : {}),
          },
        },
      };
    case "raw":
    default:
      return { message: payload.payload };
  }
}

/**
 * Detect identifiers that obviously failed Respond.io workflow template
 * substitution (e.g. literal `$conversation.id`, empty string, or `tmp_…`
 * placeholder our own code injects when no conversation arrives). In those
 * cases we cannot reach /conversation/{id}/message and must fall back to the
 * contact endpoint.
 */
function isUnresolvedTemplate(value: string | null | undefined): boolean {
  if (!value) return true;
  if (value.startsWith("$")) return true;
  if (value.startsWith("{{") || value.startsWith("{$")) return true;
  if (value.startsWith("tmp_")) return true;
  return false;
}

export const respondIoClient = new RespondIoClient();
