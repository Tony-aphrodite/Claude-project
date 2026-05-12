// ============================================================================
// Lifecycle webhook trigger (5-12-feedback-round2 Option D).
//
// Respond.io v2's contact PUT endpoint SILENTLY DROPS the `lifecycle`
// field (probed every shape on 2026-05-12 — every variant returns 200 OK
// with no actual change). Per their public docs the "Update Lifecycle"
// action is workflow-only. Miguel agreed to set up 5 workflows in his
// Respond.io workspace, each with:
//   - Trigger: Incoming Webhook (contact identifier = Contact ID)
//   - Step 1: Update Lifecycle → {New Lead | Engaging | Following Up |
//             Customer | Lost Lead}
// Each workflow generates a unique stable webhook URL.
//
// This service maps our internal lead_stage values to those URLs (via
// env vars) and POSTs `{contactId: ...}` so the workflow fires. Called
// fire-and-forget from `leadStageService.applyTransition` so a workflow
// outage can't block the server-side state machine.
// ============================================================================

import { Agent, fetch as undiciFetch } from "undici";

import { TIMEOUTS } from "@dpm/shared";

import { loadEnv } from "../env.js";
import { getLogger } from "../logger.js";

const keepAliveAgent = new Agent({
  keepAliveTimeout: TIMEOUTS.KEEP_ALIVE_MS,
  keepAliveMaxTimeout: TIMEOUTS.KEEP_ALIVE_MS,
});

/**
 * Map a `lead_stage` value to the corresponding lifecycle webhook URL
 * from env. Returns null when the URL isn't configured — caller treats
 * as "lifecycle sync disabled for this stage" and skips the call.
 *
 * The mapping mirrors `RESPOND_IO_LIFECYCLE_BY_LEAD_STAGE` in
 * respond-io.ts so the lifecycle labels stay consistent: the same target
 * we'd use if Respond.io ever exposed direct API writes.
 */
export function lifecycleWebhookUrlFor(leadStage: string): string | null {
  const env = loadEnv();
  switch (leadStage) {
    case "new":
      return env.RESPONDIO_LIFECYCLE_WEBHOOK_NEW_LEAD || null;
    case "qualified":
    case "proposed":
      return env.RESPONDIO_LIFECYCLE_WEBHOOK_ENGAGING || null;
    case "deposit_pending":
      return env.RESPONDIO_LIFECYCLE_WEBHOOK_FOLLOWING_UP || null;
    case "deposit_paid":
    case "handed_off":
    case "closed":
      return env.RESPONDIO_LIFECYCLE_WEBHOOK_CUSTOMER || null;
    case "lost":
      return env.RESPONDIO_LIFECYCLE_WEBHOOK_LOST_LEAD || null;
    default:
      return null;
  }
}

/**
 * Fire-and-forget POST to the workflow webhook URL with the contact id.
 * Returns a Promise that resolves even on failure (with a warn log) so
 * the caller can `void` it without try/catch noise. Never throws.
 */
export async function triggerLifecycleWebhook(input: {
  leadStage: string;
  respondIoContactId: string;
}): Promise<void> {
  const url = lifecycleWebhookUrlFor(input.leadStage);
  if (!url) {
    // Sync disabled for this stage. Common in dev / staging where Miguel
    // hasn't shared URLs. Stay silent — not an error.
    return;
  }
  const log = getLogger();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUTS.RESPOND_IO_MS);
  try {
    const res = await undiciFetch(url, {
      method: "POST",
      signal: controller.signal,
      dispatcher: keepAliveAgent,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contactId: input.respondIoContactId }),
    } as RequestInit);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      log.warn(
        {
          status: res.status,
          body: body.slice(0, 250),
          leadStage: input.leadStage,
          contactId: input.respondIoContactId,
        },
        "lifecycle webhook non-2xx — lifecycle in Respond.io may be stale",
      );
      return;
    }
    log.info(
      { leadStage: input.leadStage, contactId: input.respondIoContactId },
      "lifecycle webhook fired ok",
    );
  } catch (err) {
    log.warn(
      {
        err: (err as Error).message,
        leadStage: input.leadStage,
        contactId: input.respondIoContactId,
      },
      "lifecycle webhook failed — lifecycle in Respond.io may be stale",
    );
  } finally {
    clearTimeout(timer);
  }
}
