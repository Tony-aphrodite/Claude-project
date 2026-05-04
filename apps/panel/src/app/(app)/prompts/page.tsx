import Link from "next/link";

import { PageHeader } from "~/app/_components/page-header";
import { listPrompts } from "~/lib/db-queries";

export const dynamic = "force-dynamic";

export default async function PromptsPage() {
  const versions = await listPrompts("system");

  return (
    <>
      <PageHeader
        eyebrow="Configuración de la AI"
        title="Prompts del sistema"
        description="Versionado del Bloque 1. Sólo se promociona a activa una versión que pasó la suite de regresión (≥95%)."
        actions={
          <Link href="/prompts/new" className="btn-primary">
            <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
              <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            Nueva versión
          </Link>
        }
      />

      <div className="card !p-0 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th className="pl-5">Versión</th>
              <th>Creada</th>
              <th>Estado</th>
              <th>Regression</th>
              <th>Sede</th>
              <th className="pr-5"></th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id}>
                <td className="pl-5 font-medium tabular-nums">v{v.versionNumber}</td>
                <td className="text-xs text-ink-500 tabular-nums">
                  {new Date(v.createdAt).toLocaleDateString()}
                </td>
                <td>
                  {v.active ? (
                    <span className="badge-ok">Activa</span>
                  ) : (
                    <span className="badge-neutral">Inactiva</span>
                  )}
                </td>
                <td>
                  {v.regressionSuitePassed ? (
                    <span className="badge-ok">passed</span>
                  ) : (
                    <span className="badge-warn">pending</span>
                  )}
                </td>
                <td className="text-xs text-ink-500">
                  {v.sedeId ? "override sede" : "global"}
                </td>
                <td className="pr-5 text-right">
                  <Link
                    href={`/prompts/${v.id}`}
                    className="text-brand-600 hover:text-brand-700 text-sm font-medium"
                  >
                    Ver →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {versions.length === 0 && (
          <div className="text-center text-sm text-ink-500 py-12">
            Sin versiones todavía. Corré <code className="font-mono text-brand-600">pnpm db:migrate</code> para sembrar v1.
          </div>
        )}
      </div>
    </>
  );
}
