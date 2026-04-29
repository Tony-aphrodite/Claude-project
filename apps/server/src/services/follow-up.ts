// ============================================================================
// Follow-up automation. The 70-80% revenue loss Miguel quoted comes from
// leads going dark after the first message; we recover them with a 5-step
// state machine timed at 4h / 24h / 48h / 7d / 30d.
//
// Architecture:
//   1. scheduler.scanAndSchedule() — runs every 15 min via setInterval.
//        Inserts new follow_up rows for conversations that hit a level
//        threshold AND haven't been cancelled.
//   2. processor.runDue() — runs every 60s; picks rows where scheduled_at
//        <= now AND sent_at IS NULL AND cancelled_at IS NULL, generates
//        contextual text via Claude (or falls back to template if outside
//        24h window), sends via Respond.io, marks sent.
//   3. cancellation triggers — anywhere a client replies, mark all open
//        follow-ups for that conversation cancelled.
//
// We use an in-process worker with a small concurrency cap. If the volume
// grows past a few thousand follow-ups/day we'll swap in BullMQ + Redis
// (the orchestration is small enough to swap without touching call sites).
// ============================================================================

import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, isNull, lte, sql } from "drizzle-orm";

import {
  conversaciones,
  followUps,
  getDb,
  mensajes,
  type Conversacion,
  type FollowUp,
  type Mensaje,
} from "@dpm/db";
import {
  CONCURRENCY,
  FOLLOW_UP_LEVELS,
  FOLLOW_UP_SCANNER_INTERVAL_MS,
  TIMEOUTS,
  type FollowUpLevel,
} from "@dpm/shared";

import { loadEnv } from "../env.js";
import { getLogger } from "../logger.js";
import { detectNegativeIntent } from "./negative-intent.js";
import { respondIoClient } from "./respond-io.js";
import {
  isWithin24hWindow,
  pickTemplate,
} from "./whatsapp-templates.js";

let _client: Anthropic | undefined;
function claude(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: loadEnv().ANTHROPIC_API_KEY,
      timeout: TIMEOUTS.CLAUDE_API_MS,
      maxRetries: 1,
    });
  }
  return _client;
}

const FOLLOW_UP_PROMPT_BY_LEVEL: Record<number, string> = {
  1: `Sos un vendedor cálido de DPM Diving. Generá un follow-up MUY corto
(1-2 oraciones) recordándole al cliente que estás disponible. Tono casual,
sin presión. Mantené el idioma del cliente.`,
  2: `Generá un follow-up que aporte VALOR adicional al cliente: por ejemplo
mencionar un detalle del curso, una sugerencia de itinerario o algo de
contexto sobre la sede que no haya salido aún. 2-3 oraciones. Mismo idioma.`,
  3: `El cliente lleva 48h sin responder. Ofrecé OTRA opción: si pidió OW,
mencionar TryScuba o AOW; si pidió fechas específicas, sugerir alternativas.
2-3 oraciones, sin sonar desesperado. Mismo idioma.`,
  4: `Una semana sin contacto. Mensaje fresco con una novedad o urgencia
suave (temporada, plazas), sin reproche. 2-3 oraciones. Mismo idioma.`,
  5: `Último contacto. Saludo amistoso de despedida que deje la puerta
abierta sin sonar a venta. 1-2 oraciones. Mismo idioma.`,
};

