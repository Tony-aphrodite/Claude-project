import { getFollowUpMetrics, listFollowUps } from "~/lib/db-queries";

export const dynamic = "force-dynamic";

export default async function FollowUpsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: "pending" | "sent" | "cancelled" }>;
}) {
  const params = await searchParams;
  const [metrics, rows] = await Promise.all([
    getFollowUpMetrics(),
    listFollowUps({ status: params.status }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-ink-900">Follow-ups</h1>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <div className="metric-label">Pending</div>
          <div className="metric-value">{metrics?.pending ?? 0}</div>
        </div>
        <div className="card">
          <div className="metric-label">Sent</div>
          <div className="metric-value">{metrics?.sent ?? 0}</div>
        </div>
        <div className="card">
          <div className="metric-label">Cancelled</div>
          <div className="metric-value">{metrics?.cancelled ?? 0}</div>
        </div>
        <div className="card">
          <div className="metric-label">Respondieron</div>
          <div className="metric-value">{metrics?.responded ?? 0}</div>
        </div>
        <div className="card">
          <div className="metric-label">Ventas atribuidas</div>
          <div className="metric-value">{metrics?.sales ?? 0}</div>
        </div>
        <div className="card col-span-2">
          <div className="metric-label">Revenue recuperado</div>
          <div className="metric-value">${(metrics?.recoveredUsd ?? 0).toFixed(2)}</div>
          <div className="text-xs text-ink-500 mt-1">
            Suma de ventas marcadas resulted_in_sale
          </div>
        </div>
      </section>

      <nav className="flex gap-2 text-sm">
        {(["pending", "sent", "cancelled"] as const).map((s) => (
          <a
            key={s}
            href={`?status=${s}`}
            className={
              "px-3 py-1 rounded border " +
              (params.status === s
                ? "border-ink-900 bg-ink-900 text-white"
                : "border-ink-200 text-ink-700")
            }
          >
            {s}
          </a>
        ))}
        <a
          href="?"
          className={
            "px-3 py-1 rounded border " +
            (!params.status
              ? "border-ink-900 bg-ink-900 text-white"
              : "border-ink-200 text-ink-700")
          }
        >
          all
        </a>
      </nav>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-ink-500">
            <tr>
              <th className="py-2 pr-4">Creado</th>
              <th className="py-2 pr-4">Conv.</th>
              <th className="py-2 pr-4">Nivel</th>
              <th className="py-2 pr-4">Sched.</th>
              <th className="py-2 pr-4">Sent</th>
              <th className="py-2 pr-4">Cancelled</th>
              <th className="py-2 pr-4">Reason</th>
              <th className="py-2">Resp.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="py-2 pr-4 tabular-nums text-ink-500">
                  {new Date(r.createdAt).toLocaleString()}
                </td>
                <td className="py-2 pr-4 font-mono text-xs">{r.conversacionId.slice(0, 8)}</td>
                <td className="py-2 pr-4">L{r.level}</td>
                <td className="py-2 pr-4 tabular-nums text-ink-500">
                  {new Date(r.scheduledAt).toLocaleString()}
                </td>
                <td className="py-2 pr-4 text-ink-500">
                  {r.sentAt ? new Date(r.sentAt).toLocaleString() : "—"}
                </td>
                <td className="py-2 pr-4 text-ink-500">
                  {r.cancelledAt ? new Date(r.cancelledAt).toLocaleString() : "—"}
                </td>
                <td className="py-2 pr-4 text-ink-500">{r.cancellationReason ?? "—"}</td>
                <td className="py-2">{r.clientResponded ? "✓" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="text-center text-sm text-ink-500 py-6">
            Sin follow-ups que coincidan.
          </div>
        )}
      </div>
    </div>
  );
}
