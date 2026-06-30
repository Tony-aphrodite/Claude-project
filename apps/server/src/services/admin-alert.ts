// ============================================================================
// Admin alert service — Miguel 2026-06-12 resilience layer #4.
//
// "Que el sistema detecte cuando la AI/server está caído o no responde,
//  y alerte al equipo (por WhatsApp o email) con algo claro: 'AI caída,
//  cubran a mano'."
//
// Single entry point: `sendAdminAlert({ kind, severity, message, context })`.
// Tries every configured channel in turn:
//
//   1. Respond.io WhatsApp to the admin contact (ADMIN_WHATSAPP_CONTACT_ID)
//      — Miguel sees this on his phone like any other message.
//   2. Generic HTTP webhook (ADMIN_ALERT_WEBHOOK_URL) — Slack, Discord,
//      n8n, anything that accepts a JSON POST. Format is JSON so the
//      receiving end can format however it wants.
//
// Both are best-effort and independent: if WhatsApp fails the webhook
// still fires (and vice versa). At least one succeeded is enough to
// consider the alert delivered.
//
// Anti-spam: per-`kind` cooldown. A second alert of the same kind
// within ALERT_COOLDOWN_MS is logged but not sent — prevents an AI
// outage from generating dozens of identical "AI caída" pings while
// recovery is in progress.
//
// State: the `errores` table doubles as the cooldown ledger. Each
// sent alert lands as an errores row (source='admin_alert',
// error_type=kind). The cooldown check is a single indexed query.
// No extra table needed.
// ============================================================================

import { and, desc, eq, gte, sql } from "drizzle-orm";

import { errores, getDb } from "@dpm/db";

import { getLogger } from "../logger.js";
import { respondIoClient } from "./respond-io.js";

/**
 * 15-minute default cooldown. Long enough that a single recovery cycle
 * doesn't generate alert spam; short enough that a genuinely persistent
 * outage produces fresh reminders every 15 min.
 */
const ALERT_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Known alert kinds. Adding a new kind: extend this union AND wire the
 * trigger somewhere. Keep names snake_case and stable — they become
 * the operator's filter key in error queries.
 */
export type AdminAlertKind =
  | "ai_call_failed"
  | "ai_silent_with_traffic"
  | "webhook_handler_crashed"
  | "ocr_repeatedly_failing"
  | "respond_io_outage"
  | "manual_test"; // exercised from /admin/alerts/test

export type AlertSeverity = "warn" | "bad";

export type AdminAlertInput = {
  kind: AdminAlertKind;
  severity: AlertSeverity;
  /** Short human-readable summary. Goes to WhatsApp verbatim. */
  message: string;
  /** Structured payload for the webhook (and for forensics). */
  context?: Record<string, unknown>;
};

export type AdminAlertResult = {
  /** True if at least one channel delivered. */
  delivered: boolean;
  /** Which channels actually sent (may be empty if cooldown skipped). */
  channels: Array<"whatsapp" | "webhook">;
  /** True when cooldown blocked the send entirely. */
  cooldownSkipped: boolean;
};

async function isWithinCooldown(kind: AdminAlertKind): Promise<boolean> {
  const db = getDb();
  const cutoff = new Date(Date.now() - ALERT_COOLDOWN_MS);
  const [row] = await db
    .select({ id: errores.id })
    .from(errores)
    .where(
      and(
        eq(errores.source, "admin_alert"),
        eq(errores.errorType, kind),
        gte(errores.createdAt, cutoff),
      ),
    )
    .orderBy(desc(errores.createdAt))
    .limit(1);
  return !!row;
}

async function sendViaWhatsApp(args: {
  kind: AdminAlertKind;
  severity: AlertSeverity;
  message: string;
}): Promise<boolean> {
  const log = getLogger();
  const contactId = process.env.ADMIN_WHATSAPP_CONTACT_ID;
  if (!contactId) return false;
  // Severity prefix so the operator can read priority at a glance from
  // a WhatsApp notification preview.
  const prefix = args.severity === "bad" ? "🚨" : "⚠️";
  const text = `${prefix} [${args.kind}] ${args.message}`;
  try {
    await respondIoClient.sendMessage({
      conversationId: "unresolved",
      contactId,
      text,
    });
    return true;
  } catch (err) {
    log.error(
      {
        err: err instanceof Error ? err.message : String(err),
        kind: args.kind,
        contactId: contactId.slice(0, 4) + "***",
      },
      "admin-alert: WhatsApp delivery failed",
    );
    return false;
  }
}

