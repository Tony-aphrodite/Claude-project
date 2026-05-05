import { notFound } from "next/navigation";

import { getRegressionRunDetail } from "~/lib/db-queries";

export const dynamic = "force-dynamic";

export default async function RegressionRunDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getRegressionRunDetail(id);
  if (!detail.run) notFound();
  const r = detail.run as Record<string, unknown>;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink-900">Regression run</h1>
        <div className="text-sm text-ink-500">
          Pass rate {(Number(r.pass_rate) * 100).toFixed(1)}% ·
          {" "}cases {String(r.total_cases)} · review queue{" "}
          {String(r.review_queue_size)}
        </div>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {(
          [
            ["Tone", "avg_tone"],
            ["Accuracy", "avg_accuracy"],
            ["Relevance", "avg_relevance"],
            ["Anti-halu.", "avg_anti_hallucination"],
            ["Effectiveness", "avg_effectiveness"],
            ["Overall", "avg_overall"],
          ] as const
        ).map(([label, key]) => (
          <div key={key} className="card">
            <div className="metric-label">{label}</div>
            <div className="metric-value">{Number(r[key]).toFixed(2)}</div>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-ink-900">Cases</h2>
        {detail.cases.map((c) => {
          const cc = c as Record<string, unknown>;
          const detPassed = cc.deterministic_passed === true;
          const judge = cc.judge_scores as Record<string, number> | null;
          return (
            <details key={String(cc.id)} className="card open:bg-ink-50">
              <summary className="cursor-pointer flex items-center justify-between text-sm">
                <span className="font-mono">{String(cc.case_id)}</span>
                <span className="flex gap-2">
                  <span
                    className={
                      "badge " +
                      (detPassed
                        ? "bg-accent-500/10 text-accent-600"
                        : "bg-bad-500/10 text-bad-500")
                    }
                  >
                    det {detPassed ? "ok" : "fail"}
                  </span>
                  {judge && (
                    <span className="badge bg-ink-100 text-ink-700">
                      score {Number(judge.overall ?? 0).toFixed(1)}
                    </span>
                  )}
                  {cc.needs_human_review === true && (
                    <span className="badge bg-warn-500/10 text-warn-500">review</span>
                  )}
                </span>
              </summary>
              <div className="mt-3 space-y-2 text-sm">
                <div>
                  <div className="metric-label">Respuesta generada</div>
                  <div className="bg-ink-100/70 border border-ink-200/70 rounded p-2 whitespace-pre-wrap">
                    {String(cc.generated_response ?? "")}
                  </div>
                </div>
                {!detPassed && (
                  <div>
                    <div className="metric-label">Failures determinísticas</div>
                    <pre className="bg-ink-100/70 border border-ink-200/70 rounded p-2 text-xs overflow-x-auto">
                      {JSON.stringify(cc.deterministic_failures, null, 2)}
                    </pre>
                  </div>
                )}
                {judge && (
                  <div>
                    <div className="metric-label">Judge</div>
                    <pre className="bg-ink-100/70 border border-ink-200/70 rounded p-2 text-xs overflow-x-auto">
                      {JSON.stringify(judge, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </section>
    </div>
  );
}
