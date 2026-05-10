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
};

export class RespondIoClient {
  async sendTemplate(input: SendTemplateInput): Promise<void> {
    const env = loadEnv();
    const log = getLogger();
    const url = `${env.RESPOND_IO_API_BASE_URL}/conversation/${encodeURIComponent(
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
          // Pass channelId explicitly when the caller knows it (we extract
          // it from the inbound webhook). Respond.io v2 often returns
          // generic Meta delivery failures when channelId is implicit and
          // their internal session state disagrees with Meta. JSON.stringify
          // strips this when undefined, preserving the legacy implicit
          // behavior for callers that do not have a channel id.
          channelId: input.channelId,
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
    const url = `${env.RESPOND_IO_API_BASE_URL}/contact/id:${encodeURIComponent(input.contactId)}/tag`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUTS.RESPOND_IO_MS);
    try {
      const res = await undiciFetch(url, {
        method: "POST",
        signal: controller.signal,
        dispatcher: keepAliveAgent,
        headers: {
          authorization: `Bearer ${env.RESPOND_IO_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ tags: [input.tag] }),
      } as RequestInit);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new UpstreamError("respond_io", `add_tag ${res.status}`, {
          status: res.status,
          body: body.slice(0, 500),
        });
      }
      log.info({ contactId: input.contactId, tag: input.tag }, "respond_io add_tag ok");
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") {
        throw new UpstreamError("respond_io", "add_tag timed out", {
          timeoutMs: TIMEOUTS.RESPOND_IO_MS,
        });
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
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

    const url = `${env.RESPOND_IO_API_BASE_URL}/contact/id:${encodeURIComponent(input.contactId)}`;
    const customFields = entries.map(([name, value]) => ({ name, value }));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUTS.RESPOND_IO_MS);
    try {
      const res = await undiciFetch(url, {
        method: "PATCH",
        signal: controller.signal,
        dispatcher: keepAliveAgent,
        headers: {
          authorization: `Bearer ${env.RESPOND_IO_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ customFields }),
      } as RequestInit);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new UpstreamError("respond_io", `update_custom_fields ${res.status}`, {
          status: res.status,
          body: body.slice(0, 500),
        });
      }
      log.info(
        { contactId: input.contactId, fields: entries.map(([k]) => k) },
        "respond_io update_custom_fields ok",
      );
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") {
        throw new UpstreamError("respond_io", "update_custom_fields timed out", {
          timeoutMs: TIMEOUTS.RESPOND_IO_MS,
        });
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
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
