import { describe, expect, it } from "vitest";

import {
  LEAD_STAGES,
  LEAD_STAGE_TRANSITIONS,
  type LeadStage,
} from "@dpm/shared";

describe("LEAD_STAGES", () => {
  it("contains exactly the eight canonical states", () => {
    expect(LEAD_STAGES).toEqual([
      "new",
      "qualified",
      "proposed",
      "deposit_pending",
      "deposit_paid",
      "handed_off",
      "closed",
      "lost",
    ]);
  });

  it("every stage has a transition entry (even if empty)", () => {
    for (const s of LEAD_STAGES) {
      expect(LEAD_STAGE_TRANSITIONS).toHaveProperty(s);
      expect(Array.isArray(LEAD_STAGE_TRANSITIONS[s])).toBe(true);
    }
  });
});

describe("LEAD_STAGE_TRANSITIONS", () => {
  it("terminal states have no outgoing edges", () => {
    expect(LEAD_STAGE_TRANSITIONS.closed).toEqual([]);
    expect(LEAD_STAGE_TRANSITIONS.lost).toEqual([]);
  });

  it("every non-terminal stage can reach 'lost' (negative intent path)", () => {
    const nonTerminal: LeadStage[] = [
      "new",
      "qualified",
      "proposed",
      "deposit_pending",
      "deposit_paid",
      "handed_off",
    ];
    for (const s of nonTerminal) {
      expect(LEAD_STAGE_TRANSITIONS[s]).toContain("lost");
    }
  });

  it("only deposit_pending advances to deposit_paid (forward path)", () => {
    for (const s of LEAD_STAGES) {
      const advances = LEAD_STAGE_TRANSITIONS[s].includes("deposit_paid");
      expect(advances).toBe(s === "deposit_pending");
    }
  });

  it("only deposit_paid advances to handed_off", () => {
    for (const s of LEAD_STAGES) {
      const advances = LEAD_STAGE_TRANSITIONS[s].includes("handed_off");
      expect(advances).toBe(s === "deposit_paid");
    }
  });

  it("only handed_off advances to closed", () => {
    for (const s of LEAD_STAGES) {
      const advances = LEAD_STAGE_TRANSITIONS[s].includes("closed");
      expect(advances).toBe(s === "handed_off");
    }
  });

  it("forward edges are strictly forward (no backward edges in canonical map)", () => {
    const order: Record<LeadStage, number> = {
      new: 0,
      qualified: 1,
      proposed: 2,
      deposit_pending: 3,
      deposit_paid: 4,
      handed_off: 5,
      closed: 6,
      lost: 7, // lost is special — reachable from anywhere
    };
    for (const from of LEAD_STAGES) {
      for (const to of LEAD_STAGE_TRANSITIONS[from]) {
        if (to === "lost") continue;
        expect(order[to]).toBeGreaterThan(order[from]);
      }
    }
  });
});
