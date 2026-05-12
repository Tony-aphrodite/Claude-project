import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the DB module before importing the handler so the in-handler DB
// lookups go through our stub. The conversation row returned by `limit()`
// is controllable per-test via `setMockConversation()`.
let mockConversation: { id: string; leadStage: string } | null = null;

function setMockConversation(row: { id: string; leadStage: string } | null) {
  mockConversation = row;
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
    }),
  };
});

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
