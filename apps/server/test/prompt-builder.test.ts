import { describe, expect, it } from "vitest";

import type { Mensaje, Sede } from "@dpm/db";
import type { AvailabilityResponse } from "@dpm/shared";

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

const ROSTER: AvailabilityResponse = {
  hora_actual_wita: "08:00",
  fecha_consultada: "2026-04-30",
  disponible: true,
  primer_dia_disponible: "2026-04-30",
  resumen: "Disponibilidad confirmada",
  detalle: [
    {
      fecha: "2026-04-30",
      disponible: true,
      turno_manana: { disponible: true, espacios: 2, capacidad: 6 },
      turno_tarde: { disponible: true, espacios: 5, capacidad: 6 },
      turno_nocturno: { disponible: true, espacios: 6, capacidad: 6 },
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
    fuentes: null,
    metadata: null,
    createdAt: new Date("2026-04-29T08:00:00Z"),
  },
  {
    id: "m2",
    conversacionId: "c1",
    sender: "ai",
    agenteName: null,
    content: "¡Hola! Te cuento sobre el OW…",
    fuentes: null,
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

  it("prefixes each turn with the message id so the model can cite it", () => {
    const out = formatHistoryForPrompt(HISTORY);
    expect(out).toContain("[m1]");
    expect(out).toContain("[m2]");
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
    expect(text).toContain("hora_actual_wita: 08:00");
    expect(text).toContain("2026-04-30: AM 2/6");
    expect(text).toContain("PM 5/6");
    expect(text).toContain("¿Tenés plaza el 30?");
    expect(text).toContain("español");
  });

  it("instructs the model to emit a {respuesta, fuentes} JSON envelope", () => {
    const text = formatDynamicBlock({
      sede: SEDE,
      roster: ROSTER,
      incomingMessage: "hola",
    });
    expect(text).toMatch(/FORMATO DE SALIDA OBLIGATORIO/);
    expect(text).toContain("\"respuesta\"");
    expect(text).toContain("\"fuentes\"");
  });

  it("falls back gracefully when roster is unavailable", () => {
    const text = formatDynamicBlock({
      sede: SEDE,
      roster: null,
      incomingMessage: "hola",
    });
    expect(text).toContain("roster no disponible");
  });

  it("surfaces server-resolved deposit currency hint when phone prefix matches", () => {
    const text = formatDynamicBlock({
      sede: SEDE,
      roster: ROSTER,
      incomingMessage: "quiero reservar",
      suggestedCurrency: "EUR",
    });
    expect(text).toMatch(/MONEDA SUGERIDA POR PREFIJO TELEFÓNICO: EUR/);
    expect(text).toContain("solicitar_deposito");
  });

  it("instructs the AI to ask the client when currency cannot be detected", () => {
    const text = formatDynamicBlock({
      sede: SEDE,
      roster: ROSTER,
      incomingMessage: "quiero reservar",
      suggestedCurrency: null,
    });
    expect(text).toContain("MONEDA: NO DETECTADA");
    expect(text).toMatch(/preguntá al cliente/);
    // Lists the 5 supported currencies the AI must offer.
    expect(text).toContain("EUR");
    expect(text).toContain("GBP");
    expect(text).toContain("AUD");
    expect(text).toContain("USD");
    expect(text).toContain("IDR");
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

  // Inline media plumbing — Miguel 2026-06-25 image-handling fix. The chat
  // path now base64-fetches every attachment the client just sent and
  // hands them to the prompt builder, which prepends image / document
  // blocks to Bloque 4 so Claude actually sees the file.
  it("prepends image blocks to Bloque 4 when the client just attached an image", () => {
    const out = buildFourBlockPrompt({
      systemPrompt: "S",
      sedeKb: "KB",
      history: HISTORY,
      sede: SEDE,
      roster: ROSTER,
      incomingMessage: "mira la foto",
      incomingAttachments: [
        { kind: "image", mediaType: "image/png", base64: "FAKE_BASE64_AAA" },
      ],
    });
    const last = out.messages.at(-1)!;
    const blocks = last.content as Array<{ type: string; source?: { type: string; media_type: string; data: string }; text?: string }>;
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.type).toBe("image");
    expect(blocks[0]!.source!.type).toBe("base64");
    expect(blocks[0]!.source!.media_type).toBe("image/png");
    expect(blocks[0]!.source!.data).toBe("FAKE_BASE64_AAA");
    expect(blocks[1]!.type).toBe("text");
    expect(blocks[1]!.text).toContain("mira la foto");
    // The banner anchors the model to the attached file count + reminds it
    // not to auto-guess "comprobante".
    expect(blocks[1]!.text).toContain("ARCHIVO ADJUNTO");
    expect(blocks[1]!.text).toContain("comprobante");
  });

  it("supports multi-image and PDF on the same turn", () => {
    const out = buildFourBlockPrompt({
      systemPrompt: "S",
      sedeKb: "KB",
      history: HISTORY,
      sede: SEDE,
      roster: ROSTER,
      incomingMessage: "(El cliente envió un archivo sin texto en este turno.)",
      incomingAttachments: [
        { kind: "image", mediaType: "image/jpeg", base64: "PIC1" },
        { kind: "image", mediaType: "image/webp", base64: "PIC2" },
        { kind: "document", mediaType: "application/pdf", base64: "PDF1" },
      ],
    });
    const last = out.messages.at(-1)!;
    const blocks = last.content as Array<{ type: string; source?: { media_type: string }; text?: string }>;
    expect(blocks).toHaveLength(4); // 3 media + 1 text
    expect(blocks[0]!.type).toBe("image");
    expect(blocks[0]!.source!.media_type).toBe("image/jpeg");
    expect(blocks[1]!.source!.media_type).toBe("image/webp");
    expect(blocks[2]!.type).toBe("document");
    expect(blocks[2]!.source!.media_type).toBe("application/pdf");
    expect(blocks[3]!.type).toBe("text");
    // Banner pluralises and reports the count so the model is anchored.
    expect(blocks[3]!.text).toContain("ARCHIVOS ADJUNTOS (3)");
  });

  it("emits no media banner when incomingAttachments is empty / omitted", () => {
    const out = buildFourBlockPrompt({
      systemPrompt: "S",
      sedeKb: "KB",
      history: HISTORY,
      sede: SEDE,
      roster: ROSTER,
      incomingMessage: "Hola, info de OW",
    });
    const last = out.messages.at(-1)!;
    const blocks = last.content as Array<{ type: string; text?: string }>;
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.text).not.toContain("ARCHIVO ADJUNTO");
  });
});
