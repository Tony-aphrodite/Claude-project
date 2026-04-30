// ============================================================================
// PII auto-deletion (12-month retention by default — guide §16 #8 / §8 schema).
// Runs once per hour. Two triggers per chat_contacts row:
//   1. pii_retention_until is in the past.
//   2. pii_deletion_requested = true (GDPR-style on-demand request).
//
// Identity for clients now lives in chat_contacts; that's where we redact
// phone/name/language. Message bodies still carry free-text PII so we also
// scrub `mensajes.content` for every conversation tied to redacted contacts.
// Conversation rows themselves are kept (status -> "closed") so analytics keep
// counting historical activity, but they only point to a redacted contact.
// ============================================================================

import { eq, lt, or, sql } from "drizzle-orm";

import {
  chatContacts,
  conversaciones,
  getDb,
  mensajes,
} from "@dpm/db";

import { getLogger } from "../logger.js";

const REDACTED_PHONE = "redacted";
const REDACTED_NAME = null;
const REDACTED_BODY = "[redacted by retention policy]";

export class PiiRetentionService {
  async runOnce(): Promise<{
    contactsRedacted: number;
    messagesRedacted: number;
    conversationsClosed: number;
  }> {
    const db = getDb();
    const log = getLogger();

    const eligible = await db
      .select({ id: chatContacts.respondIoContactId })
      .from(chatContacts)
      .where(
        or(
          eq(chatContacts.piiDeletionRequested, true),
          lt(chatContacts.piiRetentionUntil, new Date()),
        ),
      );

    if (eligible.length === 0) {
      return { contactsRedacted: 0, messagesRedacted: 0, conversationsClosed: 0 };
    }

    const ids = eligible.map((r) => r.id);
    let messagesRedacted = 0;
    let contactsRedacted = 0;
    let conversationsClosed = 0;

    // Process in chunks to avoid one giant transaction.
    const CHUNK = 100;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);

      // Redact every message body that belongs to any conversation owned by
      // these contacts. We scrub by joining through conversaciones.
      const msgRes = await db
        .update(mensajes)
        .set({ content: REDACTED_BODY, metadata: null, fuentes: null })
        .where(
          sql`${mensajes.conversacionId} IN (
            SELECT id FROM conversaciones
             WHERE respond_io_contact_id = ANY(${chunk})
          )`,
        )
        .returning({ id: mensajes.id });
      messagesRedacted += msgRes.length;

      // Close the threads — they are not deletable for analytics, but they
      // should not look "active" to the follow-up scanner anymore.
      const convRes = await db
        .update(conversaciones)
        .set({ status: "closed" })
        .where(sql`${conversaciones.respondIoContactId} = ANY(${chunk})`)
        .returning({ id: conversaciones.id });
      conversationsClosed += convRes.length;

      const contactRes = await db
        .update(chatContacts)
        .set({
          phone: REDACTED_PHONE,
          name: REDACTED_NAME,
          language: null,
          metadata: null,
          piiDeletionRequested: false,
          piiRetentionUntil: null,
        })
        .where(sql`${chatContacts.respondIoContactId} = ANY(${chunk})`)
        .returning({ id: chatContacts.respondIoContactId });
      contactsRedacted += contactRes.length;
    }

    log.info(
      { contactsRedacted, messagesRedacted, conversationsClosed },
      "pii retention pass",
    );
    return { contactsRedacted, messagesRedacted, conversationsClosed };
  }
}

export const piiRetention = new PiiRetentionService();

export type PiiCronHandle = { stop: () => void };

export function startPiiRetentionCron(): PiiCronHandle {
  const log = getLogger();
  const HOUR_MS = 60 * 60 * 1000;
  const timer = setInterval(() => {
    piiRetention.runOnce().catch((err) => log.error({ err }, "pii retention failed"));
  }, HOUR_MS);
  // Run at boot so freshly-deployed instances catch up.
  void piiRetention.runOnce().catch(() => {});
  return { stop: () => clearInterval(timer) };
}
