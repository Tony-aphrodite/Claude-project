// Tests for the panel deposit-confirmation handoff text. The helper lives in
// apps/panel/src/lib/handoff-text.ts; we import it directly from this server-
// side test because the panel package doesn't have vitest configured and the
// monorepo allows the cross-package relative import. Owner spec:
// reference/INSTRUCCIONES_PAGO_GiliTrawangansteve.md §7 mensaje-deposito-confirmado.

import { describe, expect, it } from "vitest";

import { buildHandoffText } from "../../panel/src/lib/handoff-text.js";

const SCHOOL_URL = "https://maps.app.goo.gl/9e7PLpg1WU8b8S9R9";

describe("buildHandoffText — owner spec INSTRUCCIONES_PAGO §7", () => {
  describe("with programa + fecha", () => {
    it("renders the Spanish lead with [PROGRAMA] / [FECHA] filled in", () => {
      const txt = buildHandoffText("es", { programa: "Open Water", fecha: "2026-05-15" });
      expect(txt).toContain("¡Depósito confirmado ✅!");
      expect(txt).toContain("Open Water");
      expect(txt).toContain("2026-05-15");
    });

    it("renders the English lead with [PROGRAMA] / [FECHA] filled in", () => {
      const txt = buildHandoffText("en", { programa: "Advanced Open Water", fecha: "2026-06-02" });
      expect(txt).toContain("Deposit confirmed ✅");
      expect(txt).toContain("Advanced Open Water");
      expect(txt).toContain("2026-06-02");
    });
  });

  describe("with missing programa or fecha", () => {
    it("never emits literal [PROGRAMA] / [FECHA] placeholders", () => {
      for (const ctx of [
        { programa: null, fecha: null },
        { programa: "OW", fecha: null },
        { programa: null, fecha: "2026-05-15" },
      ]) {
        const txt = buildHandoffText("es", ctx);
        expect(txt).not.toContain("[PROGRAMA]");
        expect(txt).not.toContain("[FECHA]");
      }
    });

    it("falls back to a shorter Spanish lead when both are missing", () => {
      const txt = buildHandoffText("es", { programa: null, fecha: null });
      expect(txt).toContain("¡Depósito confirmado ✅! Tu lugar está reservado.");
    });

    it("falls back to a shorter English lead when both are missing", () => {
      const txt = buildHandoffText("en", { programa: null, fecha: null });
      expect(txt).toContain("Deposit confirmed ✅ Your spot is locked in.");
    });
  });

  describe("required spec content (Spanish)", () => {
    const txt = buildHandoffText("es", { programa: "OW", fecha: "2026-05-15" });
    it("asks for full name", () => {
      expect(txt).toContain("Nombre completo (como figura en tu documento)");
    });
    it("asks for T-shirt size in the XS-4XL range", () => {
      expect(txt).toContain("Talla de camiseta (XS a 4XL)");
    });
    it("asks for European shoe size", () => {
      expect(txt).toContain("Talla de calzado europeo");
    });
    it("includes the school maps URL", () => {
      expect(txt).toContain(SCHOOL_URL);
    });
    it("explains the day-before 8am-6pm registration window", () => {
      expect(txt).toContain("8am y 6pm");
    });
    it("ends with the human handoff line", () => {
      expect(txt).toMatch(/Mi compañero\/a de Gili Trawangan/);
    });
  });

  describe("required spec content (English)", () => {
    const txt = buildHandoffText("en", { programa: "OW", fecha: "2026-05-15" });
    it("asks for full name", () => {
      expect(txt).toContain("Full name (as on your ID)");
    });
    it("asks for T-shirt size in the XS-4XL range", () => {
      expect(txt).toContain("T-shirt size (XS to 4XL)");
    });
    it("asks for European shoe size", () => {
      expect(txt).toContain("European shoe size");
    });
    it("includes the school maps URL", () => {
      expect(txt).toContain(SCHOOL_URL);
    });
    it("explains the day-before 8am-6pm registration window", () => {
      expect(txt).toContain("8am and 6pm");
    });
    it("ends with the human handoff line", () => {
      expect(txt).toMatch(/My colleague from Gili Trawangan/);
    });
  });

  describe("language fallback", () => {
    it("defaults to Spanish for unknown language codes", () => {
      const txt = buildHandoffText("it", { programa: null, fecha: null });
      expect(txt).toContain("¡Depósito confirmado");
    });

    it("defaults to Spanish for null/undefined", () => {
      expect(buildHandoffText(null, { programa: null, fecha: null })).toContain(
        "¡Depósito confirmado",
      );
      expect(buildHandoffText(undefined, { programa: null, fecha: null })).toContain(
        "¡Depósito confirmado",
      );
    });
  });

  describe("paragraph spacing (WhatsApp readability)", () => {
    it("separates lead / sizing / location / handoff with blank lines", () => {
      const txt = buildHandoffText("es", { programa: "OW", fecha: "2026-05-15" });
      expect(txt).toMatch(/2026-05-15\.\n\nPara terminar la reserva/);
      expect(txt).toMatch(/Talla de calzado europeo\n\nAdemás/);
      expect(txt).toMatch(/9e7PLpg1WU8b8S9R9\n\nMi compañero/);
    });
  });
});
