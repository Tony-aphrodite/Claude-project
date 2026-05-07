import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory state shared between mocks. Each test resets it via beforeEach.
type FakeRow = { id: string; leadStage: string; leadStageChangedAt: Date };
const state: { rows: FakeRow[]; transitions: { id: string; to: string; by: string; note: string }[] } = {
  rows: [],
  transitions: [],
};

vi.mock("@dpm/db", async () => {
  const actual = await vi.importActual<typeof import("@dpm/db")>("@dpm/db");
  return {
    ...actual,
    getDb: () => ({
      select: () => ({
        from: () => ({
          where: () => state.rows
            .filter((r) => r.leadStage === "deposit_pending" && r.leadStageChangedAt <= state.cutoff!)
            .map((r) => ({ id: r.id })),
        }),
      }),
    }),
  };
});

vi.mock("../src/services/lead-stage.js", () => ({
  leadStageService: {
    forceTransition: async ({
      conversacionId,
      to,
      by,
      note,
    }: { conversacionId: string; to: string; by: string; note: string }) => {
      state.transitions.push({ id: conversacionId, to, by, note });
      const row = state.rows.find((r) => r.id === conversacionId);
      if (row) row.leadStage = to;
      return { ok: true };
    },
  },
}));

vi.mock("../src/logger.js", () => ({
  getLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
}));

const { expireStaleDepositPending } = await import("../src/services/follow-up.js");

declare module "vitest" {
  // Augmenting global state holder so the where()-mock can read the cutoff.
}
(state as { cutoff: Date | null }).cutoff = null;

describe("expireStaleDepositPending — owner spec INSTRUCCIONES_PAGO §1 (72h)", () => {
  beforeEach(() => {
    state.rows = [];
    state.transitions = [];
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-10T12:00:00Z"));
    // Set cutoff so the where()-mock can filter consistently with the SUT.
    (state as { cutoff: Date }).cutoff = new Date(
      new Date("2026-05-10T12:00:00Z").getTime() - 72 * 60 * 60 * 1000,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("moves a 73h-old deposit_pending lead to lost", async () => {
    state.rows.push({
      id: "c1",
      leadStage: "deposit_pending",
      leadStageChangedAt: new Date("2026-05-07T10:00:00Z"), // 74h ago
    });

    const { expired } = await expireStaleDepositPending();

    expect(expired).toBe(1);
    expect(state.transitions).toHaveLength(1);
    expect(state.transitions[0]).toMatchObject({
      id: "c1",
      to: "lost",
      by: "system",
      note: "deposit_pending_timeout_72h",
    });
  });

  it("leaves a 71h-old deposit_pending lead alone", async () => {
    state.rows.push({
      id: "c2",
      leadStage: "deposit_pending",
      leadStageChangedAt: new Date("2026-05-07T13:30:00Z"), // 70.5h ago
    });

    const { expired } = await expireStaleDepositPending();

    expect(expired).toBe(0);
    expect(state.transitions).toHaveLength(0);
  });

  it("ignores leads in other stages", async () => {
    state.rows.push(
      { id: "p1", leadStage: "proposed", leadStageChangedAt: new Date("2026-04-01T00:00:00Z") },
      { id: "n1", leadStage: "new", leadStageChangedAt: new Date("2026-04-01T00:00:00Z") },
      { id: "h1", leadStage: "handed_off", leadStageChangedAt: new Date("2026-04-01T00:00:00Z") },
    );

    const { expired } = await expireStaleDepositPending();

    expect(expired).toBe(0);
    expect(state.transitions).toHaveLength(0);
  });

  it("expires multiple stale leads in one pass", async () => {
    for (let i = 0; i < 3; i++) {
      state.rows.push({
        id: `c${i}`,
        leadStage: "deposit_pending",
        leadStageChangedAt: new Date("2026-05-06T00:00:00Z"), // 4 days ago
      });
    }

    const { expired } = await expireStaleDepositPending();

    expect(expired).toBe(3);
    expect(state.transitions.map((t) => t.to)).toEqual(["lost", "lost", "lost"]);
  });
});
