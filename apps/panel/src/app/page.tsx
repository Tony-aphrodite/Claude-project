import { LATENCY_TARGETS } from "@dpm/shared";

import { PageHeader } from "~/app/_components/page-header";
import { getDashboardSnapshot } from "~/lib/db-queries";

export const dynamic = "force-dynamic";

type LatencyTone = "ok" | "warn" | "bad";

function latencyTone(p95: number): LatencyTone {
  const target = LATENCY_TARGETS.P95_MS;
  if (p95 <= target) return "ok";
  if (p95 <= target * 1.2) return "warn";
  return "bad";
}

function statusBadge(p95: number) {
  const tone = latencyTone(p95);
  const map = {
    ok: { label: "On target", cls: "badge-ok" },
    warn: { label: "Marginal", cls: "badge-warn" },
    bad: { label: "Slow", cls: "badge-bad" },
  } as const;
  const m = map[tone];
  return <span className={m.cls}>{m.label}</span>;
}

function MetricCard({
  label,
  value,
  unit,
  sub,
  accent,
  trailing,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  sub?: React.ReactNode;
  accent?: "brand" | "ok" | "warn" | "bad";
  trailing?: React.ReactNode;
}) {
  const accentBar: Record<string, string> = {
    brand: "bg-brand-500",
    ok: "bg-ok-500",
    warn: "bg-warn-500",
    bad: "bg-bad-500",
  };
  return (
    <div className="card relative overflow-hidden">
      {accent && (
        <span
          className={`absolute left-0 top-0 h-full w-1 ${accentBar[accent]}`}
          aria-hidden
        />
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="metric-label">{label}</div>
        {trailing}
      </div>
      <div className="metric-value mt-2 flex items-baseline gap-1.5">
        {value}
        {unit && <span className="text-base text-ink-500 font-normal">{unit}</span>}
      </div>
      {sub && <div className="metric-sub mt-1.5">{sub}</div>}
    </div>
  );
}

export default async function Dashboard() {
  const snap = await getDashboardSnapshot(24);
  const lat = snap.latency;
  const errors = snap.errors;
  const conv = snap.conversations;

  const cacheRate = lat?.cacheHit !== undefined ? lat.cacheHit * 100 : 0;
  const errorRate = lat && lat.total > 0 ? (lat.errorsCount / lat.total) * 100 : 0;
  const cost = lat?.totalCost ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Operación · 24 h"
        title="Dashboard"
        description="Snapshot de tráfico, latencia, costo y errores en las últimas 24 horas."
        actions={
          <div className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-500/20">
            Pilot · Gili Trawangan
          </div>
        }
      />

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Volumen 24 h"
          value={lat?.total ?? 0}
          sub={
            <span className="inline-flex gap-2">
              <span className="text-ok-700">{lat?.successes ?? 0} ok</span>
              <span className="text-bad-700">{lat?.errorsCount ?? 0} err</span>
              <span className="text-ink-400">·</span>
              <span>{errorRate.toFixed(1)}% err rate</span>
            </span>
          }
          accent="brand"
        />
        <MetricCard
          label="Latency P50"
          value={lat?.p50 ?? 0}
          unit="ms"
          sub={`P99 ${lat?.p99 ?? 0} ms`}
        />
        <MetricCard
          label="Latency P95"
          value={lat?.p95 ?? 0}
          unit="ms"
          sub={`target ${LATENCY_TARGETS.P95_MS} ms`}
          trailing={statusBadge(lat?.p95 ?? 0)}
          accent={latencyTone(lat?.p95 ?? 0)}
        />
        <MetricCard
          label="Cache hit rate"
          value={cacheRate.toFixed(1)}
          unit="%"
          sub="Anthropic prompt cache"
          accent={cacheRate > 60 ? "ok" : cacheRate > 30 ? "warn" : "bad"}
        />
        <MetricCard
          label="Costo (24 h)"
          value={`$${cost.toFixed(2)}`}
          sub={`~$${(cost * 30).toFixed(0)} / mes proyectado`}
          accent="brand"
        />
        <MetricCard
          label="Conversaciones activas"
          value={conv?.activeNow ?? 0}
          sub={`de ${conv?.total ?? 0} totales`}
        />
        <MetricCard
          label="Errores 24 h"
          value={errors.length}
          sub={errors.length === 0 ? "Sin incidentes" : "Revisar abajo"}
          accent={errors.length === 0 ? "ok" : "warn"}
        />
        <MetricCard
          label="Tier Anthropic"
          value="Tier 2"
          sub="1000 RPM · prod-ready"
          accent="ok"
        />
      </section>

      <section className="card">
        <header className="flex items-baseline justify-between mb-4">
          <h2 className="h-section">Errores recientes</h2>
          {errors.length > 0 && (
            <span className="badge-bad">{errors.length} en 24h</span>
          )}
        </header>
        {errors.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink-200 bg-ink-50/50 py-10 text-center">
            <div className="text-3xl mb-1">✓</div>
            <div className="text-sm text-ink-500">
              Sin errores en las últimas 24 horas.
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-ink-100">
            {errors.map((e) => (
              <li key={e.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="badge-neutral font-mono">{e.source}</span>
                    {e.errorType && (
                      <span className="text-xs text-ink-500">{e.errorType}</span>
                    )}
                  </div>
                  <time className="text-xs text-ink-400 tabular-nums shrink-0">
                    {new Date(e.createdAt).toLocaleString()}
                  </time>
                </div>
                <p className="mt-1 text-sm text-ink-700">{e.errorMessage}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
