import { describe, expect, it } from "vitest";

import { reconcile, type ExpectedDeposit } from "../src/services/ocr-comprobante.js";

const expected: ExpectedDeposit = {
  refCode: "DPM-A1B2C3",
  currency: "EUR",
  amount: 40,
};

describe("reconcile — owner spec INSTRUCCIONES_PAGO §5 validation rules", () => {
  it("validates a perfect match", () => {
    const r = reconcile(
      { amount: 40, currency: "EUR", beneficiary: "DPM Diving Gili T LLC", refCode: "DPM-A1B2C3", date: "2026-05-08" },
      expected,
    );
    expect(r.validated).toBe(true);
    expect(r.mismatches).toEqual([]);
  });

  it("accepts amount within -2% tolerance (bank fees absorbed)", () => {
    const r = reconcile(
      { amount: 39.21, currency: "EUR", beneficiary: null, refCode: "DPM-A1B2C3", date: null },
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

  it("flags amount_too_low when client paid less than expected -2%", () => {
    const r = reconcile(
      { amount: 38, currency: "EUR", beneficiary: null, refCode: "DPM-A1B2C3", date: null },
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
  });

  it("rejects wrong ref code", () => {
    const r = reconcile(
      { amount: 40, currency: "EUR", beneficiary: null, refCode: "DPM-XYZXYZ", date: null },
      expected,
    );
    expect(r.mismatches).toContain("ref_code_mismatch");
  });

  it("normalizes ref code whitespace + case before comparing", () => {
    const r = reconcile(
      { amount: 40, currency: "EUR", beneficiary: null, refCode: "  dpm-a1b2c3  ", date: null },
      expected,
    );
    expect(r.validated).toBe(true);
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

  // 2026-05-12 — beneficiary "soft match" tightening. Previously, a PDF
  // whose ref code mismatched but whose amount + currency + beneficiary
  // matched would auto-confirm with softMatch: "no_refcode_beneficiary_ok".
  // Miguel demonstrated that this lets ANY prior DPM transfer (e.g.
  // Bertrand Klein's 40 EUR Wise PDF from a different booking) re-validate
  // a new conversation. The fallback now reports softMatch but keeps
  // validated=false so the lead stays in deposit_pending for human review.
  it("beneficiary soft match no longer auto-validates a ref-mismatched PDF", () => {
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
    expect(r.validated).toBe(false);
    expect(r.softMatch).toBe("no_refcode_beneficiary_ok");
    expect(r.mismatches).toContain("ref_code_mismatch");
  });

  it("scales tolerance with amount (IDR 700,000 ±2% = ±14,000)", () => {
    const idrExpected: ExpectedDeposit = { refCode: "DPM-IDR123", currency: "IDR", amount: 700_000 };
    // exact match
    expect(
      reconcile(
        { amount: 700_000, currency: "IDR", beneficiary: null, refCode: "DPM-IDR123", date: null },
        idrExpected,
      ).validated,
    ).toBe(true);
    // -1.5% — within tolerance
    expect(
      reconcile(
        { amount: 689_500, currency: "IDR", beneficiary: null, refCode: "DPM-IDR123", date: null },
        idrExpected,
      ).validated,
    ).toBe(true);
    // -3% — under tolerance
    expect(
      reconcile(
        { amount: 679_000, currency: "IDR", beneficiary: null, refCode: "DPM-IDR123", date: null },
        idrExpected,
      ).validated,
    ).toBe(false);
  });
});
