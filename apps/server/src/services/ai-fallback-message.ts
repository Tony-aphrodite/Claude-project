// ============================================================================
// AI fallback messenger — Miguel 2026-06-12 resilience layer #3.
//
// "Si la AI no responde en X segundos o está caída, que salga
//  automáticamente un mensaje tipo '¡Gracias! En un momento te
//  atendemos', para que el cliente nunca reciba silencio total."
//
// When `callClaude(...)` throws (Anthropic 5xx, timeout, network drop,
// tool execution explosion, etc.), the surrounding handler used to
// just bubble the error up — the customer received nothing. With this
// module, the handler catches the throw, calls `sendAiFallbackMessage`,
// and the customer sees a holding-pattern message immediately while
// the operator gets paged separately (resilience layer #4, future).
//
// What this DOESN'T do (intentionally):
//
//   - Doesn't try to "save the conversation" by retrying Claude. One
//     transient failure can be retried by the customer's next message;
//     the fallback's job is to acknowledge, not to substitute the AI.
//   - Doesn't bump lead_stage. The conversation stays where it was —
//     the AI's flow can pick up on the next inbound, no state drift.
//   - Doesn't fire a separate workflow. The Respond.io workflows that
//     react to outgoing messages don't need to react to this one.
//
// Anti-spam: a per-conversation cooldown ensures we don't pile fallback
// after fallback if the customer sends 5 messages in 30 seconds while
// the AI is genuinely down. The cooldown is read from the mensajes
// table (last sender='system' + metadata.type='ai_fallback'), so we
// don't need a separate state field anywhere.
// ============================================================================

import { and, desc, eq, sql } from "drizzle-orm";

import { getDb, mensajes } from "@dpm/db";

import { getLogger } from "../logger.js";
import { respondIoClient } from "./respond-io.js";

/**
 * Per-language fallback text. Pinned to a few common language codes the
 * AI panel actually sees. Unknown languages fall back to Spanish — the
 * default operating language for DPM's sedes.
 *
 * Keep these short (one line each, no markdown) — they have to look
 * natural on WhatsApp's plain-text rendering and not compete with
 * whatever the AI would normally say.
 */
const FALLBACK_ES =
  "¡Gracias por tu mensaje! 🙏 Estamos teniendo demoras técnicas. En unos minutos te atendemos.";

const FALLBACK_MESSAGES: Record<string, string> = {
  es: FALLBACK_ES,
  en: "Thanks for your message! 🙏 We're experiencing a brief technical delay. Someone will reply shortly.",
  pt: "Obrigado pela tua mensagem! 🙏 Estamos com um pequeno atraso técnico. Já te respondemos.",
  fr: "Merci pour ton message ! 🙏 Nous avons un petit délai technique. On revient vers toi dans quelques minutes.",
  de: "Danke für deine Nachricht! 🙏 Wir haben eine kurze technische Verzögerung. Wir melden uns gleich.",
  it: "Grazie per il tuo messaggio! 🙏 Stiamo riscontrando un breve ritardo tecnico. Ti rispondiamo a breve.",
  nl: "Bedankt voor je bericht! 🙏 We hebben een kort technisch oponthoud. We reageren zo.",
  ru: "Спасибо за сообщение! 🙏 У нас небольшая техническая задержка. Скоро ответим.",
};

function pickFallbackText(language: string | null | undefined): string {
  if (!language) return FALLBACK_ES;
  const code = language.toLowerCase().slice(0, 2);
  return FALLBACK_MESSAGES[code] ?? FALLBACK_ES;
}

/**
 * Cooldown window between back-to-back fallbacks on the same
 * conversation. 10 minutes is long enough that one Anthropic outage
 * doesn't generate a fallback per customer-message, short enough that
 * a recovery + fresh outage produces a fresh notice.
 */
const FALLBACK_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * Check whether we've already sent a fallback to this conversation
 * within the cooldown window. Reads the most recent `system` message
 * with metadata.type='ai_fallback' — no separate state to keep in sync.
 */
