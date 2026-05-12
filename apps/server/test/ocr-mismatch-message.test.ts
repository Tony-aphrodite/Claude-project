import { describe, expect, it } from "vitest";

import { pickOcrMismatchMessage } from "../src/handlers/process-message.js";
import type { OcrVerdict } from "../src/services/ocr-comprobante.js";

function makeOcrFalse(
  mismatches: string[],
  extraction: { amount: number | null; currency: string | null; refCode?: string | null; beneficiary?: string | null },
): OcrVerdict {
  return {
    ok: true,
    validated: false,
    mismatches,
    extraction: {
      amount: extraction.amount,
      currency: extraction.currency,
      refCode: extraction.refCode ?? null,
      beneficiary: extraction.beneficiary ?? null,
      date: null,
    },
    attachmentMime: "application/pdf",
  };
}

describe("pickOcrMismatchMessage — only clear cases get auto-message", () => {
  it("returns null when OCR validated successfully", () => {
    const ok: OcrVerdict = {
      ok: true,
      validated: true,
      mismatches: [],
      extraction: { amount: 80, currency: "EUR", refCode: "DPM-GT-X", beneficiary: "DPM Diving Gili T LLC", date: null },
      attachmentMime: "application/pdf",
    };
    expect(pickOcrMismatchMessage(ok, 80, "EUR", "es")).toBeNull();
  });

  it("returns null when OCR completely failed (ok=false)", () => {
    const fail: OcrVerdict = { ok: false, reason: "timeout", attachmentMime: "application/pdf" };
    expect(pickOcrMismatchMessage(fail, 80, "EUR", "es")).toBeNull();
  });

  // 2026-05-12 — the Bertrand-Klein scenario: PDF 40 EUR for 80 EUR booking.
  // amount < 80% of expected → clear under-payment, message immediately.
  it("flags amount_too_low when extracted < 80% of expected (Bertrand-Klein case)", () => {
    const v = makeOcrFalse(["amount_too_low"], { amount: 40, currency: "EUR" });
    const msg = pickOcrMismatchMessage(v, 80, "EUR", "es");
    expect(msg).toBeTruthy();
    expect(msg).toContain("40");
    expect(msg).toContain("80");
    expect(msg).toContain("EUR");
  });

  it("English version when language=en", () => {
    const v = makeOcrFalse(["amount_too_low"], { amount: 40, currency: "EUR" });
    const msg = pickOcrMismatchMessage(v, 80, "EUR", "en");
    expect(msg).toMatch(/Just checked the receipt/);
  });

  it("stays silent on amount within ±20% (bank fees territory)", () => {
    // 78 EUR for 80 EUR booking — 2.5% under, could easily be bank fees.
    // Operator should decide, not auto-message.
    const v = makeOcrFalse(["amount_too_low"], { amount: 78, currency: "EUR" });
    expect(pickOcrMismatchMessage(v, 80, "EUR", "es")).toBeNull();
  });

  it("flags currency mismatch with both currencies named", () => {
    const v = makeOcrFalse(["currency_mismatch"], { amount: 80, currency: "USD" });
    const msg = pickOcrMismatchMessage(v, 80, "EUR", "es");
    expect(msg).toBeTruthy();
    expect(msg).toContain("USD");
    expect(msg).toContain("EUR");
  });

  it("flags amount_too_high when > 130% (likely wrong PDF / duplicate)", () => {
    const v = makeOcrFalse(["amount_too_high"], { amount: 200, currency: "EUR" });
    const msg = pickOcrMismatchMessage(v, 80, "EUR", "es");
    expect(msg).toBeTruthy();
    expect(msg).toContain("200");
    expect(msg).toContain("80");
  });

  it("stays silent on amount_too_high within 110-130% (small over-payment)", () => {
    // 100 EUR for 80 EUR booking — 25% over. Suspicious but could be
    // intentional buffer. Operator decides.
    const v = makeOcrFalse(["amount_too_high"], { amount: 100, currency: "EUR" });
    expect(pickOcrMismatchMessage(v, 80, "EUR", "es")).toBeNull();
  });

  it("stays silent on ref_code_mismatch alone (could be typo)", () => {
    const v = makeOcrFalse(["ref_code_mismatch"], { amount: 80, currency: "EUR", refCode: "WRONG-CODE" });
    expect(pickOcrMismatchMessage(v, 80, "EUR", "es")).toBeNull();
  });

  it("Bertrand-Klein scenario triggers amount_too_low (the real-world case)", () => {
    // Exactly what Miguel sent on 2026-05-12: 40 EUR Bertrand-Klein PDF
    // against an 80 EUR 2-pax OW booking. The PDF had wrong ref code too
    // (Libellé: "Virement de Bertrand KLEIN" not DPM-GT-XXXX).
    const v = makeOcrFalse(["amount_too_low", "ref_code_mismatch"], {
      amount: 40,
      currency: "EUR",
      refCode: "Virement de Bertrand KLEIN",
      beneficiary: "DPM Diving Gili T LLC",
    });
    const msg = pickOcrMismatchMessage(v, 80, "EUR", "es");
    expect(msg).toBeTruthy();
    expect(msg).toMatch(/Acabo de revisar/);
    expect(msg).toContain("40");
    expect(msg).toContain("80");
  });
});
