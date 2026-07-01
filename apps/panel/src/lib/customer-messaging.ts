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
  /**
   * Customer's WhatsApp phone in E.164 format (e.g. "+34612345678").
   * REQUIRED for `meta_direct` provider; ignored by `respond_io` (it
   * looks up the channel via contact id). Callers can pass the value
   * from `chat_contacts.phone`.
   */
  customerPhone?: string | null;
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

    // Miguel 2026-07-01 #4 — Respond.io returns 404 when the stored
    // `respondIoConversationId` has been rolled to a new one on their
    // side. The `/contact/id:{id}/message` endpoint always resolves to
    // the customer's current open conversation, so we use it as the
    // ONLY path. The `/conversation/<id>/message` variant offered no
    // measurable benefit and produced repeated 404s in the wild
    // (Miguel: Jose Mora / GA / 248200040 · 2026-07-01).
    if (!input.respondIoContactId) {
      return {
        ok: false,
        provider: this.name,
        error:
          "El contact_id de Respond.io no está disponible para esta conversación. No podemos enviar sin él — pasalo a Miguel para revisar la sincronización.",
      };
    }
    const url = `${baseUrl}/contact/id:${encodeURIComponent(input.respondIoContactId)}/message`;

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

// ── Meta direct provider — full implementation ────────────────────────────

class MetaDirectProvider implements OutboundMessageProvider {
  readonly name = "meta_direct" as const;

  async send(input: OutboundSendInput): Promise<OutboundSendResult> {
    const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
    const apiVersion = process.env.META_WHATSAPP_API_VERSION ?? "v22.0";

    if (!phoneNumberId || !accessToken) {
      return {
        ok: false,
        provider: this.name,
        error:
          "Credenciales de Meta no configuradas. Setea META_WHATSAPP_PHONE_NUMBER_ID y META_WHATSAPP_ACCESS_TOKEN en Vercel (o volvé a OUTBOUND_PROVIDER=respond_io).",
      };
    }
    if (!input.customerPhone) {
      return {
        ok: false,
        provider: this.name,
        error:
          "El número de WhatsApp del cliente no está disponible. Probable causa: chat_contacts.phone está vacío para este contacto. Volvé a OUTBOUND_PROVIDER=respond_io o llená el teléfono.",
      };
    }

    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
    // Meta accepts E.164 without the leading "+"; tolerate both forms
    // by always stripping. If the caller passed something else (local
    // number, missing country code), Meta returns error 132000 and we
    // surface a clear message.
    const to = input.customerPhone.trim().replace(/^\+/, "");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: {
            body: input.text,
            // preview_url=false avoids Meta auto-fetching link
            // previews — fast + predictable; operators can copy URLs
            // without surprises.
            preview_url: false,
          },
        }),
      });

      if (!res.ok) {
        let errCode: number | undefined;
        let errMessage: string | undefined;
        try {
          const body = (await res.json()) as {
            error?: { code?: number; message?: string };
          };
          errCode = body.error?.code;
          errMessage = body.error?.message;
        } catch {
          errMessage = (await res.text().catch(() => "")) || `HTTP ${res.status}`;
        }
        return {
          ok: false,
          provider: this.name,
          error: mapMetaError(errCode, errMessage, res.status),
        };
      }

      let providerMessageId: string | undefined;
      try {
        const json = (await res.json()) as {
          messages?: Array<{ id?: string }>;
        };
        if (json.messages?.[0]?.id) {
          providerMessageId = json.messages[0].id;
        }
      } catch {
        // Non-fatal — Meta accepted the send; the id is for our audit.
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
          error: "Meta API tardó más de 8s — reintentá en unos segundos",
        };
      }
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        provider: this.name,
        error: `Error enviando vía Meta directo: ${message}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Map Meta WhatsApp Business API error codes to operator-friendly
 * Spanish messages. Codes covered are the realistic ones for our send
 * flow; unknown codes fall through to a generic format with the raw
 * Meta message preserved so we don't hide debugging info.
 *
 * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 */
function mapMetaError(
  code: number | undefined,
  message: string | undefined,
  httpStatus: number,
): string {
  const raw = message ?? "sin mensaje";
  switch (code) {
    case 100:
      // Generic invalid-parameter; Meta returns this for many shapes,
      // surface the raw Meta message so the operator sees the field.
      return `Parámetro inválido (Meta 100): ${raw}`;
    case 131047:
      // 24-hour customer service window expired. Free-form text is no
      // longer allowed — operator needs a Meta-approved template.
      return "El cliente lleva más de 24h sin escribirnos. Meta no permite enviar texto libre fuera de esa ventana; hay que usar una plantilla aprobada (template). Considerá pedirle al cliente que mande primero un mensaje para reabrir la ventana.";
    case 131051:
      return "Tipo de mensaje no soportado por Meta para este canal.";
    case 131056:
      // Pair rate limit (per recipient).
      return "Demasiados mensajes a este número en poco tiempo. Esperá 30 segundos y reintentá.";
    case 132000:
      return "El número del cliente no está registrado en WhatsApp.";
    case 190:
      return "Access token de Meta expirado o inválido. Renovar en Meta Business Manager > WhatsApp > Configuration.";
    case 200:
      return "El access token de Meta no tiene permiso para enviar mensajes (whatsapp_business_messaging scope).";
    case 80007:
      return "Rate limit alcanzado en la API de Meta. Esperá ~1 minuto.";
    case undefined:
      return `Meta API devolvió HTTP ${httpStatus} sin código de error: ${raw}`;
    default:
      return `Meta API devolvió error ${code}: ${raw}`;
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
