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
      escalationReason: null,
      descuento: null,
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
    expect(out.escalationReason).toBeNull();
    expect(out.descuento).toBeNull();
  });

  it("tolerates a small preamble before the JSON object", () => {
    const raw = `Sure, here's the answer:\n${JSON.stringify({
      respuesta: "Texto",
      fuentes: [],
    })}`;
    expect(parseStructuredAnswer(raw)).toEqual({
      text: "Texto",
      fuentes: [],
      escalationReason: null,
      descuento: null,
    });
  });

  it("falls back to raw text when the model returns plain text", () => {
    const raw = "Hola, esto no es JSON.";
    expect(parseStructuredAnswer(raw)).toEqual({
      text: "Hola, esto no es JSON.",
      fuentes: [],
      escalationReason: null,
      descuento: null,
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
      escalationReason: null,
      descuento: null,
    });
  });

  it("handles empty input safely", () => {
    expect(parseStructuredAnswer("")).toEqual({
      text: "",
      fuentes: [],
      escalationReason: null,
      descuento: null,
    });
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
      escalationReason: null,
      descuento: null,
    });
  });

  it("falls back to last viable envelope even if a later one is malformed", () => {
    const raw =
      '{"respuesta": "good answer", "fuentes": []}\n' +
      "And then garbage {not valid json:";
    expect(parseStructuredAnswer(raw)).toEqual({
      text: "good answer",
      fuentes: [],
      escalationReason: null,
      descuento: null,
    });
  });

  describe("escalation_reason", () => {
    it("accepts every canonical code", () => {
      const codes = [
        "medical",
        "discount_over_10",
        "instructor_request",
        "human_requested",
        "payment_issue",
        "complaint",
        "prohibited_topic",
        "out_of_scope",
      ];
      for (const code of codes) {
        const raw = JSON.stringify({
          respuesta: "te conecto con el equipo",
          fuentes: [],
          escalation_reason: code,
        });
        expect(parseStructuredAnswer(raw).escalationReason).toBe(code);
      }
    });

    it("normalizes case and trims whitespace", () => {
      const raw = JSON.stringify({
        respuesta: "te conecto",
        fuentes: [],
        escalation_reason: "  Medical ",
      });
      expect(parseStructuredAnswer(raw).escalationReason).toBe("medical");
    });

    it("rejects unknown codes — collapses to null", () => {
      const raw = JSON.stringify({
        respuesta: "te conecto",
        fuentes: [],
        escalation_reason: "made_up_category",
      });
      expect(parseStructuredAnswer(raw).escalationReason).toBeNull();
    });

    it("rejects non-string values", () => {
      const raw = JSON.stringify({
        respuesta: "ok",
        fuentes: [],
        escalation_reason: 42,
      });
      expect(parseStructuredAnswer(raw).escalationReason).toBeNull();
    });
  });

  describe("descuento", () => {
    it("accepts the 3 canonical values literally", () => {
      for (const value of ["Sin descuento", "5%", "10%"]) {
        const raw = JSON.stringify({
          respuesta: "ok",
          fuentes: [],
          descuento: value,
        });
        expect(parseStructuredAnswer(raw).descuento).toBe(value);
      }
    });

    it("normalizes 0 / 0% / casing into 'Sin descuento'", () => {
      for (const alias of ["0", "0%", "sin descuento", "Sin Descuento"]) {
        const raw = JSON.stringify({
          respuesta: "ok",
          fuentes: [],
          descuento: alias,
        });
        expect(parseStructuredAnswer(raw).descuento).toBe("Sin descuento");
      }
    });

    it("normalizes bare '5' / '10' into '5%' / '10%'", () => {
      const raw5 = JSON.stringify({
        respuesta: "ok",
        fuentes: [],
        descuento: "5",
      });
      const raw10 = JSON.stringify({
        respuesta: "ok",
        fuentes: [],
        descuento: "10",
      });
      expect(parseStructuredAnswer(raw5).descuento).toBe("5%");
      expect(parseStructuredAnswer(raw10).descuento).toBe("10%");
    });

    it("rejects values outside the canonical set", () => {
      // Anything >10% must trigger escalation, not a descuento value.
      const raw = JSON.stringify({
        respuesta: "te paso a humano",
        fuentes: [],
        descuento: "15%",
      });
      expect(parseStructuredAnswer(raw).descuento).toBeNull();
    });
  });
});
