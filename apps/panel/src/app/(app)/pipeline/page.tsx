import Link from "next/link";

import { LEAD_STAGES, type LeadMetadata, type LeadStage } from "@dpm/shared";

import { PageHeader } from "~/app/_components/page-header";
import {
  STAGE_META,
  ageTone,
  elapsedHours,
  formatElapsed,
} from "~/app/_components/stage";
import {
  listConversationsForPipeline,
  listSedes,
} from "~/lib/db-queries";

export const dynamic = "force-dynamic";

const ACTIVE_STAGES: LeadStage[] = [
  "new",
  "qualified",
  "proposed",
  "deposit_pending",
  "deposit_paid",
  "handed_off",
];

const TONE_CHIP: Record<"ok" | "warn" | "bad", string> = {
  ok: "bg-ok-50 text-ok-700 ring-ok-500/20",
  warn: "bg-warn-50 text-warn-700 ring-warn-500/30",
  bad: "bg-bad-50 text-bad-700 ring-bad-500/30",
};

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ sede?: string }>;
}) {
  const params = await searchParams;
  const [sedes, rows] = await Promise.all([
    listSedes(),
    listConversationsForPipeline(params.sede ? { sedeId: params.sede } : {}),
  ]);

  const byStage = new Map<LeadStage, typeof rows>();
  for (const stage of LEAD_STAGES) byStage.set(stage, []);
  for (const row of rows) {
    const stage = row.conv.leadStage as LeadStage;
    byStage.get(stage)?.push(row);
  }

  const activeTotal = ACTIVE_STAGES.reduce(
    (sum, s) => sum + (byStage.get(s)?.length ?? 0),
    0,
  );
  const closedCount = byStage.get("closed")?.length ?? 0;
  const lostCount = byStage.get("lost")?.length ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Espía-monitoreo"
        title="Pipeline"
        description="Estado en vivo de cada conversación. La AI mueve el lead automáticamente; tu equipo puede corregir cualquier etapa con auditoría."
        actions={
          <form className="flex items-end gap-2">
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
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="badge-brand">{activeTotal} activos</div>
        <div className="badge-ok">{closedCount} cerrados</div>
        <div className="badge-bad">{lostCount} perdidos</div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {ACTIVE_STAGES.map((stage) => {
          const meta = STAGE_META[stage];
          const cards = byStage.get(stage) ?? [];
          return (
            <section
              key={stage}
              className="kanban-col"
              style={
                { "--stage-fg": meta.fg } as React.CSSProperties
              }
            >
              <header className="mb-3">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-800">
                    <span
                      className="h-2 w-2 rounded-full shadow-[0_0_8px_currentColor]"
                      style={{
                        background: meta.fg,
                        color: meta.fg,
                      }}
                    />
                    {meta.label}
                  </h2>
                  <span className="rounded-full bg-ink-100/80 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-ink-800 ring-1 ring-inset ring-ink-300/70">
                    {cards.length}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-ink-500">
                  {meta.description}
                </p>
              </header>

              <div className="space-y-2 flex-1 max-h-[60vh] overflow-y-auto pr-1 scrollbar-thin">
                {cards.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-ink-300/70 bg-ink-100/40 py-6 text-center text-[11px] text-ink-500">
                    vacío
                  </div>
                ) : (
                  cards.map((r) => {
                    const hours = elapsedHours(r.conv.leadStageChangedAt);
                    const tone = ageTone(stage, hours);
                    const refCode = (r.conv.leadMetadata as LeadMetadata | null)
                      ?.ref_code;
                    const initials = (r.contact?.name ?? "—")
                      .split(" ")
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((s) => s[0]?.toUpperCase() ?? "")
                      .join("");
                    return (
                      <Link
                        key={r.conv.id}
                        href={`/conversations/${r.conv.id}`}
                        className="kanban-card block group"
                      >
                        <div className="flex items-start gap-2">
                          <div
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                            style={{ background: meta.fg }}
                          >
                            {initials || "·"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <div className="truncate text-[13px] font-semibold text-ink-900">
                                {r.contact?.name ?? "—"}
                              </div>
                              <span
                                className={`rounded px-1.5 py-0.5 font-mono text-[10px] ring-1 ring-inset ${TONE_CHIP[tone]}`}
                              >
                                {formatElapsed(hours)}
                              </span>
                            </div>
                            <div className="truncate text-[11px] text-ink-500">
                              {r.sedeName}
                            </div>
                            {refCode && (
                              <div className="mt-1 inline-flex items-center gap-1 rounded bg-ink-900/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-ink-700">
                                <span className="opacity-60">REF</span>
                                {refCode}
                              </div>
                            )}
                          </div>
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>

      <details className="card group">
        <summary className="flex cursor-pointer items-center justify-between text-sm font-medium text-ink-700">
          <span className="flex items-center gap-2">
            <svg
              viewBox="0 0 20 20"
              fill="none"
              className="h-3.5 w-3.5 transition-transform group-open:rotate-90"
            >
              <path
                d="M7.5 5L13 10L7.5 15"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Cerrados / perdidos
          </span>
          <span className="text-xs text-ink-500">
            {closedCount + lostCount} entradas históricas
          </span>
        </summary>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
          {(["closed", "lost"] as LeadStage[]).map((s) => {
            const meta = STAGE_META[s];
            const cards = byStage.get(s) ?? [];
            return (
              <section key={s}>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-800">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: meta.fg }}
                  />
                  {meta.label}
                  <span className="text-xs font-normal text-ink-500">
                    ({cards.length})
                  </span>
                </h3>
                <div className="space-y-1">
                  {cards.length === 0 && (
                    <div className="text-xs text-ink-400">—</div>
                  )}
                  {cards.slice(0, 20).map((r) => (
                    <Link
                      key={r.conv.id}
                      href={`/conversations/${r.conv.id}`}
                      className="flex items-center justify-between rounded-lg px-2 py-1 text-xs text-ink-600 hover:bg-ink-100"
                    >
                      <span className="truncate">
                        {r.contact?.name ?? "—"}
                      </span>
                      <span className="text-ink-400">{r.sedeName}</span>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </details>
    </>
  );
}
