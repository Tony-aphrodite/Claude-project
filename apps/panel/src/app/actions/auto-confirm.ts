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
import { requireUser } from "~/lib/supabase";

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

  revalidatePath("/depositos-auto");
}

export async function unflagAutoConfirm(formData: FormData) {
  const conversacionId = String(formData.get("conversacionId") ?? "");
  if (!conversacionId) return;

  const db = getDb();
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
