import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseEnviarCatalogoInput } from "../src/tools/enviar-catalogo.js";
import {
  describeMissingCatalog,
  getCatalogEntry,
} from "../src/services/catalog-registry.js";

describe("parseEnviarCatalogoInput", () => {
  it("accepts a valid input with a known program", () => {
    const ok = parseEnviarCatalogoInput({
      sede_id: "00000000-0000-0000-0000-000000000003",
      programa: "OW",
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.programa).toBe("OW");
      expect(ok.value.sede_id).toBe("00000000-0000-0000-0000-000000000003");
    }
  });

  it("rejects an unknown program", () => {
    const r = parseEnviarCatalogoInput({
      sede_id: "00000000-0000-0000-0000-000000000003",
      programa: "ScubaMaster", // not in enum
    });
    expect(r.ok).toBe(false);
  });

  it("rejects a non-uuid sede_id", () => {
    const r = parseEnviarCatalogoInput({ sede_id: "gili", programa: "OW" });
    expect(r.ok).toBe(false);
  });

  it("rejects when programa is missing", () => {
    const r = parseEnviarCatalogoInput({
      sede_id: "00000000-0000-0000-0000-000000000003",
    });
    expect(r.ok).toBe(false);
  });
});

describe("catalog-registry — env-based mapping", () => {
  const envBackup: Record<string, string | undefined> = {};
  const KEYS = [
    "RESPOND_IO_CATALOG_GILI_TRAWANGAN_OW",
    "RESPOND_IO_CATALOG_GILI_TRAWANGAN_TRYSCUBA",
    "RESPOND_IO_CATALOG_GILI_TRAWANGAN_REFRESH",
    "RESPOND_IO_CATALOG_GILI_TRAWANGAN_AOW",
  ];

  beforeEach(() => {
    for (const k of KEYS) {
      envBackup[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (envBackup[k] === undefined) delete process.env[k];
      else process.env[k] = envBackup[k];
    }
  });

  it("returns null when no env var is set for the (sede, program) pair", () => {
    expect(getCatalogEntry("Gili Trawangan", "OW")).toBeNull();
  });

  it("interprets a bare string as a Respond.io fragment id", () => {
    process.env.RESPOND_IO_CATALOG_GILI_TRAWANGAN_OW = "frag_OW_gili";
    const e = getCatalogEntry("Gili Trawangan", "OW");
    expect(e).not.toBeNull();
    expect(e!.label).toBe("frag_OW_gili");
    expect(e!.payload).toEqual({ type: "fragment", fragmentId: "frag_OW_gili" });
  });

  it("parses a JSON product payload", () => {
    process.env.RESPOND_IO_CATALOG_GILI_TRAWANGAN_TRYSCUBA = JSON.stringify({
      type: "product",
      product_retailer_id: "TRYSCUBA-GILI-EN",
      catalog_id: "cat_123",
    });
    const e = getCatalogEntry("Gili Trawangan", "TryScuba");
    expect(e!.label).toBe("TRYSCUBA-GILI-EN");
    expect(e!.payload).toEqual({
      type: "product",
      product_retailer_id: "TRYSCUBA-GILI-EN",
      catalog_id: "cat_123",
    });
  });

  it("parses a JSON template payload with components", () => {
    process.env.RESPOND_IO_CATALOG_GILI_TRAWANGAN_REFRESH = JSON.stringify({
      type: "template",
      name: "refresh_card_es",
      language: "es",
      components: [{ type: "body", parameters: [] }],
    });
    const e = getCatalogEntry("Gili Trawangan", "Refresh");
    expect(e!.label).toBe("refresh_card_es");
    expect(e!.payload).toEqual({
      type: "template",
      name: "refresh_card_es",
      language: "es",
      components: [{ type: "body", parameters: [] }],
    });
  });

  it("returns null on malformed JSON instead of throwing", () => {
    process.env.RESPOND_IO_CATALOG_GILI_TRAWANGAN_AOW = "{not-json";
    expect(getCatalogEntry("Gili Trawangan", "AOW")).toBeNull();
  });

  it("normalizes sede names with spaces / accents to env-key segments", () => {
    process.env.RESPOND_IO_CATALOG_GILI_TRAWANGAN_OW = "frag_OW";
    expect(getCatalogEntry("Gili Trawangan", "OW")).not.toBeNull();
    expect(getCatalogEntry("gili trawangan", "OW")).not.toBeNull(); // case-insensitive sede
  });

  it("describeMissingCatalog mentions the env var the operator must set", () => {
    const msg = describeMissingCatalog("Gili Trawangan", "OW");
    expect(msg).toContain("RESPOND_IO_CATALOG_GILI_TRAWANGAN_OW");
  });
});
