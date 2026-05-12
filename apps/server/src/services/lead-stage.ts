// ============================================================================
// LeadStageService — single owner of conversaciones.lead_stage transitions.
//
// Why centralized:
//   • Forward transitions are restricted by LEAD_STAGE_TRANSITIONS in shared
//     types. The service enforces them; callers cannot bypass.
//   • Every transition appends an audit entry to lead_metadata.history (last
//     10 retained). This is what the panel surfaces in the conversation
//     detail view so a human can see "AI moved this from proposed to
//     deposit_pending at 14:02 with ref DPM-X7B3K2".
//   • Specific transitions trigger side effects:
//       deposit_paid → handed_off (automatic, with cordial ack message
//       to the client + AI silenced for that thread).
//
// All writes go through `transition()`. The panel exposes a "human override"
// path that calls `forceTransition()` which skips validation but still
// records the audit entry (so we can spot when humans manually corrected).
// ============================================================================

import { eq } from "drizzle-orm";

import {
  conversaciones,
  getDb,
  type Conversacion,
} from "@dpm/db";
import {
  LEAD_STAGE_TRANSITIONS,
  type LeadMetadata,
  type LeadStage,
} from "@dpm/shared";

import { getLogger } from "../logger.js";
import { respondIoClient, RESPOND_IO_LIFECYCLE_BY_LEAD_STAGE } from "./respond-io.js";

export type TransitionActor = "ai" | "human" | "system" | "negative_intent";

export type TransitionInput = {
  conversacionId: string;
  to: LeadStage;
  by: TransitionActor;
  note?: string;
  /** Patch merged into lead_metadata after the audit entry is appended. */
  metadataPatch?: Partial<LeadMetadata>;
};

export type TransitionResult =
  | { ok: true; conversation: Conversacion; from: LeadStage; to: LeadStage }
  | {
      ok: false;
      reason: "not_found" | "invalid_transition" | "terminal_state";
      from?: LeadStage;
      to: LeadStage;
      message: string;
    };

const HISTORY_LIMIT = 10;

export class LeadStageService {
  /** Strict transition: rejects invalid edges. */
  async transition(input: TransitionInput): Promise<TransitionResult> {
    return this.applyTransition(input, /* force */ false);
  }

  /** Human override path — used by the panel. Records `by: human` in audit. */
  async forceTransition(
    input: Omit<TransitionInput, "by"> & { by?: TransitionActor },
  ): Promise<TransitionResult> {
    return this.applyTransition({ ...input, by: input.by ?? "human" }, /* force */ true);
  }

  private async applyTransition(
    input: TransitionInput,
    force: boolean,
  ): Promise<TransitionResult> {
    const db = getDb();
    const log = getLogger();

    const [current] = await db
      .select()
      .from(conversaciones)
      .where(eq(conversaciones.id, input.conversacionId))
      .limit(1);
    if (!current) {
      return {
        ok: false,
        reason: "not_found",
        to: input.to,
        message: `conversation ${input.conversacionId} not found`,
      };
    }

    const from = current.leadStage as LeadStage;
    if (from === input.to) {
      // Same-stage re-entry. Important: still apply the metadataPatch when
      // present, because callers like `solicitar_deposito` re-invoke this
      // transition when the AI re-runs the deposit step with a different
      // currency — without merging the patch, the stale (currency, amount,
      // ref_code) from the first invocation lingers and the OCR step
      // afterwards compares the new receipt against the OLD expected values
      // (Miguel hit this 2026-05-11: IDR→EUR re-quote produced an EUR
      // receipt that mismatched the stale IDR expectations from
      // lead_metadata). When no patch is supplied we keep the cheap
      // no-op.
      if (!input.metadataPatch || Object.keys(input.metadataPatch).length === 0) {
        return { ok: true, conversation: current, from, to: from };
      }
      const oldMeta = (current.leadMetadata as LeadMetadata | null) ?? {};
      const newMeta: LeadMetadata = { ...oldMeta, ...input.metadataPatch };
      const [updated] = await db
        .update(conversaciones)
        .set({ leadMetadata: newMeta, updatedAt: new Date() })
        .where(eq(conversaciones.id, input.conversacionId))
        .returning();
      log.info(
        { convId: input.conversacionId, stage: from, patchKeys: Object.keys(input.metadataPatch) },
        "lead_stage same-stage metadata merge",
      );
      return { ok: true, conversation: updated ?? current, from, to: from };
    }

    if (!force) {
      const allowed = LEAD_STAGE_TRANSITIONS[from] ?? [];
      if (!allowed.includes(input.to)) {
        return {
          ok: false,
          reason: from === "closed" || from === "lost" ? "terminal_state" : "invalid_transition",
          from,
          to: input.to,
          message: `transition ${from} -> ${input.to} not allowed`,
        };
      }
    }

    const now = new Date();
    const oldMeta = (current.leadMetadata as LeadMetadata | null) ?? {};
    const history = [...(oldMeta.history ?? [])];
    history.push({
      from,
      to: input.to,
      at: now.toISOString(),
      by: input.by,
      ...(input.note ? { note: input.note } : {}),
    });
    while (history.length > HISTORY_LIMIT) history.shift();

    const newMeta: LeadMetadata = {
      ...oldMeta,
      ...input.metadataPatch,
      history,
    };

    const [updated] = await db
      .update(conversaciones)
      .set({
        leadStage: input.to,
        leadStageChangedAt: now,
        leadMetadata: newMeta,
      })
      .where(eq(conversaciones.id, input.conversacionId))
      .returning();
    if (!updated) {
      return {
        ok: false,
        reason: "not_found",
        from,
        to: input.to,
        message: "update returned no row",
      };
    }

    log.info(
      { convId: input.conversacionId, from, to: input.to, by: input.by, force },
      "lead_stage transition",
    );

    // Push the matching Respond.io lifecycle so Miguel's workflows that
    // filter on lifecycle (e.g. "Lifecycle changes to Customer") fire
    // properly. Fire-and-forget — a Respond.io outage must not block
    // the server-side state machine, and the next transition will
    // re-attempt anyway.
    const lifecycle = RESPOND_IO_LIFECYCLE_BY_LEAD_STAGE[input.to];
    if (lifecycle && updated.respondIoContactId) {
      void respondIoClient
        .updateContactLifecycle({
          contactId: updated.respondIoContactId,
          lifecycle,
        })
        .catch((err) =>
          log.warn(
            { err: (err as Error).message, convId: input.conversacionId, lifecycle },
            "respond_io lifecycle push failed — server state still advanced",
          ),
        );
    }

    return { ok: true, conversation: updated, from, to: input.to };
  }
}

export const leadStageService = new LeadStageService();
