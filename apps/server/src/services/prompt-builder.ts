// ============================================================================
// 4-block prompt builder (guide §7).
//
// Anthropic allows up to 4 cache_control markers per request. We use exactly
// 3 markers (Bloques 1, 2, 3) to maximize cache hits. Bloque 4 is dynamic
// and intentionally NOT cached — putting cache_control on it would cause a
// cache write on every request and never hit.
//
// Token budget guardrails:
//   - Bloque 1 (system + playbook):     ~2,000   (cached, 1h TTL)
//   - Bloque 2 (sede KB):               15-40k   (cached, 1h TTL)
//   - Bloque 3 (sliding window):        ~3,000   (cached, 5m TTL)
//   - Bloque 4 (now + roster + msg):    ~1,500   (NOT cached)
// ============================================================================

import type Anthropic from "@anthropic-ai/sdk";

import type { Mensaje, Sede } from "@dpm/db";
import type { RosterSnapshot } from "@dpm/shared";

export type BuildPromptInput = {
  systemPrompt: string; // Bloque 1 content (system prompt + playbook + few-shots)
  sedeKb: string; // Bloque 2 content (sede knowledge base)
  history: Mensaje[]; // Bloque 3 source (sliding window)
  sede: Sede;
  roster: RosterSnapshot | null;
  incomingMessage: string;
  detectedLanguage?: string | undefined;
};

export type BuildPromptOutput = {
  system: Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
};

/**
 * Build the system + messages array Anthropic expects.
 *
 * Cache-control strategy:
 *   system block (Bloque 1)  → cache_control ephemeral (default 5m, opted to 1h)
 *   user msg #1 (Bloque 2)   → cache_control ephemeral 1h, KB never changes within the hour
 *   user msg #2 (Bloque 3)   → cache_control ephemeral 5m, history changes per turn
 *   user msg #3 (Bloque 4)   → no cache_control
 */
export function buildFourBlockPrompt(input: BuildPromptInput): BuildPromptOutput {
  const historyText = formatHistoryForPrompt(input.history);
  const dynamicText = formatDynamicBlock({
    sede: input.sede,
    roster: input.roster,
    incomingMessage: input.incomingMessage,
    detectedLanguage: input.detectedLanguage,
  });

  const system: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: input.systemPrompt,
      cache_control: { type: "ephemeral", ttl: "1h" },
    },
  ];

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `=== KB DE LA SEDE: ${input.sede.nombre} ===\n${input.sedeKb}`,
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
      ],
    },
    {
      role: "assistant",
      content: "Entendido. Tengo la base de conocimiento de la sede cargada.",
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `=== HISTORIAL RECIENTE ===\n${historyText}`,
          cache_control: { type: "ephemeral", ttl: "5m" },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: dynamicText,
          // No cache_control — Bloque 4 changes every request.
        },
      ],
    },
  ];

  return { system, messages };
}

/**
 * Format the message history as a readable transcript. We use simple role
 * labels rather than alternating role: messages because Claude has been
 * shown to follow long single-block transcripts well, and it lets us cache
 * the entire block as one unit.
 */
export function formatHistoryForPrompt(history: Mensaje[]): string {
  if (history.length === 0) return "(sin historial previo — primer mensaje)";
  return history
    .map((m) => {
      const ts = m.createdAt.toISOString();
      const who =
        m.sender === "cliente"
          ? "CLIENTE"
          : m.sender === "ai"
            ? "AI"
            : `AGENTE${m.agenteName ? ` (${m.agenteName})` : ""}`;
      return `[${ts}] ${who}: ${m.content}`;
    })
    .join("\n");
}

/**
 * Bloque 4: current sede-local time, 7-day roster summary, and the incoming
 * client message. This is the only fresh content per request.
 */
export function formatDynamicBlock(input: {
  sede: Sede;
  roster: RosterSnapshot | null;
  incomingMessage: string;
  detectedLanguage?: string | undefined;
}): string {
  const sedeNow = new Date().toLocaleString("en-US", {
    timeZone: input.sede.timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const rosterText = input.roster
    ? formatRoster(input.roster)
    : "(roster no disponible — usá tool_use consultar_disponibilidad si necesitás)";

  const langLine = input.detectedLanguage
    ? `IDIOMA DETECTADO DEL CLIENTE: ${input.detectedLanguage} (responde en ese idioma)`
    : "IDIOMA: detectá automáticamente del mensaje y responde en el mismo idioma";

  return `=== CONTEXTO DINÁMICO ===
HORA ACTUAL EN LA SEDE: ${sedeNow}
ZONA HORARIA: ${input.sede.timezone}
SEDE: ${input.sede.nombre} (${input.sede.pais})
MONEDA LOCAL: ${input.sede.currencyCode} (${input.sede.currencySymbol})

${langLine}

=== ROSTER PRÓXIMOS 7 DÍAS ===
${rosterText}

=== MENSAJE DEL CLIENTE ===
${input.incomingMessage}`;
}

function formatRoster(roster: RosterSnapshot): string {
  if (roster.days.length === 0) return "(roster vacío)";
  return roster.days
    .map((d) => {
      const courseLines = d.courses
        .map((c) => {
          const slots: string[] = [];
          if (c.am) slots.push(`AM ${c.am.booked}/${c.am.capacity}`);
          if (c.pm) slots.push(`PM ${c.pm.booked}/${c.pm.capacity}`);
          if (c.night) slots.push(`Night ${c.night.booked}/${c.night.capacity}`);
          return `  ${c.code}: ${slots.join(" | ") || "sin franjas"}`;
        })
        .join("\n");
      return `${d.date} (${d.weekday}):\n${courseLines}`;
    })
    .join("\n\n");
}
