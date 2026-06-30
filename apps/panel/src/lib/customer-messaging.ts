// ============================================================================
// Outbound customer messaging — provider abstraction.
//
// Why this lives behind an interface:
//
//   Miguel 2026-06-12 resilience-layer message, component #8: "Capa de
//   envío abstraída → poder cambiar de Respond a Meta directo sin
//   reescribir". Every panel feature that talks to the customer — the
//   operator inbox (this file's first consumer), future quick-replies,
//   future auto-respuesta de respaldo — should call ONE function
//   (`sendCustomerMessage`) and never care which downstream API
//   actually delivers the bytes.
//
//   Today: routes to Respond.io (the channel we're contracted on).
//   Tomorrow: flip `OUTBOUND_PROVIDER=meta_direct` in env, finish the
//   MetaDirectProvider implementation, no caller changes.
//
// Provider selection:
//
//   OUTBOUND_PROVIDER env var
//     - unset / "respond_io"  → RespondIoProvider (default)
//     - "meta_direct"          → MetaDirectProvider (not yet implemented)
//
//   We DON'T do per-conversation provider override today (would require
//   a column on conversaciones + admin UI). When that becomes a real
//   need, swap `getProvider()` for a `getProviderFor(conversation)`
//   resolver — the consumer signature doesn't change.
//
// Error policy:
//
//   Providers throw on transport failure (network, 5xx, timeout).
//   They return `{ ok: false, error }` on application-level rejection
//   (4xx, invalid recipient, etc.) so the caller can render an inline
//   error without crashing the page. The panel's `runAction` wrapper
//   turns either kind into `{ ok: false, error }` for ActionForm —
//   consumers don't have to handle both.
// ============================================================================

export interface OutboundSendInput {
  /** Respond.io conversation UUID (today's primary key). */
  respondIoConversationId: string;
  /** Respond.io contact ID — fallback when conversation id is unresolved. */
  respondIoContactId: string;
  /** Customer-facing text. Plain text only; no markdown / templates. */
  text: string;
  /** Email of the operator sending — for audit, not transport. */
  operatorEmail: string;
  /** Supabase user UUID of the operator — for audit, not transport. */
  operatorUserId: string;
  /**
   * Optional idempotency key. Future providers (Meta) accept this to
   * dedupe retries. Today's RespondIoProvider ignores it; we accept
   * it now so we don't have to widen the interface later.
   */
  idempotencyKey?: string;
}

export type OutboundSendResult =
  | {
      ok: true;
      provider: ProviderName;
      /** Provider-assigned message id, if returned. */
      providerMessageId?: string;
    }
  | {
      ok: false;
      provider: ProviderName;
      error: string;
    };

export type ProviderName = "respond_io" | "meta_direct";

/** Minimal interface every outbound provider must implement. */
export interface OutboundMessageProvider {
  readonly name: ProviderName;
  send(input: OutboundSendInput): Promise<OutboundSendResult>;
}

// ── Respond.io provider (today's default) ─────────────────────────────────

class RespondIoProvider implements OutboundMessageProvider {
  readonly name = "respond_io" as const;

