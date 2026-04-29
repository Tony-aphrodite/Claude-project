import Link from "next/link";

import { listPrompts } from "~/lib/db-queries";

export const dynamic = "force-dynamic";

export default async function PromptsPage() {
  const versions = await listPrompts("system");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink-900">Prompts del sistema</h1>
        <Link
          href="/prompts/new"
          className="px-3 py-1.5 text-sm bg-ink-900 text-white rounded"
        >
          + Nueva versión
        </Link>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-ink-500">
            <tr>
              <th className="py-2 pr-4">Versión</th>
              <th className="py-2 pr-4">Creada</th>
              <th className="py-2 pr-4">Estado</th>
              <th className="py-2 pr-4">Regression</th>
              <th className="py-2 pr-4">Sede</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {versions.map((v) => (
              <tr key={v.id}>
                <td className="py-2 pr-4 font-medium">v{v.versionNumber}</td>
                <td className="py-2 pr-4 text-ink-500">
                  {new Date(v.createdAt).toLocaleDateString()}
                </td>
                <td className="py-2 pr-4">
                  {v.active ? (
                    <span className="badge bg-accent-500/10 text-accent-600">Activa</span>
                  ) : (
                    <span className="badge bg-ink-200 text-ink-700">Inactiva</span>
                  )}
                </td>
                <td className="py-2 pr-4">
                  {v.regressionSuitePassed ? (
                    <span className="badge bg-accent-500/10 text-accent-600">passed</span>
                  ) : (
                    <span className="badge bg-warn-500/10 text-warn-500">pending</span>
                  )}
                </td>
                <td className="py-2 pr-4 text-ink-500">
                  {v.sedeId ? "override sede" : "global"}
                </td>
                <td className="py-2 text-right">
                  <Link href={`/prompts/${v.id}`} className="text-accent-600 hover:underline">
                    Ver →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {versions.length === 0 && (
          <div className="text-center text-sm text-ink-500 py-6">
            Sin versiones todavía. Corré <code>pnpm db:migrate</code> para sembrar v1.
          </div>
        )}
      </div>
    </div>
  );
}
