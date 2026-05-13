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
        // 2026-05-12 — correct Respond.io v2 format after thorough probing:
        // - message.type must be "whatsapp_template" (NOT "template" — that
        //   returns `Invalid field(s) : message.type = template`)
        // - template.languageCode is flat camelCase (NOT `language: { code }`
        //   nested object — that returns `Missing field(s) : template.languageCode`)
        // Confirmed against the validator with a fake contact id: 404
        // "Contact not found!" = shape passed, only the contact lookup failed.
        body: JSON.stringify({
          message: {
            type: "whatsapp_template",
            template: {
              name: input.templateName,
              languageCode: input.language,
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

      if (!res.ok) {
        const bodyText = await res.text().catch(() => "");
        log.warn(
          {
            status: res.status,
            body: bodyText.slice(0, 500),
            via: useContactFallback ? "contact" : "conversation",
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
          via: useContactFallback ? "contact" : "conversation",
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
      // Respond.io v2 returns customFields as an ARRAY of {name, value}
      // objects (observed 2026-05-11 via recovery script). The legacy v1
      // shape was an object keyed by field name. Handle both — normalize
      // to a name→value map so callers can read by name regardless.
      const cfRaw =
        c.customFields !== undefined
          ? c.customFields
          : c.fields !== undefined
            ? c.fields
            : c.custom_fields;
      const customFields: Record<string, unknown> = {};
      if (Array.isArray(cfRaw)) {
        for (const entry of cfRaw) {
          if (
            entry &&
            typeof entry === "object" &&
            "name" in entry &&
            typeof (entry as { name: unknown }).name === "string"
          ) {
            customFields[(entry as { name: string }).name] = (entry as {
              value: unknown;
            }).value;
          }
        }
      } else if (typeof cfRaw === "object" && cfRaw !== null) {
        Object.assign(customFields, cfRaw as Record<string, unknown>);
      }
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
    // CORRECT pattern, confirmed against the official respond.io
    // TypeScript SDK on 2026-05-13:
    //   POST /v2/contact/id:{id}/tag
    //   Body: raw JSON array of tag-name strings — e.g. ["deposit_paid"]
    //         NOT {"tags": ["deposit_paid"]}
    //
    // Source: respond-io/typescript-sdk addTags() →
    //   this.http.post(`/contact/${identifier}/tag`, tags)   // raw string[]
    //
    // The previous implementation PUT to /contact/id:{id} with
    // {"tags":[...]}. That endpoint returns 200 but silently drops the
    // tags field (its body schema only knows about contact fields like
    // firstName, phone, email, custom_fields). Tony verified this with
    // a before/after GET on 2026-05-13: PUT 200, but Tags unchanged.
    // Result: addContactTag had been a no-op in production since May —
    // every deposit_paid / ai_escalation our server thought it applied
    // never actually landed on the contact, which is why Miguel's
    // panel "Confirmar" path produced no onboarding workflow run, no
    // welcome snippets, and no Round Robin reassignment.
    //
    // The dedicated /tag endpoint adds tags additively (no need to GET
    // existing tags first and merge — that was a workaround for the
    // PUT-replaces-resource semantics that no longer applies). Adding
    // an already-present tag is idempotent on Respond.io's side.
    //
    // Constraint per SDK: 1–10 tags per call, max 255 chars each.
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
        body: JSON.stringify([input.tag]),
      } as RequestInit);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        log.warn(
          { status: res.status, body: body.slice(0, 300), tag: input.tag },
          "respond_io add_tag non-2xx",
        );
        throw new UpstreamError("respond_io", `add_tag ${res.status}`, {
          status: res.status,
          body: body.slice(0, 300),
        });
      }
      log.info(
        { contactId: input.contactId, tag: input.tag },
        "respond_io add_tag ok",
      );
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
   * Remove a tag from a Respond.io contact. Mirror of addContactTag. Used
   * for two scenarios on 2026-05-12:
   *
   *   1. "Tag refresh" before re-applying — Respond.io workflow triggers
   *      fire on tag-update *events*, not on tag *presence*. If
   *      deposit_paid is already pegged from a previous test run, PUTting
   *      it again emits no event and the Onboarding Piloto workflow
   *      doesn't fire. Caller does removeContactTag → addContactTag to
   *      guarantee a fresh event.
   *
   *   2. State rollback — when an operator manually moves a contact
   *      back to New Lead lifecycle (or our incoming webhook handler
   *      decides to reset state), we strip stale `deposit_paid` /
   *      `ai_escalation` tags so the next workflow run starts clean.
   *
   * 404 from the GET is treated as "contact gone — nothing to remove",
   * not an error. The PUT only fires when the tag is actually present,
   * to avoid emitting spurious tag-update events for no-ops.
   */
  async removeContactTag(input: { contactId: string; tag: string }): Promise<void> {
    const env = loadEnv();
    const log = getLogger();
    // Mirror of addContactTag — same canonical /tag sub-resource with a
    // raw JSON array body, just DELETE instead of POST.
    //   DELETE /v2/contact/id:{id}/tag
    //   Body:  ["deposit_paid"]
    //
    // The old impl GET'd current tags, filtered out the target, then
    // PUT the remainder to /contact/id:{id}. That PUT silently dropped
    // the tags field (same 2026-05-13 bug as addContactTag), so
    // removeContactTag had been a no-op in production too. Switching to
    // the dedicated /tag endpoint with raw-array body fixes both.
    //
    // 404 / "tag not present" is treated as success (idempotent remove).
    const url = `${env.RESPOND_IO_API_BASE_URL}/contact/id:${encodeURIComponent(input.contactId)}/tag`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUTS.RESPOND_IO_MS);
    try {
      const res = await undiciFetch(url, {
        method: "DELETE",
        signal: controller.signal,
        dispatcher: keepAliveAgent,
        headers: {
          authorization: `Bearer ${env.RESPOND_IO_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify([input.tag]),
      } as RequestInit);
      if (res.status === 404) {
        log.info(
          { contactId: input.contactId, tag: input.tag },
          "respond_io remove_tag: contact or tag absent — no-op",
        );
        return;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        log.warn(
          { status: res.status, body: body.slice(0, 300), tag: input.tag },
          "respond_io remove_tag non-2xx",
        );
        throw new UpstreamError("respond_io", `remove_tag ${res.status}`, {
          status: res.status,
          body: body.slice(0, 300),
        });
      }
      log.info(
        { contactId: input.contactId, tag: input.tag },
        "respond_io remove_tag ok",
      );
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") {
        throw new UpstreamError("respond_io", "remove_tag timed out", {
          timeoutMs: TIMEOUTS.RESPOND_IO_MS,
        });
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Update a Respond.io contact's `lifecycle` field.
   *
   * **HONEST STATUS (2026-05-12 probe):** Respond.io v2's PUT endpoint
   * SILENTLY IGNORES the `lifecycle` key in the request body. Every
   * variant tried returns 200 OK but leaves the value unchanged:
   *   - `{ lifecycle: "Engaging" }` — 200, no change
   *   - `{ lifecycle_stage: ... }` — 200, no change
   *   - `{ stage: ... }` — 200, no change
   *   - `{ lifecycle: { stage: ... } }` — 200, no change
   * Dedicated endpoints (PUT/POST /contact/id:{id}/lifecycle) return 404.
   * Lifecycle in Respond.io v2 is operator-only — workflows can set it,
   * direct API can't.
   *
   * What this method DOES do (intentional side effects via the same PUT):
   *   1. Preserves tags + custom fields (defensive, since PUT replaces).
   *   2. Coerces numeric custom field values to numbers before PUT so
   *      the merge doesn't fail with `monto: Invalid value` — that was
   *      the silent killer of every PUT to Miguel's test contact.
   *
   * The lifecycle key is included in the body in case Respond.io ever
   * starts honoring it (no harm — they silently drop today). If you
   * need to drive lifecycle changes from server logic, route them
   * through TAG changes (workflows triggered by `deposit_paid` /
   * `ai_escalation` can set lifecycle to Customer / Engaging on
   * Miguel's side).
   */
  async updateContactLifecycle(input: {
    contactId: string;
    lifecycle: string;
  }): Promise<void> {
    const env = loadEnv();
    const log = getLogger();
    // Read existing tags + customFields and include them in the PUT body
    // — Respond.io's PUT replaces the whole resource, so we have to write
    // back what we don't want lost. Same merge guard as updateContactCustomFields.
    let existingTags: string[] = [];
    let existingFields: Record<string, unknown> = {};
    try {
      const current = await this.getContact(input.contactId);
      existingTags = current?.tags ?? [];
      existingFields = current?.customFields ?? {};
    } catch (err) {
      log.warn(
        { err: (err as Error).message, contactId: input.contactId },
        "respond_io update_lifecycle: getContact failed — proceeding without preservation",
      );
    }
    const customFields = Object.entries(existingFields)
      .filter(([, v]) => v !== null && v !== undefined && !(typeof v === "string" && v.length === 0))
      .map(([name, value]) => ({
        name,
        value: coerceCustomFieldValueForPut(name, value),
      }));

    const url = `${env.RESPOND_IO_API_BASE_URL}/contact/id:${encodeURIComponent(input.contactId)}`;
    const putBody: Record<string, unknown> = { lifecycle: input.lifecycle };
    if (customFields.length > 0) putBody.custom_fields = customFields;
    if (existingTags.length > 0) putBody.tags = existingTags;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUTS.RESPOND_IO_MS);
    try {
      const res = await undiciFetch(url, {
        method: "PUT",
        signal: controller.signal,
        dispatcher: keepAliveAgent,
        headers: {
          authorization: `Bearer ${env.RESPOND_IO_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(putBody),
      } as RequestInit);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        log.warn(
          { status: res.status, body: body.slice(0, 300), lifecycle: input.lifecycle },
          "respond_io update_lifecycle non-2xx",
        );
        throw new UpstreamError("respond_io", `update_lifecycle ${res.status}`, {
          status: res.status,
          body: body.slice(0, 300),
        });
      }
      log.info(
        { contactId: input.contactId, lifecycle: input.lifecycle },
        "respond_io update_lifecycle ok",
      );
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") {
        throw new UpstreamError("respond_io", "update_lifecycle timed out", {
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
    /**
     * Optional ISO 639-1 language code (e.g. "es", "en"). When provided,
     * the PUT body includes a top-level `language` field so Miguel's
     * workflows that route on contact.language (Spanish vs English
     * branches in DPM GT - Onboarding Piloto) get the right value.
     * Skipped from the PUT body when null/undefined so we never overwrite
     * a value Miguel set manually.
     */
    language?: string | null;
  }): Promise<void> {
    const env = loadEnv();
    const log = getLogger();
    // Filter out null/undefined AND empty strings. An empty string is not a
    // valid value for any of our typed fields (monto=number, moneda=enum,
    // codigo_referencia=text-required) and triggers 400 on some types. The
    // OCR auto-confirm path passed `meta?.deposit_amount ?? ""` which used
    // to land as empty values across the schema; filtering here means
    // missing data is silently skipped instead of corrupting the field.
    const entries = Object.entries(input.fields).filter(
      ([, v]) => v !== null && v !== undefined && !(typeof v === "string" && v.length === 0),
    );
    if (entries.length === 0) return;

    // Confirmed via Phase F variant probing on 2026-05-11: Respond.io v2's
    // legacy `PATCH /contact/id:{id}` is blocked by AWS WAF (403). The
    // canonical path is `PUT /contact/id:{id}`.
    //
    // CRITICAL #1 (2026-05-11 Ignacia incident): PUT-replace blast radius
    // wipes tags. Mitigated by reading existing tags via GET and including
    // them in the PUT body.
    //
    // CRITICAL #2 (2026-05-11 Miguel post-test inspection): the same PUT-
    // replace semantics ALSO wipe non-included fields. Each PUT was
    // clobbering previous fields. Fix: GET existing, overlay incoming,
    // PUT the union.
    //
    // CRITICAL #3 (2026-05-11 evening): the API response uses snake_case
    // `custom_fields` (array of {name, value}) and the PUT body MUST use
    // the same snake_case key. Earlier code sent `customFields` (camelCase)
    // which Respond.io silently DROPPED — the PUT returned 200 but only
    // the `tags` part of the body landed. That's why Miguel's contact had
    // monto/moneda/codigo_referencia/programa/start_date as null even
    // after multiple successful-looking PUT responses, and why the
    // Sheet Logger never had data to read.
    let existingTags: string[] = [];
    let existingFields: Record<string, unknown> = {};
    try {
      const current = await this.getContact(input.contactId);
      existingTags = current?.tags ?? [];
      existingFields = current?.customFields ?? {};
    } catch (err) {
      log.warn(
        { err: (err as Error).message, contactId: input.contactId },
        "respond_io update_custom_fields: getContact failed before merge — proceeding WITHOUT field/tag preservation",
      );
    }

    const url = `${env.RESPOND_IO_API_BASE_URL}/contact/id:${encodeURIComponent(input.contactId)}`;
    // Merge: existing fields as the base, incoming entries overlay by name.
    // Skip existing entries whose value is null/empty-string so a stale
    // empty doesn't crowd the array.
    const merged = new Map<string, unknown>();
    for (const [name, value] of Object.entries(existingFields)) {
      if (value === null || value === undefined) continue;
      if (typeof value === "string" && value.length === 0) continue;
      merged.set(name, value);
    }
    for (const [name, value] of entries) {
      merged.set(name, value);
    }
    const customFields = Array.from(merged, ([name, value]) => ({
      name,
      value: coerceCustomFieldValueForPut(name, value),
    }));
    // PUT body MUST use snake_case `custom_fields`. CamelCase is silently
    // dropped by Respond.io v2 — see CRITICAL #3 above.
    const putBody: Record<string, unknown> = { custom_fields: customFields };
    if (existingTags.length > 0) {
      putBody.tags = existingTags;
    }
    if (input.language) {
      putBody.language = input.language;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUTS.RESPOND_IO_MS);
    try {
      const res = await undiciFetch(url, {
        method: "PUT",
        signal: controller.signal,
        dispatcher: keepAliveAgent,
        headers: {
          authorization: `Bearer ${env.RESPOND_IO_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(putBody),
      } as RequestInit);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        log.warn(
          { status: res.status, body: body.slice(0, 300), fields: entries.map(([k]) => k) },
          "respond_io update_custom_fields non-2xx",
        );
        throw new UpstreamError("respond_io", `update_custom_fields ${res.status}`, {
          status: res.status,
          body: body.slice(0, 300),
        });
      }
      log.info(
        {
          contactId: input.contactId,
          incomingFields: entries.map(([k]) => k),
          preservedFields: Array.from(merged.keys()).filter(
            (k) => !entries.some(([ek]) => ek === k),
          ),
          totalFields: customFields.length,
        },
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
/**
 * Names of Respond.io custom fields that are typed as number in Miguel's
 * workspace schema. When we PUT these we MUST send a number — sending a
 * string (even one that looks numeric) is rejected with
 * `400: <name>: Invalid value`.
 *
 * The wrinkle: Respond.io v2 GET returns these fields as strings (e.g.
 * `monto = "40"`), so when we read existing custom_fields back to
 * preserve them in a partial PUT, we need to coerce them back to numbers
 * or the entire PUT fails. This silent failure burned the 2026-05-12
 * tony test — every lifecycle update fired but landed as 400 because the
 * preserved `monto = "40"` (string from prior store) triggered the
 * validator before any of the lifecycle/custom_field payload could be
 * applied. Errors were swallowed by the fire-and-forget pattern.
 */
const NUMERIC_CUSTOM_FIELDS = new Set(["monto", "pax"]);

function coerceCustomFieldValueForPut(
  name: string,
  value: unknown,
): unknown {
  if (!NUMERIC_CUSTOM_FIELDS.has(name)) return value;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  return value;
}

function isUnresolvedTemplate(value: string | null | undefined): boolean {
  if (!value) return true;
  if (value.startsWith("$")) return true;
  if (value.startsWith("{{") || value.startsWith("{$")) return true;
  if (value.startsWith("tmp_")) return true;
  return false;
}

export const respondIoClient = new RespondIoClient();

/**
 * Map our internal `lead_stage` values to Respond.io contact lifecycle
 * labels. This is the contract Miguel's workflow trigger conditions can
 * filter on (e.g. "Lifecycle changes to Customer" fires the Onboarding
 * Piloto chain). Adding a new lead_stage will fail to compile here —
 * intentional, so an operator-visible field doesn't drift silently.
 *
 * `null` means "don't push" — used for transient stages we don't want to
 * surface (e.g. server-only `qualified` doesn't yet have a stable
 * Respond.io meaning).
 */
export const RESPOND_IO_LIFECYCLE_BY_LEAD_STAGE: Record<
  | "new"
  | "qualified"
  | "proposed"
  | "deposit_pending"
  | "deposit_paid"
  | "handed_off"
  | "closed"
  | "lost",
  string | null
> = {
  new: "New Lead",
  qualified: "Engaging",
  proposed: "Engaging",
  deposit_pending: "Following Up",
  deposit_paid: "Customer",
  handed_off: "Customer",
  closed: "Customer",
  lost: "Lost Lead",
};
