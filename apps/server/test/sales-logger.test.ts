// Tests for the sales-logger service rewritten 2026-06-07 against
// Miguel's final spec: same /exec URL humans use, token in body, exact
// field shape Miguel's Apps Script accepts. Verifies URL precedence,
// JSON body, retry/4xx contract, and env-driven failure modes.

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  salesLoggerService,
  type SalesLoggerRow,
} from "../src/services/sales-logger.js";

// Env mocked per-test. Defaults satisfy a happy path (URL + token set).
let envUrl: string = "https://example.com/logger";
let envToken: string = "secret_token_xyz";
let envUrlOverride: string = "";
vi.mock("../src/env.js", () => ({
  loadEnv: () => ({
    SALES_LOGGER_URL: envUrl,
    SALES_LOGGER_TOKEN: envToken,
    SALES_LOGGER_URL_OVERRIDE: envUrlOverride,
  }),
}));

vi.mock("../src/logger.js", () => ({
  getLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  }),
}));

function makeRow(
  overrides: Partial<Omit<SalesLoggerRow, "token">> = {},
): Omit<SalesLoggerRow, "token"> {
  return {
    fecha_venta: "2026-06-07 14:30:00",
    sede: "Koh Phi Phi",
    firstName: "John",
    lastName: "Smith",
    phone: "+66812345678",
    email: "john@mail.com",
    countryCode: "GB",
    language: "en",
    programa: "OW 18",
    turno: "AM",
    pax: 2,
    monto: 5000,
    moneda: "THB",
    agente_cierre: "Francisco Emilio",
    marketing_source: "web",
    marketing_campaign: "june-promo-2026",
    gclid: "",
    precio_total_usd: "",
    resto_a_pagar_usd: "",
    descuento: "Sin descuento",
    codigo_referencia: "DPM-PP-0607-AB12CD",
    ...overrides,
  };
}

beforeEach(() => {
  envUrl = "https://example.com/logger";
  envToken = "secret_token_xyz";
  envUrlOverride = "";
  vi.restoreAllMocks();
});

describe("salesLoggerService.logSale — happy path", () => {
  it("POSTs to SALES_LOGGER_URL with token injected from env", async () => {
    // Miguel's Apps Script returns { ok, row, tab } per 2026-06-07 smoke
    // test. We accept both `row` (number) and legacy `rowId` (string).
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, row: 175, tab: "Junio 2026" }),
        { status: 200 },
      ),
    );
    const result = await salesLoggerService.logSale(makeRow());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rowId).toBe("175");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchSpy.mock.calls[0]!;
    expect(calledUrl).toBe("https://example.com/logger");
    const body = JSON.parse(init?.body as string) as SalesLoggerRow;
    // Token injected by the service, not by the caller.
    expect(body.token).toBe("secret_token_xyz");
    // All Miguel-spec fields present.
    expect(body.fecha_venta).toBe("2026-06-07 14:30:00");
    expect(body.sede).toBe("Koh Phi Phi");
    expect(body.firstName).toBe("John");
    expect(body.lastName).toBe("Smith");
    expect(body.programa).toBe("OW 18");
    expect(body.agente_cierre).toBe("Francisco Emilio");
    expect(body.codigo_referencia).toBe("DPM-PP-0607-AB12CD");
  });

  it("env SALES_LOGGER_URL_OVERRIDE wins over SALES_LOGGER_URL (dev path)", async () => {
    envUrlOverride = "https://webhook.site/dev-override";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await salesLoggerService.logSale(makeRow());
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://webhook.site/dev-override",
    );
  });

  it("body content-type is application/json", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await salesLoggerService.logSale(makeRow());
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });
});

describe("salesLoggerService.logSale — auth / config failure modes", () => {
  it("returns reason='no_logger_url' when neither URL env nor override is set", async () => {
    envUrl = "";
    envUrlOverride = "";
    const result = await salesLoggerService.logSale(makeRow());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_logger_url");
    }
  });

  it("returns reason='no_logger_token' when token env is missing", async () => {
    envToken = "";
    const result = await salesLoggerService.logSale(makeRow());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_logger_token");
    }
  });

  it("never lets a caller-supplied token override the env token (security)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    // Cast via unknown to attempt the override at runtime; type system
    // already forbids this at compile time (Omit<_, "token">).
    const sneaky = {
      ...makeRow(),
      token: "attacker_attempts_override",
    } as unknown as Omit<SalesLoggerRow, "token">;
    await salesLoggerService.logSale(sneaky);
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string) as SalesLoggerRow;
    // Env token wins — the spread inside the service places env-token LAST.
    expect(body.token).toBe("secret_token_xyz");
  });
});

describe("salesLoggerService.logSale — HTTP failure modes", () => {
  it("does NOT retry on 4xx (client error)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("invalid payload", { status: 400 }),
    );
    const result = await salesLoggerService.logSale(makeRow());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("client_error");
      expect(result.httpStatus).toBe(400);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries up to 3 times on 5xx then returns upstream_error", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("internal error", { status: 500 }),
    );
    const result = await salesLoggerService.logSale(makeRow());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("upstream_error");
      expect(result.httpStatus).toBe(500);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("first 5xx + second 200 → resolves ok (transient recovery)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("flaky", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, rowId: "r-late" }), {
          status: 200,
        }),
      );
    const result = await salesLoggerService.logSale(makeRow());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rowId).toBe("r-late");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("returns upstream_error when Apps Script returns body.ok=false", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "token rejected" }), {
        status: 200,
      }),
    );
    const result = await salesLoggerService.logSale(makeRow());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("upstream_error");
      expect(result.message).toContain("token rejected");
    }
  });
});
