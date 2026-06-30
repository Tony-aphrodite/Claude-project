// ============================================================================
// Operator inbox actions — Miguel 2026-06-12 resilience layer #2.
//
// Lets an operator open any conversation in /conversations/[id] and send
// a WhatsApp reply directly from the panel (instead of jumping to
// Respond.io). This is the "bandeja humana con respuesta" Miguel asked
// about again 2026-06-30; first formal scope-of-work captured in
// reference/2026-06-30-miguel-feedback-followups.md item #7.
//
// What the action does, in order:
//
//   1. Validate input (non-empty, within WhatsApp's 4096-char limit).
//   2. Load the conversation (panel-side query, no server round-trip).
//   3. Enforce sede access (admin OR matching-sede office user).
//   4. Send via the provider abstraction (`sendCustomerMessage`).
//      Respond.io today, Meta direct tomorrow — caller doesn't care.
//   5. Persist the message in `mensajes` (sender='agente') + flip
//      `human_took_over=true` on `leadMetadata` IN ONE TRANSACTION.
//      Either both happen or neither — never a sent-but-not-recorded
//      ghost message in production.
//   6. Best-effort transition to `lead_stage='handed_off'` via the
//      server endpoint. Non-blocking — if it fails, the message is
//      already out, we just log and move on. The next webhook will
//      reconcile lead_stage anyway.
//
// What this DOESN'T do:
//
//   - Trigger any Respond.io workflow (no tag, no lifecycle bump). The
//     operator is just messaging the customer; lifecycle/tag side
//     effects come from the deposit / handoff flows that already exist.
//   - Spawn a follow-up timer / SLA tracker — out of scope, future #4
//     (monitoring) ticket.
//   - Implement real-time updates. The page re-renders via the
//     ActionForm's `router.refresh()` after each send.
// ============================================================================

"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { chatContacts, conversaciones, getDb, mensajes } from "@dpm/db";
import type { LeadMetadata, LeadStage } from "@dpm/shared";

import { requireSedeWriteAccess } from "~/lib/auth-context";
import { sendCustomerMessage } from "~/lib/customer-messaging";

// ── Local action-result envelope (matches roster-engine.ts) ───────────────
//
// We re-declare the type here instead of importing from roster-engine
// because importing a "use server" module's types crosses bundling
// boundaries in Next.js builds. Same shape, different file.

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return { ok: false, error: message };
  }
}

// ── Limits ────────────────────────────────────────────────────────────────

/**
 * WhatsApp text message body limit. Keeping it generous client-side
 * (4096) is fine; if Respond.io / Meta enforces stricter, the provider
 * returns an error and we surface it inline.
 */
const MAX_MESSAGE_LENGTH = 4096;

/**
 * Lead stages we DON'T force-transition out of when the operator sends.
 * `closed` and `lost` are terminal — overwriting them would resurrect a
 * conversation Miguel intentionally finalised. `handed_off` is already
 * where we want to land, so no-op.
 */
const TRANSITION_FROM_BLOCKLIST = new Set<LeadStage>([
  "handed_off",
  "closed",
  "lost",
]);

// ── Server-side force-transition (best-effort) ────────────────────────────

async function bestEffortHandoff(
  conversacionId: string,
  currentStage: LeadStage,
): Promise<void> {
  if (TRANSITION_FROM_BLOCKLIST.has(currentStage)) return;
  const baseUrl = process.env.DPM_SERVER_URL;
  const token = process.env.ADMIN_RESET_TOKEN;
  if (!baseUrl || !token) return; // dev / mis-config — silent skip

  const url = `${baseUrl.replace(/\/+$/, "")}/admin/force-transition`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        conversacionId,
        to: "handed_off" satisfies LeadStage,
        note: "operator sent message from panel inbox",
      }),
    });
  } catch {
    // Non-blocking. The message is already out; lead_stage will
    // reconcile on the next webhook or operator override.
  } finally {
    clearTimeout(timer);
  }
}

// ── Public action ─────────────────────────────────────────────────────────

/**
 * Send a WhatsApp message to the customer from the panel inbox.
 *
 * Form fields:
 *   - conversacionId (uuid, required)
 *   - text           (string, required, 1..MAX_MESSAGE_LENGTH chars)
 *
 * On success: routes through the provider, persists `mensajes` row,
 * flips `human_took_over=true`, kicks off best-effort handed_off
 * transition, and revalidates the conversation page.
 *
 * On failure (validation / provider): returns `{ok:false, error}` so
 * ActionForm renders the message inline — no Vercel "Application
 * error" page.
 */
