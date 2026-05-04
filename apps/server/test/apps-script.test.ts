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

describe("AppsScriptService.getRoster", () => {
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
    const result = await svc.getRoster(makeSede());
    expect(result).toBe(null);
  });

  it("returns null and does not throw when fetch aborts past the deadline", async () => {
    // fetch resolves only after 200ms; AbortController fires at 50ms (mocked
    // env). The service must observe AbortError and return null, never
    // bubble it out to the caller.
    global.fetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init.signal as AbortSignal;
        signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          (err as Error & { name: string }).name = "AbortError";
          reject(err);
        });
        // Never resolves on its own — only aborts via signal.
      });
    }) as typeof fetch;

    const svc = new AppsScriptService();
    const promise = svc.getRoster(makeSede("https://script.google.com/exec"));

    // Advance timers past the timeout to fire the abort.
    await vi.advanceTimersByTimeAsync(60);
    const result = await promise;
    expect(result).toBe(null);
    expect(global.fetch).toHaveBeenCalledOnce();
  });

  it("returns null on non-2xx response (does not parse body)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => "boom",
    } as unknown as Response) as typeof fetch;

    const svc = new AppsScriptService();
    const result = await svc.getRoster(makeSede("https://script.google.com/exec"));
    expect(result).toBe(null);
  });

  it("returns null when the response body is malformed (no days array)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ generatedAt: "2026-05-04T00:00:00Z" }), // missing days
    } as unknown as Response) as typeof fetch;

    const svc = new AppsScriptService();
    const result = await svc.getRoster(makeSede("https://script.google.com/exec"));
    expect(result).toBe(null);
  });

  it("returns the snapshot on a well-formed 200", async () => {
    const days = [
      {
        date: "2026-05-12",
        weekday: "lun",
        courses: [{ code: "OW", am: { capacity: 6, booked: 4 }, pm: null, night: null }],
      },
    ];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ generatedAt: "2026-05-04T00:00:00Z", days }),
    } as unknown as Response) as typeof fetch;

    const svc = new AppsScriptService();
    const result = await svc.getRoster(makeSede("https://script.google.com/exec"));
    expect(result).not.toBe(null);
    expect(result!.days).toEqual(days);
    expect(result!.sedeId).toBe("sede-1");
  });
});