export class FollowUpScheduler {
  /**
   * Scan active conversations and schedule the next-applicable follow-up
   * level. Idempotent: a level that already has a row in follow_ups for
   * this conversation is skipped.
   */
  async scanAndSchedule(): Promise<{ scheduled: number; skipped: number }> {
    const db = getDb();
    const log = getLogger();

    // Conversations active and where last activity is at least 4h old.
    // We pull a generous window — the per-row level decision happens below.
    const candidates = await db
      .select({
        conv: conversaciones,
        lastMessageAt: sql<Date>`COALESCE(
          (SELECT MAX(created_at) FROM mensajes m WHERE m.conversacion_id = ${conversaciones.id}),
          ${conversaciones.createdAt}
        )`.as("last_message_at"),
      })
      .from(conversaciones)
      .where(eq(conversaciones.status, "active"));

    let scheduled = 0;
    let skipped = 0;
    const now = Date.now();

    for (const row of candidates) {
      const elapsedHours = (now - row.lastMessageAt.getTime()) / (60 * 60 * 1000);
      const targetLevel = pickLevelByElapsed(elapsedHours);
      if (!targetLevel) {
        skipped++;
        continue;
      }

      const existing = await db
        .select({ id: followUps.id })
        .from(followUps)
        .where(
          and(
            eq(followUps.conversacionId, row.conv.id),
            eq(followUps.level, targetLevel),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        skipped++;
        continue;
      }

      await db.insert(followUps).values({
        conversacionId: row.conv.id,
        level: targetLevel,
        // Schedule for "now" so the processor picks it up next tick.
        scheduledAt: new Date(),
      });
      scheduled++;
    }

    if (scheduled + skipped > 0) {
      log.info({ scheduled, skipped }, "follow_up scanner pass");
    }
    return { scheduled, skipped };
  }
}

export class FollowUpProcessor {
  /** Pick due follow-ups, dispatch them with a small concurrency cap. */
  async runDue(): Promise<{ sent: number; cancelled: number; failed: number }> {
    const db = getDb();
    const due = await db
      .select()
      .from(followUps)
      .where(
        and(
          isNull(followUps.sentAt),
          isNull(followUps.cancelledAt),
          lte(followUps.scheduledAt, new Date()),
        ),
      )
      .orderBy(followUps.scheduledAt)
      .limit(CONCURRENCY.FOLLOW_UP_WORKERS * 5);

    if (due.length === 0) return { sent: 0, cancelled: 0, failed: 0 };

    const stats = { sent: 0, cancelled: 0, failed: 0 };

    // Manual semaphore — we don't pull p-queue for this single hot spot.
    const lanes = Math.min(CONCURRENCY.FOLLOW_UP_WORKERS, due.length);
    let cursor = 0;
    const workers = Array.from({ length: lanes }, async () => {
      while (cursor < due.length) {
        const idx = cursor++;
        const row = due[idx];
        if (!row) continue;
        const verdict = await this.processOne(row).catch((err) => {
          getLogger().error({ err, followUpId: row.id }, "follow-up processor error");
          return "failed" as const;
        });
        if (verdict === "sent") stats.sent++;
        else if (verdict === "cancelled") stats.cancelled++;
        else stats.failed++;
      }
    });
    await Promise.all(workers);

    return stats;
  }

  async cancelOpenFollowUpsForConversation(
    conversacionId: string,
    reason: string,
  ): Promise<number> {
    const db = getDb();
    const result = await db
      .update(followUps)
      .set({ cancelledAt: new Date(), cancellationReason: reason })
      .where(
        and(
          eq(followUps.conversacionId, conversacionId),
          isNull(followUps.sentAt),
          isNull(followUps.cancelledAt),
        ),
      )
      .returning({ id: followUps.id });
    return result.length;
  }

