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
import { LEAD_STAGES, type LeadStage } from "@dpm/shared";

import { loadEnv } from "../env.js";
import { leadStageService } from "../services/lead-stage.js";
import { respondIoClient } from "../services/respond-io.js";

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

    // Strip our server-emitted tags from Respond.io so the next workflow
    // run starts clean. Miguel flagged 2026-05-12 (5-12-feedback-round2
    // §3) that the `deposit_paid` tag from earlier testing persisted on
    // the contact even after a server-side reset, polluting subsequent
    // pre-deposit flows. Fire-and-forget per contact — partial failures
    // log a warn but don't fail the reset.
    const TAGS_TO_CLEAR = ["deposit_paid", "ai_escalation"];
    for (const cid of contactIds) {
      for (const tag of TAGS_TO_CLEAR) {
        await respondIoClient.removeContactTag({ contactId: cid, tag }).catch((err) =>
          req.log.warn(
            { err: (err as Error).message, contactId: cid, tag },
            "admin reset: tag cleanup failed (continuing)",
          ),
        );
      }
    }

    req.log.info(
      {
        contactIds,
        resetConversations: convIds.length,
        deletedMessages: deletedMsgs.length,
        tagsClearedPerContact: TAGS_TO_CLEAR,
      },
      "admin reset-conversation ok",
    );

    return reply.send({
      ok: true,
      contactIds,
      resetConversations: convIds.length,
      deletedMessages: deletedMsgs.length,
      tagsCleared: TAGS_TO_CLEAR,
    });
  });

  // ── /admin/force-transition ────────────────────────────────────────────
  //
  // Panel-driven lead_stage transitions. The panel (apps/panel, deployed on
  // Vercel) used to write `conversaciones.lead_stage` directly from a
  // Next.js Server Action. That bypassed `leadStageService.forceTransition`
  // — so the *outgoing* lifecycle webhook never fired and Respond.io stayed
  // out of sync (Miguel hit this 2026-05-13 confirming a deposit from the
  // panel: DB moved deposit_pending → deposit_paid → handed_off correctly,
  // but the contact's lifecycle in Respond.io stayed at "Payment" and the
  // onboarding workflow never ran).
  //
  // This endpoint is the single funnel: the panel posts here, we run the
  // same `leadStageService.forceTransition()` that the server uses for
  // its own AI-driven transitions, and the lifecycle webhook + audit log
  // entry are guaranteed.
  //
  // Auth: shared bearer with /admin/reset-conversation. Panel reads
  // ADMIN_RESET_TOKEN from its own env (added to Vercel separately).
  app.post("/admin/force-transition", async (req, reply) => {
    const expected = env.ADMIN_RESET_TOKEN;
    if (!expected) {
      return reply.status(503).send({
        error: { code: "admin_disabled", message: "ADMIN_RESET_TOKEN not configured" },
      });
    }
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${expected}`) {
      req.log.warn("admin force-transition auth rejected");
      return reply.status(401).send({ error: { code: "unauthorized" } });
    }

    const body = (req.body ?? {}) as {
      conversacionId?: string;
      to?: string;
      note?: string;
    };
    if (!body.conversacionId || !body.to) {
      return reply.status(400).send({
        error: {
          code: "bad_request",
          message: "Provide conversacionId and to in the JSON body.",
        },
      });
    }
    // Guard against typos — only allow declared LeadStage values through so
    // a misclick in the panel can't park a row in an unknown state.
    if (!LEAD_STAGES.includes(body.to as LeadStage)) {
      return reply.status(400).send({
        error: {
          code: "bad_request",
          message: `Invalid target stage '${body.to}'. Expected one of: ${LEAD_STAGES.join(", ")}`,
        },
      });
    }

    const result = await leadStageService.forceTransition({
      conversacionId: body.conversacionId,
      to: body.to as LeadStage,
      by: "human",
      note: body.note,
    });

    if (!result.ok) {
      req.log.warn(
        { convId: body.conversacionId, to: body.to, reason: result.reason },
        "admin force-transition rejected",
      );
      return reply.status(result.reason === "not_found" ? 404 : 400).send({
        error: { code: result.reason, message: result.message },
      });
    }

    req.log.info(
      { convId: body.conversacionId, from: result.from, to: result.to },
      "admin force-transition ok",
    );
    return reply.send({
      ok: true,
      from: result.from,
      to: result.to,
    });
  });

  // ── /admin/apply-tag ────────────────────────────────────────────────────
  //
  // Panel-driven contact tag application. The panel used to POST directly
  // to Respond.io's `/v2/contact/id:{id}/tag` endpoint, which v2 rejects
  // with 400 "Tags: Cannot be empty" regardless of body shape (Phase F
  // probing on 2026-05-11). We then tried a GET+PUT pattern in the panel
  // itself, but Vercel/Next.js Server Action bundling left the call
  // silently failing on Miguel's contact 208082561 and Tony's contact
  // 445381935 (no errores row, no tag applied either).
  //
  // The server's `respondIoClient.addContactTag` has been working in
  // production since May for AI-driven tag applies (`deposit_paid`,
  // `ai_escalation` from process-message.ts). Same code path, same
  // upstream, just exposed over HTTP so the panel can use it without
  // re-implementing the GET+merge+PUT dance.
  app.post("/admin/apply-tag", async (req, reply) => {
    const expected = env.ADMIN_RESET_TOKEN;
    if (!expected) {
      return reply.status(503).send({
        error: { code: "admin_disabled", message: "ADMIN_RESET_TOKEN not configured" },
      });
    }
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${expected}`) {
      req.log.warn("admin apply-tag auth rejected");
      return reply.status(401).send({ error: { code: "unauthorized" } });
    }

    const body = (req.body ?? {}) as {
      contactId?: string;
      tag?: string;
    };
    if (!body.contactId || !body.tag) {
      return reply.status(400).send({
        error: {
          code: "bad_request",
          message: "Provide contactId and tag in the JSON body.",
        },
      });
    }

    try {
      await respondIoClient.addContactTag({
        contactId: String(body.contactId),
        tag: String(body.tag),
      });
    } catch (err) {
      req.log.warn(
        { err: (err as Error).message, contactId: body.contactId, tag: body.tag },
        "admin apply-tag upstream failed",
      );
      return reply.status(502).send({
        error: {
          code: "upstream_failed",
          message: (err as Error).message?.slice(0, 200) ?? "upstream error",
        },
      });
    }

    req.log.info(
      { contactId: body.contactId, tag: body.tag },
      "admin apply-tag ok",
    );
    return reply.send({ ok: true });
  });
}
