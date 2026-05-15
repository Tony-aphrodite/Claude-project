// ============================================================================
// Replay handler (Phase 2, 2026-05-14, Miguel spec).
//
// Take a real customer conversation and re-run the client messages through
// a different prompt version, recording what John v_new would have said.
// Stored separately from `mensajes` so the original audit trail stays
// untouched (mensajes.origin stays 'production' for the real conversation).
//
// Lifecycle:
//   1. POST /admin/replay/start → inserts replay_runs row, status='pending'
//   2. We fire the worker as a fire-and-forget async task that:
//      a. flips status='running' + startedAt=now
//      b. loads the source conversaciones + ordered cliente messages
//      c. loads the target prompt version + sede KB
//      d. iterates client messages; for each, calls Claude with:
//           system  = chosen prompt + sede KB
//           history = (replay's NEW assistant replies so far) + this msg
//         This is the critical "history bootstrapping" call — replaying
//         AGAINST the OLD assistant context would defeat the whole point.
//      e. inserts replay_messages row per client + per AI reply, accumulates
//         cost
//      f. status='done' + finishedAt=now; or status='failed' + errorMessage
//   3. Panel polls GET /admin/replay/:id until done.
//
// Tools are stubbed identically to the simulator (no real Apps Script,
// no real ref code minting, no Respond.io side effects).
// ============================================================================

import { asc, desc, eq } from "drizzle-orm";

import {
  conversaciones,
  getDb,
  mensajes,
  promptsVersiones,
  replayMessages,
  replayRuns,
  sedes,
} from "@dpm/db";

import { callClaude, type ToolHandlers } from "../services/anthropic.js";
import { promptsService } from "../services/prompts.js";
import { buildFourBlockPrompt } from "../services/prompt-builder.js";
import { getLogger } from "../logger.js";
import { randomUUID } from "node:crypto";
import type {
  ConsultarDisponibilidadResult,
  EnviarCatalogoResult,
  SolicitarDepositoResult,
} from "@dpm/shared";

function buildReplayToolHandlers(): ToolHandlers {
  // Identical surface to the simulator stubs — same rationale:
  // surface-level realism, no side effects.
  return {
    consultar_disponibilidad: async (
      input,
    ): Promise<ConsultarDisponibilidadResult> => ({
      ok: true,
      programa: input.programa,
      startDate: input.start_date,
      available: true,
      slots: [
        { date: input.start_date, slot: "AM", available: true, espacios: 8 },
        { date: input.start_date, slot: "PM", available: true, espacios: 8 },
      ],
      notes: "[replay stub — disponibilidad asumida OK]",
    }),
    solicitar_deposito: async (input): Promise<SolicitarDepositoResult> => {
      const ref = `DPM-REPLAY-${randomUUID().slice(0, 8).toUpperCase()}`;
      const monto = input.moneda_cliente === "IDR" ? 700_000 : 40;
      const pax = input.pax ?? 1;
      return {
        ok: true,
        ref_code: ref,
        monto,
        monto_total: monto * pax,
        pax,
        moneda: input.moneda_cliente,
        instrucciones: "[replay stub] Transferencia ficticia. Ref " + ref + ".",
        requires_human_verification: true,
        reused_existing: false,
      };
    },
    enviar_catalogo: async (input): Promise<EnviarCatalogoResult> => ({
      ok: true,
      sent: true,
      programa: input.programa,
      catalogRef: "replay-stub",
    }),
  };
}

/**
 * Kick off a replay. Returns the new run id; actual work happens in the
 * background.
 */
export async function startReplay(input: {
  sourceConversacionId: string;
  promptVersionId: string;
  createdBy?: string | null;
}): Promise<{ id: string }> {
  const db = getDb();

  // Verify source + prompt exist.
  const [src] = await db
    .select()
    .from(conversaciones)
    .where(eq(conversaciones.id, input.sourceConversacionId))
    .limit(1);
  if (!src) throw new Error("replay: source conversation not found");

  const [pv] = await db
    .select()
    .from(promptsVersiones)
    .where(eq(promptsVersiones.id, input.promptVersionId))
    .limit(1);
  if (!pv) throw new Error("replay: prompt version not found");

  const [run] = await db
    .insert(replayRuns)
    .values({
      sourceConversacionId: input.sourceConversacionId,
      promptVersionId: input.promptVersionId,
      promptVersionLabel: `v${pv.versionNumber}`,
      createdBy: input.createdBy ?? null,
      status: "pending",
    })
    .returning({ id: replayRuns.id });
  if (!run) throw new Error("replay: run insert returned no row");

  // Fire-and-forget: run the worker without awaiting. Errors land on the
  // run row's errorMessage column.
  void executeReplay(run.id).catch((err) => {
    getLogger().error(
      { err: (err as Error).message, runId: run.id },
      "replay: worker top-level catch",
    );
  });

  return { id: run.id };
}

