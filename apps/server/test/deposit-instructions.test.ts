// Tests for per-sede bank-block selection in deposit-instructions.ts
// (Miguel rule 2026-06-07 — Phi Phi must NOT receive Gili Trawangan
// bank accounts). Also covers the new THB currency support for Phi Phi
// local Thai customers (1,000 THB per person, confirmed Miguel 2026-06-07).

import { describe, expect, it } from "vitest";

import {
  buildPaymentInstructions,
  buildStripeInstructions,
  sedeStripeLink,
  STRIPE_AMOUNT_THB_PER_PAX,
} from "../src/services/deposit-instructions.js";

describe("buildPaymentInstructions — per-sede bank blocks", () => {
  // ─── Phi Phi (new 2026-06-07) ─────────────────────────────────────────
  it("Phi Phi EUR uses 'DPM Diving Phi Phi LLC' beneficiary (not Gili T)", () => {
    const out = buildPaymentInstructions({
      sedeNombre: "Koh Phi Phi",
      language: "en",
      currency: "EUR",
      refCode: "DPM-PP-0607-AB12CD",
      pax: 1,
    });
    expect(out).toContain("DPM Diving Phi Phi LLC");
    expect(out).not.toContain("DPM Diving Gili T LLC");
    // Sanity: still has the EUR-specific Brussels Wise account.
    expect(out).toContain("BE90 9050 3751 2432");
    expect(out).toContain("TRWIBEB1XXX");
  });

  it("Phi Phi GBP uses Phi Phi IBAN + Wise London + BIC TRWIGB2LXXX", () => {
    const out = buildPaymentInstructions({
      sedeNombre: "Koh Phi Phi",
      language: "en",
      currency: "GBP",
      refCode: "DPM-PP-0607-AB12CD",
      pax: 1,
    });
    expect(out).toContain("DPM Diving Phi Phi LLC");
    expect(out).toContain("GB55 TRWI 2314 7029 2762 36");
    expect(out).toContain("29276236");
    // BIC added 2026-06-07 (Miguel follow-up — was missing in original image).
    expect(out).toContain("TRWIGB2LXXX");
  });

  it("Phi Phi AUD uses Wise Australia BIC TRWIAUS1XXX + BSB 774-001", () => {
    const out = buildPaymentInstructions({
      sedeNombre: "Koh Phi Phi",
      language: "en",
      currency: "AUD",
      refCode: "DPM-PP-0607-AB12CD",
      pax: 1,
    });
    expect(out).toContain("DPM Diving Phi Phi LLC");
    expect(out).toContain("221638707");
    expect(out).toContain("774-001"); // with hyphen
    expect(out).toContain("TRWIAUS1XXX"); // confirmed by Miguel
  });

  it("Phi Phi USD shows 'Account type: Checking' (Miguel 2026-06-07)", () => {
    const out = buildPaymentInstructions({
      sedeNombre: "Koh Phi Phi",
      language: "en",
      currency: "USD",
      refCode: "DPM-PP-0607-AB12CD",
      pax: 1,
    });
    expect(out).toContain("Account type: Checking");
  });

  it("Phi Phi USD uses 'Francisco Jose Augier' as the beneficiary (personal account)", () => {
    // Miguel confirmed 2026-06-07: show the personal name as-is to the
    // customer (option A). Account is real but personal-name; customer
    // will see it that way.
    const out = buildPaymentInstructions({
      sedeNombre: "Koh Phi Phi",
      language: "en",
      currency: "USD",
      refCode: "DPM-PP-0607-AB12CD",
      pax: 1,
    });
    expect(out).toContain("Francisco Jose Augier");
    expect(out).toContain("8313706669");
    expect(out).not.toContain("822000685807"); // GT's USD account
  });

  it("Phi Phi THB renders 1,000 THB total for 1 pax (Miguel 2026-06-07)", () => {
    const out = buildPaymentInstructions({
      sedeNombre: "Koh Phi Phi",
      language: "en",
      currency: "THB",
      refCode: "DPM-PP-0607-AB12CD",
      pax: 1,
    });
    expect(out).toContain("1,000 THB"); // thousand separator
    expect(out).toContain("Dpm diving koh phiphi");
    expect(out).toContain("5722989108");
    expect(out).toContain("SICOTHBKXXX");
    expect(out).toContain("SCB"); // Siam Commercial Bank
  });

  it("Phi Phi THB scales correctly: 3 pax × 1,000 = 3,000 THB", () => {
    const out = buildPaymentInstructions({
      sedeNombre: "Koh Phi Phi",
      language: "en",
      currency: "THB",
      refCode: "DPM-PP-0607-AB12CD",
      pax: 3,
    });
    expect(out).toContain("3,000 THB");
  });

  // ─── Gili Trawangan (legacy default — unchanged) ──────────────────────
  it("Gili Trawangan EUR uses 'DPM Diving Gili T LLC' (legacy)", () => {
    const out = buildPaymentInstructions({
      sedeNombre: "Gili Trawangan",
      language: "en",
      currency: "EUR",
      refCode: "DPM-GT-0607-AB12CD",
      pax: 1,
    });
    expect(out).toContain("DPM Diving Gili T LLC");
    expect(out).toContain("BE93 9050 6891 4867");
    expect(out).not.toContain("Phi Phi");
  });

  it("Gili Trawangan IDR uses Bank Mandiri (Indonesian local)", () => {
    const out = buildPaymentInstructions({
      sedeNombre: "Gili Trawangan",
      language: "en",
      currency: "IDR",
      refCode: "DPM-GT-0607-AB12CD",
      pax: 1,
    });
    expect(out).toContain("Bank Mandiri");
    expect(out).toContain("700,000 IDR"); // thousand separator, scale 1 pax × 700,000
  });

  // ─── Fallback behavior ────────────────────────────────────────────────
  it("Unknown sede falls back to Gili Trawangan blocks (safety net)", () => {
    // Sedes not yet configured (Koh Tao / Gili Air / Nusa Penida) get
    // the GT block — preserves legacy behavior. Once those sedes
    // activate, Miguel sends their bank details and we add explicit
    // entries.
    const out = buildPaymentInstructions({
      sedeNombre: "Koh Tao",
      language: "en",
      currency: "EUR",
      refCode: "DPM-KT-0607-AB12CD",
      pax: 1,
    });
    expect(out).toContain("DPM Diving Gili T LLC"); // GT fallback
  });

  it("Phi Phi without IDR config falls back to GT IDR (defensive)", () => {
    // Phi Phi isn't supposed to offer IDR (it's Thailand) but if a
    // customer somehow requests it, the system shouldn't crash —
    // it falls back to GT's IDR block.
    const out = buildPaymentInstructions({
      sedeNombre: "Koh Phi Phi",
      language: "en",
      currency: "IDR",
      refCode: "DPM-PP-0607-AB12CD",
      pax: 1,
    });
    expect(out).toContain("Bank Mandiri"); // GT fallback for IDR
  });

  // ─── Reference code rendering ─────────────────────────────────────────
  it("includes the ref code regardless of sede / currency", () => {
    const out = buildPaymentInstructions({
      sedeNombre: "Koh Phi Phi",
      language: "en",
      currency: "USD",
      refCode: "DPM-PP-TEST-XYZ123",
      pax: 1,
    });
    expect(out).toContain("Reference: DPM-PP-TEST-XYZ123");
  });

  // ─── PDF vs screenshot guidance ───────────────────────────────────────
  it("THB tail says 'share the payment confirmation' (no PDF required — Thai banking apps)", () => {
    const out = buildPaymentInstructions({
      sedeNombre: "Koh Phi Phi",
      language: "en",
      currency: "THB",
      refCode: "DPM-PP-0607-AB12CD",
      pax: 1,
    });
    expect(out).toContain("share the payment confirmation");
    expect(out).not.toContain("PDF");
  });

  it("EUR tail requires PDF (Wise / international bank pattern)", () => {
    const out = buildPaymentInstructions({
      sedeNombre: "Koh Phi Phi",
      language: "en",
      currency: "EUR",
      refCode: "DPM-PP-0607-AB12CD",
      pax: 1,
    });
    expect(out).toContain("PDF");
  });
});

