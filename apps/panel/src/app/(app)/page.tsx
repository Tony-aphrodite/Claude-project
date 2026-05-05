import Link from "next/link";

import { LATENCY_TARGETS } from "@dpm/shared";

import { getDashboardSnapshot } from "~/lib/db-queries";

export const dynamic = "force-dynamic";

type Tone = "ok" | "warn" | "bad" | "brand";

function latencyTone(p95: number): Exclude<Tone, "brand"> {
  const target = LATENCY_TARGETS.P95_MS;
  if (p95 <= target) return "ok";
  if (p95 <= target * 1.2) return "warn";
  return "bad";
}

const toneToBadge: Record<Tone, string> = {
  ok: "badge-ok",
  warn: "badge-warn",
  bad: "badge-bad",
  brand: "badge-brand",
};

const toneToIconChip: Record<Tone, string> = {
  ok: "icon-chip-ok",
  warn: "icon-chip-warn",
  bad: "icon-chip-bad",
  brand: "icon-chip-brand",
};

/* ------------------------------------------------------------------ */
/* Inline icons used on the KPI cards.                                */
/* ------------------------------------------------------------------ */

const Icon = {
  pulse: (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path d="M2 10h3l2-5 4 10 2-5 5 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  speed: (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path d="M3 13a7 7 0 1114 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M10 13l3-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="13" r="1" fill="currentColor" />
    </svg>
  ),
  cache: (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <ellipse cx="10" cy="5.5" rx="6" ry="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 5.5v9c0 1.1 2.7 2 6 2s6-.9 6-2v-9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 10c0 1.1 2.7 2 6 2s6-.9 6-2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  cost: (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 6v8M7.5 8a2 2 0 014 0c0 .8-.6 1.4-1.5 1.6l-1 .3c-.9.2-1.5.8-1.5 1.6 0 1.1.9 2 2 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path d="M3 5h11A2.5 2.5 0 0116.5 7.5v3A2.5 2.5 0 0114 13H7l-3.5 3V13H3V5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path d="M10 3l8 14H2L10 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10 9v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="14.5" r="0.7" fill="currentColor" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path d="M10 2.5l6 2.5v5c0 4-2.7 6.7-6 7.5-3.3-.8-6-3.5-6-7.5v-5l6-2.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M7.5 10.5l1.8 1.8L13 8.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  conv: (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <circle cx="7" cy="9" r="3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="13" cy="9" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 16c.7-2 2.3-3 4-3M17 16c-.7-2-2.3-3-4-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
};

/* ------------------------------------------------------------------ */

function KpiCard({
  label,
  value,
  unit,
  sub,
  tone = "brand",
  icon,
  trailing,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  sub?: React.ReactNode;
  tone?: Tone;
  icon: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="card card-hover">
      <div className="flex items-start justify-between">
        <div className={toneToIconChip[tone]}>{icon}</div>
        {trailing && <div>{trailing}</div>}
      </div>
      <div className="metric-value mt-4 flex items-baseline gap-1.5">
        {value}
        {unit && (
          <span className="text-base font-normal text-ink-500">{unit}</span>
        )}
      </div>
      <div className="metric-label mt-1">{label}</div>
      {sub && <div className="metric-sub mt-2">{sub}</div>}
    </div>
  );
}

/* Decorative miniature chart drawn on the hero — just SVG, no recharts. */
function HeroChart() {
  return (
    <svg
      viewBox="0 0 200 100"
      className="h-24 w-44 text-brand-400/80"
      aria-hidden
    >
      <defs>
        <linearGradient id="hg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.45" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0,80 L20,72 L40,76 L60,55 L80,60 L100,40 L120,48 L140,28 L160,34 L180,18 L200,22 L200,100 L0,100 Z"
        fill="url(#hg)"
      />
      <path
        d="M0,80 L20,72 L40,76 L60,55 L80,60 L100,40 L120,48 L140,28 L160,34 L180,18 L200,22"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {[
        [60, 55],
        [100, 40],
        [140, 28],
        [180, 18],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2" fill="currentColor" />
      ))}
    </svg>
  );
}

const QUICK = [
  { href: "/pipeline", label: "Pipeline", icon: Icon.chat },
  { href: "/payments", label: "Depósitos", icon: Icon.cost },
  { href: "/conversations", label: "Conversaciones", icon: Icon.conv },
  { href: "/regression", label: "Regression", icon: Icon.shield },
];

export default async function Dashboard() {
  const snap = await getDashboardSnapshot(24);
  const lat = snap.latency;
  const errors = snap.errors;
  const conv = snap.conversations;

  const cacheRate = lat?.cacheHit !== undefined ? lat.cacheHit * 100 : 0;
  const errorRate = lat && lat.total > 0 ? (lat.errorsCount / lat.total) * 100 : 0;
  const cost = lat?.totalCost ?? 0;
  const p95Tone = latencyTone(lat?.p95 ?? 0);
  const cacheTone: Tone = cacheRate > 60 ? "ok" : cacheRate > 30 ? "warn" : "bad";

  return (
    <>
      {/* ─────── Hero ─────── */}
      <section className="hero">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-300">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400 shadow-[0_0_8px_0_rgba(34,211,238,0.7)]" />
              Command Center · 24 h
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-ink-900 leading-tight">
              Buenas, equipo DPM.
            </h1>
            <p className="text-sm text-ink-700 leading-relaxed">
              Snapshot de tráfico, latencia y depósitos del piloto Gili Trawangan.
              Todo está cableado a Respond.io y a la base de datos en vivo.
            </p>

            {/* Quick action chips */}
            <div className="flex flex-wrap gap-2 pt-2">
              {QUICK.map((q) => (
                <Link key={q.href} href={q.href} className="quick-chip">
                  <span className="text-brand-300">{q.icon}</span>
                  {q.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Decorative chart, mirrors the FOMP hero analytic */}
          <div className="shrink-0 hidden md:flex flex-col items-end gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">
              Tendencia de volumen
            </div>
            <HeroChart />
            <div className="text-[11px] text-ink-600">
              {lat?.total ?? 0} requests · {errorRate.toFixed(1)}% err
            </div>
          </div>
        </div>
      </section>

      {/* ─────── KPI grid ─────── */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Volumen 24 h"
          value={lat?.total ?? 0}
          tone="brand"
          icon={Icon.pulse}
          sub={
            <span className="inline-flex items-center gap-2">
              <span className="text-ok-700">{lat?.successes ?? 0} ok</span>
              <span className="text-ink-400">·</span>
              <span className="text-bad-700">{lat?.errorsCount ?? 0} err</span>
            </span>
          }
          trailing={
            <span className={toneToBadge[errorRate < 1 ? "ok" : errorRate < 3 ? "warn" : "bad"]}>
              {errorRate.toFixed(1)}%
            </span>
          }
        />
        <KpiCard
          label="Latency P95"
          value={lat?.p95 ?? 0}
          unit="ms"
          tone={p95Tone}
          icon={Icon.speed}
          sub={`target ${LATENCY_TARGETS.P95_MS} ms · P50 ${lat?.p50 ?? 0}ms`}
          trailing={
            <span className={toneToBadge[p95Tone]}>
              {p95Tone === "ok" ? "On target" : p95Tone === "warn" ? "Marginal" : "Slow"}
            </span>
          }
        />
        <KpiCard
          label="Cache hit rate"
          value={cacheRate.toFixed(1)}
          unit="%"
          tone={cacheTone}
          icon={Icon.cache}
          sub="Anthropic prompt cache"
        />
        <KpiCard
          label="Costo (24 h)"
          value={`$${cost.toFixed(2)}`}
          tone="brand"
          icon={Icon.cost}
          sub={`~$${(cost * 30).toFixed(0)} / mes proyectado`}
        />
        <KpiCard
          label="Conversaciones activas"
          value={conv?.activeNow ?? 0}
          tone="brand"
          icon={Icon.conv}
          sub={`de ${conv?.total ?? 0} totales`}
        />
        <KpiCard
          label="Errores 24 h"
          value={errors.length}
          tone={errors.length === 0 ? "ok" : "warn"}
          icon={Icon.warning}
          sub={errors.length === 0 ? "Sin incidentes" : "Revisar abajo"}
        />
        <KpiCard
          label="Tier Anthropic"
          value="Tier 2"
          tone="ok"
          icon={Icon.shield}
          sub="1000 RPM · prod-ready"
        />
        <KpiCard
          label="Latency P99"
          value={lat?.p99 ?? 0}
          unit="ms"
          tone="brand"
          icon={Icon.speed}
          sub="Cola larga del 24h"
        />
      </section>

      {/* ─────── Errors panel ─────── */}
      <section className="card">
        <header className="flex items-baseline justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="icon-chip icon-chip-warn h-7 w-7">
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                <path d="M10 3l8 14H2L10 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M10 9v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <circle cx="10" cy="14.5" r="0.7" fill="currentColor" />
              </svg>
            </span>
            <h2 className="h-section">Errores recientes</h2>
          </div>
          {errors.length > 0 && (
            <span className="badge-bad">{errors.length} en 24h</span>
          )}
        </header>
        {errors.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink-300/70 bg-ink-100/40 py-10 text-center">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-ok-500/10 text-ok-700 shadow-glow-emerald">
              <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
                <path d="M5 10.5l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="text-sm text-ink-700">
              Sin errores en las últimas 24 horas.
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-ink-200/50">
            {errors.map((e) => (
              <li key={e.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="badge-neutral font-mono">{e.source}</span>
                    {e.errorType && (
                      <span className="text-xs text-ink-500">{e.errorType}</span>
                    )}
                  </div>
                  <time className="text-xs text-ink-500 tabular-nums shrink-0">
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
