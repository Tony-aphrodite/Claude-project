import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { getDb, promptsVersiones } from "@dpm/db";
import { promotePromptVersion, savePromptDraft } from "~/app/actions/prompts";

export const dynamic = "force-dynamic";

export default async function PromptDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  const [v] = await db
    .select()
    .from(promptsVersiones)
    .where(eq(promptsVersiones.id, id))
    .limit(1);
  if (!v) notFound();

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-ink-900">v{v.versionNumber}</h1>
        <div className="text-sm text-ink-500">
          {v.active ? "Activa" : "Inactiva"} · regression{" "}
          {v.regressionSuitePassed ? "passed" : "pending"}
        </div>
      </header>

      <form action={savePromptDraft} className="space-y-3">
        <input type="hidden" name="basedOnId" value={v.id} />
        <textarea
          name="content"
          rows={28}
          defaultValue={v.content}
          className="w-full font-mono text-xs border border-ink-200 rounded p-3 bg-white"
        />
        <div className="flex gap-2">
          <button className="px-3 py-1.5 text-sm bg-ink-900 text-white rounded">
            Guardar como nueva versión
          </button>
        </div>
      </form>

      {!v.active && v.regressionSuitePassed && (
        <form action={promotePromptVersion} className="card flex items-center justify-between">
          <input type="hidden" name="id" value={v.id} />
          <div className="text-sm">
            Esta versión pasó regression. ¿Promover a producción?
          </div>
          <button className="px-3 py-1.5 text-sm bg-accent-600 text-white rounded">
            Promover
          </button>
        </form>
      )}

      {!v.regressionSuitePassed && (
        <div className="card text-sm text-ink-500">
          Antes de promover, corré <code>pnpm regression -- run --version=v{v.versionNumber} ...</code>
        </div>
      )}
    </div>
  );
}
