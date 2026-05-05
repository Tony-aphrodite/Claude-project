import { PageHeader } from "~/app/_components/page-header";
import { getFollowUpMetrics, listFollowUps } from "~/lib/db-queries";

export const dynamic = "force-dynamic";

const TABS = [
  { value: "pending", label: "Pendientes" },
  { value: "sent", label: "Enviados" },
  { value: "cancelled", label: "Cancelados" },
] as const;

function MetricCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: "brand" | "ok" | "warn" | "bad";
}) {
  const bar: Record<string, string> = {
    brand: "bg-brand-500",
    ok: "bg-ok-500",
    warn: "bg-warn-500",
    bad: "bg-bad-500",
  };
  return (
    <div className="card relative overflow-hidden">
      {accent && <span className={`absolute left-0 top-0 h-full w-1 ${bar[accent]}`} />}
      <div className="metric-label">{label}</div>
      <div className="metric-value mt-2">{value}</div>
      {sub && <div className="metric-sub mt-1">{sub}</div>}
    </div>
  );
}

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
    <>
      <PageHeader
        eyebrow="Reactivación de leads"
        title="Follow-ups"
        description="State machine de 5 niveles (4 h / 24 h / 48 h / 7 d / 30 d). El scanner los programa, el processor los envía respetando la ventana 24 h de WhatsApp."
      />

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Pendientes" value={metrics?.pending ?? 0} accent="warn" />
        <MetricCard label="Enviados" value={metrics?.sent ?? 0} accent="brand" />
        <MetricCard label="Cancelados" value={metrics?.cancelled ?? 0} />
        <MetricCard label="Respondieron" value={metrics?.responded ?? 0} accent="ok" />
        <MetricCard label="Ventas atribuidas" value={metrics?.sales ?? 0} accent="ok" />
        <MetricCard
          label="Revenue recuperado"
          value={`$${(metrics?.recoveredUsd ?? 0).toFixed(2)}`}
          sub="suma de resulted_in_sale=true"
          accent="brand"
        />
      </section>

      <nav className="flex gap-2 text-sm">
        {TABS.map((t) => {
          const active = params.status === t.value;
          return (
            <a
              key={t.value}
              href={`?status=${t.value}`}
              className={
                active
                  ? "rounded-lg bg-brand-600 px-3 py-1.5 text-white shadow-card"
                  : "rounded-lg bg-ink-100/70 px-3 py-1.5 text-ink-700 ring-1 ring-inset ring-ink-300/70 hover:bg-ink-200/60 hover:text-ink-900"
              }
            >
              {t.label}
            </a>
          );
        })}
        <a
          href="?"
          className={
            !params.status
              ? "rounded-lg bg-brand-600 px-3 py-1.5 text-white shadow-card"
              : "rounded-lg bg-ink-100/70 px-3 py-1.5 text-ink-700 ring-1 ring-inset ring-ink-300/70 hover:bg-ink-200/60 hover:text-ink-900"
          }
        >
          Todos
        </a>
      </nav>

      <div className="card !p-0 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th className="pl-5">Creado</th>
              <th>Conv</th>
              <th>Nivel</th>
              <th>Programado</th>
              <th>Enviado</th>
              <th>Cancelado</th>
              <th>Razón</th>
              <th className="pr-5">Resp</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="pl-5 text-xs text-ink-500 tabular-nums">
                  {new Date(r.createdAt).toLocaleString()}
                </td>
                <td className="font-mono text-xs">
                  {r.conversacionId.slice(0, 8)}
                </td>
                <td>
                  <span className="badge-brand">L{r.level}</span>
                </td>
                <td className="text-xs text-ink-500 tabular-nums">
                  {new Date(r.scheduledAt).toLocaleString()}
                </td>
                <td className="text-xs text-ink-500 tabular-nums">
                  {r.sentAt ? new Date(r.sentAt).toLocaleString() : "—"}
                </td>
                <td className="text-xs text-ink-500 tabular-nums">
                  {r.cancelledAt ? new Date(r.cancelledAt).toLocaleString() : "—"}
                </td>
                <td className="text-xs text-ink-500">{r.cancellationReason ?? "—"}</td>
                <td className="pr-5">
                  {r.clientResponded ? (
                    <span className="badge-ok">✓</span>
                  ) : (
                    <span className="text-ink-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="text-center text-sm text-ink-500 py-12">
            Sin follow-ups que coincidan.
          </div>
        )}
      </div>
    </>
  );
}
