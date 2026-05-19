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
  searchParams: Promise<{
    status?: "pending" | "sent" | "cancelled";
    page?: string;
  }>;
}) {
  const params = await searchParams;
  // Parse page param defensively — a bogus `?page=foo` shouldn't 500
  // the route, just falls back to page 1.
  const pageParam = Number.parseInt(params.page ?? "1", 10);
  const requestedPage = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  const [metrics, { rows, total, page, pageSize }] = await Promise.all([
    getFollowUpMetrics(),
    listFollowUps({ status: params.status, page: requestedPage }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIdx = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(total, page * pageSize);

  // Helper that builds a `?status=…&page=N` URL preserving the current
  // status tab — avoids dropping the filter when you click Next.
  const pageHref = (n: number) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (n > 1) qs.set("page", String(n));
    const q = qs.toString();
    return q ? `?${q}` : "?";
  };

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

      {/* Pagination footer. Hidden when the result set fits in one page
          since Prev/Next would have nothing to do. Shows a "X-Y de N"
          counter so the operator knows where they are in the list. */}
      {total > pageSize && (
        <nav
          className="flex items-center justify-between gap-3 text-sm"
          aria-label="Paginación"
        >
          <div className="text-ink-600">
            Mostrando{" "}
            <span className="font-medium text-ink-900 tabular-nums">
              {startIdx}–{endIdx}
            </span>{" "}
            de{" "}
            <span className="font-medium text-ink-900 tabular-nums">
              {total}
            </span>{" "}
            (página {page} / {totalPages})
          </div>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <a
                href={pageHref(page - 1)}
                className="rounded-lg bg-ink-100/70 px-3 py-1.5 text-ink-700 ring-1 ring-inset ring-ink-300/70 hover:bg-ink-200/60 hover:text-ink-900"
              >
                ← Anterior
              </a>
            ) : (
              <span className="rounded-lg bg-ink-100/30 px-3 py-1.5 text-ink-500 ring-1 ring-inset ring-ink-300/30 cursor-not-allowed">
                ← Anterior
              </span>
            )}
            {page < totalPages ? (
              <a
                href={pageHref(page + 1)}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-white shadow-card hover:bg-brand-500"
              >
                Siguiente →
              </a>
            ) : (
              <span className="rounded-lg bg-ink-100/30 px-3 py-1.5 text-ink-500 ring-1 ring-inset ring-ink-300/30 cursor-not-allowed">
                Siguiente →
              </span>
            )}
          </div>
        </nav>
      )}
    </>
  );
}

