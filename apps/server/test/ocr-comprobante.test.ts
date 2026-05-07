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

  it("accepts amount within ±0.50 tolerance (high)", () => {
    const r = reconcile(
      { amount: 40.5, currency: "EUR", beneficiary: null, refCode: "DPM-A1B2C3", date: null },
      expected,
    );
    expect(r.validated).toBe(true);
  });

  it("accepts amount within ±0.50 tolerance (low)", () => {
    const r = reconcile(
      { amount: 39.5, currency: "EUR", beneficiary: null, refCode: "DPM-A1B2C3", date: null },
      expected,
    );
    expect(r.validated).toBe(true);
  });

  it("rejects amount above tolerance", () => {
    const r = reconcile(
      { amount: 41, currency: "EUR", beneficiary: null, refCode: "DPM-A1B2C3", date: null },
      expected,
    );
    expect(r.validated).toBe(false);
    expect(r.mismatches).toContain("amount_mismatch");
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

  it("treats IDR amounts the same way (700,000 ±0.50)", () => {
    const idrExpected: ExpectedDeposit = { refCode: "DPM-IDR123", currency: "IDR", amount: 700_000 };
    expect(
      reconcile(
        { amount: 700_000, currency: "IDR", beneficiary: null, refCode: "DPM-IDR123", date: null },
        idrExpected,
      ).validated,
    ).toBe(true);
    expect(
      reconcile(
        { amount: 699_999.5, currency: "IDR", beneficiary: null, refCode: "DPM-IDR123", date: null },
        idrExpected,
      ).validated,
    ).toBe(true);
    expect(
      reconcile(
        { amount: 700_001, currency: "IDR", beneficiary: null, refCode: "DPM-IDR123", date: null },
        idrExpected,
      ).validated,
    ).toBe(false);
  });
});
