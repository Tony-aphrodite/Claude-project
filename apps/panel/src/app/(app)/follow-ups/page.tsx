import { PageHeader } from "~/app/_components/page-header";
import { NIL_SEDE_ID, requireUserContext } from "~/lib/auth-context";
import {
  getFollowUpMetrics,
  listFollowUps,
  listSedes,
} from "~/lib/db-queries";

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
    q?: string;
    sede?: string;
  }>;
}) {
  const [params, user] = await Promise.all([searchParams, requireUserContext()]);
  // Parse page param defensively — a bogus `?page=foo` shouldn't 500
  // the route, just falls back to page 1.
  const pageParam = Number.parseInt(params.page ?? "1", 10);
  const requestedPage = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const searchQuery = (params.q ?? "").trim();

  // Office users see only follow-ups for their assigned sede. Admins see
  // everything (no sedeId filter). NIL_SEDE_ID keeps office users with a
  // missing sede assignment from accidentally seeing the global queue
  // while ops fixes the assignment (returns zero rows, valid UUID
  // syntax — `"__no_sede__"` would crash with a UUID cast error).
  // Miguel 2026-07-01 #7 — cross-sede oficina (role=office + sedeId=null)
  // gets the unfiltered view like admin. Only fall back to NIL_SEDE_ID
  // for a broken/missing sede assignment (role=office with a sede name
  // that didn't resolve to a UUID).
  // Steve 2026-07-01 — cross-sede + admin can further narrow to one
  // sede via `?sede=<uuid>`. Single-sede office is pinned regardless.
  const canPickSede = user.role === "admin" || user.sedeId === null;
  const sedeIdScope =
    user.role === "office" && user.sedeId
      ? user.sedeId
      : user.role === "office" && user.sedeName === null
        ? params.sede || undefined // cross-sede oficina + URL param
        : params.sede || undefined; // admin
  // Guard: office with a broken sede assignment still gets NIL_SEDE_ID
  // (not undefined) so they can't see the global queue by accident.
  const effectiveSedeScope =
    user.role === "office" && user.sedeId === null && user.sedeName !== null
      ? NIL_SEDE_ID
      : sedeIdScope;

  const [metrics, { rows, total, page, pageSize }, sedes] = await Promise.all([
    getFollowUpMetrics({
      ...(effectiveSedeScope ? { sedeId: effectiveSedeScope } : {}),
    }),
    listFollowUps({
      status: params.status,
      page: requestedPage,
      q: searchQuery || undefined,
      ...(effectiveSedeScope ? { sedeId: effectiveSedeScope } : {}),
    }),
    canPickSede ? listSedes() : Promise.resolve([]),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIdx = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(total, page * pageSize);

  // Helper that builds a `?status=…&q=…&sede=…&page=N` URL preserving
  // the active status tab + search query + sede filter — avoids
  // dropping filters when you click Next or switch tabs.
  const pageHref = (n: number) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (searchQuery) qs.set("q", searchQuery);
    if (params.sede) qs.set("sede", params.sede);
    if (n > 1) qs.set("page", String(n));
    const q = qs.toString();
    return q ? `?${q}` : "?";
  };

  // URL for a status-tab click: keep search query + sede, reset page.
  const tabHref = (status?: string) => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (searchQuery) qs.set("q", searchQuery);
    if (params.sede) qs.set("sede", params.sede);
    const s = qs.toString();
    return s ? `?${s}` : "?";
  };

  return (
    <>
      <PageHeader
        eyebrow="Reactivación de leads"
        title="Follow-ups"
        description="State machine de 5 niveles (4 h / 24 h / 48 h / 7 d / 30 d). El scanner los programa, el processor los envía respetando la ventana 24 h de WhatsApp."
        actions={
          canPickSede ? (
            <form className="flex items-end gap-2">
              {params.status ? (
                <input type="hidden" name="status" value={params.status} />
              ) : null}
              {searchQuery ? (
                <input type="hidden" name="q" value={searchQuery} />
              ) : null}
              <label className="text-xs">
                <div className="metric-label mb-1">Sede</div>
                <select
                  name="sede"
                  defaultValue={params.sede ?? ""}
                  className="select"
                >
                  <option value="">Todas</option>
                  {sedes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn-primary">Filtrar</button>
            </form>
          ) : undefined
        }
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

      {/* Tabs (status) + search row. The search is a GET form so a
          fresh `?q=…` survives a hard refresh and is shareable as a URL.
          We preserve the active status tab via a hidden input so
          submitting the search doesn't drop the user's tab. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-2 text-sm">
          {TABS.map((t) => {
            const active = params.status === t.value;
            return (
              <a
                key={t.value}
                href={tabHref(t.value)}
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
            href={tabHref(undefined)}
            className={
              !params.status
                ? "rounded-lg bg-brand-600 px-3 py-1.5 text-white shadow-card"
                : "rounded-lg bg-ink-100/70 px-3 py-1.5 text-ink-700 ring-1 ring-inset ring-ink-300/70 hover:bg-ink-200/60 hover:text-ink-900"
            }
          >
            Todos
          </a>
        </nav>

        <form method="get" className="flex items-center gap-2">
          {params.status && (
            <input type="hidden" name="status" value={params.status} />
          )}
          <div className="relative">
            <svg
              viewBox="0 0 20 20"
              fill="none"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-500 pointer-events-none"
              aria-hidden
            >
              <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
              <path
                d="M13.5 13.5L17 17"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="search"
              name="q"
              defaultValue={searchQuery}
              placeholder="Buscar por conv ID o razón…"
              className="rounded-lg border border-ink-300/70 bg-ink-100/70 pl-8 pr-3 py-1.5 text-sm text-ink-900 placeholder:text-ink-500 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/30 min-w-[260px]"
              autoComplete="off"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500"
          >
            Buscar
          </button>
          {searchQuery && (
            <a
              href={params.status ? `?status=${params.status}` : "?"}
              className="text-xs text-ink-500 hover:text-ink-700 underline"
              title="Limpiar búsqueda"
            >
              limpiar
            </a>
          )}
        </form>
      </div>

      {searchQuery && (
        <div className="text-xs text-ink-600">
          Resultados para <span className="font-mono text-ink-900">"{searchQuery}"</span>
          {" "}— {total} match{total === 1 ? "" : "es"}
        </div>
      )}

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

