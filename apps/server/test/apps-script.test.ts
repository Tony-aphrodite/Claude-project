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

  it("appends ?date=…&days=… to the URL on the first call", async () => {
    const calls: string[] = [];
    global.fetch = vi.fn().mockImplementation((url: string) => {
      calls.push(url);
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
    // First call must request the full window — verifies forward
    // compatibility for when Miguel's Apps Script honors `days` natively.
    expect(calls[0]).toContain("?date=2026-05-14");
    expect(calls[0]).toContain("&days=3");
  });

  it("fans out per-day when Apps Script returns a single-day window", async () => {
    // Reproduces Miguel's current Apps Script behavior: ignores `days` and
    // always returns one day. Our service must compensate by issuing extra
    // per-day calls and merging them into a multi-day detalle.
    const calls: string[] = [];
    global.fetch = vi.fn().mockImplementation((url: string) => {
      calls.push(url);
      const m = /date=([0-9-]{10})/.exec(url);
      const date = m![1]!;
      const body: import("@dpm/shared").AvailabilityResponse = {
        hora_actual_wita: "10:00",
        fecha_consultada: date,
        disponible: true,
        primer_dia_disponible: date,
        resumen: "ok",
        detalle: [
          {
            fecha: date,
            disponible: true,
            turno_manana: { disponible: true, espacios: 5, capacidad: 10 },
            turno_tarde: { disponible: true, espacios: 8, capacidad: 10 },
            turno_nocturno: { disponible: true, espacios: 10, capacidad: 10 },
          },
        ],
      };
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => body,
      } as unknown as Response);
    }) as typeof fetch;

    const svc = new AppsScriptService();
    const result = await svc.fetchAvailability(
      makeSede("https://script.google.com/exec"),
      { date: "2026-05-14", days: 3 },
    );

    expect(result).not.toBe(null);
    expect(result!.detalle).toHaveLength(3);
    expect(result!.detalle.map((d) => d.fecha)).toEqual([
      "2026-05-14",
      "2026-05-15",
      "2026-05-16",
    ]);
    // 1 initial call + 2 fan-out calls (since first returned only day 0).
    expect(calls).toHaveLength(3);
  });

  it("accepts responses without hora_actual_wita (multi-sede activation)", async () => {
    // Nusa Penida, Koh Tao, Koh Phi Phi return hora_actual_wita = null.
    // The validator must not reject these; downstream code degrades.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        hora_actual_wita: null,
        fecha_consultada: "2026-05-14",
        disponible: true,
        primer_dia_disponible: "2026-05-14",
        resumen: "ok",
        detalle: [
          {
            fecha: "2026-05-14",
            disponible: true,
            turno_manana: { disponible: true, espacios: 5, capacidad: 10 },
            turno_tarde: { disponible: true, espacios: 8, capacidad: 10 },
          },
        ],
      }),
    } as unknown as Response) as typeof fetch;

    const svc = new AppsScriptService();
    const result = await svc.fetchAvailability(
      makeSede("https://script.google.com/exec"),
      { date: "2026-05-14", days: 1 },
    );
    expect(result).not.toBe(null);
    expect(result!.detalle).toHaveLength(1);
    expect(result!.hora_actual_wita).toBeUndefined();
  });

  it("does not fan out when the first response already covers the window", async () => {
    // Simulates Miguel's eventual fix: a single call returns the full window.
    // Our merge logic must short-circuit and never issue extra calls.
    let count = 0;
    global.fetch = vi.fn().mockImplementation((_url: string) => {
      count++;
      const body: import("@dpm/shared").AvailabilityResponse = {
        hora_actual_wita: "10:00",
        fecha_consultada: "2026-05-14",
        disponible: true,
        primer_dia_disponible: "2026-05-14",
        resumen: "ok",
        detalle: [
          {
            fecha: "2026-05-14",
            disponible: true,
            turno_manana: { disponible: true, espacios: 1, capacidad: 1 },
            turno_tarde: { disponible: true, espacios: 1, capacidad: 1 },
            turno_nocturno: { disponible: true, espacios: 1, capacidad: 1 },
          },
          {
            fecha: "2026-05-15",
            disponible: true,
            turno_manana: { disponible: true, espacios: 1, capacidad: 1 },
            turno_tarde: { disponible: true, espacios: 1, capacidad: 1 },
            turno_nocturno: { disponible: true, espacios: 1, capacidad: 1 },
          },
        ],
      };
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => body,
      } as unknown as Response);
    }) as typeof fetch;

    const svc = new AppsScriptService();
    const result = await svc.fetchAvailability(
      makeSede("https://script.google.com/exec"),
      { date: "2026-05-14", days: 2 },
    );

    expect(result!.detalle).toHaveLength(2);
    expect(count).toBe(1);
  });
});
