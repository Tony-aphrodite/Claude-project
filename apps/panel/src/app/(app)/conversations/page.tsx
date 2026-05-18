import Link from "next/link";

import { type LeadStage } from "@dpm/shared";

import { PageHeader } from "~/app/_components/page-header";
import { StageChip } from "~/app/_components/stage";
import { requireUserContext } from "~/lib/auth-context";
import { listConversations, listSedes } from "~/lib/db-queries";

export const dynamic = "force-dynamic";

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ sede?: string; status?: string }>;
}) {
  const [params, user] = await Promise.all([searchParams, requireUserContext()]);

  // Office users are pinned to their own sede regardless of what comes in
  // on the URL — pasting a different sedeId in the querystring must not
  // widen scope. Admins see what they filter to (or all when blank).
  const effectiveSedeId =
    user.role === "office"
      ? user.sedeId ?? "__no_sede__"
      : params.sede || null;

  const [sedes, rows] = await Promise.all([
    listSedes(),
    listConversations({
      ...(effectiveSedeId ? { sedeId: effectiveSedeId } : {}),
      ...(params.status ? { status: params.status } : {}),
      limit: 100,
    }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Hilos"
        title="Conversaciones"
        description="Todos los hilos abiertos en Respond.io. Click en una fila para ver el detalle, fuentes citadas por la AI y el historial de etapas."
        actions={
          <form className="flex items-end gap-2">
            <label className="text-xs">
              <div className="metric-label mb-1">Sede</div>
              {user.role === "office" ? (
                <select
                  name="sede"
                  defaultValue={user.sedeId ?? ""}
                  disabled
                  className="select opacity-70 cursor-not-allowed"
                  title="Tu usuario está fijado a esta sede"
                >
                  <option value={user.sedeId ?? ""}>
                    {user.sedeName ?? "(sin sede)"}
                  </option>
                </select>
              ) : (
                <select name="sede" defaultValue={params.sede ?? ""} className="select">
                  <option value="">Todas</option>
                  {sedes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <label className="text-xs">
              <div className="metric-label mb-1">Estado</div>
              <select name="status" defaultValue={params.status ?? ""} className="select">
                <option value="">Todos</option>
                <option value="active">Active</option>
                <option value="closed">Closed</option>
                <option value="follow_up_disabled">Follow-up disabled</option>
              </select>
            </label>
            <button className="btn-primary">Filtrar</button>
          </form>
        }
      />

      <div className="card !p-0 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th className="pl-5">Cliente</th>
              <th>Sede</th>
              <th>Etapa</th>
              <th>Estado</th>
              <th>Idioma</th>
              <th>Última actividad</th>
              <th className="pr-5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const initials = (r.contact?.name ?? "—")
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((s) => s[0]?.toUpperCase() ?? "")
                .join("");
              return (
                <tr key={r.conv.id}>
                  <td className="pl-5">
                    <Link
                      href={`/conversations/${r.conv.id}`}
                      className="flex items-center gap-3"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/10 text-brand-700 text-[11px] font-semibold">
                        {initials || "·"}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-ink-900 truncate">
                          {r.contact?.name ?? "—"}
                        </div>
                        <div className="text-xs text-ink-500 font-mono">
                          {r.contact?.phone ?? r.conv.respondIoContactId}
                        </div>
                      </div>
                    </Link>
                  </td>
                  <td className="text-ink-700">{r.sedeName}</td>
                  <td>
                    <StageChip stage={r.conv.leadStage as LeadStage} />
                  </td>
                  <td className="text-xs">
                    {r.conv.status === "active" ? (
                      <span className="badge-ok">active</span>
                    ) : r.conv.status === "follow_up_disabled" ? (
                      <span className="badge-bad">follow-up off</span>
                    ) : (
                      <span className="badge-neutral">{r.conv.status}</span>
                    )}
                  </td>
                  <td className="text-xs text-ink-500 uppercase tracking-wide">
                    {r.contact?.language ?? "—"}
                  </td>
                  <td className="tabular-nums text-xs text-ink-500">
                    {new Date(r.conv.updatedAt).toLocaleString()}
                  </td>
                  <td className="pr-5 text-right">
                    <Link
                      href={`/conversations/${r.conv.id}`}
                      className="text-brand-600 hover:text-brand-700 text-sm font-medium"
                    >
                      Ver →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="text-center text-sm text-ink-500 py-12">
            Sin conversaciones que coincidan con el filtro.
          </div>
        )}
      </div>
    </>
  );
}
