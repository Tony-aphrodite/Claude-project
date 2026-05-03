import Link from "next/link";

import { PageHeader } from "~/app/_components/page-header";
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
    <>
      <PageHeader
        eyebrow="Calidad"
        title="Regression runs"
        description="Resultados de la suite de 3 capas (deterministic + LLM-judge + human review). Trigger CLI: pnpm regression -- run --version=…"
      />

      <div className="card !p-0 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th className="pl-5">Cuándo</th>
              <th>Prompt v</th>
              <th>Cases</th>
              <th>Pass rate</th>
              <th>Score</th>
              <th>Review</th>
              <th className="pr-5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const passPct = Number(r.pass_rate) * 100;
              const passed = Number(r.pass_rate) >= 0.95;
              return (
                <tr key={r.id}>
                  <td className="pl-5 text-xs text-ink-500 tabular-nums">
                    {new Date(r.finished_at).toLocaleString()}
                  </td>
                  <td className="font-mono text-xs">
                    {r.prompt_version_id?.slice(0, 8) ?? "—"}
                  </td>
                  <td className="tabular-nums">{r.total_cases}</td>
                  <td>
                    <span className={passed ? "badge-ok" : "badge-bad"}>
                      {passPct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="tabular-nums">{Number(r.avg_overall).toFixed(2)}</td>
                  <td className="tabular-nums">{r.review_queue_size}</td>
                  <td className="pr-5 text-right">
                    <Link
                      href={`/regression/${r.id}`}
                      className="text-brand-600 hover:text-brand-700 text-sm font-medium"
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
          <div className="text-center text-sm text-ink-500 py-12">
            No se ejecutó regression todavía.
          </div>
        )}
      </div>
    </>
  );
}
