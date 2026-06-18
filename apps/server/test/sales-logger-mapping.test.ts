// Tests for the sales-logger mapping helpers (Miguel spec 2026-06-07).
// Pin every mapping so a wrong-value silent failure (his revenue
// calculator drops to 0 on mismatches) gets caught at PR time, not in
// prod.

import { describe, expect, it } from "vitest";

import {
  agenteCierreFor,
  formatSaleTimestamp,
  marketingAttributionFor,
  programaDisplayName,
  splitContactName,
} from "../src/services/sales-logger-mapping.js";

describe("agenteCierreFor — Miguel confirmed all 5 sedes 2026-06-07", () => {
  // Exact string match matters — Miguel's reporting filters AI rows by
  // these names and his Config tab lists them with this exact spelling.

  it("Koh Phi Phi → 'Francisco Emilio'", () => {
    expect(agenteCierreFor("Koh Phi Phi")).toBe("Francisco Emilio");
  });

  it("Koh Tao → 'Emma'", () => {
    expect(agenteCierreFor("Koh Tao")).toBe("Emma");
  });

  it("Gili Trawangan → 'John'", () => {
    expect(agenteCierreFor("Gili Trawangan")).toBe("John");
  });

  it("Gili Air → 'Colomba'", () => {
    expect(agenteCierreFor("Gili Air")).toBe("Colomba");
  });

  it("Nusa Penida → 'David'", () => {
    expect(agenteCierreFor("Nusa Penida")).toBe("David");
  });

  it("returns empty string for unknown sede names (defensive)", () => {
    expect(agenteCierreFor("Atlantis")).toBe("");
    expect(agenteCierreFor("")).toBe("");
  });
});

describe("programaDisplayName — Koh Phi Phi (Miguel's tarifario 2026-06-07)", () => {
  // All assertions below mirror the EXACT strings in Miguel's tarifario
  // (see reference/koh-phi-phi-2026-06-07-tarifario-phi-phi.md).
  // Any mismatch makes his revenue calculator return 0 for the row.

  it("OW → 'OW 18'", () => {
    expect(programaDisplayName("Koh Phi Phi", "OW")).toBe("OW 18");
  });

  it("TryScuba → 'DSD / Try Scuba' (note spaces around slash)", () => {
    expect(programaDisplayName("Koh Phi Phi", "TryScuba")).toBe(
      "DSD / Try Scuba",
    );
  });

  it("ScubaDiver → 'Scuba Diver'", () => {
    expect(programaDisplayName("Koh Phi Phi", "ScubaDiver")).toBe(
      "Scuba Diver",
    );
  });

  it("OW30 → 'OW 30'", () => {
    expect(programaDisplayName("Koh Phi Phi", "OW30")).toBe("OW 30");
  });

  it("AOW → 'Advanced (AOW)' (note parens are part of the name)", () => {
    expect(programaDisplayName("Koh Phi Phi", "AOW")).toBe("Advanced (AOW)");
  });

  it("Refresh → 'Refresh'", () => {
    expect(programaDisplayName("Koh Phi Phi", "Refresh")).toBe("Refresh");
  });

  it("FunDive → 'Fun Dive'", () => {
    expect(programaDisplayName("Koh Phi Phi", "FunDive")).toBe("Fun Dive");
  });

  it("DeepAdvFD → 'Deep Adventure + Fun Dive'", () => {
    expect(programaDisplayName("Koh Phi Phi", "DeepAdvFD")).toBe(
      "Deep Adventure + Fun Dive",
    );
  });

  it("ReactRight → 'React Right'", () => {
    expect(programaDisplayName("Koh Phi Phi", "ReactRight")).toBe(
      "React Right",
    );
  });

  it("RescueDiver → 'Rescue'", () => {
    expect(programaDisplayName("Koh Phi Phi", "RescueDiver")).toBe("Rescue");
  });

  it("NitroxSpecialty → 'Nitrox Specialty' (NOT just 'Nitrox')", () => {
    expect(programaDisplayName("Koh Phi Phi", "NitroxSpecialty")).toBe(
      "Nitrox Specialty",
    );
  });

  it("DeepSpecialty → 'Deep Specialty (OW cert)' (OW cert is the default variant)", () => {
    expect(programaDisplayName("Koh Phi Phi", "DeepSpecialty")).toBe(
      "Deep Specialty (OW cert)",
    );
  });

  it("returns null for programs not in the Phi Phi tarifario (RefreshAdv, combos, specialties Miguel hasn't priced)", () => {
    // These have CATALOG entries in our enum but no price line in
    // Miguel's tarifario yet. The caller must skip the row + warn.
    // Posting null would zero out his revenue calc — worse than skipping.
    expect(programaDisplayName("Koh Phi Phi", "RefreshAdv")).toBeNull();
    expect(programaDisplayName("Koh Phi Phi", "OWAOWCombo")).toBeNull();
    expect(programaDisplayName("Koh Phi Phi", "OWDeepCombo")).toBeNull();
    expect(programaDisplayName("Koh Phi Phi", "Adventures")).toBeNull();
    expect(programaDisplayName("Koh Phi Phi", "DMT")).toBeNull();
    expect(programaDisplayName("Koh Phi Phi", "StressRescue")).toBeNull();
  });

  it("returns null for sedes without any mapping table", () => {
    expect(programaDisplayName("Koh Tao", "OW")).toBeNull();
    expect(programaDisplayName("Gili Trawangan", "OW")).toBeNull();
  });
});