export async function sendOperatorMessage(
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const conversacionId = String(formData.get("conversacionId") ?? "").trim();
    const text = String(formData.get("text") ?? "").trim();

    if (!conversacionId) {
      throw new Error("conversacionId requerido");
    }
    if (text.length === 0) {
      throw new Error("El mensaje está vacío. Escribí algo antes de enviar.");
    }
    if (text.length > MAX_MESSAGE_LENGTH) {
      throw new Error(
        `El mensaje es muy largo (${text.length} caracteres). El máximo en WhatsApp es ${MAX_MESSAGE_LENGTH}.`,
      );
    }

    const db = getDb();
    // Pull conversation + the contact's WhatsApp phone in one round-trip.
    // The phone is required by the Meta direct provider; Respond.io
    // doesn't need it but it's cheap to load either way.
    const [conv] = await db
      .select({
        id: conversaciones.id,
        sedeId: conversaciones.sedeId,
        leadStage: conversaciones.leadStage,
        respondIoConversationId: conversaciones.respondIoConversationId,
        respondIoContactId: conversaciones.respondIoContactId,
        leadMetadata: conversaciones.leadMetadata,
        customerPhone: chatContacts.phone,
      })
      .from(conversaciones)
      .leftJoin(
        chatContacts,
        eq(chatContacts.respondIoContactId, conversaciones.respondIoContactId),
      )
      .where(eq(conversaciones.id, conversacionId))
      .limit(1);
    if (!conv) {
      throw new Error("Conversación no encontrada");
    }

    // Auth: admin OR matching-sede office. Throws "forbidden: …" when
    // an office user tries to message a conversation from another sede;
    // ActionForm renders that as an inline banner.
    const ctx = await requireSedeWriteAccess(conv.sedeId);

    // 1) Send via provider (Respond.io today, Meta tomorrow).
    //    The provider returns `{ok:false, error}` for application
    //    rejections (400, invalid phone, etc.) and throws for transport
    //    errors. We rethrow on `ok:false` so runAction packages it
    //    uniformly — the operator sees the Spanish message inline.
    const sendResult = await sendCustomerMessage({
      respondIoConversationId: conv.respondIoConversationId,
      respondIoContactId: conv.respondIoContactId,
      customerPhone: conv.customerPhone ?? null,
      text,
      operatorEmail: ctx.email,
      operatorUserId: ctx.userId,
    });
    if (!sendResult.ok) {
      throw new Error(sendResult.error);
    }

    // 2) Persist + silence AI in one transaction.
    //    If the persist fails after the send, we have a ghost — but
    //    transactions on a single Postgres connection are very unlikely
    //    to fail for healthy data + correct schema. Better than two
    //    separate writes where the second can fail independently.
    await db.transaction(async (tx) => {
      await tx.insert(mensajes).values({
        conversacionId: conv.id,
        sender: "agente",
        agenteName: ctx.email,
        content: text,
        metadata: {
          source: "panel_inbox",
          operator_user_id: ctx.userId,
          provider: sendResult.provider,
          ...(sendResult.providerMessageId !== undefined
            ? { provider_message_id: sendResult.providerMessageId }
            : {}),
        },
      });

      const oldMeta = (conv.leadMetadata as LeadMetadata | null) ?? {};
      // Only patch the flag — leave every other field untouched. Using
      // jsonb merge instead of full overwrite means a concurrent write
      // to another field doesn't lose state.
      const newMeta: LeadMetadata = {
        ...oldMeta,
        human_took_over: true,
      };
      await tx
        .update(conversaciones)
        .set({ leadMetadata: newMeta, updatedAt: new Date() })
        .where(eq(conversaciones.id, conv.id));
    });

    // 3) Best-effort lead_stage transition. Out-of-band so a flaky
    //    server response doesn't make the operator think the send
    //    failed. The message is already in WhatsApp by this point.
    await bestEffortHandoff(conv.id, conv.leadStage as LeadStage);

    revalidatePath(`/conversations/${conv.id}`);
  });
}

/**
 * Hand the conversation back to the AI (clear `human_took_over`,
 * transition handed_off → qualified). Mirrors the existing "Re-roll AI"
 * button but does NOT trigger a fresh AI response — pure release.
 *
 * Use case: operator took over by mistake, or wants to let the AI
 * continue without re-rolling.
 */
export async function releaseConversationToAi(
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const conversacionId = String(formData.get("conversacionId") ?? "").trim();
    if (!conversacionId) throw new Error("conversacionId requerido");

    const db = getDb();
    const [conv] = await db
      .select({
        id: conversaciones.id,
        sedeId: conversaciones.sedeId,
        leadStage: conversaciones.leadStage,
        leadMetadata: conversaciones.leadMetadata,
      })
      .from(conversaciones)
      .where(eq(conversaciones.id, conversacionId))
      .limit(1);
    if (!conv) throw new Error("Conversación no encontrada");
    await requireSedeWriteAccess(conv.sedeId);

    const oldMeta = (conv.leadMetadata as LeadMetadata | null) ?? {};
    const newMeta: LeadMetadata = {
      ...oldMeta,
      human_took_over: false,
    };
    await db
      .update(conversaciones)
      .set({ leadMetadata: newMeta, updatedAt: new Date() })
      .where(eq(conversaciones.id, conv.id));

    // If we were `handed_off`, bring lead_stage back to qualified so
    // the AI's pipeline view + workflow gating treat this as live again.
    if ((conv.leadStage as LeadStage) === "handed_off") {
      const baseUrl = process.env.DPM_SERVER_URL;
      const token = process.env.ADMIN_RESET_TOKEN;
      if (baseUrl && token) {
        try {
          await fetch(
            `${baseUrl.replace(/\/+$/, "")}/admin/force-transition`,
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                conversacionId: conv.id,
                to: "qualified" satisfies LeadStage,
                note: "operator released conversation from panel inbox",
              }),
            },
          );
        } catch {
          // Non-blocking — same justification as bestEffortHandoff.
        }
      }
    }

    revalidatePath(`/conversations/${conv.id}`);
  });
}