async function isRecentFallback(conversacionId: string): Promise<boolean> {
  const db = getDb();
  const cutoff = new Date(Date.now() - FALLBACK_COOLDOWN_MS);
  const [row] = await db
    .select({ at: mensajes.createdAt })
    .from(mensajes)
    .where(
      and(
        eq(mensajes.conversacionId, conversacionId),
        eq(mensajes.sender, "system"),
        sql`${mensajes.metadata} ->> 'type' = 'ai_fallback'`,
        sql`${mensajes.createdAt} >= ${cutoff.toISOString()}`,
      ),
    )
    .orderBy(desc(mensajes.createdAt))
    .limit(1);
  return !!row;
}

export type FallbackResult =
  | { ok: true; sent: true; reason?: string }
  | { ok: true; sent: false; reason: "cooldown" | "missing_respond_io_ids" }
  | { ok: false; sent: false; error: string };

/**
 * Send the holding-pattern message + persist a system row so we leave
 * a paper trail (and so the cooldown check has something to compare
 * against on the next failure).
 *
 * Returns `ok:true` even when we DIDN'T send (because we shouldn't —
 * cooldown / missing IDs). The caller doesn't have to handle that
 * separately; the only `ok:false` case is when the send itself blew up.
 */
export async function sendAiFallbackMessage(input: {
  conversacionId: string;
  respondIoConversationId: string | null | undefined;
  respondIoContactId: string;
  language: string | null | undefined;
  /** What failed upstream — captured into the mensajes metadata for forensics. */
  reasonInternal: string;
}): Promise<FallbackResult> {
  const log = getLogger();
  const {
    conversacionId,
    respondIoConversationId,
    respondIoContactId,
    language,
    reasonInternal,
  } = input;

  if (!respondIoContactId) {
    return { ok: true, sent: false, reason: "missing_respond_io_ids" };
  }

  // Anti-spam: if we already sent a fallback recently, just log and skip.
  // The customer is already holding on the previous one; piling another
  // identical line on top would look broken.
  if (await isRecentFallback(conversacionId)) {
    log.info(
      { conversacionId, reasonInternal },
      "ai-fallback: skipping — fallback already sent within cooldown window",
    );
    return { ok: true, sent: false, reason: "cooldown" };
  }

  const text = pickFallbackText(language);

  // Send via the existing Respond.io client. We pass conversationId when
  // we have it (the normal path); if it's missing we let respondIoClient
  // do its contact-fallback (the same path the AI silence + R2 fix
  // already use elsewhere).
  try {
    await respondIoClient.sendMessage({
      conversationId: respondIoConversationId ?? "unresolved",
      contactId: respondIoContactId,
      text,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(
      { err: message, conversacionId, reasonInternal },
      "ai-fallback: Respond.io send failed — customer is in true silence",
    );
    return { ok: false, sent: false, error: message };
  }

  // Persist the fallback so:
  //   1. The cooldown check has something to find next time.
  //   2. The /conversations/[id] history shows what the customer saw.
  //   3. Operator analytics can count fallbacks per sede / per hour.
  try {
    await getDb()
      .insert(mensajes)
      .values({
        conversacionId,
        sender: "system",
        agenteName: null,
        content: text,
        metadata: {
          type: "ai_fallback",
          reason: reasonInternal,
          language: language ?? "es",
        },
      });
  } catch (err) {
    // Persist failure is bad but not catastrophic — the customer DID
    // get the fallback. Log loudly so we notice; the next fallback
    // attempt within the cooldown window will misfire because we
    // can't find the row, but that's strictly less bad than silence.
    log.error(
      {
        err: err instanceof Error ? err.message : String(err),
        conversacionId,
      },
      "ai-fallback: send succeeded but DB persist failed — fallback not recorded",
    );
  }

  log.warn(
    { conversacionId, reasonInternal, language: language ?? "es" },
    "ai-fallback: sent holding-pattern reply (AI failed upstream)",
  );

  return { ok: true, sent: true };
}