async function sendViaWebhook(args: AdminAlertInput): Promise<boolean> {
  const log = getLogger();
  const webhookUrl = process.env.ADMIN_ALERT_WEBHOOK_URL;
  if (!webhookUrl) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: args.kind,
        severity: args.severity,
        message: args.message,
        context: args.context ?? {},
        sentAt: new Date().toISOString(),
        service: "dpm-server",
      }),
    });
    if (!res.ok) {
      log.warn(
        { status: res.status, kind: args.kind },
        "admin-alert: webhook returned non-2xx",
      );
      return false;
    }
    return true;
  } catch (err) {
    log.error(
      {
        err: err instanceof Error ? err.message : String(err),
        kind: args.kind,
      },
      "admin-alert: webhook delivery failed",
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Record the alert attempt in `errores` regardless of delivery outcome.
 * Doubles as the cooldown ledger (same `(source, errorType)` filter)
 * and as the audit trail the panel's "what alerts fired" report will
 * read from in the future.
 */
async function recordAlertAttempt(args: {
  input: AdminAlertInput;
  channels: Array<"whatsapp" | "webhook">;
  delivered: boolean;
}): Promise<void> {
  const log = getLogger();
  try {
    await getDb()
      .insert(errores)
      .values({
        source: "admin_alert",
        errorType: args.input.kind,
        errorMessage: args.input.message,
        context: {
          severity: args.input.severity,
          channels: args.channels,
          delivered: args.delivered,
          payload: args.input.context ?? {},
        },
      });
  } catch (err) {
    // Recording failure is non-fatal — the alert already went out (if
    // any channel succeeded). Log it so we notice ledger drift.
    log.error(
      {
        err: err instanceof Error ? err.message : String(err),
        kind: args.input.kind,
      },
      "admin-alert: failed to record alert attempt in errores",
    );
  }
}

/**
 * Public entry point. Idempotent within the cooldown window.
 *
 * Returns even when every channel is unconfigured — the function never
 * throws. Callers can `void sendAdminAlert(...)` from anywhere in the
 * server pipeline without try/catch.
 */
export async function sendAdminAlert(
  input: AdminAlertInput,
): Promise<AdminAlertResult> {
  const log = getLogger();

  if (await isWithinCooldown(input.kind)) {
    log.info(
      { kind: input.kind, severity: input.severity },
      "admin-alert: skipped (cooldown active)",
    );
    return { delivered: false, channels: [], cooldownSkipped: true };
  }

  // Fire both channels in parallel; one's failure doesn't block the other.
  const [waOk, webhookOk] = await Promise.all([
    sendViaWhatsApp({
      kind: input.kind,
      severity: input.severity,
      message: input.message,
    }),
    sendViaWebhook(input),
  ]);

  const channels: Array<"whatsapp" | "webhook"> = [];
  if (waOk) channels.push("whatsapp");
  if (webhookOk) channels.push("webhook");
  const delivered = channels.length > 0;

  await recordAlertAttempt({ input, channels, delivered });

  if (!delivered) {
    log.error(
      {
        kind: input.kind,
        severity: input.severity,
        whatsappConfigured: !!process.env.ADMIN_WHATSAPP_CONTACT_ID,
        webhookConfigured: !!process.env.ADMIN_ALERT_WEBHOOK_URL,
      },
      "admin-alert: NO CHANNEL DELIVERED — alert is invisible. Configure ADMIN_WHATSAPP_CONTACT_ID or ADMIN_ALERT_WEBHOOK_URL.",
    );
  } else {
    log.warn(
      { kind: input.kind, severity: input.severity, channels },
      "admin-alert: delivered",
    );
  }

  return { delivered, channels, cooldownSkipped: false };
}

/**
 * Manually count recent alerts of a kind — used by the panel's health
 * banner / future #4 dashboard so the operator can see "how many AI
 * outage alerts fired in the last hour" without an SQL drill-in.
 */
export async function countRecentAlerts(args: {
  kind?: AdminAlertKind;
  hoursBack: number;
}): Promise<number> {
  const db = getDb();
  const cutoff = new Date(Date.now() - args.hoursBack * 60 * 60 * 1000);
  const whereClause = args.kind
    ? and(
        eq(errores.source, "admin_alert"),
        eq(errores.errorType, args.kind),
        gte(errores.createdAt, cutoff),
      )
    : and(eq(errores.source, "admin_alert"), gte(errores.createdAt, cutoff));
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(errores)
    .where(whereClause);
  return Number(row?.n ?? 0);
}
