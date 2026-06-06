// Tests for the sales-logger service (Miguel rule 2026-06-06).
// The service POSTs JSON rows to a per-sede Apps Script URL stored in
// `sede.roster_config.sales_logger_url`. We mock global fetch to verify
// the URL it picks, the JSON body shape, retry behavior, and the
// 4xx-no-retry contract.

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Sede } from "@dpm/db";

import { salesLoggerService, type SalesLoggerRow } from "../src/services/sales-logger.js";

// Mock env so SALES_LOGGER_URL_OVERRIDE is empty by default (production
// path: read from sede.roster_config). Override per-test as needed.
let envOverride: string = "";
vi.mock("../src/env.js", () => ({
  loadEnv: () => ({ SALES_LOGGER_URL_OVERRIDE: envOverride }),
}));

// Mock logger so service emits structured logs without polluting test output.
vi.mock("../src/logger.js", () => ({
  getLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  }),
}));

function makeSede(overrides: Partial<Sede> = {}): Sede {
  const base = {
    id: "sede-uuid",
    nombre: "Koh Phi Phi",
    pais: "Thailand",
    timezone: "Asia/Bangkok",
    currencyCode: "THB",
    currencySymbol: "฿",
    languagesSupported: ["en", "es"],
    minAgeCertification: 10,
    rosterSource: "apps_script_url",
    rosterConfig: { sales_logger_url: "https://example.com/logger" },
    behaviorConfig: {},
    kbDocumentId: null,
    promptOverrideId: null,
    respondIoTag: "Koh Phi Phi",
    brandId: null,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as Sede;
  return base;
}

function makeRow(overrides: Partial<SalesLoggerRow> = {}): SalesLoggerRow {
  return {
    ref_code: "DPM-PP-0606-AB12CD",
    programa: "OW",
    turno: "AM/PM",
    pax: 1,
    monto: 40,
    moneda: "USD",
    sede: "Koh Phi Phi",
    start_date: "2026-06-23",
    cliente_nombre: "Test Customer",
    cliente_telefono: "+1234567890",
    descuento: "Sin descuento",
    agent: "Francisco",
    closed_by_ai: true,
    logged_at: "2026-06-06T21:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  envOverride = "";
  vi.restoreAllMocks();
});

describe("salesLoggerService.logSale — happy path", () => {
  it("POSTs JSON to the sede's sales_logger_url and resolves ok=true", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, rowId: "row-123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const result = await salesLoggerService.logSale(makeSede(), makeRow());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rowId).toBe("row-123");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchSpy.mock.calls[0]!;
    expect(calledUrl).toBe("https://example.com/logger");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(init?.body as string) as { row: SalesLoggerRow };
    expect(body.row.ref_code).toBe("DPM-PP-0606-AB12CD");
    expect(body.row.agent).toBe("Francisco");
    expect(body.row.closed_by_ai).toBe(true);
  });

  it("env SALES_LOGGER_URL_OVERRIDE wins over sede.roster_config.sales_logger_url (dev path)", async () => {
    envOverride = "https://webhook.site/dev-override";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await salesLoggerService.logSale(makeSede(), makeRow());
    expect(fetchSpy.mock.calls[0]![0]).toBe("https://webhook.site/dev-override");
  });
});

describe("salesLoggerService.logSale — failure modes", () => {
  it("returns reason='no_logger_url' when neither env nor sede config has a URL", async () => {
    const sede = makeSede({ rosterConfig: { url: "https://roster.example.com" } as never });
    const result = await salesLoggerService.logSale(sede, makeRow());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_logger_url");
      expect(result.message).toContain("Koh Phi Phi");
    }
  });

  it("does NOT retry on 4xx (client error — payload is broken, retries won't help)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("invalid payload", { status: 400 }),
    );
    const result = await salesLoggerService.logSale(makeSede(), makeRow());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("client_error");
      expect(result.httpStatus).toBe(400);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries up to 3 times on 5xx then gives up with upstream_error", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("internal error", { status: 500 }),
    );
    const result = await salesLoggerService.logSale(makeSede(), makeRow());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("upstream_error");
      expect(result.httpStatus).toBe(500);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("first 5xx + second 200 → resolves ok (transient recovery)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("flaky", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, rowId: "r-late" }), { status: 200 }),
      );
    const result = await salesLoggerService.logSale(makeSede(), makeRow());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rowId).toBe("r-late");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("returns upstream_error when Apps Script returns body.ok=false (semantic failure)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "sheet locked" }), {
        status: 200,
      }),
    );
    const result = await salesLoggerService.logSale(makeSede(), makeRow());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("upstream_error");
  });
});
