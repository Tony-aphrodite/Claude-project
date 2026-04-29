// ============================================================================
// Layer 2: LLM-as-judge. We call Claude (different from the model under test
// when possible) with a structured rúbrica and ask for JSON. Confidence < 0.7
// or extreme score divergence routes the case to human review.
// ============================================================================

import Anthropic from "@anthropic-ai/sdk";

import { TIMEOUTS } from "@dpm/shared";

import type { JudgeScores, RegressionCase } from "../types.js";

const JUDGE_SYSTEM_PROMPT = `Sos un evaluador experto de respuestas comerciales
de un asistente IA para una escuela de buceo. Vas a calificar UNA respuesta del
asistente en 5 dimensiones, devolviendo SOLO un JSON.

DIMENSIONES (1-5 cada una):

1. TONO (tone): ¿Suena como un instructor humano cálido y profesional? Penalizá
   si suena robótico, excesivamente formal, o si usa frases típicas de IA como
   "como modelo de lenguaje" o "estoy aquí para ayudarte" repetidas.

2. PRECISIÓN (accuracy): ¿La información factual coincide con la KB de la sede?
   Penalizá si inventa precios, plazas, nombres de instructor o capacidad.

3. RELEVANCIA (relevance): ¿Responde la pregunta del cliente sin desviar? Penalizá
   si propone cosas no preguntadas o si ignora una solicitud explícita.

4. ANTI-ALUCINACIÓN (anti_hallucination): ¿Evitó comprometerse a fechas o
   disponibilidad sin confirmación? ¿Usó \`consultar_disponibilidad\` cuando
   debía? Penalizá si afirma con seguridad sin haber consultado.

5. EFECTIVIDAD (effectiveness): ¿La respuesta avanza la venta? ¿Pregunta lo que
   necesita preguntar? ¿Cierra cuando puede cerrar? Penalizá vaguedad.

OVERALL: promedio ponderado (anti_hallucination y accuracy pesan 1.5×).

CONFIANZA (confidence, 0-1): tu certeza en la calificación. Si dudás (mensaje
ambiguo, contexto insuficiente, output mixto), pon confidence < 0.7.

DEVOLVÉ SOLO ESTE JSON, SIN TEXTO ADICIONAL:

{
  "tone": 1-5,
  "accuracy": 1-5,
  "relevance": 1-5,
  "anti_hallucination": 1-5,
  "effectiveness": 1-5,
  "overall": 1-5,
  "explanation": "explicación corta",
  "confidence": 0-1
}`;

export type LlmJudgeOptions = {
  apiKey: string;
  model?: string;
  timeout?: number;
};

export class LlmJudge {
  private client: Anthropic;
  private model: string;

  constructor(opts: LlmJudgeOptions) {
    this.client = new Anthropic({
      apiKey: opts.apiKey,
      timeout: opts.timeout ?? TIMEOUTS.CLAUDE_API_MS,
      maxRetries: 1,
    });
    this.model = opts.model ?? "claude-sonnet-4-6";
  }

  async judge(
    caseDef: RegressionCase,
    aiResponse: string,
  ): Promise<JudgeScores | null> {
    const transcript = caseDef.history
      .map((m) => `${labelOf(m.sender)}: ${m.content}`)
      .join("\n");

    const userMessage = `
SEDE: ${caseDef.sedeName}
NOTAS DE LA RÚBRICA: ${caseDef.expected.judgeNotes ?? "—"}
OUTCOME ESPERADO: ${caseDef.expected.outcome ?? "—"}

CONVERSACIÓN HASTA AHORA:
${transcript}

ÚLTIMO MENSAJE DEL CLIENTE:
${caseDef.clientMessage}

RESPUESTA DEL AI A EVALUAR:
${aiResponse}

Devolvé el JSON ahora.`.trim();

    try {
      const res = await this.client.messages.create({
        model: this.model,
        max_tokens: 800,
        system: [{ type: "text", text: JUDGE_SYSTEM_PROMPT }],
        messages: [{ role: "user", content: userMessage }],
      });
      const raw = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      return parseJudgeJson(raw);
    } catch {
      return null;
    }
  }
}

function labelOf(sender: "cliente" | "ai" | "agente_humano"): string {
  return sender === "cliente" ? "CLIENTE" : sender === "ai" ? "AI" : "AGENTE";
}

function parseJudgeJson(raw: string): JudgeScores | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as Record<string, unknown>;
    const num = (k: string, def = 0): number =>
      typeof j[k] === "number" ? (j[k] as number) : def;
    return {
      tone: num("tone"),
      accuracy: num("accuracy"),
      relevance: num("relevance"),
      antiHallucination: num("anti_hallucination"),
      effectiveness: num("effectiveness"),
      overall: num("overall"),
      explanation: typeof j.explanation === "string" ? j.explanation : "",
      confidence: num("confidence"),
    };
  } catch {
    return null;
  }
}
