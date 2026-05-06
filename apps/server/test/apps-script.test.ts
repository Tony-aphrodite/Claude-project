import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Sede } from "@dpm/db";

// Mock the DB before importing the service so the cache layer is a no-op.
vi.mock("@dpm/db", async () => {
  const actual = await vi.importActual<typeof import("@dpm/db")>("@dpm/db");
  return {
    ...actual,
    getDb: () => ({
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({ limit: async () => [] }),
          }),
        }),
      }),
      insert: () => ({ values: async () => undefined }),
    }),
  };
});

vi.mock("../src/env.js", () => ({
  loadEnv: () => ({
    APPS_SCRIPT_TIMEOUT_MS: 50,
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    PORT: 3000,
  }),
}));

vi.mock("../src/logger.js", () => ({
  getLogger: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
    trace: () => {},
    child: () => ({
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      fatal: () => {},
      trace: () => {},
    }),
  }),
}));

const { AppsScriptService } = await import("../src/services/apps-script.js");

function makeSede(rosterUrl?: string): Sede {
  return {
    id: "sede-1",
    nombre: "Gili Trawangan",
    pais: "Indonesia",
    timezone: "Asia/Makassar",
    currencyCode: "IDR",
    currencySymbol: "Rp",
    languagesSupported: ["en", "es"],
    minAgeCertification: 10,
    rosterSource: "apps_script_url",
    rosterConfig: rosterUrl ? { url: rosterUrl } : null,
    kbDocumentId: null,
    promptOverrideId: null,
    respondIoTag: "sede:gili_trawangan",
    brandId: null,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Sede;
}

const SAMPLE: import("@dpm/shared").AvailabilityResponse = {
  hora_actual_wita: "10:30",
  fecha_consultada: "2026-05-14",
  disponible: true,
  primer_dia_disponible: "2026-05-14",
  resumen: "Disponibilidad confirmada",
  detalle: [
    {
      fecha: "2026-05-14",
      disponible: true,
      turno_manana: { disponible: true, espacios: 20, capacidad: 20 },
      turno_tarde: { disponible: true, espacios: 18, capacidad: 20 },
      turno_nocturno: { disponible: true, espacios: 20, capacidad: 20 },
    },
  ],
};

describe("AppsScriptService.fetchAvailability", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns null when sede has no rosterConfig.url", async () => {
    const svc = new AppsScriptService();
    const result = await svc.fetchAvailability(makeSede(), {
      date: "2026-05-14",
      days: 1,
    });
    expect(result).toBe(null);
  });

  it("returns null and does not throw when fetch aborts past the deadline", async () => {
    global.fetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init.signal as AbortSignal;
        signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          (err as Error & { name: string }).name = "AbortError";
          reject(err);
        });
      });
    }) as typeof fetch;

    const svc = new AppsScriptService();
    const promise = svc.fetchAvailability(
      makeSede("https://script.google.com/exec"),
      { date: "2026-05-14", days: 1 },
    );

    await vi.advanceTimersByTimeAsync(60);
    const result = await promise;
    expect(result).toBe(null);
    expect(global.fetch).toHaveBeenCalledOnce();
  });

  it("returns null on non-2xx response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => "boom",
    } as unknown as Response) as typeof fetch;

    const svc = new AppsScriptService();
    const result = await svc.fetchAvailability(
      makeSede("https://script.google.com/exec"),
      { date: "2026-05-14", days: 1 },
    );
    expect(result).toBe(null);
  });

  it("returns null when the response body is malformed (missing detalle)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ hora_actual_wita: "10:00", fecha_consultada: "2026-05-14" }),
    } as unknown as Response) as typeof fetch;

    const svc = new AppsScriptService();
    const result = await svc.fetchAvailability(
      makeSede("https://script.google.com/exec"),
      { date: "2026-05-14", days: 1 },
    );
    expect(result).toBe(null);
  });

  it("returns the parsed AvailabilityResponse on a well-formed 200", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => SAMPLE,
    } as unknown as Response) as typeof fetch;

    const svc = new AppsScriptService();
    const result = await svc.fetchAvailability(
      makeSede("https://script.google.com/exec"),
      { date: "2026-05-14", days: 1 },
    );
    expect(result).not.toBe(null);
    expect(result!.hora_actual_wita).toBe("10:30");
    expect(result!.detalle).toHaveLength(1);
    expect(result!.detalle[0]!.turno_manana.espacios).toBe(20);
  });

  it("appends ?date=…&days=… to the URL", async () => {
    let captured = "";
    global.fetch = vi.fn().mockImplementation((url: string) => {
      captured = url;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => SAMPLE,
      } as unknown as Response);
    }) as typeof fetch;

    const svc = new AppsScriptService();
    await svc.fetchAvailability(makeSede("https://script.google.com/exec"), {
      date: "2026-05-14",
      days: 3,
    });
    expect(captured).toContain("?date=2026-05-14");
    expect(captured).toContain("&days=3");
  });
});
