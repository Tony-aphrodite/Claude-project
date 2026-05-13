import Link from "next/link";

import type { LeadMetadata } from "@dpm/shared";

import { PageHeader } from "~/app/_components/page-header";
import { formatElapsed } from "~/app/_components/stage";
import { flagAutoConfirm, unflagAutoConfirm } from "~/app/actions/auto-confirm";
import {
  listAutoConfirmedDeposits,
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
  searchParams?: Promise<{ scope?: string; showResolved?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const scope: AutoConfirmedScope =
    params.scope === "7d" || params.scope === "all" ? params.scope : "today";
  const showResolved = params.showResolved === "1";

  const rows = await listAutoConfirmedDeposits({ scope, showResolved });
  const total = rows.length;
  const flagged = rows.filter((r) => r.flagState === "flagged").length;
  const lastHour = rows.filter((r) => hoursSince(r.autoConfirmedAt) <= 1).length;

  // Helper for preserving toggle state across tab clicks.
  const tabHref = (s: AutoConfirmedScope) =>
    `/depositos-auto?scope=${s}${showResolved ? "&showResolved=1" : ""}`;
  const toggleHref = `/depositos-auto?scope=${scope}${showResolved ? "" : "&showResolved=1"}`;

  return (
    <>
      <PageHeader
        eyebrow="Red de seguridad"
        title="Depósitos auto-confirmados"
        description="Conversaciones donde la AI auto-confirmó el depósito por OCR. Cruzá esta lista contra los emails de Wise/Mandiri/BCA en gilit@dpmdiving.com — si algo no aparece en el banco, marcalo con Flag para revisar."
      />

      <nav className="flex items-center gap-1 text-sm">
        {(Object.keys(SCOPE_LABELS) as AutoConfirmedScope[]).map((s) => (
          <Link
            key={s}
            href={tabHref(s)}
            className={`rounded-md px-3 py-1.5 ring-1 ring-inset transition-colors ${
              s === scope
                ? "bg-brand-500/10 text-brand-700 ring-brand-500/30"
                : "text-ink-600 ring-ink-200 hover:bg-ink-50"
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
              : "text-ink-600 ring-ink-200 hover:bg-ink-50"
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
                <th>Estado</th>
                <th className="pr-5"></th>
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
                      : "bg-ink-50 text-ink-600 ring-ink-200";
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
                          ? "bg-ink-50/40 text-ink-500"
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
                    <td className="text-xs">
                      {isFlagged ? (
                        <span
                          className="badge-warn"
                          title={
                            r.flaggedBy
                              ? `Flageado por ${r.flaggedBy}`
                              : "Flageado"
                          }
                        >
                          Flag · revisar
                        </span>
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
                        <span className="badge-ok">OK</span>
                      )}
                    </td>
                    <td className="pr-5 text-right whitespace-nowrap space-x-2">
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
                            className="btn-ghost text-ink-700"
                            title="Marcar como revisado y OK"
                          >
                            Resolver
                          </button>
                        </form>
                      ) : isResolved ? (
                        // Resolved rows are read-only in the audit view —
                        // the operator already triaged them. Re-flagging
                        // would just re-trigger the comment on Respond.io,
                        // which isn't useful audit information.
                        <span className="text-xs text-ink-400">—</span>
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
                            className="btn-ghost text-warn-700 hover:bg-warn-50"
                            title="Marcar para revisión contra el email del banco"
                          >
                            Flag
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
