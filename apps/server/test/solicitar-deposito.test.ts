import { describe, expect, it } from "vitest";

import { solicitarDepositoInputSchema } from "@dpm/shared";

import {
  generateRefCode,
  parseSolicitarDepositoInput,
} from "../src/tools/solicitar-deposito.js";
import {
  buildPaymentInstructions,
  sedeHasAutomaticGateway,
} from "../src/services/deposit-instructions.js";

describe("generateRefCode", () => {
  it("starts with DPM- and contains 6 alphanumerics", () => {
    const code = generateRefCode();
    expect(code).toMatch(/^DPM-[A-HJKMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it("avoids ambiguous characters (0/O, 1/I/L)", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRefCode();
      const body = code.slice(4);
      expect(body).not.toMatch(/[0O1IL]/);
    }
  });

  it("produces unique codes across many invocations (collision probability negligible)", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 200; i++) codes.add(generateRefCode());
    expect(codes.size).toBe(200);
  });
});

describe("parseSolicitarDepositoInput", () => {
  it("accepts a valid payload", () => {
    const out = parseSolicitarDepositoInput({
      sede_id: "11111111-1111-1111-1111-111111111111",
      cliente_idioma: "es",
      moneda_cliente: "EUR",
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.moneda_cliente).toBe("EUR");
    }
  });

  it("rejects invalid currency", () => {
    const out = parseSolicitarDepositoInput({
      sede_id: "11111111-1111-1111-1111-111111111111",
      cliente_idioma: "es",
      moneda_cliente: "JPY",
    });
    expect(out.ok).toBe(false);
  });

  it("rejects non-uuid sede_id", () => {
    const out = parseSolicitarDepositoInput({
      sede_id: "not-a-uuid",
      cliente_idioma: "es",
      moneda_cliente: "EUR",
    });
    expect(out.ok).toBe(false);
  });

  it("zod schema directly mirrors the parser result", () => {
    const ok = solicitarDepositoInputSchema.safeParse({
      sede_id: "11111111-1111-1111-1111-111111111111",
      cliente_idioma: "en",
      moneda_cliente: "USD",
    });
    expect(ok.success).toBe(true);
  });
});

describe("buildPaymentInstructions", () => {
  it("includes amount, currency, ref code, and the warning footer in Spanish by default", () => {
    const txt = buildPaymentInstructions({
      sedeNombre: "Gili Trawangan",
      language: "es",
      currency: "EUR",
      refCode: "DPM-A7B3K2",
    });
    expect(txt).toContain("40 EUR");
    expect(txt).toContain("DPM-A7B3K2");
    expect(txt).toContain("no reembolsable");
    expect(txt).toContain("provisional"); // placeholder marker
  });

  it("switches to English when language starts with en", () => {
    const txt = buildPaymentInstructions({
      sedeNombre: "Koh Tao",
      language: "en",
      currency: "USD",
      refCode: "DPM-AAAAAA",
    });
    expect(txt).toContain("non-refundable");
    expect(txt).toContain("DPM-AAAAAA");
  });

  it("offers Stripe only on Koh Tao (Indonesia rules out Stripe)", () => {
    const koh = buildPaymentInstructions({
      sedeNombre: "Koh Tao",
      language: "es",
      currency: "THB",
      refCode: "DPM-XYZABC",
    });
    expect(koh).toMatch(/Stripe/);

    const gili = buildPaymentInstructions({
      sedeNombre: "Gili Trawangan",
      language: "es",
      currency: "IDR",
      refCode: "DPM-XYZABC",
    });
    expect(gili).not.toMatch(/Stripe/);
  });

  it("Indonesian sedes mention IDR cash option", () => {
    const txt = buildPaymentInstructions({
      sedeNombre: "Nusa Penida",
      language: "es",
      currency: "IDR",
      refCode: "DPM-XYZABC",
    });
    expect(txt).toMatch(/Efectivo IDR/);
  });
});

describe("sedeHasAutomaticGateway", () => {
  it("reports automatic gateway only for Koh Tao", () => {
    expect(sedeHasAutomaticGateway("Koh Tao")).toBe(true);
    expect(sedeHasAutomaticGateway("Koh Phi Phi")).toBe(false);
    expect(sedeHasAutomaticGateway("Gili Trawangan")).toBe(false);
    expect(sedeHasAutomaticGateway("Gili Air")).toBe(false);
    expect(sedeHasAutomaticGateway("Nusa Penida")).toBe(false);
  });
});
