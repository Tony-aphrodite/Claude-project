import { describe, expect, it, vi } from "vitest";

vi.mock("@dpm/db", async () => {
  const actual = await vi.importActual<typeof import("@dpm/db")>("@dpm/db");
  return { ...actual, getDb: () => ({}) };
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

const { pickComprobanteAck } = await import("../src/handlers/process-message.js");

describe("pickComprobanteAck — INSTRUCCIONES_PAGO §7 mensaje-comprobante-recibido", () => {
  it("returns the exact Spanish wording from the spec", () => {
    expect(pickComprobanteAck("es")).toBe(
      "¡Recibido, gracias 🙏! Déjame confirmar la transferencia con el equipo y te aviso en unos minutos.",
    );
  });

  it("returns the exact English wording from the spec", () => {
    expect(pickComprobanteAck("en")).toBe(
      "Got it, thanks 🙏 Let me confirm the transfer with the team and I'll get back to you in a few minutes.",
    );
  });

  it("defaults to Spanish for unknown / null language", () => {
    expect(pickComprobanteAck(null)).toContain("¡Recibido");
    expect(pickComprobanteAck("it")).toContain("¡Recibido");
    expect(pickComprobanteAck("fr")).toContain("¡Recibido");
  });
});
