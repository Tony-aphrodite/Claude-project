"use server";

// Server actions for the lead pipeline. The pipeline state machine is owned
// by the server's LeadStageService; the panel does NOT replicate the
// transition rules — it just calls the same helpers via direct DB writes
// and treats them as a forced (human-driven) transition.
//
// Why force-transition: the panel exposes a "human override" path. A sede
// team member may legitimately need to skip stages (e.g., move a stuck
// deposit_pending straight to lost). The audit trail in lead_metadata.history
// records `by: "human"` so we can spot manual interventions later.

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  chatContacts,
  conversaciones,
  errores,
  getDb,
  mensajes,
  sedes,
} from "@dpm/db";
import {
  LEAD_STAGES,
  type LeadMetadata,
  type LeadStage,
} from "@dpm/shared";

import { sendRespondIoMessage } from "~/lib/respond-io";

const MAX_HISTORY = 10;

async function applyForceTransition(
  conversacionId: string,
  to: LeadStage,
  note?: string,
): Promise<{ from: LeadStage; to: LeadStage } | null> {
  const db = getDb();
  const [current] = await db
    .select()
    .from(conversaciones)
    .where(eq(conversaciones.id, conversacionId))
    .limit(1);
  if (!current) return null;

  const from = current.leadStage as LeadStage;
  if (from === to) return { from, to };

  const meta = (current.leadMetadata as LeadMetadata | null) ?? {};
  const history = [...(meta.history ?? [])];
  history.push({
    from,
    to,
    at: new Date().toISOString(),
    by: "human",
    ...(note ? { note } : {}),
  });
  while (history.length > MAX_HISTORY) history.shift();

  await db
    .update(conversaciones)
    .set({
      leadStage: to,
      leadStageChangedAt: new Date(),
      leadMetadata: { ...meta, history },
    })
    .where(eq(conversaciones.id, conversacionId));
  return { from, to };
}

// Handoff text now lives in ~/lib/handoff-text so it can be unit-tested
// without spinning up vitest in the panel package. "use server" files only
// export server actions, so the helper has to live elsewhere.
import { buildHandoffText } from "~/lib/handoff-text";

/**
 * Confirm that the deposit landed on Wise/Revolut/bank. The action:
 *   1. Forces lead_stage: deposit_pending → deposit_paid
 *   2. Posts a cordial "payment received" message to Respond.io
 *   3. Persists that message as an AI row in mensajes (so prompt history
 *      reflects what the client saw)
 *   4. Forces lead_stage: deposit_paid → handed_off (the human team owns
 *      the thread from here)
 *
 * Each step is best-effort — if Respond.io send fails, we still record the
 * deposit as paid so the panel reflects reality. The panel will surface the
 * send error on the next refresh via the errores table.
 */
export async function confirmDepositReceived(formData: FormData) {
  const conversacionId = String(formData.get("conversacionId") ?? "");
  if (!conversacionId) return;

  const db = getDb();
  const [row] = await db
    .select({
      conv: conversaciones,
      contact: chatContacts,
      sedeName: sedes.nombre,
    })
    .from(conversaciones)
    .leftJoin(
      chatContacts,
      eq(chatContacts.respondIoContactId, conversaciones.respondIoContactId),
    )
    .leftJoin(sedes, eq(sedes.id, conversaciones.sedeId))
    .where(eq(conversaciones.id, conversacionId))
    .limit(1);
  if (!row) return;

  await applyForceTransition(conversacionId, "deposit_paid", "panel:confirm_deposit");

  const meta = (row.conv.leadMetadata ?? null) as LeadMetadata | null;
  const text = buildHandoffText(row.contact?.language, {
    programa: meta?.programa ?? null,
    fecha: meta?.start_date ?? null,
  });

  // Best-effort outbound send.
  let sent = false;
  try {
    await sendRespondIoMessage({
      conversationId: row.conv.respondIoConversationId,
      text,
    });
    sent = true;
  } catch (err) {
    console.error("respond_io send failed during deposit confirmation", err);
  }

  // Persist as AI message regardless of send success — the panel UI shows
  // the intended message so the operator knows what was attempted.
  await db.insert(mensajes).values({
    conversacionId,
    sender: "ai",
    content: text,
    metadata: {
      synthetic: true,
      reason: "deposit_paid_handoff",
      sent_via_respond_io: sent,
    },
  });

  await applyForceTransition(conversacionId, "handed_off", "panel:auto_handoff_after_deposit");

  // Owner spec DPM_AI_LAUNCH 2026-05-07: notify gilit@dpmdiving.com on
  // every handoff. Email transport (Resend / SMTP) is not yet configured;
  // we queue the intent in `errores` with type `handoff_email_pending`
  // so the operator can replay them once the transport lands.
  const targetEmail = process.env.HANDOFF_NOTIFICATION_EMAIL ?? "gilit@dpmdiving.com";
  await db
    .insert(errores)
    .values({
      source: "internal",
      conversacionId,
      errorType: "handoff_email_pending",
      errorMessage: `Notify ${targetEmail}: deposit confirmed and lead handed off`,
      context: {
        targetEmail,
        sede: row.sedeName ?? null,
        contactName: row.contact?.name ?? null,
        contactPhone: row.contact?.phone ?? null,
        respondIoConversationId: row.conv.respondIoConversationId,
        refCode: (row.conv.leadMetadata as LeadMetadata | null)?.ref_code ?? null,
        program: (row.conv.leadMetadata as LeadMetadata | null)?.programa ?? null,
        startDate: (row.conv.leadMetadata as LeadMetadata | null)?.start_date ?? null,
        currency: (row.conv.leadMetadata as LeadMetadata | null)?.deposit_currency ?? null,
        amount: (row.conv.leadMetadata as LeadMetadata | null)?.deposit_amount ?? null,
      },
    })
    .catch((err) =>
      console.error("failed to queue handoff email notification", err),
    );

  revalidatePath("/payments");
  revalidatePath("/pipeline");
  revalidatePath(`/conversations/${conversacionId}`);
}

/**
 * Mark a stuck or rejected lead as lost. Used for deposits that never
 * arrived after a long wait, or threads where the human decided to give up.
 */
export async function markLeadLost(formData: FormData) {
  const conversacionId = String(formData.get("conversacionId") ?? "");
  const note = String(formData.get("note") ?? "panel:manual_lost");
  if (!conversacionId) return;

  await applyForceTransition(conversacionId, "lost", note);

  revalidatePath("/payments");
  revalidatePath("/pipeline");
  revalidatePath(`/conversations/${conversacionId}`);
}

/**
 * Free-form stage override from the panel kanban. Validates the target
 * against the canonical LEAD_STAGES list to reject typos.
 */
export async function overrideLeadStage(formData: FormData) {
  const conversacionId = String(formData.get("conversacionId") ?? "");
  const target = String(formData.get("to") ?? "") as LeadStage;
  const note = String(formData.get("note") ?? "panel:manual_override");
  if (!conversacionId) return;
  if (!LEAD_STAGES.includes(target)) return;

  await applyForceTransition(conversacionId, target, note);

  revalidatePath("/payments");
  revalidatePath("/pipeline");
  revalidatePath(`/conversations/${conversacionId}`);
}
