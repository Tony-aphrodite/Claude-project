"use server";

// Server actions for the lead pipeline. The pipeline state machine is owned
// by the server's LeadStageService — the panel does NOT mutate
// `conversaciones.lead_stage` directly anymore.
//
// Why route through the server's HTTP endpoint:
//   • Force transitions trigger an *outgoing* lifecycle webhook to
//     Respond.io (so the contact's lifecycle moves to the right stage and
//     the matching workflow — e.g. "DPM GT - Onboarding Piloto" listening
//     on the `deposit_paid` tag — fires). Miguel hit this 2026-05-13 from
//     the panel's "Confirmar depósito" button: DB transitioned correctly
//     but Respond.io's lifecycle, tag, snippets and assignee were all left
//     untouched because the panel was bypassing the LeadStageService.
//   • Audit log + structured server logs end up in one place (Railway).
//   • Future side effects (email, slack, kb invalidation) only need to be
//     wired into the server once.
//
// The panel keeps writing other rows directly (mensajes, errores, etc.) —
// only the lead_stage transition itself is delegated.

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

import { applyContactTag } from "~/lib/respond-io";

/**
 * POST to the server's /admin/force-transition endpoint, which runs the
 * canonical `leadStageService.forceTransition()` and fires the matching
 * outgoing lifecycle webhook.
 *
 * Returns `null` when the server reports the conversation as not found.
 * Throws on network errors or 4xx/5xx from the server so the parent
 * action surfaces the failure (we do NOT silently fall back to a local
 * DB write — that's exactly the data-drift bug we're fixing).
 *
 * Required env on the panel deployment (Vercel):
 *   • DPM_SERVER_URL          base URL of the Railway server (no trailing slash)
 *   • ADMIN_RESET_TOKEN       shared with the server's same-named env var
 */
async function applyForceTransition(
  conversacionId: string,
  to: LeadStage,
  note?: string,
): Promise<{ from: LeadStage; to: LeadStage } | null> {
  const baseUrl = process.env.DPM_SERVER_URL;
  const token = process.env.ADMIN_RESET_TOKEN;
  if (!baseUrl || !token) {
    throw new Error(
      "applyForceTransition: DPM_SERVER_URL and ADMIN_RESET_TOKEN must be set in panel env",
    );
  }

  const url = `${baseUrl.replace(/\/+$/, "")}/admin/force-transition`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ conversacionId, to, note }),
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `force-transition ${res.status}: ${body.slice(0, 200)}`,
      );
    }
    const data = (await res.json()) as {
      ok: boolean;
      from?: LeadStage;
      to?: LeadStage;
    };
    if (!data.ok || !data.from || !data.to) {
      throw new Error(
        `force-transition response malformed: ${JSON.stringify(data).slice(0, 200)}`,
      );
    }
    return { from: data.from, to: data.to };
  } finally {
    clearTimeout(timer);
  }
}

// (Long handoff message helper at ~/lib/handoff-text is no longer used
// here — Miguel's Respond.io workflow handles all post-venta messaging
// when it sees the `deposit_paid` tag. The helper stays in the repo as
// fallback in case the workflow ever needs to be bypassed.)

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

  // Owner spec DPM_AI_LAUNCH 2026-05-07 reply §3 + §4: the post-venta
  // workflow lives in Respond.io and dispatches the snippets
  // (gten_paperwork, predive_tips, ssi_app, location, accommodation)
  // when it sees the `deposit_paid` tag on the contact. Our job from
  // the panel is to apply the tag — we do NOT send a long
  // confirmation message ourselves because that duplicates the
  // workflow output. Custom fields are already pushed by the AI when
  // it ran consultar_disponibilidad / solicitar_deposito; if the
  // operator confirms a lead where those fields are stale (e.g. the
  // AI never invoked the tools), the workflow will render snippets
  // with empty $contact.X — that's a Miguel-side concern, not ours.
  // Use the conversaciones row's respondIoContactId directly. Earlier we
  // pulled it via `row.contact?.respondIoContactId` (joined chat_contacts),
  // which is null whenever the contact has no chat_contacts row yet — that
  // happens for any conversation initialised via webhook before the AI
  // upsert has fired. Miguel saw this 2026-05-13 (contact 208082561 / 6281237414214):
  // DB transitions ran but the tag never reached Respond.io. The
  // conversaciones row always carries the contact id since the row itself
  // is created from a Respond.io contact.id, so reading it there is
  // unambiguous.
  const respondIoContactId =
    row.conv.respondIoContactId ?? row.contact?.respondIoContactId ?? null;
  let tagApplied = false;
  let tagError: string | null = null;
  try {
    await applyContactTag(respondIoContactId, "deposit_paid");
    tagApplied = true;
  } catch (err) {
    tagError = (err as Error).message ?? String(err);
    console.error("respond_io add deposit_paid tag failed", err);
    // Persist so we don't lose the failure in stateless Vercel logs.
    // `errores` is the operator-visible queue the panel surfaces.
    await db
      .insert(errores)
      .values({
        source: "internal",
        conversacionId,
        errorType: "respond_io_tag_apply_failed",
        errorMessage: tagError.slice(0, 500),
        context: {
          tag: "deposit_paid",
          respondIoContactId,
          stage: "confirm_deposit",
        },
      })
      .catch((logErr) =>
        console.error("failed to persist tag-apply error", logErr),
      );
  }

  await db.insert(mensajes).values({
    conversacionId,
    sender: "ai",
    content: "[deposit_paid tag applied — Respond.io workflow handles post-venta messaging]",
    metadata: {
      synthetic: true,
      reason: "deposit_paid_tag",
      tag_applied: tagApplied,
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
