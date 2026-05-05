import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "~/app/_components/page-header";
import { DiffView } from "~/app/_components/diff-view";
import { promoteKbVersion, saveKbDraft } from "~/app/actions/kb";
import {
  getActiveKbForSede,
  getKbVersionRow,
  listKbVersions,
} from "~/lib/db-queries";
import { fetchKbBlob } from "~/lib/kb-storage";

export const dynamic = "force-dynamic";

export default async function KbDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: "edit" | "diff" }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const view = sp.view ?? "edit";

  const row = await getKbVersionRow(id);
  if (!row) notFound();

  // Lazy-load the blob from Storage. Falls back to an explanatory error
  // if Storage is unreachable so the editor can still show the row metadata.
  let content = "";
  let loadError: string | null = null;
  try {
    content = await fetchKbBlob(row.storagePath);
  } catch (err) {
    loadError = (err as Error).message;
  }

  // Active version for diff baseline (skip the lookup if THIS is the active).
  const active = row.active ? row : await getActiveKbForSede(row.sedeId);
  let activeContent = content;
  if (active && active.id !== row.id) {
    try {
      activeContent = await fetchKbBlob(active.storagePath);
    } catch {
      activeContent = "";
    }
  }

  const allVersions = await listKbVersions(row.sedeId);

  return (
    <>
      <PageHeader
        eyebrow="Knowledge Base"
        title={`${row.sedeName ?? "?"} · v${row.version}`}
        description={
          row.active
            ? "Esta es la versión activa que el AI usa ahora mismo. Editar y guardar crea una versión nueva inactiva."
            : "Versión inactiva. Podés editar y guardar otra, comparar con la activa, o promover esta a producción."
        }
        actions={
          <div className="flex items-center gap-2">
            {row.active ? (
              <span className="badge-ok">activa</span>
            ) : (
              <span className="badge-neutral">inactiva</span>
            )}
            <Link href="/kb" className="btn-ghost text-sm">
              ← Lista
            </Link>
          </div>
        }
      />

      {/* View tabs */}
      <div className="flex gap-2 border-b border-ink-100 -mt-2">
        <Link
          href={`/kb/${row.id}?view=edit`}
          className={`px-3 py-2 text-sm border-b-2 ${
            view === "edit" ? "border-brand-500 text-ink-900" : "border-transparent text-ink-500"
          }`}
        >
          Editar
        </Link>
        <Link
          href={`/kb/${row.id}?view=diff`}
          className={`px-3 py-2 text-sm border-b-2 ${
            view === "diff" ? "border-brand-500 text-ink-900" : "border-transparent text-ink-500"
          }`}
        >
          Diff con activa
        </Link>
      </div>

      {loadError && (
        <div className="card bg-bad-50 text-sm text-bad-700">
          No se pudo cargar el contenido de Storage: {loadError}
        </div>
      )}

      {view === "edit" && (
        <form action={saveKbDraft} className="space-y-3">
          <input type="hidden" name="sedeId" value={row.sedeId} />
          <textarea
            name="content"
            rows={28}
            defaultValue={content}
            className="w-full font-mono text-xs border border-ink-200 rounded p-3 bg-white"
          />
          <div className="flex items-center justify-between">
            <div className="text-xs text-ink-500">
              Guardar genera v{(allVersions[0]?.version ?? 0) + 1} inactiva.
            </div>
            <div className="flex gap-2">
              <button className="btn-primary">Guardar como nueva versión</button>
            </div>
          </div>
        </form>
      )}

      {view === "diff" && (
        <DiffView
          before={activeContent}
          after={content}
          beforeLabel={`activa (v${active?.version ?? "?"})`}
          afterLabel={`v${row.version}`}
        />
      )}

      {/* Promote */}
      {!row.active && (
        <form
          action={promoteKbVersion}
          className="card flex items-center justify-between"
        >
          <input type="hidden" name="id" value={row.id} />
          <div className="text-sm text-ink-700">
            Activar esta versión. La activa actual (v{active?.version ?? "?"}) pasa a
            inactiva. El AI recoge el cambio en menos de 60 segundos.
          </div>
          <button className="btn-ok">Activar</button>
        </form>
      )}

      {/* Version history compact */}
      <details className="card">
        <summary className="text-sm font-medium text-ink-700 cursor-pointer">
          Historial ({allVersions.length})
        </summary>
        <ul className="mt-3 space-y-1 text-xs">
          {allVersions.map((v) => (
            <li key={v.id}>
              <Link
                href={`/kb/${v.id}`}
                className={`flex items-center justify-between rounded-md px-2 py-1 hover:bg-ink-50 ${
                  v.id === row.id ? "bg-brand-50" : ""
                }`}
              >
                <span className="font-mono tabular-nums">v{v.version}</span>
                <span className="text-ink-500">
                  {new Date(v.uploadedAt).toLocaleString()}
                </span>
                {v.active ? (
                  <span className="badge-ok">activa</span>
                ) : (
                  <span className="badge-neutral">inactiva</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
