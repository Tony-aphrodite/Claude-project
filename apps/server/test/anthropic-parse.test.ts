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
      reasoningLeak: false,
      closeReason: null,
      notes: null,
      sendProductCardIds: null,
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
    expect(out.reasoningLeak).toBe(false);
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
      reasoningLeak: false,
      closeReason: null,
      notes: null,
      sendProductCardIds: null,
    });
  });

  it("falls back to raw text when the model returns plain text (no JSON, no leak signals)", () => {
    const raw = "Hola, esto no es JSON.";
    expect(parseStructuredAnswer(raw)).toEqual({
      text: "Hola, esto no es JSON.",
      fuentes: [],
      escalationReason: null,
      descuento: null,
      reasoningLeak: false,
      closeReason: null,
      notes: null,
      sendProductCardIds: null,
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
      reasoningLeak: false,
      closeReason: null,
      notes: null,
      sendProductCardIds: null,
    });
  });

  it("handles empty input safely", () => {
    expect(parseStructuredAnswer("")).toEqual({
      text: "",
      fuentes: [],
      escalationReason: null,
      descuento: null,
      reasoningLeak: false,
      closeReason: null,
      notes: null,
      sendProductCardIds: null,
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
    expect(out.reasoningLeak).toBe(false);
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
      reasoningLeak: false,
      closeReason: null,
      notes: null,
      sendProductCardIds: null,
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
      reasoningLeak: false,
      closeReason: null,
      notes: null,
      sendProductCardIds: null,
    });
  });

  // ── Layered defense added 2026-05-14 after the Miguel test incident ────
  describe("layered defense against reasoning leaks", () => {
    it("accepts the Portuguese 'resposta' key as a fallback for 'respuesta'", () => {
      // Long Spanish conversations occasionally drift to Portuguese (cognate
      // language). The parser must still extract the customer-facing text
      // even if the model used the PT spelling for the JSON key.
      const raw = JSON.stringify({
        resposta: "Entendo, te explico.",
        fuentes: ["kb:ow-course"],
      });
      expect(parseStructuredAnswer(raw)).toEqual({
        text: "Entendo, te explico.",
        fuentes: ["kb:ow-course"],
        escalationReason: null,
        descuento: null,
        reasoningLeak: false,
      closeReason: null,
      notes: null,
      sendProductCardIds: null,
      });
    });

    it("accepts English 'answer' and 'response' key variants", () => {
      for (const key of ["answer", "response"]) {
        const raw = JSON.stringify({ [key]: "OK", fuentes: [] });
        expect(parseStructuredAnswer(raw).text).toBe("OK");
      }
    });

    it("prefers respuesta over alternative keys when multiple are present", () => {
      const raw = JSON.stringify({
        respuesta: "ES wins",
        resposta: "PT loses",
        answer: "EN loses",
      });
      expect(parseStructuredAnswer(raw).text).toBe("ES wins");
    });

    it("blocks meta-commentary openers (ES) and forces complaint escalation", () => {
      const raw = JSON.stringify({
        respuesta:
          "El cliente está frustrado porque no encuentra fechas, voy a proponer alternativa.",
        fuentes: [],
      });
      const out = parseStructuredAnswer(raw);
      expect(out.reasoningLeak).toBe(true);
      expect(out.text).toMatch(/conecto.*equipo/i);
      expect(out.escalationReason).toBe("complaint");
      expect(out.fuentes).toEqual([]);
    });

    it("blocks meta-commentary openers (PT)", () => {
      const raw = JSON.stringify({
        respuesta:
          "O cliente está frustrado porque eu já expliquei várias vezes...",
        fuentes: [],
      });
      const out = parseStructuredAnswer(raw);
      expect(out.reasoningLeak).toBe(true);
      expect(out.escalationReason).toBe("complaint");
    });

    it("blocks meta-commentary openers (EN)", () => {
      const raw = JSON.stringify({
        respuesta:
          "The customer is asking about discounts. Let me think about this.",
        fuentes: [],
      });
      expect(parseStructuredAnswer(raw).reasoningLeak).toBe(true);
    });

    it("blocks 'Vou ser direto / Voy a ser directo / Let me be direct' planning text", () => {
      for (const opener of [
        "Vou ser direto e propor a melhor solução para o casal.",
        "Voy a ser directo y proponer la mejor opción.",
        "Let me be direct and offer the OW course.",
        "Preciso ser honesto sobre os limites do Try Scuba.",
        "Necesito ser honesto sobre los límites.",
        "I need to be honest about the depth limits.",
      ]) {
        const raw = JSON.stringify({ respuesta: opener, fuentes: [] });
        expect(parseStructuredAnswer(raw).reasoningLeak).toBe(true);
      }
    });

    it("blocks JSON-key fragments leaking in plain text", () => {
      // When the model emits a JSON envelope that the parser can't extract
      // (e.g. truncated mid-string), the raw text often contains literal
      // `"respuesta":` substrings — strongest possible signal of a leak.
      const raw =
        'Razonamiento previo. ```json\n{"resposta": "Hola", "fuentes":';
      const out = parseStructuredAnswer(raw);
      expect(out.reasoningLeak).toBe(true);
      expect(out.text).toMatch(/conecto.*equipo/i);
      expect(out.escalationReason).toBe("complaint");
    });

    it("reproduces the 2026-05-14 Miguel incident — extracts JSON, suppresses preamble", () => {
      // Verbatim shape of what the model emitted (conv c7c7888a, 00:19:49):
      // reasoning preamble in Portuguese + a code-fenced JSON envelope
      // using the PT key 'resposta'. Old parser fell through (because it
      // only recognised 'respuesta') and shipped the ENTIRE raw text —
      // 1318 chars of internal monologue — to WhatsApp.
      //
      // New parser: extracts the JSON envelope via the resposta key.
      // The customer-facing text is the clean reply (Portuguese here —
      // language drift is a separate concern, handled by the Bloque 4
      // language anchor + system prompt #idioma hard lock). The preamble
      // is gone, the code fence is gone, the JSON keys are gone.
      const raw = `O cliente está frustrado porque eu já expliquei várias vezes que eles vão no mesmo barco, mas ele quer literalmente mergulhar lado a lado.

Vou ser direto e propor a solução mais completa.

\`\`\`json
{
  "resposta": "Entendo a frustração. Se querem mergulhar juntos, a opção é o Open Water.",
  "fuentes": ["kb:#try-scuba", "kb:#ow-course"]
}`;
      const out = parseStructuredAnswer(raw);
      expect(out.text).toBe(
        "Entendo a frustração. Se querem mergulhar juntos, a opção é o Open Water.",
      );
      expect(out.text).not.toMatch(/O cliente/);
      expect(out.text).not.toMatch(/Vou ser direto/);
      expect(out.text).not.toMatch(/```json/);
      expect(out.fuentes).toEqual(["kb:#try-scuba", "kb:#ow-course"]);
    });

    it("Miguel-incident worst case — preamble + MALFORMED envelope (no JSON to extract)", () => {
      // Variant: model emits preamble + a JSON envelope that the parser
      // can't extract because it was truncated (no closing brace). With
      // no usable envelope, fall through to raw-text branch — and there
      // the reasoning-leak guard MUST catch the preamble and force the
      // safe fallback. Without this layer the customer sees garbage.
      const raw = `O cliente está frustrado porque queremos vender mais.

\`\`\`json
{
  "resposta": "Tente o Open Water",
  "fuentes": [`;
      const out = parseStructuredAnswer(raw);
      expect(out.reasoningLeak).toBe(true);
      expect(out.text).toMatch(/conecto.*equipo/i);
      expect(out.text).not.toMatch(/O cliente/);
      expect(out.escalationReason).toBe("complaint");
    });

    it("does NOT flag a legitimate Spanish reply that happens to mention 'el cliente'", () => {
      // False positive guard: the regex is anchored to the start of the
      // text and requires the pattern "X is frustrated/confused/asking",
      // so generic mentions like "te conecto con el cliente otra vez" or
      // a reply containing the word "cliente" in the middle should pass.
      const raw = JSON.stringify({
        respuesta: "Para tu reserva el cliente confirmará al llegar.",
        fuentes: [],
      });
      expect(parseStructuredAnswer(raw).reasoningLeak).toBe(false);
    });

    it("plain text that looks like leaked reasoning is also blocked", () => {
      // Even when there is no JSON at all — if the model just emitted
      // reasoning prose, do NOT send it to the customer.
      const raw =
        "El cliente está frustrado y voy a proponer otra opción ya mismo.";
      const out = parseStructuredAnswer(raw);
      expect(out.reasoningLeak).toBe(true);
      expect(out.text).toMatch(/conecto.*equipo/i);
      expect(out.escalationReason).toBe("complaint");
    });
  });

  // ── L7: Portuguese language drift on a Spanish conversation ───────────
  describe("PT drift detection when expectedLanguage is Spanish", () => {
    it("blocks a clean PT reply (vocês / mergulhar / Dia / vão / ção)", () => {
      // Verbatim text from Tony's 2026-05-15 retest, turn 11 — a clean
      // JSON envelope with valid `respuesta` key but the value is full
      // Portuguese after 9 successful Spanish turns. The reasoning-leak
      // guard doesn't catch it (no monologue patterns); the new PT
      // detector does.
      const raw = JSON.stringify({
        respuesta:
          "Entendo perfeitamente 😊 Fazendo o Open Water, vocês vão mergulhar juntos de verdade — mesmo barco, mesmo local, lado a lado até 18m. O Dia 1 é só teoria e piscina para você.",
        fuentes: ["kb:#ow-course"],
      });
      const out = parseStructuredAnswer(raw, { expectedLanguage: "español" });
      expect(out.reasoningLeak).toBe(true);
      expect(out.text).toMatch(/conecto.*equipo/i);
      expect(out.escalationReason).toBe("complaint");
    });

    it("accepts ISO-2 'es' as the language code variant", () => {
      const raw = JSON.stringify({ respuesta: "Vamos com você", fuentes: [] });
      expect(parseStructuredAnswer(raw, { expectedLanguage: "es" }).reasoningLeak).toBe(true);
    });

    it("does NOT flag a clean Spanish reply", () => {
      const raw = JSON.stringify({
        respuesta:
          "¡Perfecto! El Open Water son 3 días, te certificás hasta 18m. ¿Para qué fecha en julio?",
        fuentes: ["kb:#ow-course"],
      });
      expect(
        parseStructuredAnswer(raw, { expectedLanguage: "español" }).reasoningLeak,
      ).toBe(false);
    });

    it("does NOT flag PT when expectedLanguage is also PT (legit PT customer)", () => {
      const raw = JSON.stringify({
        respuesta: "Vamos mergulhar juntos com você no barco da tarde.",
        fuentes: [],
      });
      expect(
        parseStructuredAnswer(raw, { expectedLanguage: "português" }).reasoningLeak,
      ).toBe(false);
    });

    it("does NOT flag PT when expectedLanguage is omitted (backwards compat)", () => {
      const raw = JSON.stringify({
        respuesta: "Vamos mergulhar juntos com você",
        fuentes: [],
      });
      expect(parseStructuredAnswer(raw).reasoningLeak).toBe(false);
    });

    it("catches PT in the plain-text fallback branch too", () => {
      const raw = "Entendo, vamos mergulhar juntos";
      const out = parseStructuredAnswer(raw, { expectedLanguage: "español" });
      expect(out.reasoningLeak).toBe(true);
      expect(out.text).toMatch(/conecto.*equipo/i);
    });

    it("false-positive guard: Spanish words sharing letters with PT pass through", () => {
      // 'instructor' (ES) shouldn't trip the 'instrutor' (PT) regex.
      // Word boundaries matter.
      const raw = JSON.stringify({
        respuesta:
          "El instructor te guía durante todo el buceo. Ustedes están en el mismo barco.",
        fuentes: [],
      });
      expect(
        parseStructuredAnswer(raw, { expectedLanguage: "español" }).reasoningLeak,
      ).toBe(false);
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
      // Use a benign respuesta (no handoff phrasing) so the L10 auto-detect
      // doesn't interfere — we're verifying only the unknown-code coercion.
      const raw = JSON.stringify({
        respuesta: "ok",
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

  // ── L10: auto-inject escalation_reason when reply text announces handoff
  describe("L10 escalation auto-detect from reply phrasing", () => {
    it("auto-injects 'complaint' when model says 'voy a conectarte' but omits the field", () => {
      // Verbatim from Tony's 2026-05-15 test #3 (v2.4 prompt) — model
      // ignored the AUTO-CHECK section + STOP-table template and shipped
      // the handoff text without the field. Server-side safety net now
      // detects the phrase and injects complaint so the ai_escalation tag
      // + motivo_escalation custom field still fire on Respond.io.
      const raw = JSON.stringify({
        respuesta:
          "Te entiendo perfectamente 🙏 Voy a conectarte con el equipo para que vean cómo armarles algo que funcione para los dos.",
        fuentes: [],
      });
      expect(parseStructuredAnswer(raw).escalationReason).toBe("complaint");
    });

    it("auto-injects on every supported phrase variant (ES + EN)", () => {
      const variants = [
        "Te conecto con el equipo para que te ayuden.",
        "Voy a conectarte con el equipo de Gili T.",
        "Te paso al equipo, ya te escriben.",
        "Te dejo con el equipo.",
        "Te derivo con el equipo de la sede.",
        "I'll connect you with the team right away.",
        "Let me connect you with the team.",
      ];
      for (const text of variants) {
        const out = parseStructuredAnswer(
          JSON.stringify({ respuesta: text, fuentes: [] }),
        );
        expect(out.escalationReason).toBe("complaint");
      }
    });

    it("does NOT override an explicit non-null escalation_reason", () => {
      const raw = JSON.stringify({
        respuesta: "Te conecto con el equipo médico.",
        fuentes: [],
        escalation_reason: "medical",
      });
      // The model's explicit choice wins — auto-detect only fills nulls.
      expect(parseStructuredAnswer(raw).escalationReason).toBe("medical");
    });

    it("does NOT inject when the reply has no handoff phrasing", () => {
      const raw = JSON.stringify({
        respuesta: "¡Perfecto! El precio del OW es 6.400.000 IDR.",
        fuentes: ["kb:ow-precio"],
      });
      expect(parseStructuredAnswer(raw).escalationReason).toBeNull();
    });

    it("also applies in the plain-text (no JSON) fallback branch", () => {
      const raw = "Te conecto con el equipo, ya te escriben.";
      expect(parseStructuredAnswer(raw).escalationReason).toBe("complaint");
    });

    it("auto-injects on graceful-goodbye exit-intent phrasing (§sentimiento-negativo despedida cordial)", () => {
      // Verbatim shape from Tony's 2026-05-15 scenario-B test: AI
      // emitted the prompt's despedida-cordial template after a
      // sarcastic "vamos con otra escuela" goodbye, but the model
      // forgot escalation_reason. Without this catch the lead is
      // lost — no human gets the chance to recover.
      for (const text of [
        "Te entiendo, ojalá les vaya genial 🙏 Si en algún momento cambian de idea, acá estamos.",
        "Ojalá te vaya bien. Aquí estamos si necesitan algo.",
        "Si cambian de idea, acá estamos para lo que necesiten.",
      ]) {
        const out = parseStructuredAnswer(
          JSON.stringify({ respuesta: text, fuentes: [] }),
        );
        expect(out.escalationReason).toBe("complaint");
      }
    });
  });

  // ── L11: client-message exit-intent overrides AI's miss ───────────────
  describe("L11 exit-intent from cliente input forces complaint", () => {
    it("forces complaint when cliente said 'vamos con otra secuela' even if AI replied with a sales pitch", () => {
      // Tony scenario-B retest 2026-05-15: cliente wrote a clear exit
      // signal ("Gracias vamos con otra secuela que nos permite bucear
      // juntos") and the AI MISSED it — pivoted to an OW upsell. L10
      // doesn't trigger because AI text has no handoff phrase. L11
      // catches it from the input side.
      const aiReply =
        "Te entiendo, pero siendo honesto — en el Try Scuba el buceo es a 12m máximo. Si quieren bucear juntos de verdad, la opción real es Open Water. ¿Te cuento más?";
      const out = parseStructuredAnswer(
        JSON.stringify({ respuesta: aiReply, fuentes: ["kb:ow"] }),
        {
          incomingMessage:
            "Gracias vamos con otra secuela que nos permite bucear juntos",
        },
      );
      expect(out.escalationReason).toBe("complaint");
      expect(out.text).toBe(aiReply); // AI text is preserved (not replaced)
    });

    it("catches every exit-intent variant", () => {
      const aiReply = "Una respuesta cualquiera, ¿confirmamos?";
      const exitInputs = [
        "Vamos con otra escuela",
        "Voy a probar con otro centro",
        "Lo dejamos por hoy",
        "Me voy con otra empresa",
        "Nos vamos, gracias",
        "Gracias por nada",
        "Qué pena, esperaba más",
        "Qué lástima, no era lo que buscaba",
        "Qué ruda tu respuesta",
        "No me ayudaste",
        "Prefiero ir a otro dive shop",
        "Voy a mirar otras opciones",
      ];
      for (const incoming of exitInputs) {
        const out = parseStructuredAnswer(
          JSON.stringify({ respuesta: aiReply, fuentes: [] }),
          { incomingMessage: incoming },
        );
        expect(out.escalationReason).toBe("complaint");
      }
    });

    it("does NOT override an explicit non-null escalation_reason", () => {
      const out = parseStructuredAnswer(
        JSON.stringify({
          respuesta: "Te conecto con el equipo médico",
          fuentes: [],
          escalation_reason: "medical",
        }),
        { incomingMessage: "vamos a otra escuela" }, // would normally inject complaint
      );
      expect(out.escalationReason).toBe("medical");
    });

    it("does NOT fire on benign cliente messages", () => {
      const out = parseStructuredAnswer(
        JSON.stringify({
          respuesta: "Perfecto, ¿para qué fecha?",
          fuentes: [],
        }),
        { incomingMessage: "Quiero el Open Water para julio" },
      );
      expect(out.escalationReason).toBeNull();
    });

    it("is a no-op when incomingMessage is omitted (backwards compat)", () => {
      const out = parseStructuredAnswer(
        JSON.stringify({ respuesta: "ok", fuentes: [] }),
      );
      expect(out.escalationReason).toBeNull();
    });
  });
});
