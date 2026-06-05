import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the DB module before importing the handler so the in-handler DB
// lookups go through our stub. The conversation row returned by `limit()`
// is controllable per-test via `setMockConversation()`.
let mockConversation: {
  id: string;
  leadStage: string;
  leadMetadata?: Record<string, unknown> | null;
} | null = null;

function setMockConversation(
  row: {
    id: string;
    leadStage: string;
    leadMetadata?: Record<string, unknown> | null;
  } | null,
) {
  mockConversation = row;
}

const updateCalls: Array<{ set: Record<string, unknown> }> = [];

function resetUpdateCalls() {
  updateCalls.length = 0;
}

vi.mock("@dpm/db", async () => {
  const actual = await vi.importActual<typeof import("@dpm/db")>("@dpm/db");
  return {
    ...actual,
    getDb: () => ({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => (mockConversation ? [mockConversation] : []),
          }),
        }),
      }),
      update: () => ({
        set: (s: Record<string, unknown>) => {
          updateCalls.push({ set: s });
          return {
            where: () => Promise.resolve(),
          };
        },
      }),
    }),
  };
});

// Mock env so RESPOND_IO_AI_ASSIGNEE_ID is deterministic in tests. 999 is
// the "AI bot" user id; anything else counts as a human takeover. We
// don't call the real loadEnv() because test env vars aren't seeded
// (NODE_ENV=test bypasses .env loading).
vi.mock("../src/env.js", () => ({
  loadEnv: () => ({ RESPOND_IO_AI_ASSIGNEE_ID: 999 }),
  resolveHandoffEmail: () => "test@example.com",
}));

// Mock leadStageService so we can observe (and stub) the forceTransition
// call without spinning up the real state machine.
const forceTransitionMock = vi.fn(
  async (args: { conversacionId: string; to: string; by: string; note?: string }) => ({
    ok: true as const,
    from: "deposit_paid",
    to: args.to,
    conversation: { id: args.conversacionId },
  }),
);

vi.mock("../src/services/lead-stage.js", () => ({
  leadStageService: {
    forceTransition: (args: Parameters<typeof forceTransitionMock>[0]) =>
      forceTransitionMock(args),
  },
}));

// Silent logger — the handler emits structured logs that would otherwise
// flood test output.
const silentLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  fatal: () => {},
  trace: () => {},
  level: "info",
  child: () => silentLog,
} as unknown as Parameters<typeof handleContactStateEvent>[2];

import { handleContactStateEvent } from "../src/handlers/contact-state-event.js";

beforeEach(() => {
  forceTransitionMock.mockClear();
  resetUpdateCalls();
  setMockConversation({ id: "conv_abc", leadStage: "deposit_paid" });
});

describe("contact-state-event — tag.updated (flat payload shape)", () => {
  it("triggers rollback to 'proposed' on remove of deposit_paid (action='remove')", async () => {
    const result = await handleContactStateEvent(
      {
        contact: { id: 445381935 },
        tag: "deposit_paid",
        action: "remove",
      },
      "contact.tag.updated",
      silentLog,
    );
    expect(forceTransitionMock).toHaveBeenCalledTimes(1);
    expect(forceTransitionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversacionId: "conv_abc",
        to: "proposed",
        by: "human",
        note: "respond_io_deposit_paid_tag_removed",
      }),
    );
    expect(result.action).toBe("tag_event_ignored");
    if (result.action === "tag_event_ignored") {
      expect(result.reason).toBe("remove:deposit_paid");
    }
  });

  it("also accepts legacy 'removed' action value (backward compat)", async () => {
    await handleContactStateEvent(
      {
        contact: { id: 445381935 },
        tag: "deposit_paid",
        action: "removed",
      },
      "contact.tag.updated",
      silentLog,
    );
    expect(forceTransitionMock).toHaveBeenCalledTimes(1);
  });

  it("ignores tag add events (action='add')", async () => {
    const result = await handleContactStateEvent(
      {
        contact: { id: 445381935 },
        tag: "deposit_paid",
        action: "add",
      },
      "contact.tag.updated",
      silentLog,
    );
    expect(forceTransitionMock).not.toHaveBeenCalled();
    expect(result.action).toBe("tag_event_ignored");
    if (result.action === "tag_event_ignored") {
      expect(result.reason).toBe("add:deposit_paid");
    }
  });

  it("ignores remove of tags other than deposit_paid", async () => {
    const result = await handleContactStateEvent(
      {
        contact: { id: 445381935 },
        tag: "Nusa Penida",
        action: "remove",
      },
      "contact.tag.updated",
      silentLog,
    );
    expect(forceTransitionMock).not.toHaveBeenCalled();
    expect(result.action).toBe("tag_event_ignored");
  });

  it("does not double-fire when the stage is already 'proposed' (idempotent)", async () => {
    setMockConversation({ id: "conv_abc", leadStage: "proposed" });
    const result = await handleContactStateEvent(
      {
        contact: { id: 445381935 },
        tag: "deposit_paid",
        action: "remove",
      },
      "contact.tag.updated",
      silentLog,
    );
    expect(forceTransitionMock).not.toHaveBeenCalled();
    expect(result.action).toBe("tag_event_ignored");
  });
});

