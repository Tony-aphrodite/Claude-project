import { describe, expect, it } from "vitest";

import { checkDeterministic } from "../src/layers/deterministic.js";
import type { RegressionCase } from "../src/types.js";

const baseCase: RegressionCase = {
  id: "t",
  sedeId: "s",
  sedeName: "Gili Trawangan",
  clientMessage: "info",
  history: [],
  expected: {},
};

describe("checkDeterministic — global rules", () => {
  it("flags absolute promises", () => {
    const v = checkDeterministic(baseCase, "Te garantizamos plaza el sábado.");
    expect(v.passed).toBe(false);
    expect(v.failures.some((f) => f.rule === "no_absolutes")).toBe(true);
  });

  it("flags other-sede leakage", () => {
    const v = checkDeterministic(
      baseCase,
      "También tenemos en Koh Tao si querés.",
    );
    expect(v.passed).toBe(false);
    expect(v.failures.some((f) => f.rule === "no_other_sede_leak")).toBe(true);
  });

  it("flags price words without a currency", () => {
    const v = checkDeterministic(
      baseCase,
      "El precio del Open Water es 4500 por persona.",
    );
    expect(v.failures.some((f) => f.rule === "currency_required_when_pricing")).toBe(
      true,
    );
  });

  it("passes a clean response", () => {
    const v = checkDeterministic(
      baseCase,
      "Open Water son 3 días. ¿Cuándo llegás a Gili Trawangan?",
    );
    expect(v.passed).toBe(true);
  });
});

describe("checkDeterministic — per-case rules", () => {
  it("enforces mustInclude", () => {
    const v = checkDeterministic(
      { ...baseCase, expected: { mustInclude: [/IDR/] } },
      "Open Water cuesta Rp 4.500.000.",
    );
    expect(v.passed).toBe(false);
    expect(v.failures.some((f) => f.rule === "must_include")).toBe(true);
  });

  it("enforces mustExclude", () => {
    const v = checkDeterministic(
      { ...baseCase, expected: { mustExclude: [/competencia/] } },
      "La competencia es buena pero nosotros mejor.",
    );
    expect(v.passed).toBe(false);
    expect(v.failures.some((f) => f.rule === "must_exclude")).toBe(true);
  });
});