async function executeReplay(runId: string): Promise<void> {
  const db = getDb();
  const log = getLogger();
  const now = () => new Date();

  try {
    // Flip to running.
    await db
      .update(replayRuns)
      .set({ status: "running", startedAt: now() })
      .where(eq(replayRuns.id, runId));

    const [run] = await db
      .select()
      .from(replayRuns)
      .where(eq(replayRuns.id, runId))
      .limit(1);
    if (!run) throw new Error("replay: run vanished mid-execute");

    // Load source conv + sede + client messages in order.
    const [src] = await db
      .select()
      .from(conversaciones)
      .where(eq(conversaciones.id, run.sourceConversacionId))
      .limit(1);
    if (!src) throw new Error("replay: source conversation deleted");

    const [sede] = await db
      .select()
      .from(sedes)
      .where(eq(sedes.id, src.sedeId))
      .limit(1);
    if (!sede) throw new Error("replay: sede gone");

    const clientMessages = await db
      .select()
      .from(mensajes)
      .where(eq(mensajes.conversacionId, src.id))
      .orderBy(asc(mensajes.createdAt));
    const clientOnly = clientMessages.filter((m) => m.sender === "cliente");

    if (clientOnly.length === 0) {
      await db
        .update(replayRuns)
        .set({
          status: "done",
          finishedAt: now(),
          messageCount: "0",
          costUsdTotal: "0",
        })
        .where(eq(replayRuns.id, runId));
      log.info({ runId }, "replay: source has no client messages, no-op done");
      return;
    }

    // Load target prompt + KB.
    const [pv] = await db
      .select()
      .from(promptsVersiones)
      .where(eq(promptsVersiones.id, run.promptVersionId))
      .limit(1);
    if (!pv || typeof pv.content !== "string") {
      throw new Error("replay: prompt version content missing");
    }
    const kbText = await promptsService.loadSedeKb(sede);

    const tools = buildReplayToolHandlers();

    // History bootstrapping: accumulate the NEW (v_new) assistant replies
    // here. Each client message turn sees this accumulated history (not
    // the production v_orig replies) — that's the whole point of replay,
    // measure how the new prompt drives the entire conversation from
    // scratch.
    const replayHistory: Array<{
      role: "cliente" | "ai";
      content: string;
    }> = [];

    let costTotal = 0;
    let idx = 0;
    for (const cm of clientOnly) {
      idx += 1;
      const idxStr = String(idx).padStart(5, "0");

      // Persist the client message in replay_messages so the side-by-
      // side UI can render without re-joining mensajes.
      await db.insert(replayMessages).values({
        replayRunId: runId,
        idx: `${idxStr}-c`,
        role: "cliente",
        content: cm.content,
      });

      // Convert replay history into the (sender,content) shape the
      // 4-block builder accepts. We synthesise a Mensaje-shape array
      // since buildFourBlockPrompt expects that.
      const historyForBuilder = replayHistory.map((h) => ({
        id: randomUUID(),
        conversacionId: src.id,
        sender: h.role,
        agenteName: null,
        content: h.content,
        fuentes: null,
        metadata: null,
        origin: "replay",
        createdAt: new Date(0),
      })) as unknown as Parameters<typeof buildFourBlockPrompt>[0]["history"];

      const built = buildFourBlockPrompt({
        systemPrompt: pv.content,
        sedeKb: kbText,
        history: historyForBuilder,
        sede,
        roster: null,
        incomingMessage: cm.content,
        detectedLanguage: "es",
        suggestedCurrency: "EUR",
      });

      const turn = await callClaude({
        system: built.system,
        messages: built.messages,
        conversacionId: src.id,
        sedeId: sede.id,
        promptVersionId: pv.id,
        toolHandlers: tools,
        expectedLanguage: "español",
        incomingMessage: cm.content,
      });

      costTotal += turn.cost.totalUsd;

      // Persist replay's AI reply.
      await db.insert(replayMessages).values({
        replayRunId: runId,
        idx: `${idxStr}-a`,
        role: "ai",
        content: turn.text,
        fuentes: turn.fuentes,
        toolCalls: turn.toolCalls,
        metadata: {
          model: turn.model,
          latencyMs: turn.latencyMs,
          costUsd: turn.cost.totalUsd,
          escalationReason: turn.escalationReason,
        },
      });

      replayHistory.push({ role: "cliente", content: cm.content });
      replayHistory.push({ role: "ai", content: turn.text });
    }

    await db
      .update(replayRuns)
      .set({
        status: "done",
        finishedAt: now(),
        costUsdTotal: costTotal.toFixed(6),
        messageCount: String(clientOnly.length),
      })
      .where(eq(replayRuns.id, runId));
    log.info(
      { runId, turns: clientOnly.length, costUsd: costTotal },
      "replay: done",
    );
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    await db
      .update(replayRuns)
      .set({
        status: "failed",
        finishedAt: now(),
        errorMessage: msg.slice(0, 500),
      })
      .where(eq(replayRuns.id, runId));
    log.warn({ err: msg, runId }, "replay: failed");
  }
}

export async function getReplayRun(id: string): Promise<{
  run: typeof replayRuns.$inferSelect;
  messages: Array<typeof replayMessages.$inferSelect>;
} | null> {
  const db = getDb();
  const [run] = await db
    .select()
    .from(replayRuns)
    .where(eq(replayRuns.id, id))
    .limit(1);
  if (!run) return null;
  const messages = await db
    .select()
    .from(replayMessages)
    .where(eq(replayMessages.replayRunId, id))
    .orderBy(asc(replayMessages.idx));
  return { run, messages };
}

export async function listReplayRunsForConversation(
  sourceConversacionId: string,
): Promise<Array<typeof replayRuns.$inferSelect>> {
  const db = getDb();
  return db
    .select()
    .from(replayRuns)
    .where(eq(replayRuns.sourceConversacionId, sourceConversacionId))
    .orderBy(desc(replayRuns.createdAt));
}
