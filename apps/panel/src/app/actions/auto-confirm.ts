"use server";

// Panel actions for the /depositos-auto safety-net dashboard.
//
// Phase A (deployed 2026-05-13) loosened the OCR auto-confirm gate per
// Miguel's spec — ref code is informational, images accepted for all
// currencies, amount tolerance ±5 %. The trade-off is a real risk that
// an unrelated PDF with the right amount + currency could auto-confirm.
// Phase B (this page + actions) is the human safety net: the sede team
// cross-references auto-confirmed rows against the Wise/Mandiri/BCA
// bank emails landing in gilit@dpmdiving.com (ground truth of cash
// actually received). When the dashboard doesn't agree with a bank
// email, the operator clicks Flag.
//
// Implementation: flag state lives in the `errores` table with
// `error_type = "auto_confirm_review_requested"` (set) or
// `"auto_confirm_review_resolved"` (un-flagged). The list query reads
// the latest of those two for each conversation to decide current
// state — no schema change needed, audit trail is built in.

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  conversaciones,
  errores,
  getDb,
} from "@dpm/db";
import type { LeadMetadata } from "@dpm/shared";
import { requireUserContext } from "~/lib/auth-context";
import { requireUser } from "~/lib/supabase";

/**
 * Refuse the action if an office user is reaching across sedes. Same
 * pattern as actions/leads.ts — protects against form-replay attacks
 * even when the office user can see only their own rows in the list.
 */
async function assertSedeAccess(sedeId: string | null): Promise<boolean> {
  if (!sedeId) return true;
  const user = await requireUserContext();
  if (user.role === "admin") return true;
  return user.sedeId === sedeId;
}

async function currentOperatorEmail(): Promise<string | null> {
  try {
    const user = await requireUser();
    return user?.email ?? null;
  } catch {
    // dev-mode bypass — no auth session
    return null;
  }
}

export async function flagAutoConfirm(formData: FormData) {
  const conversacionId = String(formData.get("conversacionId") ?? "");
  if (!conversacionId) return;

  const db = getDb();
  const [conv] = await db
    .select()
    .from(conversaciones)
    .where(eq(conversaciones.id, conversacionId))
    .limit(1);
  if (!conv) return;
  if (!(await assertSedeAccess(conv.sedeId))) return;

  const meta = (conv.leadMetadata as LeadMetadata | null) ?? {};
  const ocr = meta.ocr_result;
  const extraction = ocr && "extraction" in ocr ? ocr.extraction : null;

  const flaggedBy = (await currentOperatorEmail()) ?? "unknown";

  await db.insert(errores).values({
    source: "internal",
    conversacionId,
    errorType: "auto_confirm_review_requested",
    errorMessage: `Operator flagged auto-confirmed deposit for review`,
    context: {
      flaggedBy,
      detectedAmount: extraction?.amount ?? null,
      detectedCurrency: extraction?.currency ?? null,
      expectedAmount: meta.deposit_amount_total ?? meta.deposit_amount ?? null,
      expectedCurrency: meta.deposit_currency ?? null,
      refCode: meta.ref_code ?? null,
      autoConfirmedAt: ocr?.at ?? null,
    },
  });

  // Miguel spec 2026-05-13 #1c: also drop a comment on the Respond.io
  // contact so anyone re-opening the chat (handoff agent, follow-up
  // worker, customer reply on a future day) sees the flag context
  // inline without cross-referencing the panel.
  //
  // Routed through the server's /admin/add-comment endpoint — the
  // Respond.io API key is server-only (panel deliberately doesn't
  // carry it, see the auto-confirm key rotation work). Best-effort:
  // if the comment fails we don't roll back the flag, we just log
  // (the dashboard signal still works on its own).
  if (conv.respondIoContactId) {
    const baseUrl = process.env.DPM_SERVER_URL;
    const token = process.env.ADMIN_RESET_TOKEN;
    if (baseUrl && token) {
      const detected =
        extraction?.amount != null && extraction.currency
          ? `${extraction.amount} ${extraction.currency}`
          : "—";
      const expected =
        meta.deposit_amount_total != null && meta.deposit_currency
          ? `${meta.deposit_amount_total} ${meta.deposit_currency}`
          : meta.deposit_amount != null && meta.deposit_currency
            ? `${meta.deposit_amount} ${meta.deposit_currency}`
            : "—";
      const commentText =
        `🚩 Flag para revisar — depósito auto-confirmado por OCR pero el ` +
        `equipo lo marcó para chequear contra los emails de banco.\n` +
        `• OCR detectó: ${detected}\n` +
        `• Esperado: ${expected}\n` +
        `• Ref: ${meta.ref_code ?? "—"}\n` +
        `• Flagged por: ${flaggedBy}\n` +
        `Cruzar contra Wise/Mandiri/BCA en gilit@dpmdiving.com antes de responder al cliente.`;

      try {
        const res = await fetch(
          `${baseUrl.replace(/\/+$/, "")}/admin/add-comment`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              contactId: conv.respondIoContactId,
              text: commentText,
            }),
          },
        );
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          console.warn(
            `flagAutoConfirm: respond.io comment failed ${res.status}: ${body.slice(0, 200)}`,
          );
        }
      } catch (err) {
        console.warn(
          "flagAutoConfirm: respond.io comment threw",
          (err as Error).message,
        );
      }
    }
  }

  revalidatePath("/depositos-auto");
}

export async function unflagAutoConfirm(formData: FormData) {
  const conversacionId = String(formData.get("conversacionId") ?? "");
  if (!conversacionId) return;

  const db = getDb();
  const [conv] = await db
    .select({ sedeId: conversaciones.sedeId })
    .from(conversaciones)
    .where(eq(conversaciones.id, conversacionId))
    .limit(1);
  if (!conv) return;
  if (!(await assertSedeAccess(conv.sedeId))) return;

  const resolvedBy = (await currentOperatorEmail()) ?? "unknown";

  await db.insert(errores).values({
    source: "internal",
    conversacionId,
    errorType: "auto_confirm_review_resolved",
    errorMessage: `Operator resolved auto-confirm flag — looks fine after manual review`,
    context: {
      resolvedBy,
    },
  });

  revalidatePath("/depositos-auto");
}
