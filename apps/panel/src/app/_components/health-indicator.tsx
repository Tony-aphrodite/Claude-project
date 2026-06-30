// ============================================================================
// HealthIndicator — Miguel 2026-06-12 resilience layer #5.
//
// Single semáforo chip + tooltip + three at-a-glance metrics. Reads from
// the lib/health-stats snapshot the page fetches; this component itself
// is pure server-side render (no hooks). The whole banner re-renders on
// page reload — no client polling. Adding a 60s refresh later is a one-
// line change (useEffect + router.refresh) but Miguel's read pattern
// is "open the panel, see status" not "watch the panel" so we keep it
// minimal.
// ============================================================================

import type { HealthSnapshot } from "~/lib/health-stats";

const LEVEL_STYLES = {
  ok: {
    dot: "bg-ok-500 shadow-[0_0_8px_0_rgba(52,211,153,0.7)]",
    chip: "bg-ok-500/10 text-ok-700 ring-ok-500/40",
    icon: "text-ok-700",
  },
  warn: {
    dot: "bg-warn-500 shadow-[0_0_8px_0_rgba(245,158,11,0.7)]",
    chip: "bg-warn-500/10 text-warn-700 ring-warn-500/40",
    icon: "text-warn-700",
  },
  bad: {
    dot: "bg-bad-500 shadow-[0_0_8px_0_rgba(239,68,68,0.8)] animate-pulse",
    chip: "bg-bad-500/10 text-bad-700 ring-bad-500/40",
    icon: "text-bad-700",
  },
  unknown: {
    dot: "bg-ink-400",
    chip: "bg-ink-200/40 text-ink-700 ring-ink-300/60",
    icon: "text-ink-500",
  },
} as const;

function formatAgo(iso: string | null): string {
  if (iso === null) return "—";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const minutes = Math.floor((now - then) / 60_000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

export function HealthIndicator({ snap }: { snap: HealthSnapshot }) {
  const styles = LEVEL_STYLES[snap.level];

  return (
    <section
      className="card flex flex-wrap items-center justify-between gap-4"
      aria-label="Estado de la AI"
    >
      <div className="flex items-center gap-3">
        {/* Status pill */}
        <div
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 ring-1 ring-inset ${styles.chip}`}
          title={snap.description}
        >
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${styles.dot}`}
          />
          <span className="text-sm font-semibold">{snap.label}</span>
        </div>
        {/* Description — readable on every viewport, not just on hover */}
        <p className="max-w-prose text-xs text-ink-600">{snap.description}</p>
      </div>

      {/* Compact metrics strip — gives the operator the "why" behind the
          semaphore without opening the tooltip. */}
      <div className="flex flex-wrap items-center gap-3 text-[11px]">
        <Metric
          label="Última respuesta AI"
          value={formatAgo(snap.lastAiMessageAt)}
          tone={snap.level === "bad" ? "bad" : snap.level === "warn" ? "warn" : "ink"}
        />
        <Metric
          label="Clientes esperando"
          value={String(snap.inboundSinceLastAi)}
          tone={snap.inboundSinceLastAi > 0 ? "warn" : "ink"}
        />
        <Metric
          label="Errores 1h"
          value={String(snap.recentErrorCount)}
          tone={snap.recentErrorCount >= 3 ? "bad" : "ink"}
        />
        <Metric
          label="Handed-off"
          value={String(snap.handsOffPending)}
          tone="ink"
        />
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ink" | "warn" | "bad";
}) {
  const toneCls =
    tone === "bad"
      ? "text-bad-700 font-semibold"
      : tone === "warn"
        ? "text-warn-700 font-semibold"
        : "text-ink-800 font-medium";
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-ink-500 uppercase tracking-wide text-[10px]">
        {label}
      </span>
      <span className={`tabular-nums ${toneCls}`}>{value}</span>
    </div>
  );
}
