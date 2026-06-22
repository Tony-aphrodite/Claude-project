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
//   • Strip server-emitted tags from Respond.io (deposit_paid, ai_escalation)
//   • Reassign the conversation back to the AI user in Respond.io
//     (Tony fix 2026-06-08 — required so the take-over silence's 3rd
//     defense layer doesn't keep silencing the AI after reset).
//
// Side effects on Respond.io UI: the operator may still want to close the
// conversation in the panel separately for a clean conversation thread,
// but assignment + tags + flags are all reset by this endpoint.
// ============================================================================

import type { FastifyInstance } from "fastify";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import {
  chatContacts,
  conversaciones,
  errores,
  getDb,
  mensajes,
  sedes,
} from "@dpm/db";
import { LEAD_STAGES, type LeadStage } from "@dpm/shared";

import type { LeadMetadata, RespondIoIncomingMessage } from "@dpm/shared";

import { loadEnv } from "../env.js";
import {
  logSaleRowsForBooking,
  processIncomingMessage,
} from "../handlers/process-message.js";
import {
  getReplayRun,
  listReplayRunsForConversation,
  startReplay,
} from "../handlers/replay.js";
import {
  createSimulatorSession,
  deleteSimulatorSession,
  fetchSandboxRoster,
  listSimulatorPromptVersions,
  listSimulatorSedes,
  listSimulatorSessions,
  loadSimulatorHistory,
  resetSandboxRosterGrid,
  resetSimulatorSession,
  runSimulatorMessage,
  runSimulatorOcr,
  saveSimulatorSession,
  setSandboxRosterCell,
} from "../handlers/simulator.js";
import { leadStageService } from "../services/lead-stage.js";
import { respondIoClient } from "../services/respond-io.js";
import {
  isValidTurno,
  rosterDbService,
  VALID_TURNOS,
  type Turno,
} from "../services/roster-db.js";

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

    // Tony fix 2026-06-08: reassign the conversation back to the AI
    // user so the take-over silence flow (which now actively GETs the
    // current assignee — see process-message.ts 3rd defense layer)
    // doesn't keep silencing the AI on the next test message.
    //
    // Without this, the sequence:
    //   1. Test 1: human self-assigns to test take-over silence
    //   2. Reset endpoint (clears DB but Respond.io still has human assignee)
    //   3. Test 2: customer sends message → 3rd defense layer GETs current
    //      assignee → human still assigned → AI silenced (correctly!)
    //
    // The reset endpoint is for TEST scenarios — we want the AI to be
    // fully active after reset, so we explicitly reassign to the AI
    // user. Env-gated: when RESPOND_IO_AI_ASSIGNEE_ID is unset (dev
    // mode without an AI user configured), skip this step.
    const aiAssigneeId = loadEnv().RESPOND_IO_AI_ASSIGNEE_ID;
    if (aiAssigneeId) {
      for (const cid of contactIds) {
        await respondIoClient
          .assignConversation({ contactId: cid, assignee: aiAssigneeId })
          .catch((err) =>
            req.log.warn(
              { err: (err as Error).message, contactId: cid, aiAssigneeId },
              "admin reset: ai reassign failed (continuing)",
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

    // Sales-logger side effect (Miguel 2026-06-20 "no escribe las ventas
    // en el Excel"). When the panel's "Confirmar depósito" button drives
    // the transition to deposit_paid, fire the sales-logger so the
    // master sheet gets a row — same way the OCR auto-confirm path does
    // it. logSaleRowsForBooking is idempotent (checks
    // sale_logged_at_by_program in lead_metadata), so even if the OCR
    // path already wrote rows, this is a no-op. Best-effort; failures
    // here don't block the panel response.
    if (body.to === "deposit_paid") {
      void (async () => {
        try {
          const db = getDb();
          const [row] = await db
            .select({
              conv: conversaciones,
              contact: chatContacts,
              sede: sedes,
            })
            .from(conversaciones)
            .leftJoin(
              chatContacts,
              eq(chatContacts.respondIoContactId, conversaciones.respondIoContactId),
            )
            .leftJoin(sedes, eq(sedes.id, conversaciones.sedeId))
            .where(eq(conversaciones.id, body.conversacionId!))
            .limit(1);
          if (!row?.sede || !row?.conv || !row?.contact) {
            req.log.warn(
              { convId: body.conversacionId },
              "force-transition: sales-logger skipped — could not load sede/conv/contact for sales row",
            );
            return;
          }
          await logSaleRowsForBooking({
            sede: row.sede,
            conversation: {
              id: row.conv.id,
              leadMetadata: row.conv.leadMetadata,
            },
            contact: {
              id: row.contact.respondIoContactId,
              name: row.contact.name ?? null,
              phone: row.contact.phone ?? null,
              language: row.contact.language ?? null,
            },
            log: req.log,
          });
          req.log.info(
            { convId: body.conversacionId },
            "force-transition: sales-logger fired (panel-driven deposit_paid)",
          );
        } catch (err) {
          req.log.warn(
            { err: (err as Error).message, convId: body.conversacionId },
            "force-transition: sales-logger side effect failed (non-blocking)",
          );
        }
      })();
    }

    return reply.send({
      ok: true,
      from: result.from,
      to: result.to,
    });
  });

  // ── /admin/roster/block ────────────────────────────────────────────────
  //
  // Mark one or more turnos of a sede × date as manually BLOCKED (weather,
  // charter, festivo, no boat). Sets the `blocked` flag in
  // roster_capacity_overrides WITHOUT touching capacity — so unblocking
  // restores the slot's previous capacity automatically (Miguel feedback
  // 2026-06-05: capacity=0 hack was discarded in favor of flag-based block).
  //
  // Body shape:
  //   { sedeId: "<uuid>", fecha: "YYYY-MM-DD", turnos?: ["AM"|"PM"|"Nocturno"], reason?: string }
  //
  // Omitting `turnos` blocks the whole day (all 3). Idempotent — running
  // again with the same input is a no-op (just refreshes updatedAt).
  //
  // Auth: shared Bearer with /admin/reset-conversation (env ADMIN_RESET_TOKEN).
  app.post("/admin/roster/block", async (req, reply) => {
    const expected = env.ADMIN_RESET_TOKEN;
    if (!expected) {
      return reply.status(503).send({
        error: { code: "admin_disabled", message: "ADMIN_RESET_TOKEN not configured" },
      });
    }
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${expected}`) {
      req.log.warn("admin roster/block auth rejected");
      return reply.status(401).send({ error: { code: "unauthorized" } });
    }

    const body = (req.body ?? {}) as {
      sedeId?: string;
      fecha?: string;
      turnos?: string[];
      reason?: string;
      by?: string;
    };
    if (!body.sedeId || !body.fecha) {
      return reply.status(400).send({
        error: {
          code: "bad_request",
          message: "Provide sedeId (uuid) and fecha (YYYY-MM-DD) in the JSON body.",
        },
      });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.fecha)) {
      return reply.status(400).send({
        error: { code: "bad_request", message: "fecha must be YYYY-MM-DD" },
      });
    }
    let turnosValidated: Turno[] | undefined;
    if (Array.isArray(body.turnos) && body.turnos.length > 0) {
      const invalid = body.turnos.filter((t): t is string => !isValidTurno(t));
      if (invalid.length > 0) {
        return reply.status(400).send({
          error: {
            code: "bad_request",
            message: `Invalid turno(s): ${invalid.join(", ")}. Expected: ${VALID_TURNOS.join(", ")}`,
          },
        });
      }
      turnosValidated = body.turnos as Turno[];
    }

    const result = await rosterDbService.blockDay({
      sedeId: body.sedeId,
      fecha: body.fecha,
      ...(turnosValidated ? { turnos: turnosValidated } : {}),
      ...(body.reason ? { reason: body.reason } : {}),
      by: body.by ?? "admin_api",
    });
    req.log.info(
      { sedeId: body.sedeId, fecha: body.fecha, turnos: result.blocked, reason: body.reason },
      "admin roster/block ok",
    );
    return reply.send({ ok: true, blocked: result.blocked });
  });

  // ── /admin/roster/unblock ──────────────────────────────────────────────
  //
  // Reverse of /admin/roster/block — clear the manual block flag for one
  // or more turnos. Capacity is untouched, so the slot returns to its
  // previous overridden or default value (Miguel feedback 2026-06-05).
  //
  // Body: { sedeId, fecha, turnos?, by? }
  app.post("/admin/roster/unblock", async (req, reply) => {
    const expected = env.ADMIN_RESET_TOKEN;
    if (!expected) {
      return reply.status(503).send({
        error: { code: "admin_disabled", message: "ADMIN_RESET_TOKEN not configured" },
      });
    }
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${expected}`) {
      req.log.warn("admin roster/unblock auth rejected");
      return reply.status(401).send({ error: { code: "unauthorized" } });
    }
    const body = (req.body ?? {}) as {
      sedeId?: string;
      fecha?: string;
      turnos?: string[];
      by?: string;
    };
    if (!body.sedeId || !body.fecha) {
      return reply.status(400).send({
        error: {
          code: "bad_request",
          message: "Provide sedeId (uuid) and fecha (YYYY-MM-DD) in the JSON body.",
        },
      });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.fecha)) {
      return reply.status(400).send({
        error: { code: "bad_request", message: "fecha must be YYYY-MM-DD" },
      });
    }
    let turnosValidated: Turno[] | undefined;
    if (Array.isArray(body.turnos) && body.turnos.length > 0) {
      const invalid = body.turnos.filter((t): t is string => !isValidTurno(t));
      if (invalid.length > 0) {
        return reply.status(400).send({
          error: {
            code: "bad_request",
            message: `Invalid turno(s): ${invalid.join(", ")}. Expected: ${VALID_TURNOS.join(", ")}`,
          },
        });
      }
      turnosValidated = body.turnos as Turno[];
    }
    const result = await rosterDbService.unblockDay({
      sedeId: body.sedeId,
      fecha: body.fecha,
      ...(turnosValidated ? { turnos: turnosValidated } : {}),
      by: body.by ?? "admin_api",
    });
    req.log.info(
      { sedeId: body.sedeId, fecha: body.fecha, turnos: result.unblocked },
      "admin roster/unblock ok",
    );
    return reply.send({ ok: true, unblocked: result.unblocked });
  });

  // ── /admin/roster/booking ──────────────────────────────────────────────
  //
  // Seed a confirmed booking directly, bypassing OCR validation. Used to
  // import existing future bookings BEFORE the AI starts selling against
  // the new DB-backed roster (Miguel go-live recommendation 2026-06-05).
  // Without this seeding, the AI would see those seats as empty and
  // oversell against bookings the office already has on the books.
  //
  // Race-safe — uses confirmBooking's SERIALIZABLE-tx capacity check
  // internally. Returns the same shapes as the OCR-write path:
  //   • ok:true with booking row
  //   • ok:false reason:overbooked when no room
  //   • ok:false reason:blocked when slot is manually blocked
  //
  // Body: { sedeId, fecha, turno, programa, pax, notes?, contactId? }
  app.post("/admin/roster/booking", async (req, reply) => {
    const expected = env.ADMIN_RESET_TOKEN;
    if (!expected) {
      return reply.status(503).send({
        error: { code: "admin_disabled", message: "ADMIN_RESET_TOKEN not configured" },
      });
    }
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${expected}`) {
      req.log.warn("admin roster/booking auth rejected");
      return reply.status(401).send({ error: { code: "unauthorized" } });
    }
    const body = (req.body ?? {}) as {
      sedeId?: string;
      fecha?: string;
      turno?: string;
      programa?: string;
      pax?: number;
      notes?: string;
      contactId?: string;
    };
    if (
      !body.sedeId ||
      !body.fecha ||
      !body.turno ||
      !body.programa ||
      body.pax === undefined
    ) {
      return reply.status(400).send({
        error: {
          code: "bad_request",
          message: "Provide sedeId, fecha (YYYY-MM-DD), turno, programa, pax.",
        },
      });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.fecha)) {
      return reply.status(400).send({
        error: { code: "bad_request", message: "fecha must be YYYY-MM-DD" },
      });
    }
    if (!isValidTurno(body.turno)) {
      return reply.status(400).send({
        error: {
          code: "bad_request",
          message: `Invalid turno: ${body.turno}. Expected: ${VALID_TURNOS.join(", ")}`,
        },
      });
    }
    if (!Number.isInteger(body.pax) || body.pax < 1) {
      return reply.status(400).send({
        error: { code: "bad_request", message: "pax must be a positive integer" },
      });
    }
    const result = await rosterDbService.seedBooking({
      sedeId: body.sedeId,
      fecha: body.fecha,
      turno: body.turno,
      programa: body.programa,
      pax: body.pax,
      notes: body.notes ?? "seeded via /admin/roster/booking",
      contactId: body.contactId,
    });
    if (!result.ok) {
      const code = result.reason === "blocked" ? 409 : 400;
      return reply.status(code).send({ error: { code: result.reason, detail: result } });
    }
    req.log.info(
      {
        sedeId: body.sedeId,
        fecha: body.fecha,
        turno: body.turno,
        programa: body.programa,
        pax: body.pax,
        bookingId: result.booking.id,
      },
      "admin roster/booking ok",
    );
    return reply.send({ ok: true, booking: result.booking });
  });

  // ── /admin/roster/set-capacity ─────────────────────────────────────────
  //
  // Set explicit capacity for a single (sede, fecha, turno). 0 == blocked.
  // Useful for "reduce capacity to 18 because fewer tanks today" rather
  // than the full-block case (which has its own endpoint above).
  //
  // Body: { sedeId, fecha, turno, capacity, reason?, by? }
  app.post("/admin/roster/set-capacity", async (req, reply) => {
    const expected = env.ADMIN_RESET_TOKEN;
    if (!expected) {
      return reply.status(503).send({
        error: { code: "admin_disabled", message: "ADMIN_RESET_TOKEN not configured" },
      });
    }
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${expected}`) {
      req.log.warn("admin roster/set-capacity auth rejected");
      return reply.status(401).send({ error: { code: "unauthorized" } });
    }
    const body = (req.body ?? {}) as {
      sedeId?: string;
      fecha?: string;
      turno?: string;
      capacity?: number;
      reason?: string;
      by?: string;
    };
    if (!body.sedeId || !body.fecha || !body.turno || body.capacity === undefined) {
      return reply.status(400).send({
        error: {
          code: "bad_request",
          message: "Provide sedeId, fecha (YYYY-MM-DD), turno, capacity in JSON body.",
        },
      });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.fecha)) {
      return reply.status(400).send({
        error: { code: "bad_request", message: "fecha must be YYYY-MM-DD" },
      });
    }
    if (!isValidTurno(body.turno)) {
      return reply.status(400).send({
        error: {
          code: "bad_request",
          message: `Invalid turno: ${body.turno}. Expected: ${VALID_TURNOS.join(", ")}`,
        },
      });
    }
    if (!Number.isInteger(body.capacity) || body.capacity < 0) {
      return reply.status(400).send({
        error: {
          code: "bad_request",
          message: "capacity must be a non-negative integer",
        },
      });
    }
    await rosterDbService.setCapacity({
      sedeId: body.sedeId,
      fecha: body.fecha,
      turno: body.turno,
      capacity: body.capacity,
      reason: body.reason,
      by: body.by ?? "admin_api",
    });
    req.log.info(
      { sedeId: body.sedeId, fecha: body.fecha, turno: body.turno, capacity: body.capacity },
      "admin roster/set-capacity ok",
    );
    return reply.send({ ok: true });
  });

  // ── /admin/roster/availability ─────────────────────────────────────────
  //
  // Read-only diagnostic: show capacity/reserved/available for a (sede, fecha).
  // Used by the panel and by ops debugging. No write side-effects.
  //
  // Body: { sedeId, fecha, turno? }
  app.post("/admin/roster/availability", async (req, reply) => {
    const expected = env.ADMIN_RESET_TOKEN;
    if (!expected) {
      return reply.status(503).send({
        error: { code: "admin_disabled", message: "ADMIN_RESET_TOKEN not configured" },
      });
    }
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${expected}`) {
      return reply.status(401).send({ error: { code: "unauthorized" } });
    }
    const body = (req.body ?? {}) as {
      sedeId?: string;
      fecha?: string;
      turno?: string;
    };
    if (!body.sedeId || !body.fecha) {
      return reply.status(400).send({
        error: { code: "bad_request", message: "Provide sedeId and fecha" },
      });
    }
    const turno =
      body.turno && isValidTurno(body.turno) ? (body.turno as Turno) : undefined;
    const slots = await rosterDbService.getAvailability(
      body.sedeId,
      body.fecha,
      turno,
    );
    return reply.send({ ok: true, slots });
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

  // ── /admin/add-comment ──────────────────────────────────────────────────
  //
  // Add an internal note ("comentario") to a Respond.io contact. Maps to
  // their `POST /v2/contact/id:{id}/comment` endpoint. Used by the Phase B
  // auto-confirm dashboard (Miguel spec 2026-05-13): when an operator
  // clicks Flag on a row, we also drop a comment on the contact so anyone
  // re-opening the chat later sees the flag context inline.
  //
  // Routing through the server (not the panel directly) keeps the
  // Respond.io API key out of the Vercel panel env — same reason
  // /admin/apply-tag exists.
  app.post("/admin/add-comment", async (req, reply) => {
    const expected = env.ADMIN_RESET_TOKEN;
    if (!expected) {
      return reply.status(503).send({
        error: { code: "admin_disabled", message: "ADMIN_RESET_TOKEN not configured" },
      });
    }
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${expected}`) {
      req.log.warn("admin add-comment auth rejected");
      return reply.status(401).send({ error: { code: "unauthorized" } });
    }

    const body = (req.body ?? {}) as {
      contactId?: string;
      text?: string;
    };
    if (!body.contactId || !body.text) {
      return reply.status(400).send({
        error: {
          code: "bad_request",
          message: "Provide contactId and text in the JSON body.",
        },
      });
    }
    // Hard cap so a buggy caller can't flood Respond.io with a 100KB
    // comment. UI flags carry <500 chars in practice.
    const text = String(body.text).slice(0, 2000);

    try {
      await respondIoClient.addContactComment({
        contactId: String(body.contactId),
        text,
      });
    } catch (err) {
      req.log.warn(
        { err: (err as Error).message, contactId: body.contactId, textLen: text.length },
        "admin add-comment upstream failed",
      );
      return reply.status(502).send({
        error: {
          code: "upstream_failed",
          message: (err as Error).message?.slice(0, 200) ?? "upstream error",
        },
      });
    }

    req.log.info(
      { contactId: body.contactId, textLen: text.length },
      "admin add-comment ok",
    );
    return reply.send({ ok: true });
  });

  // ── /admin/send-daily-summary ───────────────────────────────────────────
  //
  // Daily end-of-day summary email queue. Miguel spec 2026-05-13: at 18:00
  // Asia/Makassar (= 10:00 UTC), an external cron POSTs here. We query
  // three lists and queue the rendered body in `errores` with
  // `error_type = "daily_summary_pending"` so it surfaces in the panel's
  // error queue and (once SMTP is configured) gets sent to
  // gilit@dpmdiving.com — same pattern as `handoff_email_pending`.
  //
  // Lists rendered:
  //   1. Auto-confirmados hoy (lead_metadata.ocr_result.validated = true,
  //      latest history entry note='ocr_auto_confirmed' since midnight
  //      Asia/Makassar today)
  //   2. Depósitos pendientes (lead_stage = 'deposit_pending')
  //   3. Flagged sin resolver (errores rows of type
  //      'auto_confirm_review_requested' whose latest follow-up for that
  //      conversation is NOT 'auto_confirm_review_resolved')
  //
  // Cron config (Tony adds to Railway):
  //   schedule: "0 10 * * *"   (10:00 UTC = 18:00 Asia/Makassar)
  //   command: curl -X POST -H "Authorization: Bearer $ADMIN_RESET_TOKEN" \
  //                 https://dpmserver-production.up.railway.app/admin/send-daily-summary
  app.post("/admin/send-daily-summary", async (req, reply) => {
    const expected = env.ADMIN_RESET_TOKEN;
    if (!expected) {
      return reply.status(503).send({
        error: { code: "admin_disabled", message: "ADMIN_RESET_TOKEN not configured" },
      });
    }
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${expected}`) {
      req.log.warn("admin send-daily-summary auth rejected");
      return reply.status(401).send({ error: { code: "unauthorized" } });
    }

    const db = getDb();

    // Cutoff = midnight today in Asia/Makassar (UTC+8, no DST).
    const now = new Date();
    const makassarMs = now.getTime() + 8 * 3_600_000;
    const md = new Date(makassarMs);
    const cutoffMs = Date.UTC(
      md.getUTCFullYear(),
      md.getUTCMonth(),
      md.getUTCDate(),
      -8, // -8h to bring midnight-Makassar back to UTC
      0,
      0,
    );
    const cutoffIso = new Date(cutoffMs).toISOString();
    const todayLabel = `${md.getUTCFullYear()}-${String(
      md.getUTCMonth() + 1,
    ).padStart(2, "0")}-${String(md.getUTCDate()).padStart(2, "0")}`;

    // List 1: auto-confirmed today
    const autoConfirmedRows = await db
      .select({ conv: conversaciones })
      .from(conversaciones)
      .where(
        sql`(${conversaciones.leadMetadata} -> 'ocr_result' ->> 'validated') = 'true'`,
      )
      .orderBy(conversaciones.leadStageChangedAt);
    const autoConfirmedToday: Array<{
      id: string;
      respondIoContactId: string | null;
      at: string;
      amount: number | null;
      currency: string | null;
    }> = [];
    for (const r of autoConfirmedRows) {
      const meta = (r.conv.leadMetadata ?? {}) as {
        history?: Array<{ at?: string; note?: string }>;
        ocr_result?: { extraction?: { amount?: number | null; currency?: string | null } };
      };
      const entry = (meta.history ?? [])
        .filter((h) => h?.note === "ocr_auto_confirmed")
        .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))[0];
      if (!entry?.at) continue;
      if (entry.at < cutoffIso) continue;
      autoConfirmedToday.push({
        id: r.conv.id,
        respondIoContactId: r.conv.respondIoContactId,
        at: entry.at,
        amount: meta.ocr_result?.extraction?.amount ?? null,
        currency: meta.ocr_result?.extraction?.currency ?? null,
      });
    }

    // List 2: pending deposit
    const pendingRows = await db
      .select({ conv: conversaciones })
      .from(conversaciones)
      .where(eq(conversaciones.leadStage, "deposit_pending"))
      .orderBy(conversaciones.leadStageChangedAt);

    // List 3: flagged unresolved — for each conversacion_id with a
    // 'auto_confirm_review_requested' row, count it as flagged when its
    // latest of (requested, resolved) is requested.
    const flagRows = await db
      .select()
      .from(errores)
      .where(
        sql`${errores.errorType} in ('auto_confirm_review_requested','auto_confirm_review_resolved')`,
      )
      .orderBy(sql`${errores.createdAt} desc`);
    const latestByConv = new Map<string, typeof flagRows[number]>();
    for (const row of flagRows) {
      if (!row.conversacionId) continue;
      if (!latestByConv.has(row.conversacionId)) {
        latestByConv.set(row.conversacionId, row);
      }
    }
    const flaggedUnresolved = [...latestByConv.values()].filter(
      (r) => r.errorType === "auto_confirm_review_requested",
    );

    // Render plain-text summary. Keep it short — the operator team scans
    // it as an end-of-day checklist, not a deep report.
    const lines: string[] = [];
    lines.push(`DPM Diving — Resumen diario ${todayLabel} (18:00 hora Bali)`);
    lines.push("");
    lines.push(
      `1) DEPÓSITOS AUTO-CONFIRMADOS HOY  (${autoConfirmedToday.length})`,
    );
    if (autoConfirmedToday.length === 0) {
      lines.push("   — ninguno —");
    } else {
      for (const r of autoConfirmedToday) {
        lines.push(
          `   • ${r.amount ?? "?"} ${r.currency ?? ""}  contact ${r.respondIoContactId ?? "?"}  conv ${r.id.slice(0, 8)}`,
        );
      }
    }
    lines.push("");
    lines.push(
      `2) PENDIENTES EN /Depósitos  (${pendingRows.length} esperando Confirmar)`,
    );
    if (pendingRows.length === 0) {
      lines.push("   — ninguno —");
    } else {
      for (const r of pendingRows) {
        const meta = (r.conv.leadMetadata ?? {}) as {
          ref_code?: string;
          deposit_amount_total?: number;
          deposit_currency?: string;
        };
        lines.push(
          `   • ${meta.deposit_amount_total ?? "?"} ${meta.deposit_currency ?? ""}  ref ${meta.ref_code ?? "—"}  contact ${r.conv.respondIoContactId ?? "?"}`,
        );
      }
    }
    lines.push("");
    lines.push(
      `3) FLAGGED SIN RESOLVER en /depositos-auto  (${flaggedUnresolved.length})`,
    );
    if (flaggedUnresolved.length === 0) {
      lines.push("   — ninguno —");
    } else {
      for (const r of flaggedUnresolved) {
        const ctx = (r.context ?? {}) as Record<string, unknown>;
        lines.push(
          `   • flagged ${r.createdAt.toISOString().slice(0, 16)}Z  conv ${r.conversacionId?.slice(0, 8) ?? "?"}  by ${(ctx.flaggedBy as string) ?? "?"}`,
        );
      }
    }
    lines.push("");
    lines.push(
      `— DPM AI server. Cruzar lista (1) contra los emails de Wise/Mandiri/BCA en gilit@dpmdiving.com. Si algo no coincide, abrir /depositos-auto y clickear Flag.`,
    );
    const body = lines.join("\n");

    // Queue in errores until SMTP transport lands. Same pattern as
    // handoff_email_pending — once Resend/SMTP is configured, a drainer
    // job iterates these rows and sends them.
    await db.insert(errores).values({
      source: "internal",
      conversacionId: null,
      errorType: "daily_summary_pending",
      errorMessage: `Daily summary queued for gilit@dpmdiving.com (${todayLabel})`,
      context: {
        targetEmail: "gilit@dpmdiving.com",
        subject: `DPM Diving — Resumen ${todayLabel} (18:00 Bali)`,
        body,
        counts: {
          autoConfirmedToday: autoConfirmedToday.length,
          pending: pendingRows.length,
          flaggedUnresolved: flaggedUnresolved.length,
        },
      },
    });

    req.log.info(
      {
        date: todayLabel,
        autoConfirmedToday: autoConfirmedToday.length,
        pending: pendingRows.length,
        flaggedUnresolved: flaggedUnresolved.length,
      },
      "admin daily-summary queued",
    );
    return reply.send({
      ok: true,
      date: todayLabel,
      counts: {
        autoConfirmedToday: autoConfirmedToday.length,
        pending: pendingRows.length,
        flaggedUnresolved: flaggedUnresolved.length,
      },
      body,
    });
  });

  // ── /admin/simulator/* ──────────────────────────────────────────────────
  //
  // Phase 1 of Miguel's Simulator + Replay spec (2026-05-12 / 2026-05-14):
  // Miguel chats with John from the panel as a fake client without using
  // a real WhatsApp number and without contaminating dashboard metrics
  // or Respond.io workflows. Tools are stubbed in handlers/simulator.ts
  // so the surface mirrors production without side effects. All routes
  // share the same ADMIN_RESET_TOKEN bearer used by force-transition /
  // apply-tag / send-daily-summary.

  // Pre-auth helper to deduplicate the same check in 4 handlers.
  const requireAdminAuth = (headers: {
    authorization?: string | undefined;
  }): "ok" | "no_token" | "bad_auth" => {
    const expected = env.ADMIN_RESET_TOKEN;
    if (!expected) return "no_token";
    if (headers.authorization !== `Bearer ${expected}`) return "bad_auth";
    return "ok";
  };

  // GET /admin/simulator/prompts — list versions for the dropdown.
  app.get("/admin/simulator/prompts", async (req, reply) => {
    const auth = requireAdminAuth(req.headers);
    if (auth === "no_token") {
      return reply.status(503).send({
        error: { code: "admin_disabled" },
      });
    }
    if (auth === "bad_auth") {
      return reply.status(401).send({ error: { code: "unauthorized" } });
    }
    const versions = await listSimulatorPromptVersions();
    return reply.send({ ok: true, versions });
  });

  // GET /admin/simulator/sedes — list sedes for the sede selector. The
  // simulator can chat as any sede; the panel lets the operator pick.
  app.get("/admin/simulator/sedes", async (req, reply) => {
    const auth = requireAdminAuth(req.headers);
    if (auth === "no_token") {
      return reply.status(503).send({ error: { code: "admin_disabled" } });
    }
    if (auth === "bad_auth") {
      return reply.status(401).send({ error: { code: "unauthorized" } });
    }
    const sedeList = await listSimulatorSedes();
    return reply.send({ ok: true, sedes: sedeList });
  });

  // POST /admin/simulator/session — create a new simulator conversation.
  //   body: { sedeId?: string }   (defaults to Gili Trawangan)
  //   returns: { conversacionId, sedeId }
  app.post("/admin/simulator/session", async (req, reply) => {
    const auth = requireAdminAuth(req.headers);
    if (auth === "no_token") return reply.status(503).send({ error: { code: "admin_disabled" } });
    if (auth === "bad_auth") return reply.status(401).send({ error: { code: "unauthorized" } });
    const body = (req.body ?? {}) as { sedeId?: string };
    try {
      const res = await createSimulatorSession({ sedeId: body.sedeId });
      req.log.info(res, "simulator session created");
      return reply.send({ ok: true, ...res });
    } catch (err) {
      req.log.warn({ err: (err as Error).message }, "simulator session failed");
      return reply.status(500).send({
        error: { code: "create_failed", message: (err as Error).message },
      });
    }
  });

  // POST /admin/simulator/message — one turn of the simulator chat.
  //   body: { conversacionId: string; text: string; promptVersionId?: string }
  //   returns: { aiText, sources, toolCalls, costUsd, latencyMs, model,
  //              promptVersionId, escalationReason }
  app.post("/admin/simulator/message", async (req, reply) => {
    const auth = requireAdminAuth(req.headers);
    if (auth === "no_token") return reply.status(503).send({ error: { code: "admin_disabled" } });
    if (auth === "bad_auth") return reply.status(401).send({ error: { code: "unauthorized" } });
    const body = (req.body ?? {}) as {
      conversacionId?: string;
      text?: string;
      promptVersionId?: string;
    };
    if (!body.conversacionId || !body.text) {
      return reply.status(400).send({
        error: {
          code: "bad_request",
          message: "Provide conversacionId and text in the JSON body.",
        },
      });
    }
    try {
      const res = await runSimulatorMessage({
        conversacionId: body.conversacionId,
        text: body.text,
        promptVersionId: body.promptVersionId,
      });
      return reply.send({ ok: true, ...res });
    } catch (err) {
      req.log.warn(
        { err: (err as Error).message, conversacionId: body.conversacionId },
        "simulator message failed",
      );
      return reply.status(500).send({
        error: { code: "inference_failed", message: (err as Error).message },
      });
    }
  });

  // GET /admin/simulator/history?conversacionId=... — full message list.
  app.get("/admin/simulator/history", async (req, reply) => {
    const auth = requireAdminAuth(req.headers);
    if (auth === "no_token") return reply.status(503).send({ error: { code: "admin_disabled" } });
    if (auth === "bad_auth") return reply.status(401).send({ error: { code: "unauthorized" } });
    const q = (req.query ?? {}) as { conversacionId?: string };
    if (!q.conversacionId) {
      return reply.status(400).send({
        error: { code: "bad_request", message: "Provide conversacionId query param." },
      });
    }
    try {
      const messages = await loadSimulatorHistory(q.conversacionId);
      return reply.send({ ok: true, messages });
    } catch (err) {
      return reply.status(500).send({
        error: { code: "history_failed", message: (err as Error).message },
      });
    }
  });

  // POST /admin/simulator/ocr — upload a comprobante image for the
  // current sandbox session. Routes through `runOcrOnAttachment` (real
  // Anthropic Vision) and on validate=true upgrades the sandbox pending
  // holds to `confirmed` in `roster_bookings_sandbox`. Mirrors the
  // production webhook path so the operator sees the SAME OCR decision +
  // booking confirmation flow they'd see for a real customer.
  //   body: { conversacionId: string;
  //           base64: string;          // raw bytes, no data: prefix
  //           mimeType: string;        // image/jpeg | image/png | application/pdf | ...
  //           fileName?: string }
  app.post("/admin/simulator/ocr", async (req, reply) => {
    const auth = requireAdminAuth(req.headers);
    if (auth === "no_token") return reply.status(503).send({ error: { code: "admin_disabled" } });
    if (auth === "bad_auth") return reply.status(401).send({ error: { code: "unauthorized" } });
    const body = (req.body ?? {}) as {
      conversacionId?: string;
      base64?: string;
      mimeType?: string;
      fileName?: string;
    };
    if (!body.conversacionId || !body.base64 || !body.mimeType) {
      return reply.status(400).send({
        error: {
          code: "bad_request",
          message: "Provide conversacionId, base64, and mimeType.",
        },
      });
    }
    // Strip data-URL prefix if the panel sent one. Both forms are common
    // from <input type=file>+FileReader workflows.
    const cleanedBase64 = body.base64.replace(/^data:[^;]+;base64,/, "");
    try {
      const res = await runSimulatorOcr({
        conversacionId: body.conversacionId,
        base64: cleanedBase64,
        mimeType: body.mimeType,
        fileName: body.fileName,
      });
      return reply.send({ ok: true, ...res });
    } catch (err) {
      req.log.warn(
        { err: (err as Error).message, conversacionId: body.conversacionId },
        "simulator ocr failed",
      );
      return reply.status(500).send({
        error: { code: "ocr_failed", message: (err as Error).message },
      });
    }
  });

  // POST /admin/simulator/reset — rewind a sandbox session for the next
  // test scenario: delete sandbox bookings tied to this conversation,
  // clear leadMetadata, reset leadStage='new', drop all messages. The
  // conversaciones row + saved-session references stay intact.
  //   body: { conversacionId: string }
  app.post("/admin/simulator/reset", async (req, reply) => {
    const auth = requireAdminAuth(req.headers);
    if (auth === "no_token") return reply.status(503).send({ error: { code: "admin_disabled" } });
    if (auth === "bad_auth") return reply.status(401).send({ error: { code: "unauthorized" } });
    const body = (req.body ?? {}) as { conversacionId?: string };
    if (!body.conversacionId) {
      return reply.status(400).send({
        error: { code: "bad_request", message: "Provide conversacionId." },
      });
    }
    try {
      const res = await resetSimulatorSession({
        conversacionId: body.conversacionId,
      });
      req.log.info(res, "simulator session reset");
      return reply.send(res);
    } catch (err) {
      return reply.status(500).send({
        error: { code: "reset_failed", message: (err as Error).message },
      });
    }
  });

  // GET /admin/simulator/roster?sedeId=&fromDate=&days= — read the
  // sandbox roster as a flat (fecha, turno) grid. Miguel rule 2026-06-09
  // PM: operators need a visible 15-day window to test multi-day course
  // footprints (OW spans 3-4 days, etc).
  app.get("/admin/simulator/roster", async (req, reply) => {
    const auth = requireAdminAuth(req.headers);
    if (auth === "no_token") return reply.status(503).send({ error: { code: "admin_disabled" } });
    if (auth === "bad_auth") return reply.status(401).send({ error: { code: "unauthorized" } });
    const q = (req.query ?? {}) as {
      sedeId?: string;
      fromDate?: string;
      days?: string;
    };
    if (!q.sedeId || !q.fromDate) {
      return reply.status(400).send({
        error: { code: "bad_request", message: "Provide sedeId and fromDate." },
      });
    }
    const days = q.days ? Math.max(1, Math.min(31, parseInt(q.days, 10) || 15)) : 15;
    try {
      const res = await fetchSandboxRoster({
        sedeId: q.sedeId,
        fromDate: q.fromDate,
        days,
      });
      return reply.send(res);
    } catch (err) {
      req.log.warn(
        { err: (err as Error).message, sedeId: q.sedeId, fromDate: q.fromDate },
        "simulator roster fetch failed",
      );
      return reply.status(500).send({
        error: { code: "roster_failed", message: (err as Error).message },
      });
    }
  });

  // POST /admin/simulator/roster/set-cell — set occupancy on one cell.
  // body: { sedeId, fecha (YYYY-MM-DD), turno, pax }
  // pax=0 clears the cell. Real chat bookings are NEVER touched — only
  // rows with notes='[grid-seed]' are mutated.
  app.post("/admin/simulator/roster/set-cell", async (req, reply) => {
    const auth = requireAdminAuth(req.headers);
    if (auth === "no_token") return reply.status(503).send({ error: { code: "admin_disabled" } });
    if (auth === "bad_auth") return reply.status(401).send({ error: { code: "unauthorized" } });
    const body = (req.body ?? {}) as {
      sedeId?: string;
      fecha?: string;
      turno?: string;
      pax?: number;
    };
    if (!body.sedeId || !body.fecha || !body.turno || typeof body.pax !== "number") {
      return reply.status(400).send({
        error: {
          code: "bad_request",
          message: "Provide sedeId, fecha (YYYY-MM-DD), turno, pax (number).",
        },
      });
    }
    try {
      const res = await setSandboxRosterCell({
        sedeId: body.sedeId,
        fecha: body.fecha,
        turno: body.turno,
        pax: body.pax,
      });
      return reply.send(res);
    } catch (err) {
      return reply.status(400).send({
        error: { code: "set_cell_failed", message: (err as Error).message },
      });
    }
  });

  // POST /admin/simulator/roster/reset — wipe ALL grid-seed rows for a
  // sede (manual setup only — chat bookings preserved).
  app.post("/admin/simulator/roster/reset", async (req, reply) => {
    const auth = requireAdminAuth(req.headers);
    if (auth === "no_token") return reply.status(503).send({ error: { code: "admin_disabled" } });
    if (auth === "bad_auth") return reply.status(401).send({ error: { code: "unauthorized" } });
    const body = (req.body ?? {}) as { sedeId?: string };
    if (!body.sedeId) {
      return reply.status(400).send({
        error: { code: "bad_request", message: "Provide sedeId." },
      });
    }
    try {
      const res = await resetSandboxRosterGrid({ sedeId: body.sedeId });
      return reply.send(res);
    } catch (err) {
      return reply.status(500).send({
        error: { code: "reset_grid_failed", message: (err as Error).message },
      });
    }
  });

  // ── Phase 1.5: saved sessions ─────────────────────────────────────────

  // GET /admin/simulator/sessions — list saved sessions for the dropdown.
  app.get("/admin/simulator/sessions", async (req, reply) => {
    const auth = requireAdminAuth(req.headers);
    if (auth === "no_token") return reply.status(503).send({ error: { code: "admin_disabled" } });
    if (auth === "bad_auth") return reply.status(401).send({ error: { code: "unauthorized" } });
    const sessions = await listSimulatorSessions();
    return reply.send({ ok: true, sessions });
  });

  // POST /admin/simulator/sessions — save the current conversation as a
  // named session. body: { name, conversacionId, promptVersionId?, notes? }
  app.post("/admin/simulator/sessions", async (req, reply) => {
    const auth = requireAdminAuth(req.headers);
    if (auth === "no_token") return reply.status(503).send({ error: { code: "admin_disabled" } });
    if (auth === "bad_auth") return reply.status(401).send({ error: { code: "unauthorized" } });
    const body = (req.body ?? {}) as {
      name?: string;
      conversacionId?: string;
      promptVersionId?: string | null;
      createdBy?: string | null;
      notes?: string | null;
    };
    if (!body.name || !body.conversacionId) {
      return reply.status(400).send({
        error: {
          code: "bad_request",
          message: "Provide name and conversacionId in the JSON body.",
        },
      });
    }
    try {
      const res = await saveSimulatorSession({
        name: body.name,
        conversacionId: body.conversacionId,
        promptVersionId: body.promptVersionId ?? null,
        createdBy: body.createdBy ?? null,
        notes: body.notes ?? null,
      });
      return reply.send({ ok: true, ...res });
    } catch (err) {
      return reply.status(400).send({
        error: { code: "save_failed", message: (err as Error).message },
      });
    }
  });

  // DELETE /admin/simulator/sessions/:id — remove a saved session.
  app.delete("/admin/simulator/sessions/:id", async (req, reply) => {
    const auth = requireAdminAuth(req.headers);
    if (auth === "no_token") return reply.status(503).send({ error: { code: "admin_disabled" } });
    if (auth === "bad_auth") return reply.status(401).send({ error: { code: "unauthorized" } });
    const { id } = (req.params ?? {}) as { id?: string };
    if (!id) {
      return reply.status(400).send({
        error: { code: "bad_request", message: "Provide id in the path." },
      });
    }
    await deleteSimulatorSession(id);
    return reply.send({ ok: true });
  });

  // ── /admin/replay/* ─────────────────────────────────────────────────────
  //
  // Phase 2 of Miguel's spec: take a real customer conversation and
  // re-run the client messages through a different prompt version,
  // recording what John v_new would have said. Side-by-side comparison
  // lives in the panel; the worker + storage live here. See
  // handlers/replay.ts for the worker semantics.

  // POST /admin/replay/start  body: { sourceConversacionId, promptVersionId }
  //   returns: { id }
  app.post("/admin/replay/start", async (req, reply) => {
    const auth = requireAdminAuth(req.headers);
    if (auth === "no_token") return reply.status(503).send({ error: { code: "admin_disabled" } });
    if (auth === "bad_auth") return reply.status(401).send({ error: { code: "unauthorized" } });
    const body = (req.body ?? {}) as {
      sourceConversacionId?: string;
      promptVersionId?: string;
      createdBy?: string;
    };
    if (!body.sourceConversacionId || !body.promptVersionId) {
      return reply.status(400).send({
        error: {
          code: "bad_request",
          message: "Provide sourceConversacionId and promptVersionId.",
        },
      });
    }
    try {
      const { id } = await startReplay({
        sourceConversacionId: body.sourceConversacionId,
        promptVersionId: body.promptVersionId,
        createdBy: body.createdBy ?? null,
      });
      return reply.send({ ok: true, id });
    } catch (err) {
      return reply.status(400).send({
        error: { code: "start_failed", message: (err as Error).message },
      });
    }
  });

  // GET /admin/replay/:id — fetch run status + messages for the
  // side-by-side view. The panel polls this until status='done'.
  app.get("/admin/replay/:id", async (req, reply) => {
    const auth = requireAdminAuth(req.headers);
    if (auth === "no_token") return reply.status(503).send({ error: { code: "admin_disabled" } });
    if (auth === "bad_auth") return reply.status(401).send({ error: { code: "unauthorized" } });
    const { id } = (req.params ?? {}) as { id?: string };
    if (!id) {
      return reply.status(400).send({ error: { code: "bad_request" } });
    }
    const res = await getReplayRun(id);
    if (!res) {
      return reply.status(404).send({ error: { code: "not_found" } });
    }
    return reply.send({ ok: true, ...res });
  });

  // GET /admin/replay?conversacionId=... — past runs for a given source
  // conversation (so the panel can show a history dropdown).
  app.get("/admin/replay", async (req, reply) => {
    const auth = requireAdminAuth(req.headers);
    if (auth === "no_token") return reply.status(503).send({ error: { code: "admin_disabled" } });
    if (auth === "bad_auth") return reply.status(401).send({ error: { code: "unauthorized" } });
    const q = (req.query ?? {}) as { conversacionId?: string };
    if (!q.conversacionId) {
      return reply.status(400).send({
        error: { code: "bad_request", message: "Provide conversacionId query param." },
      });
    }
    const runs = await listReplayRunsForConversation(q.conversacionId);
    return reply.send({ ok: true, runs });
  });

  // ─── POST /admin/conversations/:id/reroll ─────────────────────────────
  // Miguel 2026-06-18 feedback: "AI se queda colgada en medio de una
  // conversación; escribimos algo y cuando el cliente contesta, la AI
  // vuelve a contestar normal." His proposed solution was a "re-roll"
  // button to make the AI take a fresh turn without needing the
  // operator to write a manual message first.
  //
  // What this endpoint does:
  //   1. Clears `lead_metadata.human_took_over` if set (stale-flag
  //      recovery — same as the new server-side self-heal but here
  //      operator-triggered).
  //   2. Resets `lead_stage` from `handed_off` → `qualified` so the
  //      post-handoff silence guard in process-message no longer
  //      trips.
  //   3. Reads the most recent `cliente` message in `mensajes` for
  //      this conversation.
  //   4. Synthesizes a minimal Respond.io webhook payload from that
  //      message and pipes it through processIncomingMessage. The AI
  //      generates and sends a fresh response.
  //
  // Safety: synthesizes a new `messageId` (`reroll-...`) so the
  // dedup layer doesn't see this as a duplicate of the original
  // customer webhook. Skips the batcher path (immediate processing).
  //
  // Returns 200 immediately with `{ ok: true, queued: true, ... }`
  // and processes the AI turn asynchronously.
  app.post("/admin/conversations/:id/reroll", async (req, reply) => {
    const auth = requireAdminAuth(req.headers);
    if (auth === "no_token") {
      return reply.status(503).send({ error: { code: "admin_disabled" } });
    }
    if (auth === "bad_auth") {
      return reply.status(401).send({ error: { code: "unauthorized" } });
    }

    const conversationId = (req.params as { id?: string })?.id;
    if (!conversationId) {
      return reply.status(400).send({
        error: { code: "bad_request", message: "Missing :id path param" },
      });
    }

    const db = getDb();
    const [conv] = await db
      .select()
      .from(conversaciones)
      .where(eq(conversaciones.id, conversationId))
      .limit(1);
    if (!conv) {
      return reply.status(404).send({
        error: { code: "not_found", message: "Conversation not found" },
      });
    }
    if (!conv.respondIoContactId) {
      return reply.status(400).send({
        error: {
          code: "no_contact_id",
          message: "Conversation has no respondIoContactId — cannot re-roll",
        },
      });
    }

    // (1) Clear stale takeover flag if set.
    const oldMeta = (conv.leadMetadata as LeadMetadata | null) ?? ({} as LeadMetadata);
    let clearedFlag = false;
    if (oldMeta.human_took_over === true) {
      const {
        human_took_over: _ht,
        human_took_over_at: _hta,
        human_took_over_by: _htb,
        ...restMeta
      } = oldMeta;
      void _ht;
      void _hta;
      void _htb;
      await db
        .update(conversaciones)
        .set({ leadMetadata: restMeta as LeadMetadata, updatedAt: new Date() })
        .where(eq(conversaciones.id, conversationId));
      clearedFlag = true;
    }

    // (2) Reset stage from handed_off.
    let stageResetTo: string | null = null;
    if (conv.leadStage === "handed_off") {
      const stageResult = await leadStageService.forceTransition({
        conversacionId: conversationId,
        to: "qualified",
        by: "human",
        note: `reroll_admin:${req.ip ?? "unknown"}`,
      });
      if (stageResult.ok) {
        stageResetTo = "qualified";
      } else {
        req.log.warn(
          { conversationId, reason: stageResult.reason },
          "reroll: stage reset failed (continuing with flag-clear only)",
        );
      }
    }

    // (3) Find the most recent customer message.
    const [lastCustomerMsg] = await db
      .select({
        id: mensajes.id,
        content: mensajes.content,
        createdAt: mensajes.createdAt,
      })
      .from(mensajes)
      .where(
        and(
          eq(mensajes.conversacionId, conversationId),
          eq(mensajes.sender, "cliente"),
        ),
      )
      .orderBy(desc(mensajes.createdAt))
      .limit(1);
    if (!lastCustomerMsg) {
      return reply.status(400).send({
        error: {
          code: "no_customer_message",
          message:
            "No customer messages found in this conversation — nothing to re-roll. The AI needs at least one prior customer turn to respond to.",
        },
      });
    }

    // (4) Synthesize a minimal webhook payload and pipe through
    // processIncomingMessage. Schema requires `event`, `contact`, `message`;
    // optional fields filled with sensible defaults so the strict parser
    // accepts it.
    const syntheticMessageId = `reroll-${Date.now()}-${conversationId.slice(0, 6)}`;
    const synthetic: RespondIoIncomingMessage = {
      event: "message.received",
      contact: {
        id: conv.respondIoContactId,
      },
      message: {
        messageId: syntheticMessageId,
        type: "text",
        text: lastCustomerMsg.content,
        direction: "incoming",
      },
    } as RespondIoIncomingMessage;

    // Fire-and-forget: the HTTP response returns immediately; the AI work
    // happens in the background and the customer gets the reply via the
    // normal sendMessage path.
    void processIncomingMessage(synthetic, req.log).catch((err) =>
      req.log.error(
        { err: (err as Error).message, conversationId },
        "reroll: processIncomingMessage failed",
      ),
    );

    req.log.info(
      {
        conversationId,
        contactId: conv.respondIoContactId,
        clearedFlag,
        stageResetTo,
        rerolledFromMessageId: lastCustomerMsg.id,
        syntheticMessageId,
      },
      "reroll triggered — async processing started",
    );

    return reply.send({
      ok: true,
      queued: true,
      conversationId,
      clearedFlag,
      stageResetTo,
      rerolledFromMessageId: lastCustomerMsg.id,
    });
  });
}
