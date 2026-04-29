import { describe, expect, it } from "vitest";

import type { Mensaje, Sede } from "@dpm/db";
import type { RosterSnapshot } from "@dpm/shared";

import {
  buildFourBlockPrompt,
  formatDynamicBlock,
  formatHistoryForPrompt,
} from "../src/services/prompt-builder.js";

const SEDE: Sede = {
  id: "11111111-1111-1111-1111-111111111111",
  nombre: "Gili Trawangan",
  pais: "Indonesia",
  timezone: "Asia/Makassar",
  currencyCode: "IDR",
  currencySymbol: "Rp",
  languagesSupported: ["en", "es"],
  minAgeCertification: 10,
  rosterSource: "apps_script_url",
  rosterConfig: null,
  kbDocumentId: null,
  promptOverrideId: null,
  respondIoTag: "sede:gili_trawangan",
  brandId: null,
  active: true,
  createdAt: new Date("2026-04-29T00:00:00Z"),
  updatedAt: new Date("2026-04-29T00:00:00Z"),
};

const ROSTER: RosterSnapshot = {
  sedeId: SEDE.id,
  generatedAt: "2026-04-29T00:00:00Z",
  days: [
    {
      date: "2026-04-30",
      weekday: "Thursday",
      courses: [
        {
          code: "OW",
          am: { capacity: 6, booked: 4 },
          pm: null,
          night: null,
        },
      ],
    },
  ],
};

const HISTORY: Mensaje[] = [
  {
    id: "m1",
    conversacionId: "c1",
    sender: "cliente",
    agenteName: null,
    content: "Hola, quería info de Open Water",
    metadata: null,
    createdAt: new Date("2026-04-29T08:00:00Z"),
  },
  {
    id: "m2",
    conversacionId: "c1",
    sender: "ai",
    agenteName: null,
    content: "¡Hola! Te cuento sobre el OW…",
    metadata: null,
    createdAt: new Date("2026-04-29T08:00:30Z"),
  },
];

describe("formatHistoryForPrompt", () => {
  it("returns a placeholder when there is no history", () => {
    expect(formatHistoryForPrompt([])).toContain("sin historial");
  });

  it("preserves chronological order with role labels", () => {
    const out = formatHistoryForPrompt(HISTORY);
    expect(out.indexOf("CLIENTE:")).toBeLessThan(out.indexOf("AI:"));
    expect(out).toContain("Hola, quería info de Open Water");
  });
});

describe("formatDynamicBlock", () => {
  it("includes sede metadata, roster, and the incoming message", () => {
    const text = formatDynamicBlock({
      sede: SEDE,
      roster: ROSTER,
      incomingMessage: "¿Tenés plaza el 30?",
      detectedLanguage: "español",
    });
    expect(text).toContain("Gili Trawangan");
    expect(text).toContain("Asia/Makassar");
    expect(text).toContain("IDR");
    expect(text).toContain("OW: AM 4/6");
    expect(text).toContain("¿Tenés plaza el 30?");
    expect(text).toContain("español");
  });

  it("falls back gracefully when roster is unavailable", () => {
    const text = formatDynamicBlock({
      sede: SEDE,
      roster: null,
      incomingMessage: "hola",
    });
    expect(text).toContain("roster no disponible");
  });
});

describe("buildFourBlockPrompt", () => {
  it("produces a system block with cache_control 1h", () => {
    const out = buildFourBlockPrompt({
      systemPrompt: "Sos un vendedor.",
      sedeKb: "KB content",
      history: HISTORY,
      sede: SEDE,
      roster: ROSTER,
      incomingMessage: "hola",
    });
    expect(out.system).toHaveLength(1);
    const sys = out.system[0]!;
    expect(sys).toMatchObject({
      type: "text",
      cache_control: { type: "ephemeral", ttl: "1h" },
    });
  });

  it("uses exactly 3 cache_control markers across messages (Bloques 2,3 cached, 4 not)", () => {
    const out = buildFourBlockPrompt({
      systemPrompt: "S",
      sedeKb: "KB",
      history: HISTORY,
      sede: SEDE,
      roster: ROSTER,
      incomingMessage: "hi",
    });

    let messageMarkers = 0;
    for (const m of out.messages) {
      if (typeof m.content === "string") continue;
      for (const block of m.content) {
        if ("cache_control" in block && block.cache_control) messageMarkers++;
      }
    }
    // 1 system marker + 2 message markers (KB + history) = 3 total cached blocks.
    // Bloque 4 (dynamic) must NOT have a cache_control marker.
    expect(messageMarkers).toBe(2);
  });

  it("places the dynamic block last and unmarked", () => {
    const out = buildFourBlockPrompt({
      systemPrompt: "S",
      sedeKb: "KB",
      history: HISTORY,
      sede: SEDE,
      roster: ROSTER,
      incomingMessage: "ping-payload",
    });
    const last = out.messages.at(-1)!;
    expect(last.role).toBe("user");
    expect(typeof last.content).not.toBe("string");
    const blocks = last.content as Array<{ type: string; text?: string; cache_control?: unknown }>;
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe("text");
    expect(blocks[0]!.text).toContain("ping-payload");
    expect(blocks[0]!.cache_control).toBeUndefined();
  });
});