describe("contact-state-event — tag.updated (legacy wrapper shape)", () => {
  it("reads `tag` and `action` from a `data.*` wrapper if not at top-level", async () => {
    await handleContactStateEvent(
      {
        contact: { id: 445381935 },
        data: { tag: "deposit_paid", action: "remove" },
      },
      "contact.tag.updated",
      silentLog,
    );
    expect(forceTransitionMock).toHaveBeenCalledTimes(1);
  });

  it("reads `tag` and `action` from a `payload.*` wrapper if not at top-level", async () => {
    await handleContactStateEvent(
      {
        contact: { id: 445381935 },
        payload: { tag: "deposit_paid", action: "remove" },
      },
      "contact.tag.updated",
      silentLog,
    );
    expect(forceTransitionMock).toHaveBeenCalledTimes(1);
  });

  it("infers 'remove' from explicit event name contact.tag.removed", async () => {
    await handleContactStateEvent(
      {
        contact: { id: 445381935 },
        tag: "deposit_paid",
      },
      "contact.tag.removed",
      silentLog,
    );
    expect(forceTransitionMock).toHaveBeenCalledTimes(1);
  });

  it("infers 'add' from explicit event name contact.tag.added and ignores it", async () => {
    await handleContactStateEvent(
      {
        contact: { id: 445381935 },
        tag: "deposit_paid",
      },
      "contact.tag.added",
      silentLog,
    );
    expect(forceTransitionMock).not.toHaveBeenCalled();
  });
});

describe("contact-state-event — lifecycle.updated", () => {
  it("rolls back to 'new' on lifecycle='New Lead'", async () => {
    const result = await handleContactStateEvent(
      {
        contact: { id: 445381935 },
        lifecycle: "New Lead",
        oldLifecycle: "Customer",
        action: "update",
      },
      "contact.lifecycle.updated",
      silentLog,
    );
    expect(forceTransitionMock).toHaveBeenCalledTimes(1);
    expect(forceTransitionMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "new", by: "human" }),
    );
    expect(result.action).toBe("lifecycle_reset");
  });

  it("rolls back to 'lost' on lifecycle='Lost Lead'", async () => {
    await handleContactStateEvent(
      {
        contact: { id: 445381935 },
        lifecycle: "Lost Lead",
        oldLifecycle: "In process",
        action: "update",
      },
      "contact.lifecycle.updated",
      silentLog,
    );
    expect(forceTransitionMock).toHaveBeenCalledTimes(1);
    expect(forceTransitionMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "lost", by: "human" }),
    );
  });

  it("ignores forward lifecycle changes (Customer, Payment, In process)", async () => {
    for (const fwd of ["Customer", "Payment", "In process"]) {
      forceTransitionMock.mockClear();
      const result = await handleContactStateEvent(
        {
          contact: { id: 445381935 },
          lifecycle: fwd,
          action: "update",
        },
        "contact.lifecycle.updated",
        silentLog,
      );
      expect(forceTransitionMock).not.toHaveBeenCalled();
      expect(result.action).toBe("noop");
      if (result.action === "noop") {
        expect(result.reason).toBe(`lifecycle_forward:${fwd}`);
      }
    }
  });

  it("noop when payload has no lifecycle string at all", async () => {
    const result = await handleContactStateEvent(
      { contact: { id: 445381935 }, action: "update" },
      "contact.lifecycle.updated",
      silentLog,
    );
    expect(forceTransitionMock).not.toHaveBeenCalled();
    expect(result.action).toBe("noop");
  });
});

describe("contact-state-event — guard rails", () => {
  it("returns no_conversation when DB has no row for this contact", async () => {
    setMockConversation(null);
    const result = await handleContactStateEvent(
      {
        contact: { id: 445381935 },
        tag: "deposit_paid",
        action: "remove",
      },
      "contact.tag.updated",
      silentLog,
    );
    expect(forceTransitionMock).not.toHaveBeenCalled();
    expect(result.action).toBe("no_conversation");
  });

  it("noops when contactId is missing entirely", async () => {
    const result = await handleContactStateEvent(
      { tag: "deposit_paid", action: "remove" },
      "contact.tag.updated",
      silentLog,
    );
    expect(forceTransitionMock).not.toHaveBeenCalled();
    expect(result.action).toBe("noop");
  });

  it("falls through to tag_event_ignored for unrecognized events", async () => {
    const result = await handleContactStateEvent(
      { contact: { id: 445381935 } },
      "contact.something.weird",
      silentLog,
    );
    expect(forceTransitionMock).not.toHaveBeenCalled();
    expect(result.action).toBe("tag_event_ignored");
  });
});

