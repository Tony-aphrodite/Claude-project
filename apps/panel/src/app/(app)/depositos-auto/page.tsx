import Link from "next/link";

import type { LeadMetadata } from "@dpm/shared";

import { PageHeader } from "~/app/_components/page-header";
import { formatElapsed } from "~/app/_components/stage";
import { flagAutoConfirm, unflagAutoConfirm } from "~/app/actions/auto-confirm";
import { requireUserContext } from "~/lib/auth-context";
import {
  listAutoConfirmedDeposits,
  listSedes,
  type AutoConfirmedScope,
} from "~/lib/db-queries";

export const dynamic = "force-dynamic";

const SCOPE_LABELS: Record<AutoConfirmedScope, string> = {
  today: "Hoy",
  "7d": "Últimos 7 días",
  all: "Todos",
};

function hoursSince(iso: string | null): number {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return ms / 3_600_000;
}

export default async function DepositosAutoPage({
  searchParams,
}: {
  searchParams?: Promise<{ scope?: string; showResolved?: string; sede?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const scope: AutoConfirmedScope =
    params.scope === "7d" || params.scope === "all" ? params.scope : "today";
  const showResolved = params.showResolved === "1";

  // Sede scope (Miguel 2026-05-18): office staff see only their own
  // sede's auto-confirmed deposits — same model as /payments. Admins
  // pass undefined and see every sede. Steve 2026-07-01 — cross-sede
  // oficina (role=office + sedeId=null) sees all by default and can
  // narrow to one sede via `?sede=<uuid>`.
  const user = await requireUserContext();
  const sedeId =
    user.role === "office" && user.sedeId
      ? user.sedeId
      : params.sede || undefined;
  const canPickSede = user.role === "admin" || user.sedeId === null;

  const [rows, sedes] = await Promise.all([
    listAutoConfirmedDeposits({
      scope,
      showResolved,
      ...(sedeId ? { sedeId } : {}),
    }),
    canPickSede ? listSedes() : Promise.resolve([]),
  ]);
  const total = rows.length;
  const flagged = rows.filter((r) => r.flagState === "flagged").length;
  const lastHour = rows.filter((r) => hoursSince(r.autoConfirmedAt) <= 1).length;

  // Helper for preserving toggle state across tab clicks — sede filter
  // survives every intra-page navigation.
  const preserveSede = params.sede ? `&sede=${encodeURIComponent(params.sede)}` : "";
  const tabHref = (s: AutoConfirmedScope) =>
    `/depositos-auto?scope=${s}${showResolved ? "&showResolved=1" : ""}${preserveSede}`;
  const toggleHref = `/depositos-auto?scope=${scope}${showResolved ? "" : "&showResolved=1"}${preserveSede}`;

  return (
    <>
      <PageHeader
        eyebrow="Red de seguridad"
        title="Depósitos auto-confirmados"
        description="Conversaciones donde la AI auto-confirmó el depósito por OCR. Cruzá esta lista contra los emails de Wise/Mandiri/BCA en gilit@dpmdiving.com — si algo no aparece en el banco, marcalo con Flag para revisar."
        actions={
          canPickSede ? (
            <form className="flex items-end gap-2">
              {/* Preserve the other query params when filtering. */}
              <input type="hidden" name="scope" value={scope} />
              {showResolved ? (
                <input type="hidden" name="showResolved" value="1" />
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

      <nav className="flex items-center gap-1 text-sm">
        {(Object.keys(SCOPE_LABELS) as AutoConfirmedScope[]).map((s) => (
          <Link
            key={s}
            href={tabHref(s)}
            className={`rounded-md px-3 py-1.5 ring-1 ring-inset transition-colors ${
              s === scope
                ? "bg-brand-500/10 text-brand-700 ring-brand-500/30"
                : "text-ink-600 ring-ink-200 hover:bg-ink-200/40"
            }`}
          >
            {SCOPE_LABELS[s]}
          </Link>
        ))}
        <span className="mx-2 h-4 w-px bg-ink-200" />
        <Link
          href={toggleHref}
          className={`rounded-md px-3 py-1.5 ring-1 ring-inset transition-colors ${
            showResolved
              ? "bg-warn-50 text-warn-700 ring-warn-500/30"
              : "text-ink-600 ring-ink-200 hover:bg-ink-200/40"
          }`}
          title="Incluye filas marcadas como 'Resuelto' para auditoría"
        >
          {showResolved ? "✓ Mostrar resueltos" : "Mostrar resueltos"}
        </Link>
      </nav>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card">
          <div className="metric-label">Auto-confirmados</div>
          <div className="metric-value mt-2">{total}</div>
          <div className="metric-sub mt-1">{SCOPE_LABELS[scope].toLowerCase()}</div>
        </div>
        <div className="card relative overflow-hidden">
          <span className="absolute left-0 top-0 h-full w-1 bg-warn-500" />
          <div className="metric-label">Flageados</div>
          <div className="metric-value mt-2">{flagged}</div>
          <div className="metric-sub mt-1">esperando revisión humana</div>
        </div>
        <div className="card">
          <div className="metric-label">Última hora</div>
          <div className="metric-value mt-2">{lastHour}</div>
          <div className="metric-sub mt-1">confirmados en los últimos 60 min</div>
        </div>
      </section>

      {rows.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-sm text-ink-500">
            No hay auto-confirmaciones {SCOPE_LABELS[scope].toLowerCase()}.
          </div>
          <div className="mt-2 text-xs text-ink-400 max-w-md mx-auto">
            Los depósitos confirmados automáticamente por la IA aparecerán acá
            para que el equipo de sede los cruce contra los emails de
            Wise/Mandiri/BCA en gilit@dpmdiving.com.
          </div>
        </div>
      ) : (
        <div className="card !p-0 overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th className="pl-5">Cliente</th>
                <th>Sede</th>
                <th>Programa</th>
                <th>Detectado</th>
                <th>Esperado</th>
                <th>Hace</th>
                <th>OCR</th>
                <th className="pr-5">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = (r.conv.leadMetadata as LeadMetadata | null) ?? {};
                const ocr = meta.ocr_result;
                const extraction =
                  ocr && "extraction" in ocr ? ocr.extraction : null;
                const isFlagged = r.flagState === "flagged";
                const isResolved = r.flagState === "resolved";
                const initials = (r.contact?.name ?? "—")
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((s) => s[0]?.toUpperCase() ?? "")
                  .join("");
                const ageH = hoursSince(r.autoConfirmedAt);
                const ageBadge =
                  ageH < 1
                    ? "bg-ok-50 text-ok-700 ring-ok-500/20"
                    : ageH < 24
                      ? "bg-warn-50 text-warn-700 ring-warn-500/30"
                      : "bg-ink-200/40 text-ink-600 ring-ink-300/40";
                const mismatchPills = (ocr?.mismatches ?? []).filter(
                  (m) => m === "ref_code_missing" || m === "ref_code_mismatch",
                );
                return (
                  <tr
                    key={r.conv.id}
                    className={
                      isFlagged
                        ? "bg-warn-50/30"
                        : isResolved
                          ? "bg-ink-200/30 text-ink-500"
                          : ""
                    }
                  >
                    <td className="pl-5">
                      <Link
                        href={`/conversations/${r.conv.id}`}
                        className="flex items-center gap-3 group"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/10 text-brand-700 text-[11px] font-semibold">
                          {initials || "·"}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-ink-900 truncate group-hover:text-brand-700">
                            {r.contact?.name ?? "—"}
                          </div>
                          <div className="text-xs text-ink-500 font-mono">
                            {r.contact?.phone ?? r.conv.respondIoContactId}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="text-ink-700">{r.sedeName ?? "—"}</td>
                    <td className="text-xs">
                      <div className="text-ink-800">{meta.programa ?? "—"}</div>
                      <div className="text-ink-500">{meta.start_date ?? ""}</div>
                    </td>
                    <td className="tabular-nums text-xs">
                      <span className="font-semibold text-ink-900">
                        {extraction?.amount ?? "—"}
                      </span>{" "}
                      <span className="text-ink-500">
                        {extraction?.currency ?? ""}
                      </span>
                    </td>
                    <td className="tabular-nums text-xs">
                      <span className="font-semibold text-ink-900">
                        {meta.deposit_amount_total ??
                          meta.deposit_amount ??
                          "—"}
                      </span>{" "}
                      <span className="text-ink-500">
                        {meta.deposit_currency ?? ""}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 font-mono text-[11px] ring-1 ring-inset ${ageBadge}`}
                      >
                        {formatElapsed(ageH)}
                      </span>
                    </td>
                    <td className="text-xs whitespace-nowrap">
                      {mismatchPills.length > 0 ? (
                        <span
                          className="badge-warn"
                          title="Auto-confirmado a pesar de ref code faltante/incorrecto. Cruzar contra email de banco."
                        >
                          AI ⚠ ref
                        </span>
                      ) : (
                        <span className="badge-ok">AI ✓</span>
                      )}
                    </td>
                    {/* Steve 2026-07-01 — the Estado pill IS the action.
                        Clicking it flags/resolves in one step. Removes
                        the separate "Flag/Resolver" column at the far
                        right (was line-noise). Resolved rows stay read-
                        only — the operator already triaged them and
                        re-flagging would re-trigger the Respond.io
                        comment (useless audit noise). */}
                    <td className="pr-5 text-xs">
                      {isFlagged ? (
                        <form
                          action={unflagAutoConfirm}
                          className="inline"
                        >
                          <input
                            type="hidden"
                            name="conversacionId"
                            value={r.conv.id}
                          />
                          <button
                            type="submit"
                            className="inline-flex items-center gap-1 rounded-full bg-warn-500/15 px-2.5 py-0.5 text-xs font-medium text-warn-700 ring-1 ring-inset ring-warn-500/40 transition hover:bg-warn-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-warn-400"
                            title={
                              r.flaggedBy
                                ? `Flageado por ${r.flaggedBy} — clic para resolver`
                                : "Flageado — clic para resolver"
                            }
                          >
                            Flag · revisar
                            <span aria-hidden="true">↺</span>
                          </button>
                        </form>
                      ) : isResolved ? (
                        <span
                          className="badge-neutral"
                          title={
                            r.flaggedBy
                              ? `Resuelto por ${r.flaggedBy}`
                              : "Resuelto"
                          }
                        >
                          Resuelto
                        </span>
                      ) : (
                        <form
                          action={flagAutoConfirm}
                          className="inline"
                        >
                          <input
                            type="hidden"
                            name="conversacionId"
                            value={r.conv.id}
                          />
                          <button
                            type="submit"
                            className="inline-flex items-center gap-1 rounded-full bg-ok-500/15 px-2.5 py-0.5 text-xs font-medium text-ok-700 ring-1 ring-inset ring-ok-500/30 transition hover:bg-warn-500/15 hover:text-warn-700 hover:ring-warn-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                            title="Clic para marcar como Flag (revisar contra el email del banco)"
                          >
                            OK
                            <span aria-hidden="true">→</span>
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
