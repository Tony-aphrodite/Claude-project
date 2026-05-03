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
      return { ok: true, conversation: current, from, to: from };
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

    return { ok: true, conversation: updated, from, to: input.to };
  }
}

export const leadStageService = new LeadStageService();