  async send(input: OutboundSendInput): Promise<OutboundSendResult> {
    const apiKey = process.env.RESPOND_IO_API_KEY;
    const baseUrl =
      process.env.RESPOND_IO_API_BASE_URL ?? "https://api.respond.io/v2";
    if (!apiKey) {
      return {
        ok: false,
        provider: this.name,
        error:
          "RESPOND_IO_API_KEY no configurada en el panel — el operador no puede enviar mensajes",
      };
    }

    // Respond.io behaviour (verified 2026-05-10): the conversation
    // endpoint sometimes returns 404 if Respond.io has rolled the
    // conversation id over to a new one. The /contact endpoint always
    // resolves to the customer's current open conversation, so we use
    // it as the canonical path when the conversation id looks unresolved
    // (placeholder template, empty, or obviously synthetic).
    const useContactFallback =
      !input.respondIoConversationId ||
      input.respondIoConversationId.startsWith("{{") ||
      input.respondIoConversationId === "unresolved";

    const url = useContactFallback
      ? `${baseUrl}/contact/id:${encodeURIComponent(input.respondIoContactId)}/message`
      : `${baseUrl}/conversation/${encodeURIComponent(input.respondIoConversationId)}/message`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        // The Respond.io v2 /contact/id:{id}/message endpoint REJECTS
        // `channelId` as an invalid field (verified 2026-05-10 — see
        // `apps/server/src/services/respond-io.ts` for the source
        // incident). Channel disambiguation happens implicitly via the
        // contact's primary channel. Do NOT add channelId here.
        body: JSON.stringify({
          message: { type: "text", text: input.text },
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return {
          ok: false,
          provider: this.name,
          error: `Respond.io devolvió ${res.status}: ${body.slice(0, 200)}`,
        };
      }

      // Respond.io v2 returns a JSON body with message metadata on
      // success. Don't fail if parsing breaks — the send already
      // worked, the provider id is just nice-to-have for audit.
      let providerMessageId: string | undefined;
      try {
        const json = (await res.json()) as { message?: { id?: string | number } };
        if (json.message?.id !== undefined) {
          providerMessageId = String(json.message.id);
        }
      } catch {
        // Parse failure is non-fatal — the send is committed upstream.
      }

      return {
        ok: true,
        provider: this.name,
        ...(providerMessageId !== undefined ? { providerMessageId } : {}),
      };
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") {
        return {
          ok: false,
          provider: this.name,
          error: "Respond.io tardó más de 8s — reintentá en unos segundos",
        };
      }
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        provider: this.name,
        error: `Error enviando vía Respond.io: ${message}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

// ── Meta direct provider (stub — implement when Miguel says go) ───────────

class MetaDirectProvider implements OutboundMessageProvider {
  readonly name = "meta_direct" as const;

  async send(_input: OutboundSendInput): Promise<OutboundSendResult> {
    // Placeholder. When we wire Meta WhatsApp Business API directly:
    //   1. Acquire long-lived access token + phone-number-id (env).
    //   2. POST https://graph.facebook.com/v22.0/{phone-number-id}/messages
    //      body: { messaging_product: "whatsapp", to, text: { body } }
    //   3. Parse `messages[0].id` for provider id.
    //   4. Map Meta error codes to user-friendly Spanish messages.
    //   5. Honour 24h customer-service window — outside it requires
    //      template messages, which is a different code path.
    //
    // Until then, return a clear error so flipping the env var by
    // mistake produces a recoverable banner, not a crash.
    return {
      ok: false,
      provider: this.name,
      error:
        "Provider 'meta_direct' aún no implementado. Setea OUTBOUND_PROVIDER=respond_io (o quitalo) hasta tener la integración Meta lista.",
    };
  }
}

// ── Provider selection ────────────────────────────────────────────────────

let _cachedProvider: OutboundMessageProvider | undefined;

function getProvider(): OutboundMessageProvider {
  if (_cachedProvider) return _cachedProvider;
  const name = process.env.OUTBOUND_PROVIDER?.trim() ?? "respond_io";
  _cachedProvider =
    name === "meta_direct" ? new MetaDirectProvider() : new RespondIoProvider();
  return _cachedProvider;
}

/**
 * Public API — every caller in the panel goes through this single function.
 * The selected provider is cached for the process lifetime (Next.js
 * server lambdas are short-lived so cache freshness is naturally bounded).
 */
export async function sendCustomerMessage(
  input: OutboundSendInput,
): Promise<OutboundSendResult> {
  return getProvider().send(input);
}

/**
 * Test-only escape hatch. Used by future unit tests to inject a mock
 * provider without polluting env. Kept out of the default export so it
 * doesn't show up in autocomplete for production code paths.
 */
export function __setProviderForTest(p: OutboundMessageProvider | undefined): void {
  _cachedProvider = p;
}
