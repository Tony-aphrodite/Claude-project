import Link from "next/link";

import { listRegressionRuns } from "~/lib/db-queries";

export const dynamic = "force-dynamic";

export default async function RegressionPage() {
  const rows = (await listRegressionRuns()) as unknown as Array<{
    id: string;
    prompt_version_id: string | null;
    finished_at: string;
    pass_rate: string;
    avg_overall: string;
    review_queue_size: number;
    total_cases: number;
  }>;

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-baseline">
        <h1 className="text-2xl font-semibold text-ink-900">Regression runs</h1>
        <div className="text-sm text-ink-500">
          Trigger desde CLI: <code className="text-xs">pnpm regression -- run --version=v2 ...</code>
        </div>
      </header>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-ink-500">
            <tr>
              <th className="py-2 pr-4">Cuándo</th>
              <th className="py-2 pr-4">Prompt v</th>
              <th className="py-2 pr-4">Cases</th>
              <th className="py-2 pr-4">Pass rate</th>
              <th className="py-2 pr-4">Score promedio</th>
              <th className="py-2 pr-4">Review</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((r) => {
              const passPct = (Number(r.pass_rate) * 100).toFixed(1);
              const passed = Number(r.pass_rate) >= 0.95;
              return (
                <tr key={r.id}>
                  <td className="py-2 pr-4 text-ink-500">
                    {new Date(r.finished_at).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    {r.prompt_version_id?.slice(0, 8) ?? "—"}
                  </td>
                  <td className="py-2 pr-4 tabular-nums">{r.total_cases}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={
                        "badge " +
                        (passed
                          ? "bg-accent-500/10 text-accent-600"
                          : "bg-bad-500/10 text-bad-500")
                      }
                    >
                      {passPct}%
                    </span>
                  </td>
                  <td className="py-2 pr-4 tabular-nums">
                    {Number(r.avg_overall).toFixed(2)}
                  </td>
                  <td className="py-2 pr-4">{r.review_queue_size}</td>
                  <td className="py-2 text-right">
                    <Link
                      href={`/regression/${r.id}`}
                      className="text-accent-600 hover:underline"
                    >
                      Ver →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="text-center text-sm text-ink-500 py-6">
            No se ejecutó regression todavía.
          </div>
        )}
      </div>
    </div>
  );
}
