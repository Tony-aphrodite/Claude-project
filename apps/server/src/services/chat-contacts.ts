// ============================================================================
// chat_contacts service. The ONLY place in the system that writes per-person
// identity data — phone, name, language, tags, sede assignment.
//
// Architectural rule (project guide §8 + 2026-04-30 owner directive):
//   The PRIMARY KEY is Respond.io's contact_id verbatim. We do NOT mint a UUID
//   surrogate, because the owner runs a separate operational system (payments
//   registry) that joins on the same external key. A surrogate would force
//   future re-keying / dedupe — exactly what this design avoids.
//
// Both the conversation handler and the (future) spy webhook funnel through
// `upsertFromWebhook` so the row is created/refreshed exactly once per inbound
// event regardless of which entry point saw the message first.
// ============================================================================

import { eq } from "drizzle-orm";

import {
  chatContacts,
  getDb,
  type ChatContact,
  type NewChatContact,
} from "@dpm/db";

import { PII_RETENTION_DAYS } from "@dpm/shared";

export type ContactSyncInput = {
  respondIoContactId: string;
  phone?: string | null | undefined;
  name?: string | null | undefined;
  language?: string | null | undefined;
  tags?: string[] | undefined;
  sedeId?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export class ChatContactsService {
  /**
   * Upsert a contact from an inbound webhook payload. New rows get a
   * pii_retention_until set to today + PII_RETENTION_DAYS; existing rows have
   * their last_synced_at refreshed and any non-empty fields overwritten with
   * the latest values from Respond.io. Empty incoming values do NOT clobber
   * existing data (e.g. if Respond.io stops sending `name`, we keep ours).
   */
  async upsertFromWebhook(input: ContactSyncInput): Promise<ChatContact> {
    const db = getDb();
    const now = new Date();
    const retentionUntil = new Date(
      now.getTime() + PII_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    const newRow: NewChatContact = {
      respondIoContactId: input.respondIoContactId,
      phone: input.phone ?? null,
      name: input.name ?? null,
      language: input.language ?? null,
      tags: input.tags ?? [],
      sedeId: input.sedeId ?? null,
      metadata: input.metadata ?? null,
      lastSyncedAt: now,
      piiRetentionUntil: retentionUntil,
    };

    const [row] = await db
      .insert(chatContacts)
      .values(newRow)
      .onConflictDoUpdate({
        target: chatContacts.respondIoContactId,
        set: {
          // COALESCE-style merge: prefer fresh value when present, else keep.
          phone: input.phone ?? undefined,
          name: input.name ?? undefined,
          language: input.language ?? undefined,
          tags: input.tags ?? undefined,
          sedeId: input.sedeId ?? undefined,
          metadata: input.metadata ?? undefined,
          lastSyncedAt: now,
        },
      })
      .returning();

    if (!row) {
      throw new Error(
        `chat_contacts upsert returned no row for ${input.respondIoContactId}`,
      );
    }
    return row;
  }

  async findById(respondIoContactId: string): Promise<ChatContact | null> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(chatContacts)
      .where(eq(chatContacts.respondIoContactId, respondIoContactId))
      .limit(1);
    return row ?? null;
  }

  /** Mark a contact for PII deletion on the next retention pass. */
  async requestDeletion(respondIoContactId: string): Promise<void> {
    const db = getDb();
    await db
      .update(chatContacts)
      .set({ piiDeletionRequested: true })
      .where(eq(chatContacts.respondIoContactId, respondIoContactId));
  }
}

export const chatContactsService = new ChatContactsService();
