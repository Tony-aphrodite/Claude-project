// ============================================================================
// Admin / ops endpoints. Behind a single bearer token (ADMIN_RESET_TOKEN env)
// so operators can run housekeeping actions without exposing them to the
// general webhook layer. Today this file ships exactly one endpoint:
//
//   POST /admin/reset-conversation
//
// Use case: during the GT pilot day-interno (2026-05-11), a tester wants to
// rerun a scenario (e.g. retry the OW happy path) from the same WhatsApp
// number without the AI carrying over context from the previous run.
// Respond.io's "close conversation + remove tag" flow doesn't propagate to
// our server — the conversaciones row + mensajes history persist, so the
// next inbound resumes mid-flow.
//
// This endpoint hard-resets server-side state for a contact:
//   • DELETE every mensajes row for the contact's conversaciones
//   • UPDATE the conversaciones row(s) → lead_stage='new',
//     lead_metadata=null, status='active', closed_at=null
//   • Leave the chat_contacts row alone (identity is preserved)
//
// Side effects on Respond.io are out of scope — operators still close the
// conversation in the Respond.io UI separately if they want a clean
// conversation thread in the panel.
// ============================================================================

import type { FastifyInstance } from "fastify";

import { eq, inArray } from "drizzle-orm";

import {
  chatContacts,
  conversaciones,
  getDb,
  mensajes,
} from "@dpm/db";

import { loadEnv } from "../env.js";

export async function adminRoutes(app: FastifyInstance) {
  const env = loadEnv();

  app.post("/admin/reset-conversation", async (req, reply) => {
    // Auth: require Bearer token configured in env. Refuse outright when
    // env is empty so a misconfigured deploy can't accidentally expose a
    // destructive endpoint.
    const expected = env.ADMIN_RESET_TOKEN;
    if (!expected) {
      return reply.status(503).send({
        error: { code: "admin_disabled", message: "ADMIN_RESET_TOKEN not configured" },
      });
    }
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${expected}`) {
      req.log.warn("admin reset auth rejected");
      return reply.status(401).send({ error: { code: "unauthorized" } });
    }

    const body = (req.body ?? {}) as {
      contactId?: string;
      phone?: string;
    };
    if (!body.contactId && !body.phone) {
      return reply.status(400).send({
        error: {
          code: "bad_request",
          message: "Provide either contactId or phone in the JSON body.",
        },
      });
    }

    const db = getDb();

    // Resolve the Respond.io contact id(s) to operate on.
    let contactIds: string[] = [];
    if (body.contactId) {
      contactIds = [String(body.contactId)];
    } else if (body.phone) {
      const matches = await db
        .select({ id: chatContacts.respondIoContactId })
        .from(chatContacts)
        .where(eq(chatContacts.phone, body.phone));
      contactIds = matches.map((m) => m.id);
    }

    if (contactIds.length === 0) {
      return reply.send({
        ok: true,
        reset: 0,
        message: "no matching contact",
      });
    }

    // Find all conversations for those contacts.
    const convs = await db
      .select({ id: conversaciones.id })
      .from(conversaciones)
      .where(inArray(conversaciones.respondIoContactId, contactIds));
    if (convs.length === 0) {
      return reply.send({
        ok: true,
        reset: 0,
        contactIds,
        message: "contact found but no conversations to reset",
      });
    }
    const convIds = convs.map((c) => c.id);

    // Delete all message history so the AI's recentMessages() window
    // returns nothing — the next inbound starts a fresh dialogue.
    const deletedMsgs = await db
      .delete(mensajes)
      .where(inArray(mensajes.conversacionId, convIds))
      .returning({ id: mensajes.id });

    // Reset state on the conversations themselves.
    const now = new Date();
    await db
      .update(conversaciones)
      .set({
        leadStage: "new",
        leadMetadata: null,
        leadStageChangedAt: now,
        status: "active",
        followUpState: null,
        closedAt: null,
        updatedAt: now,
      })
      .where(inArray(conversaciones.id, convIds));

    req.log.info(
      {
        contactIds,
        resetConversations: convIds.length,
        deletedMessages: deletedMsgs.length,
      },
      "admin reset-conversation ok",
    );

    return reply.send({
      ok: true,
      contactIds,
      resetConversations: convIds.length,
      deletedMessages: deletedMsgs.length,
    });
  });
}
