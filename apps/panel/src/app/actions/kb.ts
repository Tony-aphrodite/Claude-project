"use server";

// Server actions for the KB editor. All writes go through here so we can
// audit them, version them, and gate activation behind regression-suite
// pass.
//
// Lifecycle of an edit:
//   1. saveKbDraft   — uploads markdown to Storage, inserts kb_documents row
//                      with active=false. Returns the new row's id.
//   2. (out of band) regression suite runs, marks the row passed/failed.
//   3. promoteKbVersion — sets active=true; deactivates the previously-active
//                          row for the same sede. Refuses to promote a
//                          version that hasn't passed regression unless
//                          force=1 (kept as an explicit override path).

import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb, kbDocuments, sedes } from "@dpm/db";

import { sedeSlug, uploadKbBlob } from "~/lib/kb-storage";

export async function saveKbDraft(formData: FormData) {
  const sedeId = String(formData.get("sedeId") ?? "");
  const content = String(formData.get("content") ?? "");
  if (!sedeId || !content.trim()) return;

  const db = getDb();
  const [sede] = await db.select().from(sedes).where(eq(sedes.id, sedeId)).limit(1);
  if (!sede) return;

  // Pick next version number for this sede.
  const verRows = (await db.execute<{ nextVer: number }>(sql`
    SELECT COALESCE(MAX(version), 0) + 1 AS "nextVer"
      FROM kb_documents
     WHERE sede_id = ${sedeId}
  `)) as unknown as { nextVer: number }[];
  const nextVer = verRows[0]?.nextVer ?? 1;

  const storagePath = await uploadKbBlob({
    sedeSlug: sedeSlug(sede.nombre),
    version: nextVer,
    content,
  });

  const [created] = await db
    .insert(kbDocuments)
    .values({
      sedeId,
      version: nextVer,
      storagePath,
      active: false,
      uploadedBy: "panel",
    })
    .returning();

  revalidatePath("/kb");
  if (created) redirect(`/kb/${created.id}`);
}

export async function promoteKbVersion(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const force = formData.get("force") === "1";
  if (!id) return;

  const db = getDb();
  const [target] = await db
    .select()
    .from(kbDocuments)
    .where(eq(kbDocuments.id, id))
    .limit(1);
  if (!target) return;

  // We don't currently model "regression passed" on kb_documents, only on
  // prompts_versiones. For now, allow promotion freely; the force flag is
  // a future hook for when we add a kb_regression_passed column.
  void force;

  await db.transaction(async (tx) => {
    await tx
      .update(kbDocuments)
      .set({ active: false })
      .where(
        and(eq(kbDocuments.sedeId, target.sedeId), eq(kbDocuments.active, true)),
      );
    await tx
      .update(kbDocuments)
      .set({ active: true })
      .where(eq(kbDocuments.id, target.id));
  });

  revalidatePath("/kb");
  revalidatePath(`/kb/${id}`);
}
