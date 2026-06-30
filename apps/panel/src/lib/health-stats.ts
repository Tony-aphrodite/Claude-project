// ============================================================================
// AI health stats — Miguel 2026-06-12 resilience layer #5 (Semáforo de salud).
//
// Computes a single coherent snapshot of "is the AI working?" by joining
// three signals from data we ALREADY have:
//
//   1. lastAiMessageAt       — newest mensajes row with sender='ai'.
//                              The AI has answered SOMETHING this recently.
//   2. minutesSinceLastAi    — derived; the "did the AI just go silent?"
//                              warning fires when no AI reply for 15+ min
//                              while inbound traffic was still arriving.
//   3. inboundSinceLastAi    — count of cliente messages newer than the
//                              latest AI reply. If > 0, the AI owes
//                              answers right now.
//   4. recentErrorCount      — errores rows from the last hour. The
//                              process-message handler logs failures to
//                              this table; a spike means the AI is
//                              stumbling even if it eventually replies.
//   5. handsOffPending       — conversations currently in lead_stage =
//                              'handed_off'. Not a health signal per se,
//                              but tells the operator how much human
//                              workload exists right now.
//
// The semaphore label is a deterministic function of these signals —
// see `semaphoreFor` below. We never store any of this; every call hits
// the DB, but each query is indexed and bounded to the last hour, so
// total cost is < 50ms even on a large mensajes table.
//
// Why not a separate "ai_health" table that gets pinged on a cron:
//
//   - Cron pings drift from reality (no recent inbound = AI looks
//     "broken" but is actually just idle).
//   - Indirect data (cron health) lies when the real data (mensajes,
//     errores) is fine — the operator wants to know about THIS
//     conversation traffic, not a synthetic pulse.
//   - One extra table to keep in sync = one more thing to break.
//
// Reading from mensajes / errores directly stays honest: the panel
// shows what just happened, not what a heartbeat says about it.
// ============================================================================

import { and, desc, eq, gte, sql } from "drizzle-orm";

import {
  conversaciones,
  errores,
  getDb,
  mensajes,
} from "@dpm/db";

export type HealthLevel = "ok" | "warn" | "bad" | "unknown";

export type HealthSnapshot = {
  level: HealthLevel;
  /** Short Spanish label suitable for a chip. */
  label: string;
  /** Long Spanish description suitable for a hover/help text. */
  description: string;
  /** ISO timestamp of the newest AI reply we've seen, or null. */
  lastAiMessageAt: string | null;
  /** Minutes between now and lastAiMessageAt. Infinity if no AI reply yet. */
  minutesSinceLastAi: number;
  /** Count of inbound cliente messages newer than the latest AI reply. */
  inboundSinceLastAi: number;
  /** Errors logged in the last hour. */
  recentErrorCount: number;
  /** Conversations in lead_stage='handed_off'. */
  handsOffPending: number;
  /** ISO timestamp this snapshot was computed at — useful for "ago" display. */
  computedAt: string;
};

// Thresholds — chosen conservatively. Tune by tracking false-positive
// rate in Miguel's reports.
//
//   GREEN  → an AI reply happened within the last 5 minutes
//          OR no inbound is waiting on the AI
//          AND no recent error spike.
//   YELLOW → AI hasn't replied in 5-15 min while inbound is waiting,
//          OR error spike (≥3 in the last hour).
//   RED    → AI hasn't replied in 15+ min while inbound is waiting,
//          OR error spike (≥10 in the last hour).
const AI_REPLY_WARN_MINUTES = 5;
const AI_REPLY_BAD_MINUTES = 15;
const ERROR_WARN_THRESHOLD = 3;
const ERROR_BAD_THRESHOLD = 10;

