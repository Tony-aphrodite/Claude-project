// ============================================================================
// Semantic negative-intent detection. We DON'T rely on keyword matching ("no"
// is too broad). We ask Claude to classify whether the recent client messages
// indicate the lead is dead so the follow-up scanner can stop annoying them.
//
// Multi-language by design (Spanish/English/Italian/etc.) since DPM serves
// travelers from everywhere.
// ============================================================================

import Anthropic from "@anthropic-ai/sdk";

import { TIMEOUTS } from "@dpm/shared";

import { loadEnv } from "../env.js";
import { getLogger } from "../logger.js";

let _client: Anthropic | undefined;
function client(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: loadEnv().ANTHROPIC_API_KEY,
      timeout: TIMEOUTS.CLAUDE_API_MS,
      maxRetries: 1,
    });
  }
  return _client;
}

export type NegativeIntentVerdict = {
  isNegative: boolean;
  reason: "explicit_decline" | "already_booked_elsewhere" | "asked_to_stop" | "other" | null;
  confidence: number; // 0..1
  rawAnswer: string;
};

const JUDGE_PROMPT = `Sos un clasificador. Analizá el último mensaje del cliente
y devolvé EXCLUSIVAMENTE un JSON con esta forma:

{"isNegative": boolean, "reason": "explicit_decline"|"already_booked_elsewhere"|"asked_to_stop"|"other"|null, "confidence": 0..1}

Marcá isNegative=true SOLO si el cliente:
- declinó explícitamente ("no me interesa", "no thanks", "non mi interessa", "не интересует")
- ya reservó en otro lugar ("ya reservé en X", "I booked elsewhere")
- pidió que dejes de escribir ("no me escribas más", "stop messaging me")

Si dudás, respondé isNegative=false con confidence baja. NO incluyas texto extra.`;

export async function detectNegativeIntent(
  recentMessages: { sender: string; content: string }[],
): Promise<NegativeIntentVerdict> {
  const log = getLogger();
  const env = loadEnv();

  const transcript = recentMessages
    .slice(-6)
    .map((m) => `${m.sender === "cliente" ? "CLIENTE" : "AI"}: ${m.content}`)
    .join("\n");

  const lastClient = [...recentMessages].reverse().find((m) => m.sender === "cliente");
  if (!lastClient) {
    return { isNegative: false, reason: null, confidence: 0, rawAnswer: "" };
  }

  try {
    const res = await client().messages.create({
      model: env.ANTHROPIC_MODEL_FALLBACK, // Haiku is plenty for binary classification
      max_tokens: 150,
      system: [{ type: "text", text: JUDGE_PROMPT }],
      messages: [
        {
          role: "user",
          content: `Transcripción reciente:\n${transcript}\n\nÚltimo mensaje cliente:\n${lastClient.content}`,
        },
      ],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return parseJudgeResponse(text);
  } catch (err) {
    log.warn({ err }, "negative-intent detector failed; defaulting to neutral");
    return { isNegative: false, reason: null, confidence: 0, rawAnswer: "" };
  }
}

function parseJudgeResponse(raw: string): NegativeIntentVerdict {
  // Strip any pre/post fence the model added.
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    return { isNegative: false, reason: null, confidence: 0, rawAnswer: raw };
  }
  try {
    const parsed = JSON.parse(match[0]) as Partial<NegativeIntentVerdict>;
    return {
      isNegative: Boolean(parsed.isNegative),
      reason: (parsed.reason as NegativeIntentVerdict["reason"]) ?? null,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      rawAnswer: raw,
    };
  } catch {
    return { isNegative: false, reason: null, confidence: 0, rawAnswer: raw };
  }
}