describe("formatSaleTimestamp — Miguel's spec: 'YYYY-MM-DD HH:MM:SS' (NOT ISO 8601)", () => {
  it("formats with space separator, no T, no Z", () => {
    // 2026-06-07 14:30:00 UTC === 21:30:00 in Asia/Bangkok (+7).
    const out = formatSaleTimestamp(
      "Koh Phi Phi",
      new Date("2026-06-07T14:30:00Z"),
    );
    expect(out).toBe("2026-06-07 21:30:00");
    expect(out).not.toContain("T");
    expect(out).not.toContain("Z");
  });

  it("uses Asia/Bangkok for Phi Phi (UTC+7)", () => {
    const out = formatSaleTimestamp(
      "Koh Phi Phi",
      new Date("2026-06-07T01:00:00Z"),
    );
    // 01:00 UTC = 08:00 Bangkok.
    expect(out).toBe("2026-06-07 08:00:00");
  });

  it("uses Asia/Makassar for Gili Trawangan (UTC+8)", () => {
    const out = formatSaleTimestamp(
      "Gili Trawangan",
      new Date("2026-06-07T01:00:00Z"),
    );
    // 01:00 UTC = 09:00 Makassar.
    expect(out).toBe("2026-06-07 09:00:00");
  });

  it("falls back to Asia/Makassar for unknown sede", () => {
    const out = formatSaleTimestamp(
      "Atlantis",
      new Date("2026-06-07T01:00:00Z"),
    );
    expect(out).toBe("2026-06-07 09:00:00");
  });

  it("handles midnight cleanly (no 24:00:00 artefact)", () => {
    // 16:00 UTC = 23:00 Bangkok ... but what about midnight?
    // 17:00 UTC = 00:00 Bangkok next day.
    const out = formatSaleTimestamp(
      "Koh Phi Phi",
      new Date("2026-06-07T17:00:00Z"),
    );
    expect(out).toBe("2026-06-08 00:00:00");
  });
});

describe("splitContactName", () => {
  it("splits on the LAST space (multi-word first name stays together)", () => {
    expect(splitContactName("Maria Jose Gonzalez")).toEqual({
      firstName: "Maria Jose",
      lastName: "Gonzalez",
    });
  });

  it("handles single-word names (last name empty)", () => {
    expect(splitContactName("Madonna")).toEqual({
      firstName: "Madonna",
      lastName: "",
    });
  });

  it("handles standard two-word names", () => {
    expect(splitContactName("John Smith")).toEqual({
      firstName: "John",
      lastName: "Smith",
    });
  });

  it("collapses multiple spaces", () => {
    expect(splitContactName("John   Smith")).toEqual({
      firstName: "John",
      lastName: "Smith",
    });
  });

  it("trims leading / trailing whitespace", () => {
    expect(splitContactName("  John Smith  ")).toEqual({
      firstName: "John",
      lastName: "Smith",
    });
  });

  it("returns empty strings for null / undefined / empty input", () => {
    expect(splitContactName(null)).toEqual({ firstName: "", lastName: "" });
    expect(splitContactName(undefined)).toEqual({ firstName: "", lastName: "" });
    expect(splitContactName("")).toEqual({ firstName: "", lastName: "" });
    expect(splitContactName("   ")).toEqual({ firstName: "", lastName: "" });
  });
});

describe("marketingAttributionFor", () => {
  it("returns empty-string placeholders when attribution is absent", () => {
    expect(marketingAttributionFor(null)).toEqual({
      marketing_source: "",
      marketing_campaign: "",
      gclid: "",
    });
    expect(marketingAttributionFor({})).toEqual({
      marketing_source: "",
      marketing_campaign: "",
      gclid: "",
    });
  });

  it("pulls source + campaign + gclid when lead_source_attribution is set", () => {
    const meta = {
      lead_source_attribution: {
        source: "fb_ads",
        campaign: "june-promo-2026",
        gclid: "Cj0KCQjw",
      },
    } as unknown as Parameters<typeof marketingAttributionFor>[0];
    expect(marketingAttributionFor(meta)).toEqual({
      marketing_source: "fb_ads",
      marketing_campaign: "june-promo-2026",
      gclid: "Cj0KCQjw",
    });
  });

  it("handles partial attribution gracefully (some fields empty)", () => {
    const meta = {
      lead_source_attribution: { source: "web" },
    } as unknown as Parameters<typeof marketingAttributionFor>[0];
    expect(marketingAttributionFor(meta)).toEqual({
      marketing_source: "web",
      marketing_campaign: "",
      gclid: "",
    });
  });
});
