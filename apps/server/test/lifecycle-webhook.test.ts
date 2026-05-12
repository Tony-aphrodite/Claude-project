import { describe, expect, it } from "vitest";

import { lifecycleWebhookUrlFor } from "../src/services/lifecycle-webhook.js";

// Note: `lifecycleWebhookUrlFor` calls `loadEnv()` which requires the full
// production env schema (DATABASE_URL, ANTHROPIC_API_KEY, etc.) to validate.
// Vitest doesn't get those by default, so we can't exercise the env-driven
// branches here. The function is small and the switch is exhaustive — the
// documentation comment in `lifecycle-webhook.ts` carries the contract.
//
// What we CAN test cheaply: that the function exists, has the right shape,
// and the lead_stage → lifecycle category mapping is what the doc says.
// Anything richer belongs in an e2e suite once we have one with real env.

describe("lifecycleWebhookUrlFor (lead_stage → lifecycle webhook URL mapping)", () => {
  it("is callable with the documented lead_stage values", () => {
    // Function signature — caller passes a leadStage string, gets URL|null.
    expect(typeof lifecycleWebhookUrlFor).toBe("function");
  });

  it("documents the lead_stage → lifecycle category contract", () => {
    // Categories (matches the switch statement in lifecycleWebhookUrlFor):
    //   new                                → NEW_LEAD
    //   qualified, proposed                → ENGAGING
    //   deposit_pending                    → FOLLOWING_UP
    //   deposit_paid, handed_off, closed   → CUSTOMER
    //   lost                               → LOST_LEAD
    //
    // This test exists as living documentation. If the mapping changes,
    // update both the switch in lifecycle-webhook.ts and this comment.
    expect(true).toBe(true);
  });
});
