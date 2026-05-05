import { and, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getDb, promptsVersiones } from "@dpm/db";

import { DiffView } from "~/app/_components/diff-view";
import { PageHeader } from "~/app/_components/page-header";
import { promotePromptVersion, savePromptDraft } from "~/app/actions/prompts";

export const dynamic = "force-dynamic";

export default async function PromptDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: "edit" | "diff" }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const view = sp.view ?? "edit";

  const db = getDb();
  const [v] = await db
    .select()
    .from(promptsVersiones)
    .where(eq(promptsVersiones.id, id))
    .limit(1);
  if (!v) notFound();

  // Currently-active version of the same (type, sede) bucket — diff baseline.
  const [active] = v.active
    ? [v]
    : await db
        .select()
        .from(promptsVersiones)
        .where(
          and(
            eq(promptsVersiones.type, v.type),
            eq(promptsVersiones.active, true),
            v.sedeId
              ? eq(promptsVersiones.sedeId, v.sedeId)
              : isNull(promptsVersiones.sedeId),
          ),
        )
        .orderBy(desc(promptsVersiones.versionNumber))
        .limit(1);

  return (
    <>
      <PageHeader
        eyebrow="Prompt del sistema"
        title={`v${v.versionNumber}`}
        description={
          v.active
            ? "Versión activa que el AI usa ahora mismo."
            : "Versión inactiva. Editá, comparala con la activa, o promové si pasó regression."
        }
        actions={
          <div className="flex items-center gap-2">
            {v.active ? (
              <span className="badge-ok">activa</span>
            ) : (
              <span className="badge-neutral">inactiva</span>
            )}
            {v.regressionSuitePassed ? (
              <span className="badge-ok">regression OK</span>
            ) : (
              <span className="badge-warn">regression pending</span>
            )}
            <Link href="/prompts" className="btn-ghost text-sm">
              ← Lista
            </Link>
          </div>
        }
      />

      <div className="flex gap-2 border-b border-ink-100 -mt-2">
        <Link
          href={`/prompts/${v.id}?view=edit`}
          className={`px-3 py-2 text-sm border-b-2 ${
            view === "edit" ? "border-brand-500 text-ink-900" : "border-transparent text-ink-500"
          }`}
        >
          Editar
        </Link>
        <Link
          href={`/prompts/${v.id}?view=diff`}
          className={`px-3 py-2 text-sm border-b-2 ${
            view === "diff" ? "border-brand-500 text-ink-900" : "border-transparent text-ink-500"
          }`}
        >
          Diff con activa
        </Link>
      </div>

      {view === "edit" && (
        <form action={savePromptDraft} className="space-y-3">
          <input type="hidden" name="basedOnId" value={v.id} />
          <textarea
            name="content"
            rows={28}
            defaultValue={v.content}
            className="w-full font-mono text-xs border border-ink-200 rounded p-3 bg-white"
          />
          <div className="flex justify-end">
            <button className="btn-primary">Guardar como nueva versión</button>
          </div>
        </form>
      )}

      {view === "diff" && (
        <DiffView
          before={active?.content ?? ""}
          after={v.content}
          beforeLabel={`activa (v${active?.versionNumber ?? "?"})`}
          afterLabel={`v${v.versionNumber}`}
        />
      )}

      {!v.active && v.regressionSuitePassed && (
        <form action={promotePromptVersion} className="card flex items-center justify-between">
          <input type="hidden" name="id" value={v.id} />
          <div className="text-sm">
            Esta versión pasó regression. ¿Promover a producción?
          </div>
          <button className="btn-ok">Promover</button>
        </form>
      )}

      {!v.regressionSuitePassed && !v.active && (
        <div className="card text-sm text-ink-500">
          Antes de promover, corré la regression suite contra esta versión.
          (Por ahora: <code className="font-mono text-brand-600">pnpm dpm-regression run --version=v{v.versionNumber} --cases=fixtures/regression/cases --kb-dir=fixtures/regression/kb</code>)
        </div>
      )}
    </>
  );
}
