import { describe, expect, it } from "vitest";

import { reconcile, type ExpectedDeposit } from "../src/services/ocr-comprobante.js";

const expected: ExpectedDeposit = {
  refCode: "DPM-A1B2C3",
  currency: "EUR",
  amount: 40,
};

// Retuned 2026-05-13 (Miguel feedback after real-customer chat review,
// see 5-13-feedback-deposit-autoconfirm-spec.md):
//   - Ref code is INFORMATIONAL only — still extracted + reported in
//     `mismatches` for audit, but does NOT gate `validated`.
//   - Amount tolerance widened from ±2 % to ±5 % to absorb the noisier
//     OCR readings we get from mobile-banking screenshots (vs the old
//     PDF-only assumption).
//   - Currency + amount remain hard gates.
//
// The "beneficiary soft match" path was removed entirely — it was a
// partial mitigation for the ref-code gate problem that is solved
// directly by relaxing the gate itself.
describe("reconcile — auto-confirm rules (post 2026-05-13 retune)", () => {
  it("validates a perfect match", () => {
    const r = reconcile(
      { amount: 40, currency: "EUR", beneficiary: "DPM Diving Gili T LLC", refCode: "DPM-A1B2C3", date: "2026-05-08" },
      expected,
    );
    expect(r.validated).toBe(true);
    expect(r.mismatches).toEqual([]);
  });

  it("accepts amount within -5% tolerance (OCR jitter + bank fees absorbed)", () => {
    // 40 * 0.96 = 38.4 → inside the new -5% lower bound
    const r = reconcile(
      { amount: 38.4, currency: "EUR", beneficiary: null, refCode: "DPM-A1B2C3", date: null },
      expected,
    );
    expect(r.validated).toBe(true);
  });

  it("accepts amount slightly over expected", () => {
    const r = reconcile(
      { amount: 40.5, currency: "EUR", beneficiary: null, refCode: "DPM-A1B2C3", date: null },
      expected,
    );
    expect(r.validated).toBe(true);
  });

  it("flags amount_too_low when client paid less than expected -5%", () => {
    // 40 * 0.93 = 37.2 → under the new -5% lower bound (which is 38.0)
    const r = reconcile(
      { amount: 37.2, currency: "EUR", beneficiary: null, refCode: "DPM-A1B2C3", date: null },
      expected,
    );
    expect(r.validated).toBe(false);
    expect(r.mismatches).toContain("amount_too_low");
  });

  it("flags amount_too_high when client paid more than +10% (possible duplicate)", () => {
    const r = reconcile(
      { amount: 50, currency: "EUR", beneficiary: null, refCode: "DPM-A1B2C3", date: null },
      expected,
    );
    expect(r.validated).toBe(false);
    expect(r.mismatches).toContain("amount_too_high");
  });

  it("rejects mismatched currency", () => {
    const r = reconcile(
      { amount: 40, currency: "USD", beneficiary: null, refCode: "DPM-A1B2C3", date: null },
      expected,
    );
    expect(r.mismatches).toContain("currency_mismatch");
    expect(r.validated).toBe(false);
  });

  it("reports ref_code_mismatch in mismatches but still validates (informational only)", () => {
    const r = reconcile(
      { amount: 40, currency: "EUR", beneficiary: null, refCode: "DPM-XYZXYZ", date: null },
      expected,
    );
    expect(r.mismatches).toContain("ref_code_mismatch");
    expect(r.validated).toBe(true); // ← amount + currency pass → validated
  });

  it("reports ref_code_missing in mismatches but still validates (the >50%-of-clients case)", () => {
    // Miguel's real-world observation: most clients never paste the
    // DPM code into the bank's Concept/Libellé field. Auto-confirm
    // should still fire because amount + currency match.
    const r = reconcile(
      { amount: 40, currency: "EUR", beneficiary: null, refCode: null, date: null },
      expected,
    );
    expect(r.mismatches).toContain("ref_code_missing");
    expect(r.validated).toBe(true);
  });

  it("normalizes ref code whitespace + case before comparing (still useful for audit)", () => {
    const r = reconcile(
      { amount: 40, currency: "EUR", beneficiary: null, refCode: "  dpm-a1b2c3  ", date: null },
      expected,
    );
    expect(r.validated).toBe(true);
    // ref code matched normalized → no ref_code_* entry in mismatches
    expect(r.mismatches).not.toContain("ref_code_mismatch");
    expect(r.mismatches).not.toContain("ref_code_missing");
  });

  it("flags missing required fields explicitly", () => {
    const r = reconcile(
      { amount: null, currency: null, beneficiary: null, refCode: null, date: null },
      expected,
    );
    expect(r.mismatches).toContain("amount_missing");
    expect(r.mismatches).toContain("currency_missing");
    expect(r.mismatches).toContain("ref_code_missing");
    expect(r.validated).toBe(false);
  });

  // 2026-05-12 risk that drove the original beneficiary-soft-match
  // tightening: Bertrand Klein's 40 EUR Wise PDF from an unrelated
  // booking could re-validate any new EUR/40 conversation. With ref
  // code now informational the same risk still exists at the amount
  // layer — that's why the safety net moves to the auto-confirm
  // dashboard (Phase B): operators cross-reference auto-confirmed
  // rows against actual bank emails landing in gilit@dpmdiving.com.
  // This test pins down the new behavior so a future maintainer
  // doesn't accidentally restore the ref-code gate.
  it("ref-mismatched PDF with matching amount + currency now auto-confirms (dashboard catches abuse)", () => {
    const r = reconcile(
      {
        amount: 40,
        currency: "EUR",
        beneficiary: "DPM Diving Gili T LLC",
        refCode: "Virement de Bertrand KLEIN", // unrelated bank Libellé
        date: "2026-05-07",
      },
      expected,
      "DPM Diving Gili T LLC",
    );
    expect(r.validated).toBe(true);
    expect(r.mismatches).toContain("ref_code_mismatch");
  });

  it("scales tolerance with amount (IDR 700,000 ±5% = ±35,000)", () => {
    const idrExpected: ExpectedDeposit = { refCode: "DPM-IDR123", currency: "IDR", amount: 700_000 };
    // exact match
    expect(
      reconcile(
        { amount: 700_000, currency: "IDR", beneficiary: null, refCode: "DPM-IDR123", date: null },
        idrExpected,
      ).validated,
    ).toBe(true);
    // -4% — within new tolerance
    expect(
      reconcile(
        { amount: 672_000, currency: "IDR", beneficiary: null, refCode: "DPM-IDR123", date: null },
        idrExpected,
      ).validated,
    ).toBe(true);
    // -6% — under tolerance
    expect(
      reconcile(
        { amount: 658_000, currency: "IDR", beneficiary: null, refCode: "DPM-IDR123", date: null },
        idrExpected,
      ).validated,
    ).toBe(false);
  });
});
