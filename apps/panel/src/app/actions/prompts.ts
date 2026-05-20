"use server";

// Server actions for the prompts editor. All writes go through here so we
// can audit them and enforce regression-passed gating before promotion.
//
// Admin gate (2026-05-19 audit pass): both savePromptDraft and
// promotePromptVersion require role=admin. Office users have no business
// editing or activating prompts — the surface is invisible to them in
// the sidebar and the page returns 404, but the actions themselves are
// addressable HTTP endpoints so we add the guard at the action layer too.

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { getDb, promptsVersiones } from "@dpm/db";

import { requireUserContext } from "~/lib/auth-context";

async function requireAdmin(): Promise<void> {
  const user = await requireUserContext();
  if (user.role !== "admin") notFound();
}

export async function savePromptDraft(formData: FormData) {
  await requireAdmin();
  const basedOnId = String(formData.get("basedOnId") ?? "");
  const content = String(formData.get("content") ?? "").trim();
  if (!basedOnId || !content) return;

  const db = getDb();
  const [base] = await db
    .select()
    .from(promptsVersiones)
    .where(eq(promptsVersiones.id, basedOnId))
    .limit(1);
  if (!base) return;

  // Pick next version number for this (type, sede_id) tuple.
  const verRows = (await db.execute<{ nextVer: number }>(sql`
    SELECT COALESCE(MAX(version_number), 0) + 1 AS "nextVer"
      FROM prompts_versiones
     WHERE type = ${base.type}
       AND ${base.sedeId ? sql`sede_id = ${base.sedeId}` : sql`sede_id IS NULL`}
  `)) as unknown as { nextVer: number }[];
  const nextVer = verRows[0]?.nextVer ?? 1;

  const [created] = await db
    .insert(promptsVersiones)
    .values({
      versionNumber: nextVer,
      type: base.type,
      sedeId: base.sedeId,
      content,
      active: false,
      createdBy: "panel",
      regressionSuitePassed: false,
    })
    .returning();

  revalidatePath("/prompts");
  if (created) redirect(`/prompts/${created.id}`);
}

export async function promotePromptVersion(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const db = getDb();
  const [target] = await db
    .select()
    .from(promptsVersiones)
    .where(eq(promptsVersiones.id, id))
    .limit(1);
  if (!target) return;

  // Refuse promotion if regression hasn't passed — guide §16 #10.
  if (!target.regressionSuitePassed) return;

  await db.transaction(async (tx) => {
    await tx
      .update(promptsVersiones)
      .set({ active: false })
      .where(
        sql`type = ${target.type} AND ${
          target.sedeId ? sql`sede_id = ${target.sedeId}` : sql`sede_id IS NULL`
        }`,
      );
    await tx
      .update(promptsVersiones)
      .set({ active: true })
      .where(eq(promptsVersiones.id, target.id));
  });

  revalidatePath("/prompts");
}
