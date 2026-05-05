import { describe, expect, it } from "vitest";

import { parseStructuredAnswer } from "../src/services/anthropic.js";

describe("parseStructuredAnswer", () => {
  it("returns text + fuentes for a clean JSON envelope", () => {
    const raw = JSON.stringify({
      respuesta: "Hola Ana, te cuento del OW…",
      fuentes: ["kb:ow-course", "history:m12"],
    });
    expect(parseStructuredAnswer(raw)).toEqual({
      text: "Hola Ana, te cuento del OW…",
      fuentes: ["kb:ow-course", "history:m12"],
    });
  });

  it("strips markdown code fences", () => {
    const raw =
      "```json\n" +
      JSON.stringify({ respuesta: "Hola", fuentes: ["kb:greeting"] }) +
      "\n```";
    const out = parseStructuredAnswer(raw);
    expect(out.text).toBe("Hola");
    expect(out.fuentes).toEqual(["kb:greeting"]);
  });

  it("tolerates a small preamble before the JSON object", () => {
    const raw = `Sure, here's the answer:\n${JSON.stringify({
      respuesta: "Texto",
      fuentes: [],
    })}`;
    expect(parseStructuredAnswer(raw)).toEqual({ text: "Texto", fuentes: [] });
  });

  it("falls back to raw text when the model returns plain text", () => {
    const raw = "Hola, esto no es JSON.";
    expect(parseStructuredAnswer(raw)).toEqual({
      text: "Hola, esto no es JSON.",
      fuentes: [],
    });
  });

  it("filters non-string entries out of fuentes defensively", () => {
    const raw = JSON.stringify({
      respuesta: "ok",
      fuentes: ["kb:a", 42, null, "history:m1"],
    });
    expect(parseStructuredAnswer(raw)).toEqual({
      text: "ok",
      fuentes: ["kb:a", "history:m1"],
    });
  });

  it("handles empty input safely", () => {
    expect(parseStructuredAnswer("")).toEqual({ text: "", fuentes: [] });
  });

  it("picks the LAST envelope when the model self-corrects mid-output", () => {
    // Real artifact observed in production: model emits a first envelope,
    // then says "Wait — retomo" and emits the corrected one. The final
    // envelope is the model's true intent, so we keep that.
    const raw =
      '{"respuesta": "¡Hola! ¿En qué te puedo ayudar?", "fuentes": []}\n' +
      "Wait — ya leí el mensaje del cliente. Retomo con la respuesta correcta:\n" +
      "```json\n" +
      '{"respuesta": "¡Hola! Qué buena elección el Open Water…", "fuentes": ["kb:ow"]}\n' +
      "```";
    const out = parseStructuredAnswer(raw);
    expect(out.text).toBe("¡Hola! Qué buena elección el Open Water…");
    expect(out.fuentes).toEqual(["kb:ow"]);
  });

  it("ignores braces inside string literals", () => {
    const raw = JSON.stringify({
      respuesta: "Te paso link } con llaves } adentro",
      fuentes: [],
    });
    expect(parseStructuredAnswer(raw)).toEqual({
      text: "Te paso link } con llaves } adentro",
      fuentes: [],
    });
  });

  it("falls back to last viable envelope even if a later one is malformed", () => {
    const raw =
      '{"respuesta": "good answer", "fuentes": []}\n' +
      "And then garbage {not valid json:";
    expect(parseStructuredAnswer(raw)).toEqual({
      text: "good answer",
      fuentes: [],
    });
  });
});
