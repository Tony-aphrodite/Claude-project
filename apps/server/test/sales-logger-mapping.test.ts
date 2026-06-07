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

describe("agenteCierreFor", () => {
  it("returns 'Francisco Emilio' for Koh Phi Phi (Miguel confirmed)", () => {
    // Exact string match matters — Miguel's filter is case-sensitive.
    expect(agenteCierreFor("Koh Phi Phi")).toBe("Francisco Emilio");
  });

  it("returns empty string for sedes without a registered AI persona yet", () => {
    // Pending: Miguel needs to confirm AI personas for KT/GT/GA/NP.
    expect(agenteCierreFor("Koh Tao")).toBe("");
    expect(agenteCierreFor("Gili Trawangan")).toBe("");
    expect(agenteCierreFor("Gili Air")).toBe("");
    expect(agenteCierreFor("Nusa Penida")).toBe("");
  });

  it("returns empty string for unknown sede names (defensive)", () => {
    expect(agenteCierreFor("Atlantis")).toBe("");
    expect(agenteCierreFor("")).toBe("");
  });
});

describe("programaDisplayName — Koh Phi Phi", () => {
  it("returns 'OW 18' for OW (Miguel's example payload)", () => {
    expect(programaDisplayName("Koh Phi Phi", "OW")).toBe("OW 18");
  });

  it("returns provisional display names for the rest of the Phi Phi catalog", () => {
    // These are educated guesses, not yet Miguel-confirmed. The test
    // pins the current state so a future change is intentional.
    expect(programaDisplayName("Koh Phi Phi", "TryScuba")).toBe("Try Scuba");
    expect(programaDisplayName("Koh Phi Phi", "ScubaDiver")).toBe("Scuba Diver");
    expect(programaDisplayName("Koh Phi Phi", "AOW")).toBe("Advanced");
    expect(programaDisplayName("Koh Phi Phi", "Refresh")).toBe("Refresh");
  });

  it("returns null for programs without a mapping (caller surfaces warning)", () => {
    // Combos / specialties without a defined display name → caller must
    // skip or alert. Posting null to Miguel's script would silently
    // zero-out the revenue.
    expect(programaDisplayName("Koh Phi Phi", "OWAOWCombo")).toBeNull();
    expect(programaDisplayName("Koh Phi Phi", "Adventures")).toBeNull();
    expect(programaDisplayName("Koh Phi Phi", "DMT")).toBeNull();
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