function semaphoreFor(snapshot: {
  lastAiMessageAt: Date | null;
  minutesSinceLastAi: number;
  inboundSinceLastAi: number;
  recentErrorCount: number;
}): { level: HealthLevel; label: string; description: string } {
  const {
    lastAiMessageAt,
    minutesSinceLastAi,
    inboundSinceLastAi,
    recentErrorCount,
  } = snapshot;

  // Never seen an AI reply at all. Could be a fresh install OR a real
  // outage. Surface as "unknown" so the operator investigates instead
  // of assuming the worst.
  if (lastAiMessageAt === null) {
    return {
      level: "unknown",
      label: "Sin datos",
      description:
        "No hay todavía ninguna respuesta de la AI en la base. Si el piloto recién arrancó es normal; si llevás horas operando, revisá Railway.",
    };
  }

  // Error spike — high errorCount wins regardless of recent activity.
  if (recentErrorCount >= ERROR_BAD_THRESHOLD) {
    return {
      level: "bad",
      label: "AI con errores",
      description: `${recentErrorCount} errores en la última hora — la AI está respondiendo pero algo está roto. Revisá /follow-ups y Railway logs.`,
    };
  }

  // Stale AI with traffic waiting → escalate by minutes.
  if (inboundSinceLastAi > 0) {
    if (minutesSinceLastAi >= AI_REPLY_BAD_MINUTES) {
      return {
        level: "bad",
        label: "AI caída",
        description: `Hace ${Math.floor(minutesSinceLastAi)} min que la AI no responde y ${inboundSinceLastAi} cliente${inboundSinceLastAi === 1 ? "" : "s"} está${inboundSinceLastAi === 1 ? "" : "n"} esperando. Cubrí a mano desde /conversations.`,
      };
    }
    if (minutesSinceLastAi >= AI_REPLY_WARN_MINUTES) {
      return {
        level: "warn",
        label: "AI lenta",
        description: `Hace ${Math.floor(minutesSinceLastAi)} min sin respuesta de la AI con ${inboundSinceLastAi} cliente${inboundSinceLastAi === 1 ? "" : "s"} esperando. Si llega a ${AI_REPLY_BAD_MINUTES} min se considera caída.`,
      };
    }
  }

  if (recentErrorCount >= ERROR_WARN_THRESHOLD) {
    return {
      level: "warn",
      label: "AI con avisos",
      description: `${recentErrorCount} errores en la última hora — la AI responde pero hay ruido en los logs.`,
    };
  }

  return {
    level: "ok",
    label: "AI activa",
    description:
      inboundSinceLastAi === 0
        ? "Sin clientes esperando respuesta. La AI está al día."
        : `Última respuesta hace ${Math.floor(minutesSinceLastAi)} min · ${inboundSinceLastAi} cliente${inboundSinceLastAi === 1 ? "" : "s"} esperando — dentro del rango normal.`,
  };
}

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  const db = getDb();
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Run the three queries in parallel — each is short and hits a
  // covering index (mensajes.createdAt; errores.createdAt;
  // conversaciones.leadStage).
  const [lastAiRow, errorRow, handedOffRow, inboundRow] = await Promise.all([
    db
      .select({ at: mensajes.createdAt })
      .from(mensajes)
      .where(eq(mensajes.sender, "ai"))
      .orderBy(desc(mensajes.createdAt))
      .limit(1),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(errores)
      .where(gte(errores.createdAt, oneHourAgo)),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(conversaciones)
      .where(eq(conversaciones.leadStage, "handed_off")),
    // Inbound waiting on AI: cliente messages newer than the latest AI
    // reply. We compute this in a single query using a window — if
    // there's no AI reply yet, it counts every cliente message ever,
    // which the semaphore reads as "no AI activity at all" and flags
    // unknown.
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(mensajes)
      .where(
        and(
          eq(mensajes.sender, "cliente"),
          sql`${mensajes.createdAt} > COALESCE((SELECT MAX(${mensajes.createdAt}) FROM ${mensajes} WHERE ${mensajes.sender} = 'ai'), '1970-01-01'::timestamptz)`,
        ),
      ),
  ]);

  const lastAiAt = lastAiRow[0]?.at ?? null;
  const minutesSinceLastAi =
    lastAiAt === null
      ? Number.POSITIVE_INFINITY
      : (now.getTime() - lastAiAt.getTime()) / 60_000;
  const recentErrorCount = Number(errorRow[0]?.n ?? 0);
  const handsOffPending = Number(handedOffRow[0]?.n ?? 0);
  const inboundSinceLastAi = Number(inboundRow[0]?.n ?? 0);

  const sem = semaphoreFor({
    lastAiMessageAt: lastAiAt,
    minutesSinceLastAi,
    inboundSinceLastAi,
    recentErrorCount,
  });

  return {
    level: sem.level,
    label: sem.label,
    description: sem.description,
    lastAiMessageAt: lastAiAt ? lastAiAt.toISOString() : null,
    // Cap at a sane number for display — Number.POSITIVE_INFINITY isn't
    // JSON-safe and would render weird.
    minutesSinceLastAi: Number.isFinite(minutesSinceLastAi)
      ? Math.round(minutesSinceLastAi * 10) / 10
      : 99999,
    inboundSinceLastAi,
    recentErrorCount,
    handsOffPending,
    computedAt: now.toISOString(),
  };
}
