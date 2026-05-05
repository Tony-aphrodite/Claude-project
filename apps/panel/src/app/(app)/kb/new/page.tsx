import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { getDb, sedes } from "@dpm/db";

import { PageHeader } from "~/app/_components/page-header";
import { saveKbDraft } from "~/app/actions/kb";

export const dynamic = "force-dynamic";

const STARTER_TEMPLATE = `# DPM Diving — KB

> Esta es la primera versión de la KB para esta sede. Editá libremente y
> dale Guardar — el sistema crea una versión nueva inactiva. Para
> activarla, pasá por la pantalla de la versión y tocá el botón "Activar".

## Cursos
…

## Logística
…

## Política de cancelación
…
`;

export default async function NewKbPage({
  searchParams,
}: {
  searchParams: Promise<{ sede?: string }>;
}) {
  const { sede: sedeId } = await searchParams;
  if (!sedeId) notFound();

  const db = getDb();
  const [sede] = await db.select().from(sedes).where(eq(sedes.id, sedeId)).limit(1);
  if (!sede) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Knowledge Base"
        title={`Nueva KB · ${sede.nombre}`}
        description="Esta sede aún no tiene KB. Cargá el contenido y dale Guardar — la versión queda inactiva hasta que la actives."
      />

      <form action={saveKbDraft} className="space-y-3">
        <input type="hidden" name="sedeId" value={sedeId} />
        <textarea
          name="content"
          rows={28}
          defaultValue={STARTER_TEMPLATE}
          className="w-full font-mono text-xs border border-ink-300/70 rounded p-3 bg-ink-100/70 text-ink-900 placeholder:text-ink-500 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
        />
        <div className="flex justify-end">
          <button className="btn-primary">Crear v1 inactiva</button>
        </div>
      </form>
    </>
  );
}
