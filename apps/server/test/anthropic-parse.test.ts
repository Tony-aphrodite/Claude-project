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
});