// ─── Stripe (Miguel 2026-06-07) ───────────────────────────────────────────
describe("buildStripeInstructions — Phi Phi credit card option", () => {
  it("constant matches Miguel's spec: 1,000 THB per pax", () => {
    expect(STRIPE_AMOUNT_THB_PER_PAX).toBe(1000);
  });

  it("Phi Phi has a configured Stripe link", () => {
    expect(sedeStripeLink("Koh Phi Phi")).toBe(
      "https://buy.stripe.com/28E5kC8mXakL3VT3jk4AU47",
    );
  });

  it("Other sedes have NO Stripe link (returns undefined)", () => {
    expect(sedeStripeLink("Gili Trawangan")).toBeUndefined();
    expect(sedeStripeLink("Koh Tao")).toBeUndefined();
    expect(sedeStripeLink("Gili Air")).toBeUndefined();
    expect(sedeStripeLink("Nusa Penida")).toBeUndefined();
  });

  it("returns null instructions for sedes without a Stripe link", () => {
    expect(
      buildStripeInstructions({
        sedeNombre: "Gili Trawangan",
        language: "en",
        pax: 1,
      }),
    ).toBeNull();
  });

  it("1 pax: simple message with link + 1,000 THB single charge", () => {
    const out = buildStripeInstructions({
      sedeNombre: "Koh Phi Phi",
      language: "en",
      pax: 1,
    });
    expect(out).toContain("1,000 THB");
    expect(out).toContain("https://buy.stripe.com/28E5kC8mXakL3VT3jk4AU47");
    expect(out).not.toContain("TIMES");
    expect(out).not.toContain("times");
  });

  it("4 pax: instructs customer to use link 4 TIMES + shows total 4,000 THB", () => {
    // Miguel's multi-pax rule: same link reused N times for N pax.
    const out = buildStripeInstructions({
      sedeNombre: "Koh Phi Phi",
      language: "en",
      pax: 4,
    });
    expect(out).toContain("4 TIMES"); // capitalized for emphasis
    expect(out).toContain("1,000 THB per person");
    expect(out).toContain("4,000 THB");
    expect(out).toContain("https://buy.stripe.com/28E5kC8mXakL3VT3jk4AU47");
  });

  it("Spanish: 4 pax shows 4 VECES + un cobro por persona", () => {
    const out = buildStripeInstructions({
      sedeNombre: "Koh Phi Phi",
      language: "es",
      pax: 4,
    });
    expect(out).toContain("4 VECES");
    expect(out).toContain("un cobro por persona");
    expect(out).toContain("4,000 THB");
  });

  it("Spanish: 1 pax simple message", () => {
    const out = buildStripeInstructions({
      sedeNombre: "Koh Phi Phi",
      language: "es",
      pax: 1,
    });
    expect(out).toContain("1,000 THB");
    expect(out).toContain("con tarjeta");
    expect(out).not.toContain("VECES");
  });

  it("pax < 1 defaults to 1 (defensive)", () => {
    const out = buildStripeInstructions({
      sedeNombre: "Koh Phi Phi",
      language: "en",
      pax: 0,
    });
    expect(out).toContain("1,000 THB");
  });
});