  private async processOne(
    fu: FollowUp,
  ): Promise<"sent" | "cancelled" | "failed"> {
    const db = getDb();
    const log = getLogger();

    // Re-check current state to avoid races with the cancellation path.
    const [conv] = await db
      .select()
      .from(conversaciones)
      .where(eq(conversaciones.id, fu.conversacionId))
      .limit(1);
    if (!conv) return "failed";
    if (conv.status !== "active") {
      await db
        .update(followUps)
        .set({ cancelledAt: new Date(), cancellationReason: "conversation_inactive" })
        .where(eq(followUps.id, fu.id));
      return "cancelled";
    }

    // Pull recent context for negative-intent detection + Claude generator.
    const recent = await db
      .select()
      .from(mensajes)
      .where(eq(mensajes.conversacionId, conv.id))
      .orderBy(desc(mensajes.createdAt))
      .limit(20);
    recent.reverse();

    const negative = await detectNegativeIntent(
      recent.map((m) => ({ sender: m.sender, content: m.content })),
    );
    if (negative.isNegative && negative.confidence >= 0.7) {
      await db
        .update(followUps)
        .set({
          cancelledAt: new Date(),
          cancellationReason: `negative_intent:${negative.reason ?? "other"}`,
        })
        .where(eq(followUps.id, fu.id));
      // Disable all future follow-ups for this conversation.
      await this.cancelOpenFollowUpsForConversation(
        conv.id,
        `negative_intent:${negative.reason ?? "other"}`,
      );
      // Mark conversation so the scanner stops considering it.
      await db
        .update(conversaciones)
        .set({
          status: "follow_up_disabled",
          followUpState: { disabledReason: negative.reason, at: new Date().toISOString() },
        })
        .where(eq(conversaciones.id, conv.id));
      log.info({ convId: conv.id, reason: negative.reason }, "follow-up cancelled by intent");
      return "cancelled";
    }

    const lastClientMsg = [...recent].reverse().find((m) => m.sender === "cliente");

    const insideWindow = isWithin24hWindow(lastClientMsg?.createdAt ?? null);
    const requiresTemplate = !insideWindow || fu.level >= 3;

    try {
      if (requiresTemplate) {
        const template = pickTemplate(fu.level as 3 | 4 | 5, conv.clientLanguage);
        if (!template) {
          log.warn(
            { level: fu.level, lang: conv.clientLanguage },
            "no template found — skipping follow-up",
          );
          await db
            .update(followUps)
            .set({
              cancelledAt: new Date(),
              cancellationReason: "no_template_available",
            })
            .where(eq(followUps.id, fu.id));
          return "cancelled";
        }
        const variables = [conv.clientName ?? "amigo"];
        await respondIoClient.sendTemplate({
          conversationId: conv.respondIoConversationId,
          templateName: template.name,
          language: template.language,
          variables,
        });
        await db
          .update(followUps)
          .set({
            sentAt: new Date(),
            messageSent: `[template:${template.name}] ${template.bodyPreview}`,
          })
          .where(eq(followUps.id, fu.id));
        return "sent";
      }

      // Free-form: generate contextual text with Claude.
      const text = await generateFollowUpText(fu.level, recent, conv);
      await respondIoClient.sendMessage({
        conversationId: conv.respondIoConversationId,
        text,
      });
      await db
        .update(followUps)
        .set({ sentAt: new Date(), messageSent: text })
        .where(eq(followUps.id, fu.id));
      // Persist as an AI message so the next prompt has the correct history.
      await db.insert(mensajes).values({
        conversacionId: conv.id,
        sender: "ai",
        content: text,
        metadata: { followUpLevel: fu.level },
      });
      return "sent";
    } catch (err) {
      log.error({ err, fuId: fu.id }, "follow-up send failed");
      return "failed";
    }
  }
}

async function generateFollowUpText(
  level: number,
  recent: Mensaje[],
  conv: Conversacion,
): Promise<string> {
  const env = loadEnv();
  const transcript = recent
    .map(
      (m) =>
        `${m.sender === "cliente" ? "CLIENTE" : m.sender === "ai" ? "AI" : "AGENTE"}: ${m.content}`,
    )
    .join("\n");

  const system =
    FOLLOW_UP_PROMPT_BY_LEVEL[level] ??
    "Generá un follow-up cálido para reactivar al cliente.";

  const res = await claude().messages.create({
    model: env.ANTHROPIC_MODEL_PRIMARY,
    max_tokens: 250,
    system: [{ type: "text", text: system }],
    messages: [
      {
        role: "user",
        content:
          `Historial reciente:\n${transcript}\n\n` +
          `Idioma del cliente: ${conv.clientLanguage ?? "auto-detectar"}\n\n` +
          `Generá el follow-up de nivel ${level}.`,
      },
    ],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

function pickLevelByElapsed(elapsedHours: number): FollowUp["level"] | null {
  // Priority: highest applicable level we haven't tried yet.
  const order: { key: FollowUpLevel; level: number; hours: number }[] = [
    { key: "LEVEL_5", level: 5, hours: FOLLOW_UP_LEVELS.LEVEL_5.hours },
    { key: "LEVEL_4", level: 4, hours: FOLLOW_UP_LEVELS.LEVEL_4.hours },
    { key: "LEVEL_3", level: 3, hours: FOLLOW_UP_LEVELS.LEVEL_3.hours },
    { key: "LEVEL_2", level: 2, hours: FOLLOW_UP_LEVELS.LEVEL_2.hours },
    { key: "LEVEL_1", level: 1, hours: FOLLOW_UP_LEVELS.LEVEL_1.hours },
  ];
  for (const o of order) {
    if (elapsedHours >= o.hours) return o.level;
  }
  return null;
}

// ── Scheduler bootstrap ─────────────────────────────────────────────────────
// Single setInterval each. Tests can call scanAndSchedule/runDue directly.

export type ScannerHandle = { stop: () => void };

export function startFollowUpWorkers(): ScannerHandle {
  const scheduler = new FollowUpScheduler();
  const processor = new FollowUpProcessor();
  const log = getLogger();

  const scannerTimer = setInterval(() => {
    scheduler
      .scanAndSchedule()
      .catch((err) => log.error({ err }, "follow-up scanner failed"));
  }, FOLLOW_UP_SCANNER_INTERVAL_MS);

  const processorTimer = setInterval(() => {
    processor
      .runDue()
      .catch((err) => log.error({ err }, "follow-up processor failed"));
  }, 60_000);

  // Run an initial pass so we don't wait the full interval after boot.
  void scheduler.scanAndSchedule().catch(() => {});
  void processor.runDue().catch(() => {});

  return {
    stop: () => {
      clearInterval(scannerTimer);
      clearInterval(processorTimer);
    },
  };
}

export const followUpProcessor = new FollowUpProcessor();
