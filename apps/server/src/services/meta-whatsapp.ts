// Direct Meta WhatsApp Cloud API client. Used when Respond.io's public
// REST API can't deliver a message type (specifically: WhatsApp catalog
// product cards, which Respond.io only exposes through their internal
// /ajax/message/send endpoint that requires session-cookie auth).
//
// 2026-06-04: Confirmed via probe that Respond.io public API rejects every
// shape that could carry a catalog product (whatsapp_interactive / product
// / interactive / product_message / custom_payload all 400 or 403). The
// only paths to actually deliver the card are:
//   (a) Miguel builds a workflow inside Respond.io (UI work he must do)
//   (b) Bypass Respond.io and POST directly to Meta Graph API ← this file
//
// Send goes to:
//   POST https://graph.facebook.com/v22.0/{PHONE_NUMBER_ID}/messages
// with body shape per Meta's Interactive Single Product Message docs:
//   {
//     messaging_product: "whatsapp",
//     recipient_type: "individual",
//     to: "<E.164 phone, no +>",
//     type: "interactive",
//     interactive: {
//       type: "product",
//       body: { text: "<optional caption>" },
//       action: { catalog_id, product_retailer_id }
//     }
//   }
//
// Required env vars:
//   META_WHATSAPP_PHONE_NUMBER_ID — numeric, from Meta Business Manager
//     → WhatsApp → API Setup → "Phone number ID" (NOT the +16592814080
//     phone number itself; this is an internal Meta id like 123456789).
//   META_WHATSAPP_ACCESS_TOKEN — Bearer token from Meta Business Manager
//     → Business Settings → System Users → generate a system user token
//     with whatsapp_business_messaging scope. (Or the temporary 24h token
//     under WhatsApp → API Setup, but use a permanent system-user token
//     for production.)
//
// Both must be added to Railway env before the first send call.

import { fetch as undiciFetch } from "undici";

import { loadEnv } from "../env.js";
import { UpstreamError } from "../lib/errors.js";
import { getLogger } from "../logger.js";

const META_API_VERSION = "v22.0";
const META_API_BASE = "https://graph.facebook.com";

export type MetaProductCardInput = {
  /** E.164-formatted recipient phone, with or without leading +. We strip it. */
  toPhone: string;
  /** Meta product catalog id (numeric, ~15-16 digits). */
  catalogId: string;
  /** Meta product retailer id (the per-product alphanumeric id). */
  productRetailerId: string;
  /** Optional caption text shown above the card. WhatsApp requires non-empty. */
  bodyText?: string;
};

/**
 * Send a Single Product Message (catalog card) directly via Meta WhatsApp
 * Cloud API. Throws UpstreamError on non-2xx so the caller can convert to
 * a tool result the AI can recover from (same pattern as Respond.io path).
 */
export async function sendMetaProductCard(input: MetaProductCardInput): Promise<{
  messageId: string;
}> {
  const env = loadEnv();
  const log = getLogger();

  const phoneNumberId = env.META_WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = env.META_WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    throw new UpstreamError(
      "meta_whatsapp",
      "META_WHATSAPP_PHONE_NUMBER_ID and META_WHATSAPP_ACCESS_TOKEN must be configured in env",
      { phoneNumberIdSet: !!phoneNumberId, accessTokenSet: !!accessToken },
    );
  }

  // Meta wants phone without leading +, just digits.
  const to = input.toPhone.replace(/^\+/, "").replace(/\D/g, "");
  if (!to) {
    throw new UpstreamError("meta_whatsapp", "Recipient phone is empty after normalization", {
      input: input.toPhone,
    });
  }

  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "product",
      // WhatsApp rejects body absence with code 131009 for type=product.
      // A single non-whitespace character is the documented minimum.
      body: { text: input.bodyText && input.bodyText.trim().length > 0 ? input.bodyText : "." },
      action: {
        catalog_id: input.catalogId,
        product_retailer_id: input.productRetailerId,
      },
    },
  };

  const url = `${META_API_BASE}/${META_API_VERSION}/${encodeURIComponent(phoneNumberId)}/messages`;

  const res = await undiciFetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const responseText = await res.text().catch(() => "");
  if (!res.ok) {
    log.error(
      {
        status: res.status,
        body: responseText.slice(0, 600),
        to,
        catalogId: input.catalogId,
        productRetailerId: input.productRetailerId,
      },
      "meta_whatsapp send_product_card non-2xx",
    );
    throw new UpstreamError(
      "meta_whatsapp",
      `Meta WhatsApp Cloud API returned ${res.status}`,
      {
        status: res.status,
        responsePreview: responseText.slice(0, 300),
        catalogId: input.catalogId,
        productRetailerId: input.productRetailerId,
      },
    );
  }

  let parsed: { messages?: Array<{ id: string }> } = {};
  try {
    parsed = JSON.parse(responseText);
  } catch {
    log.warn(
      { responsePreview: responseText.slice(0, 200) },
      "meta_whatsapp send_product_card 2xx but body not JSON",
    );
  }
  const messageId = parsed.messages?.[0]?.id ?? "";
  log.info(
    {
      to,
      catalogId: input.catalogId,
      productRetailerId: input.productRetailerId,
      messageId,
    },
    "meta_whatsapp send_product_card ok",
  );
  return { messageId };
}
