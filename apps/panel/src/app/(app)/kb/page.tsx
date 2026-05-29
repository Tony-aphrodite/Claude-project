import Link from "next/link";

import { PageHeader } from "~/app/_components/page-header";
import { requireAdminContext } from "~/lib/auth-context";
import { listKbVersions, listSedes } from "~/lib/db-queries";

export const dynamic = "force-dynamic";

export default async function KbListPage({
  searchParams,
}: {
  searchParams: Promise<{ sede?: string }>;
}) {
  await requireAdminContext();
  const params = await searchParams;
  const [sedes, versions] = await Promise.all([
    listSedes(),
    listKbVersions(params.sede),
  ]);

  // Find the active version per sede (for the "create new" button to know
  // which existing content to clone into the editor as a starting point).
  const activeBySede = new Map<string, string>();
  for (const v of versions) {
    if (v.active) activeBySede.set(v.sedeId, v.id);
  }

  return (
    <>
      <PageHeader
        eyebrow="Configuración de la AI"
        title="Knowledge Base"
        description="Editor de la KB que el AI inyecta al prompt en cada respuesta. Cada Save crea una versión nueva inactiva; activarla la pone en producción y el AI la usa en menos de un minuto."
        actions={
          <form className="flex items-end gap-2">
            <label className="text-xs">
              <div className="metric-label mb-1">Sede</div>
              <select name="sede" defaultValue={params.sede ?? ""} className="select">
                <option value="">Todas</option>
                {sedes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn-primary">Filtrar</button>
          </form>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sedes
          .filter((s) => !params.sede || s.id === params.sede)
          .map((s) => {
            const activeId = activeBySede.get(s.id);
            return (
              <div key={s.id} className="card">
                <header className="flex items-baseline justify-between mb-3">
                  <h3 className="text-sm font-semibold text-ink-900">{s.nombre}</h3>
                  {activeId ? (
                    <Link
                      href={`/kb/${activeId}`}
                      className="text-xs text-brand-600 hover:underline"
                    >
                      Editar activa →
                    </Link>
                  ) : (
                    <Link
                      href={`/kb/new?sede=${s.id}`}
                      className="text-xs text-brand-600 hover:underline"
                    >
                      Crear primera versión →
                    </Link>
                  )}
                </header>
                <ul className="space-y-1 text-xs max-h-[13.5rem] overflow-y-auto scrollbar-thin pr-1">
                  {versions
                    .filter((v) => v.sedeId === s.id)
                    .map((v) => (
                      <li key={v.id}>
                        <Link
                          href={`/kb/${v.id}`}
                          className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-ink-200/50"
                        >
                          <span className="font-mono tabular-nums">v{v.version}</span>
                          <span className="text-ink-500">
                            {new Date(v.uploadedAt).toLocaleDateString()}
                          </span>
                          {v.active ? (
                            <span className="badge-ok">activa</span>
                          ) : (
                            <span className="badge-neutral">inactiva</span>
                          )}
                        </Link>
                      </li>
                    ))}
                  {versions.filter((v) => v.sedeId === s.id).length === 0 && (
                    <li className="text-ink-400 italic px-2 py-1">
                      Sin versiones todavía.
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
      </div>
    </>
  );
}
