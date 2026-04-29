import { getDashboardSnapshot } from "~/lib/db-queries";

import { LATENCY_TARGETS } from "@dpm/shared";

function StatusBadge({ p95 }: { p95: number }) {
  const target = LATENCY_TARGETS.P95_MS;
  if (p95 <= target) {
    return <span className="badge bg-accent-500/10 text-accent-600">on target</span>;
  }
  if (p95 <= target * 1.2) {
    return <span className="badge bg-warn-500/10 text-warn-500">marginal</span>;
  }
  return <span className="badge bg-bad-500/10 text-bad-500">slow</span>;
}

export default async function Dashboard() {
  const snap = await getDashboardSnapshot(24);
  const lat = snap.latency;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink-900">Dashboard</h1>
        <div className="text-sm text-ink-500">Últimas 24 horas</div>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <div className="metric-label">Volumen (mensajes)</div>
          <div className="metric-value">{lat?.total ?? 0}</div>
          <div className="text-xs text-ink-500 mt-1">
            {lat?.successes ?? 0} ok · {lat?.errorsCount ?? 0} err
          </div>
        </div>
        <div className="card">
          <div className="metric-label">Latency P50</div>
          <div className="metric-value">{lat?.p50 ?? 0}<span className="text-base text-ink-500"> ms</span></div>
        </div>
        <div className="card">
          <div className="metric-label">Latency P95</div>
          <div className="metric-value flex items-baseline gap-2">
            {lat?.p95 ?? 0}<span className="text-base text-ink-500">ms</span>
            <StatusBadge p95={lat?.p95 ?? 0} />
          </div>
          <div className="text-xs text-ink-500 mt-1">
            target {LATENCY_TARGETS.P95_MS} ms
          </div>
        </div>
        <div className="card">
          <div className="metric-label">Latency P99</div>
          <div className="metric-value">{lat?.p99 ?? 0}<span className="text-base text-ink-500"> ms</span></div>
        </div>
        <div className="card">
          <div className="metric-label">Cache hit rate</div>
          <div className="metric-value">
            {lat?.cacheHit !== undefined ? (lat.cacheHit * 100).toFixed(1) : 0}%
          </div>
        </div>
        <div className="card">
          <div className="metric-label">Costo (24h)</div>
          <div className="metric-value">${(lat?.totalCost ?? 0).toFixed(2)}</div>
        </div>
        <div className="card">
          <div className="metric-label">Conversaciones activas</div>
          <div className="metric-value">{snap.conversations?.activeNow ?? 0}</div>
          <div className="text-xs text-ink-500 mt-1">
            de {snap.conversations?.total ?? 0} totales
          </div>
        </div>
        <div className="card">
          <div className="metric-label">Errores (24h)</div>
          <div className="metric-value">{snap.errors.length}</div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-ink-900 mb-3">Errores recientes</h2>
        {snap.errors.length === 0 ? (
          <div className="card text-sm text-ink-500">Sin errores en las últimas 24h.</div>
        ) : (
          <div className="card divide-y divide-ink-100">
            {snap.errors.map((e) => (
              <div key={e.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex justify-between text-xs text-ink-500">
                  <span>{e.source} · {e.errorType ?? "—"}</span>
                  <span>{new Date(e.createdAt).toLocaleString()}</span>
                </div>
                <div className="text-sm text-ink-700 mt-1">{e.errorMessage}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
