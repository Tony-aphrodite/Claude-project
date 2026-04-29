// ============================================================================
// PII auto-deletion (12-month retention by default — guide §16 #8 / §8 schema).
// Runs once per hour. Two triggers per row:
//   1. pii_retention_until is in the past (whatever was set at write time).
//   2. pii_deletion_requested = true (GDPR-style on-demand request).
//
// We delete the message bodies + client name + phone but keep the row's
// shell so analytics keep working. This satisfies both "right to be
// forgotten" and our need to count past conversations.
// ============================================================================

import { eq, lt, or, sql } from "drizzle-orm";

import { conversaciones, getDb, mensajes } from "@dpm/db";

import { getLogger } from "../logger.js";

const REDACTED_PHONE = "redacted";
const REDACTED_NAME = null;
const REDACTED_BODY = "[redacted by retention policy]";

export class PiiRetentionService {
  async runOnce(): Promise<{ conversationsRedacted: number; messagesRedacted: number }> {
    const db = getDb();
    const log = getLogger();

    const eligible = await db
      .select({ id: conversaciones.id })
      .from(conversaciones)
      .where(
        or(
          eq(conversaciones.piiDeletionRequested, true),
          lt(conversaciones.piiRetentionUntil, new Date()),
        ),
      );

    if (eligible.length === 0) return { conversationsRedacted: 0, messagesRedacted: 0 };

    const ids = eligible.map((r) => r.id);
    let messagesRedacted = 0;
    let conversationsRedacted = 0;

    // Process in chunks to avoid one giant transaction.
    const CHUNK = 100;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const msgRes = await db
        .update(mensajes)
        .set({ content: REDACTED_BODY, metadata: null })
        .where(sql`${mensajes.conversacionId} = ANY(${chunk})`)
        .returning({ id: mensajes.id });
      messagesRedacted += msgRes.length;

      const convRes = await db
        .update(conversaciones)
        .set({
          clientName: REDACTED_NAME,
          clientPhone: REDACTED_PHONE,
          piiDeletionRequested: false,
          piiRetentionUntil: null,
          status: "closed",
        })
        .where(sql`${conversaciones.id} = ANY(${chunk})`)
        .returning({ id: conversaciones.id });
      conversationsRedacted += convRes.length;
    }

    log.info({ conversationsRedacted, messagesRedacted }, "pii retention pass");
    return { conversationsRedacted, messagesRedacted };
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