// ─── conversation.assignee.* (Miguel rule 2026-06-05) ─────────────────────
describe("contact-state-event — conversation.assignee.changed", () => {
  it("human takeover (assignee != AI bot id) sets human_took_over flag + transitions to handed_off", async () => {
    setMockConversation({ id: "conv_xyz", leadStage: "engaged" });
    const result = await handleContactStateEvent(
      {
        contact: { id: 445381935 },
        assignee: 7733, // human user id (not the mocked AI id 999)
        oldAssignee: 999,
      },
      "conversation.assignee.changed",
      silentLog,
    );
    expect(forceTransitionMock).toHaveBeenCalledTimes(1);
    expect(forceTransitionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversacionId: "conv_xyz",
        to: "handed_off",
        by: "human",
        note: "respond_io_human_takeover:7733",
        metadataPatch: expect.objectContaining({
          human_took_over: true,
          human_took_over_by: "7733",
        }),
      }),
    );
    expect(result.action).toBe("human_takeover");
  });

  it("assignee = AI bot id is a no-op (handed back to AI, flag not set)", async () => {
    setMockConversation({ id: "conv_xyz", leadStage: "engaged" });
    const result = await handleContactStateEvent(
      {
        contact: { id: 445381935 },
        assignee: 999, // matches mocked RESPOND_IO_AI_ASSIGNEE_ID
      },
      "conversation.assignee.changed",
      silentLog,
    );
    expect(forceTransitionMock).not.toHaveBeenCalled();
    expect(result.action).toBe("human_released");
  });

  it("assignee = null with flag previously set clears the flag", async () => {
    // Note: stage reset behavior is covered by a separate test below
    // ("human unassigns with flag set → same resume path"). Here we lock
    // the metadata-side contract: flag and its diagnostic keys are stripped.
    setMockConversation({
      id: "conv_xyz",
      leadStage: "handed_off",
      leadMetadata: { human_took_over: true, human_took_over_by: "7733" },
    });
    const result = await handleContactStateEvent(
      {
        contact: { id: 445381935 },
        assignee: null,
      },
      "conversation.assignee.changed",
      silentLog,
    );
    expect(result.action).toBe("human_released");
    if (result.action === "human_released") {
      expect(result.clearedFlag).toBe(true);
    }
    // The update call should have stripped the flag keys.
    expect(updateCalls.length).toBeGreaterThan(0);
    const lastUpdate = updateCalls[updateCalls.length - 1]!.set;
    expect(lastUpdate.leadMetadata).toBeDefined();
    const meta = lastUpdate.leadMetadata as Record<string, unknown>;
    expect(meta.human_took_over).toBeUndefined();
    expect(meta.human_took_over_by).toBeUndefined();
  });

  it("human re-assigns BACK to AI bot → flag cleared AND lead_stage forced from handed_off → qualified (Miguel resume rule)", async () => {
    setMockConversation({
      id: "conv_xyz",
      leadStage: "handed_off",
      leadMetadata: { human_took_over: true, human_took_over_by: "7733" },
    });
    const result = await handleContactStateEvent(
      {
        contact: { id: 445381935 },
        assignee: 999, // back to AI bot
      },
      "conversation.assignee.changed",
      silentLog,
    );
    expect(result.action).toBe("human_released");
    if (result.action === "human_released") {
      expect(result.clearedFlag).toBe(true);
    }
    // Flag cleared via direct update
    const lastUpdate = updateCalls[updateCalls.length - 1]!.set;
    const meta = lastUpdate.leadMetadata as Record<string, unknown>;
    expect(meta.human_took_over).toBeUndefined();
    // Stage reset triggered
    expect(forceTransitionMock).toHaveBeenCalledTimes(1);
    expect(forceTransitionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "qualified",
        by: "human",
        note: "respond_io_human_release:999",
      }),
    );
  });

  it("human unassigns (assignee=null) with flag set → same resume path (flag + stage)", async () => {
    setMockConversation({
      id: "conv_xyz",
      leadStage: "handed_off",
      leadMetadata: { human_took_over: true, human_took_over_by: "7733" },
    });
    const result = await handleContactStateEvent(
      {
        contact: { id: 445381935 },
        assignee: null,
      },
      "conversation.assignee.changed",
      silentLog,
    );
    expect(result.action).toBe("human_released");
    expect(forceTransitionMock).toHaveBeenCalledTimes(1);
    expect(forceTransitionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "qualified",
        note: "respond_io_human_release:null",
      }),
    );
  });

  it("release path does NOT reset lead_stage when flag was never set (avoids undoing AI-driven handoffs)", async () => {
    setMockConversation({
      id: "conv_xyz",
      leadStage: "handed_off",
      leadMetadata: {}, // no human_took_over flag
    });
    await handleContactStateEvent(
      {
        contact: { id: 445381935 },
        assignee: 999,
      },
      "conversation.assignee.changed",
      silentLog,
    );
    // AI's own handoff_human escalation has its own semantics; the
    // reassign-to-AI gesture should not undo that judgment.
    expect(forceTransitionMock).not.toHaveBeenCalled();
  });

  it("accepts assignee wrapped in data.* (legacy payload shape)", async () => {
    setMockConversation({ id: "conv_xyz", leadStage: "engaged" });
    const result = await handleContactStateEvent(
      {
        contact: { id: 445381935 },
        data: { assignee: 7733 },
      },
      "conversation.assignee.updated",
      silentLog,
    );
    expect(forceTransitionMock).toHaveBeenCalledTimes(1);
    expect(result.action).toBe("human_takeover");
  });
});
