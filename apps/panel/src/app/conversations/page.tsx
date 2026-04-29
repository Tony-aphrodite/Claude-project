import Link from "next/link";

import { listConversations, listSedes } from "~/lib/db-queries";

export const dynamic = "force-dynamic";

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ sede?: string; status?: string }>;
}) {
  const params = await searchParams;
  const [sedes, rows] = await Promise.all([
    listSedes(),
    listConversations({
      ...(params.sede ? { sedeId: params.sede } : {}),
      ...(params.status ? { status: params.status } : {}),
      limit: 100,
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-ink-900">Conversaciones</h1>

      <form className="flex gap-3 items-end">
        <label className="text-sm">
          <div className="metric-label mb-1">Sede</div>
          <select
            name="sede"
            defaultValue={params.sede ?? ""}
            className="border border-ink-200 rounded px-2 py-1 text-sm bg-white"
          >
            <option value="">Todas</option>
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <div className="metric-label mb-1">Estado</div>
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="border border-ink-200 rounded px-2 py-1 text-sm bg-white"
          >
            <option value="">Todos</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
            <option value="follow_up_disabled">Follow-up disabled</option>
          </select>
        </label>
        <button className="px-3 py-1 text-sm bg-ink-900 text-white rounded">Filtrar</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-ink-500">
            <tr>
              <th className="py-2 pr-4">Fecha</th>
              <th className="py-2 pr-4">Sede</th>
              <th className="py-2 pr-4">Cliente</th>
              <th className="py-2 pr-4">Estado</th>
              <th className="py-2 pr-4">Lang</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((r) => (
              <tr key={r.conv.id}>
                <td className="py-2 pr-4 tabular-nums text-ink-500">
                  {new Date(r.conv.updatedAt).toLocaleString()}
                </td>
                <td className="py-2 pr-4">{r.sedeName}</td>
                <td className="py-2 pr-4">
                  {r.conv.clientName ?? "—"}{" "}
                  <span className="text-xs text-ink-500">{r.conv.clientPhone}</span>
                </td>
                <td className="py-2 pr-4">{r.conv.status}</td>
                <td className="py-2 pr-4 text-ink-500">{r.conv.clientLanguage ?? "—"}</td>
                <td className="py-2 text-right">
                  <Link
                    href={`/conversations/${r.conv.id}`}
                    className="text-accent-600 hover:underline"
                  >
                    Ver →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="text-center text-sm text-ink-500 py-6">
            Sin conversaciones que coincidan con el filtro.
          </div>
        )}
      </div>
    </div>
  );
}
