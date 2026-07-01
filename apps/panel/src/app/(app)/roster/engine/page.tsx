// Roster engine view — Sheet-style daily roster grouped by instructor.
//
// Mirrors what Miguel sees in his Google Sheet: per-slot blocks with
// instructor as the row header and divers as the rows under each.
// Also exposes a walk-in entry form so office can add divers that
// didn't come through the AI conversation flow.
//
// Auth: admin or office (office user is scoped to their sede).
//
// Visual tokens (Miguel 2026-06-26 design review): uses the panel's
// abyss/ink/brand palette (.card / text-ink-* / text-brand-*) instead
// of raw Tailwind zinc/emerald — matches Dashboard / Pipeline / etc.

import { Fragment } from "react";

import {
  createWalkInDiver,
  deleteWalkInDiver,
  reassignDiver,
  swapGroupLeader,
  updateWalkInDiver,
} from "~/app/actions/roster-engine";
import { ActionForm } from "~/app/_components/action-form";
import { PageHeader } from "~/app/_components/page-header";
import { SubmitButton } from "~/app/_components/submit-button";

import { CopyCodeButton } from "./_copy-code-button";
import { requireUserContext } from "~/lib/auth-context";
import {
  listDiversForDate,
  listEngineSedes,
  listGroupsForDate,
  listInstructors,
  type DiverRow,
} from "~/lib/roster-engine-queries";

export const dynamic = "force-dynamic";

// Miguel 2026-06-26: POOL → POOL_AM + POOL_PM to mirror real ops.
const ENGINE_SLOTS = ["AM", "PM", "POOL_AM", "POOL_PM", "NIGHT"] as const;

function todayYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Add N days to an ISO date string (YYYY-MM-DD) and return the shifted
 * ISO date. Uses UTC math to avoid DST-off-by-one when the local
 * timezone crosses a boundary. Miguel 2026-07-01 #9 — prev/next day
 * navigation on the roster engine.
 */
function addDaysIso(ymd: string, deltaDays: number): string {
  const parts = ymd.split("-");
  const y = Number.parseInt(parts[0] ?? "1970", 10);
  const m = Number.parseInt(parts[1] ?? "01", 10);
  const d = Number.parseInt(parts[2] ?? "01", 10);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate(),
  ).padStart(2, "0")}`;
}

export default async function EnginePage({
  searchParams,
}: {
  searchParams: Promise<{ sede?: string; fecha?: string }>;
}) {
  const ctx = await requireUserContext();
  const { sede: sedeParam, fecha: fechaParam } = await searchParams;

  const allSedes = await listEngineSedes();
  if (allSedes.length === 0) {
    return (
      <div className="card border-bad-200 bg-bad-50 text-bad-900">
        No hay sedes configuradas.
      </div>
    );
  }
  // Office users are scoped to their sede.
  const selectableSedes =
    ctx.role === "admin"
      ? allSedes
      : allSedes.filter((s) => s.id === ctx.sedeId);
  if (selectableSedes.length === 0) {
    return (
      <div className="card border-bad-200 bg-bad-50 text-bad-900">
        Tu cuenta no tiene una sede asignada. Pedile a admin que la configure.
      </div>
    );
  }
  const selectedSede =
    selectableSedes.find((s) => s.id === sedeParam) ?? selectableSedes[0]!;
  const fecha = fechaParam ?? todayYmd();

  const [divers, groups, instructors] = await Promise.all([
    listDiversForDate({ sedeId: selectedSede.id, fecha }),
    listGroupsForDate({ sedeId: selectedSede.id, fecha }),
    listInstructors(selectedSede.id),
  ]);
  const activeInstructors = instructors.filter((i) => i.active);

  // §1 — Miguel 2026-06-30: grouping cascade (engine → manual → none).
  // Old behaviour grouped only by group_id, so a diver with a manually
  // assigned instructor but no engine group_id landed in "Sin asignar"
  // even though Miguel had just clicked "asignar". Now we cascade:
  //
  //   • d.groupId set         → `${slot}::${groupId}`        (engine group)
  //   • d.instructorId set    → `${slot}::manual-${instId}`  (manual group)
  //   • both null             → `${slot}::none`              (sin asignar)
  //
  // The render path adds a "manual group" panel between engine groups and
  // the unassigned bucket so the operator sees the diver under the
  // instructor they just picked.
  type GroupKey = string;
  const grouped = new Map<GroupKey, DiverRow[]>();
  for (const d of divers) {
    let key: GroupKey;
    if (d.groupId) {
      key = `${d.slot}::${d.groupId}`;
    } else if (d.instructorId) {
      key = `${d.slot}::manual-${d.instructorId}`;
    } else {
      key = `${d.slot}::none`;
    }
    let bucket = grouped.get(key);
    if (!bucket) {
      bucket = [];
      grouped.set(key, bucket);
    }
    bucket.push(d);
  }

  // Quick instructor lookup for manual-group headers.
  const instructorById = new Map<string, (typeof instructors)[number]>();
  for (const i of instructors) instructorById.set(i.id, i);

  // §5 daily ops single-view stats (Miguel 2026-06-27 addendum). Compute
  // once per render so the operator's top banner stays in lock-step with
  // the turno boxes below.
  const perSlotCount: Record<string, number> = {
    AM: 0,
    PM: 0,
    POOL_AM: 0,
    POOL_PM: 0,
    NIGHT: 0,
  };
  for (const d of divers) {
    perSlotCount[d.slot] = (perSlotCount[d.slot] ?? 0) + 1;
  }
  const totalDiversToday = divers.length;
  const unassignedGroupCount = groups.filter((g) => g.instructorId === null).length;
  // §1 — only count divers that are TRULY unassigned (no engine group
  // AND no manual instructor). A diver Miguel just manually attached to
  // Billy via the asignar form should no longer trip the warning.
  const unassignedDiverCount = divers.filter(
    (d) => d.groupId === null && d.instructorId === null,
  ).length;
  const instructorCount = activeInstructors.filter(
    (i) => i.role === "instructor",
  ).length;
  const divemasterCount = activeInstructors.filter(
    (i) => i.role === "divemaster",
  ).length;
  const sortedStaff = activeInstructors.slice().sort((a, b) => {
    if (a.role !== b.role) return a.role === "instructor" ? -1 : 1;
    return a.nombre.localeCompare(b.nombre);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="ROSTER ENGINE"
        title="Roster del día (vista por instructor)"
        description="Vista operativa estilo Google Sheet: por turno, por instructor, con sus buceadores. Agregar walk-ins manuales con el form de abajo."
      />

      {/* Sede + fecha picker */}
      <form className="card flex flex-wrap items-center gap-3 text-sm">
        <label htmlFor="sede" className="text-ink-700">
          Sede:
        </label>
        <select
          id="sede"
          name="sede"
          defaultValue={selectedSede.id}
          disabled={ctx.role !== "admin"}
          className="rounded border border-ink-200 bg-ink-100/60 px-2 py-1 text-ink-900 disabled:opacity-60"
        >
          {selectableSedes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
        <label htmlFor="fecha" className="ml-4 text-ink-700">
          Fecha:
        </label>
        {/* Miguel 2026-07-01 #9 — prev / next day shortcuts. Two hidden-
            value submit buttons flank the date input; they submit the
            same form with the neighbouring ISO date so the operator can
            navigate multi-day programs without opening the picker. */}
        <button
          type="submit"
          name="fecha"
          value={addDaysIso(fecha, -1)}
          title="Día anterior"
          aria-label="Día anterior"
          className="rounded border border-ink-200 bg-ink-100/60 px-2 py-1 text-ink-700 hover:bg-ink-200/60"
        >
          ←
        </button>
        <input
          id="fecha"
          name="fecha"
          type="date"
          defaultValue={fecha}
          className="rounded border border-ink-200 bg-ink-100/60 px-2 py-1 text-ink-900"
        />
        <button
          type="submit"
          name="fecha"
          value={addDaysIso(fecha, 1)}
          title="Día siguiente"
          aria-label="Día siguiente"
          className="rounded border border-ink-200 bg-ink-100/60 px-2 py-1 text-ink-700 hover:bg-ink-200/60"
        >
          →
        </button>
        <button type="submit" className="btn-primary ml-auto text-sm">
          Ver
        </button>
      </form>

      {/* ===========================================================
          §5 — Daily ops top banner (Miguel v2.2 addendum 2026-06-27).
          Three sections side-by-side on desktop, stacked on mobile:
          (a) summary stats — total + per-slot counts + alerts
          (b) "Disponibles hoy" staff strip with rol badges
          (c) compact admin link to /roster/instructors

          The strip moved here from the bottom of the page so the
          operator opens the screen and immediately sees both the
          shape of the day AND which staff is available. Config
          (capacity grid, 30-day availability) lives one click away
          in the sidebar — keeps the operational screen clean.
          =========================================================== */}
      <section className="card">
        <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          {/* (a) Summary stats */}
          <div className="space-y-2">
            <h2 className="h-section">Resumen del día</h2>
            <div className="flex items-baseline gap-2">
              <span className="metric-value">{totalDiversToday}</span>
              <span className="metric-sub">
                buceador{totalDiversToday === 1 ? "" : "es"} hoy
              </span>
            </div>
            <div className="flex flex-wrap gap-3 text-[11px] text-ink-600">
              {(["AM", "PM", "POOL_AM", "POOL_PM", "NIGHT"] as const).map(
                (s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1.5 rounded-md bg-ink-200/40 px-2 py-0.5"
                  >
                    <span className="font-semibold text-ink-800">{s}</span>
                    <span className="tabular-nums">{perSlotCount[s] ?? 0}</span>
                  </span>
                ),
              )}
            </div>
            {/* Alerts row — only render the ones that fire. */}
            <div className="space-y-1 text-[11px]">
              {unassignedGroupCount > 0 ? (
                <div className="inline-flex items-center gap-1.5 rounded-md bg-warn-500/10 px-2 py-0.5 text-warn-700 ring-1 ring-inset ring-warn-500/30">
                  ⚠ {unassignedGroupCount} grupo
                  {unassignedGroupCount === 1 ? "" : "s"} sin instructor
                </div>
              ) : null}
              {unassignedDiverCount > 0 ? (
                <div className="inline-flex items-center gap-1.5 rounded-md bg-warn-500/10 px-2 py-0.5 text-warn-700 ring-1 ring-inset ring-warn-500/30">
                  ⚠ {unassignedDiverCount} buceador
                  {unassignedDiverCount === 1 ? "" : "es"} sin asignar
                </div>
              ) : null}
              {activeInstructors.length === 0 ? (
                <div className="inline-flex items-center gap-1.5 rounded-md bg-bad-500/10 px-2 py-0.5 text-bad-700 ring-1 ring-inset ring-bad-500/30">
                  🚫 Sin staff activo — ventas bloqueadas
                </div>
              ) : null}
              {instructorCount === 0 && activeInstructors.length > 0 ? (
                <div className="inline-flex items-center gap-1.5 rounded-md bg-bad-500/10 px-2 py-0.5 text-bad-700 ring-1 ring-inset ring-bad-500/30">
                  🚫 Sin instructores — solo fun dives son vendibles hoy
                </div>
              ) : null}
              {unassignedGroupCount === 0 &&
              unassignedDiverCount === 0 &&
              activeInstructors.length > 0 &&
              instructorCount > 0 ? (
                <div className="inline-flex items-center gap-1.5 rounded-md bg-ok-500/10 px-2 py-0.5 text-ok-700 ring-1 ring-inset ring-ok-500/30">
                  ✓ Roster limpio
                </div>
              ) : null}
            </div>
          </div>

          {/* (b) Staff strip + (c) admin link */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h2 className="h-section">Disponibles hoy</h2>
              <div className="flex items-center gap-2 text-[11px] text-ink-500">
                <span>
                  <span className="text-brand-300 font-semibold">
                    {instructorCount}
                  </span>{" "}
                  inst
                </span>
                <span className="text-ink-400">·</span>
                <span>
                  <span className="text-warn-700 font-semibold">
                    {divemasterCount}
                  </span>{" "}
                  DM
                </span>
                <span className="text-ink-400">·</span>
                <a
                  href="/roster/instructors"
                  className="text-ink-500 hover:text-brand-300"
                >
                  configurar →
                </a>
              </div>
            </div>
            {activeInstructors.length === 0 ? (
              <p className="text-xs text-ink-600">
                Sin staff activo. Las ventas van a quedar bloqueadas — agregá
                instructores en{" "}
                <code className="rounded bg-ink-200/60 px-1.5 py-0.5 text-[11px] text-brand-300">
                  /roster/instructors
                </code>
                .
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 text-xs">
                {sortedStaff.map((i) => (
                  <span
                    key={i.id}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-medium ring-1 ring-inset transition-colors ${
                      i.role === "divemaster"
                        ? "border-warn-500/40 bg-warn-500/15 text-warn-700 ring-warn-500/30"
                        : "border-brand-400/40 bg-brand-400/10 text-brand-300 ring-brand-400/30"
                    }`}
                    title={
                      i.role === "divemaster"
                        ? "Divemaster — solo fun dives (Miguel v2.2 §1)"
                        : "Instructor — cursos + fun dives"
                    }
                  >
                    <span>{i.nombre}</span>
                    <span
                      className={`rounded px-1 text-[9px] font-bold uppercase tracking-wider ${
                        i.role === "divemaster"
                          ? "bg-warn-500/25 text-warn-700"
                          : "bg-brand-400/20 text-brand-300"
                      }`}
                    >
                      {i.role === "divemaster" ? "DM" : "INST"}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Per-slot panels */}
      <div className="grid gap-4 lg:grid-cols-2">
        {ENGINE_SLOTS.map((slot) => {
          const slotGroups = groups.filter((g) => g.slot === slot);
          const unassignedKey = `${slot}::none`;
          const unassigned = grouped.get(unassignedKey) ?? [];

          // §1 — Miguel 2026-06-30: collect manually-assigned buckets
          // (instructor_id set, group_id null) for THIS slot. Render as
          // synthetic groups between engine groups and "Sin asignar".
          // Each bucket maps to one instructor → one card.
          const manualBuckets: Array<{
            instructorId: string;
            instructorNombre: string;
            instructorRole: "instructor" | "divemaster";
            divers: DiverRow[];
          }> = [];
          for (const [key, divers] of grouped) {
            if (!key.startsWith(`${slot}::manual-`)) continue;
            const instructorId = key.slice(`${slot}::manual-`.length);
            const inst = instructorById.get(instructorId);
            manualBuckets.push({
              instructorId,
              instructorNombre: inst?.nombre ?? "(instructor desconocido)",
              instructorRole: inst?.role ?? "instructor",
              divers,
            });
          }
          // Stable sort so the same instructor always renders in the
          // same position regardless of insertion order.
          manualBuckets.sort((a, b) =>
            a.instructorNombre.localeCompare(b.instructorNombre),
          );
          return (
            <section key={slot} className="card !p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <h3 className="h-section">Turno {slot}</h3>
                {/* §5 — slot-level density indicator. Shows total divers
                    in this turno + group count at a glance, mirrors the
                    "n/m" style of the Sheet. */}
                <span className="text-[11px] text-ink-500 tabular-nums">
                  {(perSlotCount[slot] ?? 0)} buceador
                  {(perSlotCount[slot] ?? 0) === 1 ? "" : "es"}
                  {slotGroups.length > 0
                    ? ` · ${slotGroups.length} grupo${slotGroups.length === 1 ? "" : "s"}`
                    : ""}
                </span>
              </div>

              {slotGroups.length === 0 &&
              manualBuckets.length === 0 &&
              unassigned.length === 0 ? (
                <p className="text-xs text-ink-600">
                  Sin buceadores en este turno.
                </p>
              ) : (
                <div className="space-y-3">
                  {slotGroups.map((g) => {
                    const bucket = grouped.get(`${slot}::${g.id}`) ?? [];
                    return (
                      <div key={g.id} className="card-tight">
                        <div className="mb-2 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-brand-300">
                              {g.instructorNombre ?? "(sin instructor)"}
                            </span>
                            {/* §4 swap líder — only show when the group
                                actually has an instructor; an empty
                                group has nothing to swap from. */}
                            {g.instructorId ? (
                              <a
                                href={`#swap-${g.id}`}
                                className="text-[10px] text-ink-500 hover:text-brand-300"
                                title="Cambiar el líder del grupo entero (sin re-agrupar)"
                              >
                                swap líder
                              </a>
                            ) : null}
                            <span className="text-ink-500">·</span>
                            <span className="text-ink-600">
                              {g.grupoActividad} · {g.perfilProfundidad}m · ratio{" "}
                              {g.ratioMax}
                            </span>
                          </div>
                          <span className="text-ink-500">
                            {bucket.length}/{g.ratioMax}
                          </span>
                        </div>
                        {/* §4 swap leader inline form — expanded by
                            #swap-{g.id} hash. Hidden by default. */}
                        {g.instructorId ? (
                          <div
                            id={`swap-${g.id}`}
                            className="hidden target:block mb-2 rounded-lg border border-brand-400/30 bg-brand-400/5 p-2"
                          >
                            <ActionForm
                              action={swapGroupLeader}
                              className="flex flex-wrap items-end gap-2 text-[11px]"
                            >
                              <input
                                type="hidden"
                                name="sede_id"
                                value={selectedSede.id}
                              />
                              <input
                                type="hidden"
                                name="fecha"
                                value={fecha}
                              />
                              <input
                                type="hidden"
                                name="slot"
                                value={g.slot}
                              />
                              <input
                                type="hidden"
                                name="from_instructor_id"
                                value={g.instructorId}
                              />
                              <label className="flex flex-col gap-0.5">
                                <span className="text-ink-500">
                                  Nuevo líder (mismo grupo, mismo ratio)
                                </span>
                                <select
                                  name="to_instructor_id"
                                  required
                                  className="rounded border border-ink-200 bg-ink-100/60 px-1.5 py-0.5 text-ink-900"
                                >
                                  <option value="">— elegir —</option>
                                  {activeInstructors
                                    .filter((i) => i.id !== g.instructorId)
                                    .map((i) => (
                                      <option key={i.id} value={i.id}>
                                        {i.nombre} [
                                        {i.role === "divemaster" ? "DM" : "INST"}
                                        ]
                                      </option>
                                    ))}
                                </select>
                              </label>
                              <SubmitButton
                                variant="primary"
                                loadingLabel="swap…"
                                className="text-[10px]"
                              >
                                aplicar swap
                              </SubmitButton>
                              <a
                                href="#"
                                className="text-[10px] text-ink-500 hover:text-ink-700"
                              >
                                cancelar
                              </a>
                            </ActionForm>
                          </div>
                        ) : null}
                        <table className="w-full text-xs">
                          <tbody>
                            {bucket.map((d) => (
                              <Fragment key={d.id}>
                                <tr
                                  className="border-t border-ink-200/60"
                                >
                                  <td className="py-1 pr-2 text-ink-500">
                                    {d.groupOrder ?? "?"}
                                  </td>
                                  <td className="py-1 pr-2 text-ink-900">
                                    <div className="flex flex-col">
                                      <span>{d.nombre}</span>
                                      {/* §2 — Miguel 2026-06-30: ref code
                                          must be visible. Used by the
                                          diver to access the future SSI
                                          online registro. */}
                                      <span className="inline-flex items-center font-mono text-[9px] text-ink-500">
                                        {d.codigoBuceador}
                                        <CopyCodeButton code={d.codigoBuceador} />
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-1 pr-2 text-ink-600">
                                    {d.activity}
                                    {d.activityDetail
                                      ? `:${d.activityDetail}`
                                      : ""}
                                  </td>
                                  <td className="py-1 pr-2 text-ink-500">
                                    {d.nivelCertificacion}
                                  </td>
                                  <td className="py-1 pr-2">
                                    {d.origen === "Manual" ? (
                                      <span className="badge-warn">
                                        walk-in
                                      </span>
                                    ) : null}
                                  </td>
                                  <td className="py-1 text-right">
                                    {d.origen === "Manual" ? (
                                      <div className="flex justify-end gap-2 text-[10px]">
                                        <a
                                          href={`#edit-${d.id}`}
                                          className="text-ink-500 hover:text-brand-300"
                                        >
                                          mover
                                        </a>
                                        {/* §4 reassign (este día / todo el
                                            programa) — opens a separate
                                            inline form via #reassign-{id}
                                            hash. Distinct from mover which
                                            changes slot/activity in place;
                                            reassign only changes
                                            instructor, optionally cascading
                                            across program days. */}
                                        <a
                                          href={`#reassign-${d.id}`}
                                          className="text-ink-500 hover:text-brand-300"
                                        >
                                          reasignar
                                        </a>
                                        <ActionForm action={deleteWalkInDiver}>
                                          <input
                                            type="hidden"
                                            name="id"
                                            value={d.id}
                                          />
                                          <SubmitButton
                                            variant="subtle"
                                            loadingLabel="borrando…"
                                          >
                                            eliminar
                                          </SubmitButton>
                                        </ActionForm>
                                      </div>
                                    ) : null}
                                  </td>
                                </tr>
                                {/* Inline edit form — collapsed by default
                                    (the :target selector reveals it when
                                    the user clicks "mover" above, which
                                    sets the URL hash to #edit-<id>). No
                                    JS needed; the link toggles it. */}
                                {d.origen === "Manual" ? (
                                  <tr
                                    id={`edit-${d.id}`}
                                    className="hidden target:table-row border-t border-brand-400/30 bg-brand-400/5"
                                  >
                                    <td colSpan={6} className="px-2 py-2">
                                      <ActionForm
                                        action={updateWalkInDiver}
                                        className="flex flex-wrap items-end gap-2 text-[11px]"
                                      >
                                        <input
                                          type="hidden"
                                          name="id"
                                          value={d.id}
                                        />
                                        <label className="flex flex-col gap-0.5">
                                          <span className="text-ink-500">
                                            Slot
                                          </span>
                                          <select
                                            name="slot"
                                            defaultValue={d.slot}
                                            className="rounded border border-ink-200 bg-ink-100/60 px-1.5 py-0.5 text-ink-900"
                                          >
                                            {ENGINE_SLOTS.map((s) => (
                                              <option key={s} value={s}>
                                                {s}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                        <label className="flex flex-col gap-0.5">
                                          <span className="text-ink-500">
                                            Instructor
                                          </span>
                                          <select
                                            name="instructor_id"
                                            defaultValue={
                                              d.instructorId ?? ""
                                            }
                                            className="rounded border border-ink-200 bg-ink-100/60 px-1.5 py-0.5 text-ink-900"
                                          >
                                            <option value="">
                                              Sin asignar (auto)
                                            </option>
                                            {/* §1+§2 rol annotation */}
                                            {activeInstructors.map((i) => (
                                              <option
                                                key={i.id}
                                                value={i.id}
                                              >
                                                {i.nombre} [
                                                {i.role === "divemaster"
                                                  ? "DM"
                                                  : "INST"}
                                                ]
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                        <label className="flex flex-col gap-0.5">
                                          <span className="text-ink-500">
                                            Activity
                                          </span>
                                          <select
                                            name="activity"
                                            defaultValue={d.activity}
                                            className="rounded border border-ink-200 bg-ink-100/60 px-1.5 py-0.5 text-ink-900"
                                          >
                                            <option value="BD_CONFINADA">
                                              BD_CONFINADA
                                            </option>
                                            <option value="BD_BARCO">
                                              BD_BARCO
                                            </option>
                                            <option value="OW1">OW1</option>
                                            <option value="OW2">OW2</option>
                                            <option value="OW3">OW3</option>
                                            <option value="FD">FD</option>
                                            <option value="AA">AA</option>
                                            <option value="AA2">AA2</option>
                                            <option value="ADV">ADV</option>
                                            <option value="SP">SP</option>
                                            <option value="RES">RES</option>
                                            <option value="REF_FASE1">
                                              REF_FASE1
                                            </option>
                                            <option value="REF_FASE2">
                                              REF_FASE2
                                            </option>
                                          </select>
                                        </label>
                                        <SubmitButton
                                          variant="subtle"
                                          loadingLabel="guardando…"
                                          className="rounded bg-brand-500/15 px-2 py-0.5 text-[10px] font-medium text-brand-300 ring-1 ring-inset ring-brand-400/30 hover:bg-brand-500/30"
                                        >
                                          guardar
                                        </SubmitButton>
                                        <a
                                          href="#"
                                          className="text-[10px] text-ink-500 hover:text-ink-700"
                                        >
                                          cancelar
                                        </a>
                                      </ActionForm>
                                    </td>
                                  </tr>
                                ) : null}
                                {/* §4 reassign form — separate from
                                    #edit so the operator's choices stay
                                    focused (instructor + scope only). */}
                                {d.origen === "Manual" ? (
                                  <tr
                                    id={`reassign-${d.id}`}
                                    className="hidden target:table-row border-t border-warn-500/30 bg-warn-500/5"
                                  >
                                    <td colSpan={6} className="px-2 py-2">
                                      <ActionForm
                                        action={reassignDiver}
                                        className="flex flex-wrap items-end gap-3 text-[11px]"
                                      >
                                        <input
                                          type="hidden"
                                          name="id"
                                          value={d.id}
                                        />
                                        <label className="flex flex-col gap-0.5">
                                          <span className="text-warn-700">
                                            Nuevo instructor / DM
                                          </span>
                                          <select
                                            name="to_instructor_id"
                                            defaultValue={d.instructorId ?? ""}
                                            className="rounded border border-ink-200 bg-ink-100/60 px-1.5 py-0.5 text-ink-900"
                                          >
                                            <option value="">
                                              Sin asignar (desligar)
                                            </option>
                                            {activeInstructors.map((i) => (
                                              <option key={i.id} value={i.id}>
                                                {i.nombre} [
                                                {i.role === "divemaster"
                                                  ? "DM"
                                                  : "INST"}
                                                ]
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                        <fieldset className="flex flex-col gap-0.5">
                                          <legend className="text-warn-700">
                                            Alcance
                                          </legend>
                                          <label className="flex items-center gap-1.5">
                                            <input
                                              type="radio"
                                              name="scope"
                                              value="this_day"
                                              defaultChecked
                                              className="accent-warn-500"
                                            />
                                            <span>Solo este día</span>
                                          </label>
                                          <label className="flex items-center gap-1.5">
                                            <input
                                              type="radio"
                                              name="scope"
                                              value="all_program"
                                              className="accent-warn-500"
                                            />
                                            <span>
                                              Todo el programa (cascada
                                              multi-día)
                                            </span>
                                          </label>
                                        </fieldset>
                                        <SubmitButton
                                          variant="warn"
                                          loadingLabel="reasignando…"
                                          className="text-[10px]"
                                        >
                                          aplicar
                                        </SubmitButton>
                                        <a
                                          href="#"
                                          className="text-[10px] text-ink-500 hover:text-ink-700"
                                        >
                                          cancelar
                                        </a>
                                      </ActionForm>
                                    </td>
                                  </tr>
                                ) : null}
                              </Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}

                  {/* §1 — Manual-assignment buckets. One card per
                      instructor with at least 1 manually-assigned diver
                      in this slot. Visually distinct from engine groups
                      (brand-amber accent) so the operator can tell
                      "engine packed this" vs "I packed this manually". */}
                  {manualBuckets.map((mb) => (
                    <div
                      key={`manual-${mb.instructorId}`}
                      className="card-tight border-warn-500/30 bg-warn-500/5"
                    >
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-warn-700">
                            {mb.instructorNombre}
                          </span>
                          <span
                            className={`rounded px-1 text-[9px] font-bold uppercase tracking-wider ${
                              mb.instructorRole === "divemaster"
                                ? "bg-warn-500/25 text-warn-700"
                                : "bg-brand-400/20 text-brand-300"
                            }`}
                          >
                            {mb.instructorRole === "divemaster" ? "DM" : "INST"}
                          </span>
                          <span className="text-ink-500">·</span>
                          <span className="rounded bg-warn-500/15 px-1.5 py-0.5 text-[10px] text-warn-700 ring-1 ring-inset ring-warn-500/30">
                            manual
                          </span>
                          <span className="text-ink-500 text-[10px]">
                            asignación manual; el motor no agrupó todavía
                          </span>
                        </div>
                        <span className="text-ink-500 text-[11px] tabular-nums">
                          {mb.divers.length}
                        </span>
                      </div>
                      <table className="w-full text-xs">
                        <tbody>
                          {mb.divers.map((d) => (
                            <Fragment key={d.id}>
                              <tr className="border-t border-warn-500/20">
                                <td className="py-1 pr-2 text-ink-500">—</td>
                                <td className="py-1 pr-2 text-ink-900">
                                  <div className="flex flex-col">
                                    <span>{d.nombre}</span>
                                    <span className="inline-flex items-center font-mono text-[9px] text-ink-500">
                                      {d.codigoBuceador}
                                      <CopyCodeButton
                                        code={d.codigoBuceador}
                                      />
                                    </span>
                                  </div>
                                </td>
                                <td className="py-1 pr-2 text-ink-600">
                                  {d.activity}
                                  {d.activityDetail
                                    ? `:${d.activityDetail}`
                                    : ""}
                                </td>
                                <td className="py-1 pr-2 text-ink-500">
                                  {d.nivelCertificacion}
                                </td>
                                <td className="py-1 pr-2">
                                  {d.origen === "Manual" ? (
                                    <span className="badge-warn">walk-in</span>
                                  ) : null}
                                </td>
                                <td className="py-1 text-right">
                                  {d.origen === "Manual" ? (
                                    <div className="flex justify-end gap-2 text-[10px]">
                                      <a
                                        href={`#reassign-${d.id}`}
                                        className="text-ink-500 hover:text-brand-300"
                                      >
                                        reasignar
                                      </a>
                                      <ActionForm
                                        action={deleteWalkInDiver}
                                      >
                                        <input
                                          type="hidden"
                                          name="id"
                                          value={d.id}
                                        />
                                        <SubmitButton
                                          variant="subtle"
                                          loadingLabel="borrando…"
                                        >
                                          eliminar
                                        </SubmitButton>
                                      </ActionForm>
                                    </div>
                                  ) : null}
                                </td>
                              </tr>
                              {/* Reassign form (same UX as the engine
                                  group case) — lets the operator move
                                  to a different instructor or to "todo
                                  el programa" cascade. */}
                              {d.origen === "Manual" ? (
                                <tr
                                  id={`reassign-${d.id}`}
                                  className="hidden target:table-row border-t border-warn-500/30 bg-warn-500/5"
                                >
                                  <td colSpan={6} className="px-2 py-2">
                                    <ActionForm
                                      action={reassignDiver}
                                      className="flex flex-wrap items-end gap-3 text-[11px]"
                                    >
                                      <input
                                        type="hidden"
                                        name="id"
                                        value={d.id}
                                      />
                                      <label className="flex flex-col gap-0.5">
                                        <span className="text-warn-700">
                                          Nuevo instructor / DM
                                        </span>
                                        <select
                                          name="to_instructor_id"
                                          defaultValue={d.instructorId ?? ""}
                                          className="rounded border border-ink-200 bg-ink-100/60 px-1.5 py-0.5 text-ink-900"
                                        >
                                          <option value="">
                                            Sin asignar (desligar)
                                          </option>
                                          {activeInstructors.map((i) => (
                                            <option key={i.id} value={i.id}>
                                              {i.nombre} [
                                              {i.role === "divemaster"
                                                ? "DM"
                                                : "INST"}
                                              ]
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                      <fieldset className="flex flex-col gap-0.5">
                                        <legend className="text-warn-700">
                                          Alcance
                                        </legend>
                                        <label className="flex items-center gap-1.5">
                                          <input
                                            type="radio"
                                            name="scope"
                                            value="this_day"
                                            defaultChecked
                                            className="accent-warn-500"
                                          />
                                          <span>Solo este día</span>
                                        </label>
                                        <label className="flex items-center gap-1.5">
                                          <input
                                            type="radio"
                                            name="scope"
                                            value="all_program"
                                            className="accent-warn-500"
                                          />
                                          <span>
                                            Todo el programa (cascada
                                            multi-día)
                                          </span>
                                        </label>
                                      </fieldset>
                                      <SubmitButton
                                        variant="warn"
                                        loadingLabel="reasignando…"
                                        className="text-[10px]"
                                      >
                                        aplicar
                                      </SubmitButton>
                                      <a
                                        href="#"
                                        className="text-[10px] text-ink-500 hover:text-ink-700"
                                      >
                                        cancelar
                                      </a>
                                    </ActionForm>
                                  </td>
                                </tr>
                              ) : null}
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}

                  {unassigned.length > 0 ? (
                    <div className="rounded-xl border border-warn-500/40 bg-warn-500/5 p-3">
                      <div className="mb-2 h-section text-warn-700">
                        Sin asignar a instructor — {unassigned.length} buceador
                        {unassigned.length === 1 ? "" : "es"}
                      </div>
                      {/* Miguel v2.2 §3+§4 (2026-06-29): walk-in rows
                          without a group_id need delete + reassign
                          actions just like grouped ones. Previously
                          rendered as a passive list — the office had
                          no way to remove a mis-typed walk-in until
                          the engine ran. */}
                      <ul className="space-y-2 text-xs text-ink-700">
                        {unassigned.map((d) => (
                          <li key={d.id} className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex flex-col">
                                <span>
                                  {d.nombre} ({d.activity} /{" "}
                                  {d.nivelCertificacion})
                                  {d.origen === "Manual" ? " · walk-in" : ""}
                                </span>
                                {/* §2 — ref code visible (Miguel 2026-06-30) */}
                                <span className="inline-flex items-center font-mono text-[9px] text-ink-500">
                                  {d.codigoBuceador}
                                  <CopyCodeButton code={d.codigoBuceador} />
                                </span>
                              </div>
                              {d.origen === "Manual" ? (
                                <span className="flex gap-2 text-[10px]">
                                  <a
                                    href={`#reassign-un-${d.id}`}
                                    className="text-ink-500 hover:text-brand-300"
                                  >
                                    asignar
                                  </a>
                                  <ActionForm action={deleteWalkInDiver}>
                                    <input
                                      type="hidden"
                                      name="id"
                                      value={d.id}
                                    />
                                    <SubmitButton
                                      variant="subtle"
                                      loadingLabel="borrando…"
                                    >
                                      eliminar
                                    </SubmitButton>
                                  </ActionForm>
                                </span>
                              ) : null}
                            </div>
                            {/* §4 reassign for unassigned walk-ins —
                                give the office a fast path to attach
                                a specific instructor without waiting
                                for the engine to run. Same
                                reassignDiver action; defaults to
                                this-day scope. */}
                            {d.origen === "Manual" ? (
                              <div
                                id={`reassign-un-${d.id}`}
                                className="hidden target:block rounded-lg border border-brand-400/30 bg-brand-400/5 p-2"
                              >
                                <ActionForm
                                  action={reassignDiver}
                                  className="flex flex-wrap items-end gap-2 text-[10px]"
                                >
                                  <input
                                    type="hidden"
                                    name="id"
                                    value={d.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="scope"
                                    value="this_day"
                                  />
                                  <label className="flex flex-col gap-0.5">
                                    <span className="text-ink-500">
                                      Asignar a
                                    </span>
                                    <select
                                      name="to_instructor_id"
                                      required
                                      className="rounded border border-ink-200 bg-ink-100/60 px-1.5 py-0.5 text-ink-900"
                                    >
                                      <option value="">— elegir —</option>
                                      {activeInstructors.map((i) => (
                                        <option key={i.id} value={i.id}>
                                          {i.nombre} [
                                          {i.role === "divemaster"
                                            ? "DM"
                                            : "INST"}
                                          ]
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <SubmitButton
                                    variant="primary"
                                    loadingLabel="asignando…"
                                    className="text-[10px]"
                                  >
                                    asignar
                                  </SubmitButton>
                                  <a
                                    href="#"
                                    className="text-[10px] text-ink-500 hover:text-ink-700"
                                  >
                                    cancelar
                                  </a>
                                </ActionForm>
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* §3 — Miguel 2026-06-30: per-day flat listing. Collapsible
          <details> block so the operator can audit "did all my walk-ins
          land?" in one sortable table without parsing the per-instructor
          grouping above. Default closed; one click expands. */}
      <section className="card">
        <details className="group">
          <summary className="flex cursor-pointer items-baseline justify-between gap-3 list-none">
            <div className="flex items-baseline gap-3">
              <span className="h-section">
                Listado plano del día — para auditoría
              </span>
              <span className="text-[11px] text-ink-500">
                {totalDiversToday} fila
                {totalDiversToday === 1 ? "" : "s"}
              </span>
            </div>
            <span className="text-[11px] text-ink-500 group-open:hidden">
              ▾ mostrar
            </span>
            <span className="hidden text-[11px] text-ink-500 group-open:inline">
              ▴ ocultar
            </span>
          </summary>
          <div className="mt-3 overflow-x-auto">
            {totalDiversToday === 0 ? (
              <p className="text-xs text-ink-600">
                Sin buceadores cargados para {fecha}.
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-ink-300/60 text-left text-[10px] uppercase text-ink-500">
                    <th className="py-1.5 pr-3">Slot</th>
                    <th className="py-1.5 pr-3">Nombre</th>
                    <th className="py-1.5 pr-3">Código</th>
                    <th className="py-1.5 pr-3">Actividad</th>
                    <th className="py-1.5 pr-3">Nivel</th>
                    <th className="py-1.5 pr-3">Instructor</th>
                    <th className="py-1.5 pr-3">Origen</th>
                    <th className="py-1.5 pr-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {divers
                    .slice()
                    .sort((a, b) => {
                      // Stable sort: slot order then name.
                      const slotOrder = [
                        "AM",
                        "POOL_AM",
                        "PM",
                        "POOL_PM",
                        "NIGHT",
                      ];
                      const ia = slotOrder.indexOf(a.slot);
                      const ib = slotOrder.indexOf(b.slot);
                      if (ia !== ib) return ia - ib;
                      return a.nombre.localeCompare(b.nombre);
                    })
                    .map((d) => {
                      const inst = d.instructorId
                        ? instructorById.get(d.instructorId)
                        : null;
                      return (
                        <tr
                          key={d.id}
                          className="border-b border-ink-200/40 last:border-b-0"
                        >
                          <td className="py-1.5 pr-3 font-medium text-ink-700">
                            {d.slot}
                          </td>
                          <td className="py-1.5 pr-3 text-ink-900">
                            {d.nombre}
                          </td>
                          <td className="py-1.5 pr-3 font-mono text-[10px] text-ink-600">
                            <span className="inline-flex items-center">
                              {d.codigoBuceador}
                              <CopyCodeButton code={d.codigoBuceador} />
                            </span>
                          </td>
                          <td className="py-1.5 pr-3 text-ink-600">
                            {d.activity}
                            {d.activityDetail
                              ? `:${d.activityDetail}`
                              : ""}
                          </td>
                          <td className="py-1.5 pr-3 text-ink-500">
                            {d.nivelCertificacion}
                          </td>
                          <td className="py-1.5 pr-3 text-ink-700">
                            {inst ? (
                              <span className="inline-flex items-center gap-1">
                                {inst.nombre}
                                <span
                                  className={`rounded px-1 text-[9px] font-bold uppercase ${
                                    inst.role === "divemaster"
                                      ? "bg-warn-500/20 text-warn-700"
                                      : "bg-brand-400/20 text-brand-300"
                                  }`}
                                >
                                  {inst.role === "divemaster" ? "DM" : "INST"}
                                </span>
                              </span>
                            ) : (
                              <span className="text-warn-700">sin asignar</span>
                            )}
                          </td>
                          <td className="py-1.5 pr-3 text-ink-500">
                            {d.origen}
                          </td>
                          <td className="py-1.5 pr-3 text-ink-500">
                            {d.estadoPago}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
          </div>
        </details>
      </section>

      {/* Walk-in form */}
      <section className="card">
        <h3 className="mb-1 h-section">Walk-in manual</h3>
        <p className="mb-4 metric-sub">
          Cliente que entra sin pasar por la AI. Se carga con el mismo formato
          y el motor lo agrupa al próximo cálculo.
        </p>
        <ActionForm
          action={createWalkInDiver}
          className="grid gap-3 text-sm md:grid-cols-2 lg:grid-cols-4"
          resetOnSuccess
          successMessage="Walk-in cargado"
        >
          <input type="hidden" name="sede_id" value={selectedSede.id} />
          <input type="hidden" name="fecha" value={fecha} />
          <div>
            <label className="mb-1 block text-ink-700" htmlFor="walkin-slot">
              Slot
            </label>
            <select
              id="walkin-slot"
              name="slot"
              required
              className="w-full rounded border border-ink-200 bg-ink-100/60 px-2 py-1 text-ink-900"
            >
              {ENGINE_SLOTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-ink-700" htmlFor="walkin-nombre">
              Nombre
            </label>
            <input
              id="walkin-nombre"
              name="nombre"
              required
              className="w-full rounded border border-ink-200 bg-ink-100/60 px-2 py-1 text-ink-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-ink-700" htmlFor="walkin-nivel">
              Nivel certificación
            </label>
            <select
              id="walkin-nivel"
              name="nivel_certificacion"
              required
              className="w-full rounded border border-ink-200 bg-ink-100/60 px-2 py-1 text-ink-900"
            >
              <option value="BEG">BEG (sin cert)</option>
              <option value="OW">OW</option>
              <option value="AA">AA (Advanced)</option>
              <option value="RES">RES (Rescue)</option>
              <option value="DM">DM</option>
              <option value="INS">INS</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-ink-700" htmlFor="walkin-activity">
              Activity
            </label>
            <select
              id="walkin-activity"
              name="activity"
              required
              className="w-full rounded border border-ink-200 bg-ink-100/60 px-2 py-1 text-ink-900"
            >
              <option value="BD_CONFINADA">BD_CONFINADA (pool)</option>
              <option value="BD_BARCO">BD_BARCO (boat)</option>
              <option value="OW1">OW1</option>
              <option value="OW2">OW2</option>
              <option value="OW3">OW3</option>
              <option value="FD">FD</option>
              <option value="AA">AA</option>
              <option value="AA2">AA2</option>
              <option value="ADV">ADV</option>
              <option value="SP">SP</option>
              <option value="RES">RES</option>
              <option value="REF_FASE1">REF_FASE1</option>
              <option value="REF_FASE2">REF_FASE2</option>
            </select>
          </div>
          {/* Instructor pre-assignment (Miguel 2026-06-26). Optional —
              leave on "Auto" to let the engine pick when it next runs.
              Useful when the office knows exactly who's going to take
              this walk-in (e.g. specific language match, regular
              instructor for a returning client). */}
          <div>
            <label
              className="mb-1 block text-ink-700"
              htmlFor="walkin-instructor"
            >
              Instructor/DM (opcional)
            </label>
            <select
              id="walkin-instructor"
              name="instructor_id"
              className="w-full rounded border border-ink-200 bg-ink-100/60 px-2 py-1 text-ink-900"
            >
              <option value="">Auto (motor decide)</option>
              {/* Miguel v2.2 §1+§2: show role inline so operator can
                  pick the right staff for the activity. Server-side
                  rolValidator blocks the save if DM + course; surfacing
                  the role here avoids the round-trip. */}
              {activeInstructors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nombre} [{i.role === "divemaster" ? "DM" : "INST"}]
                  {i.languages.length > 0 ? ` · ${i.languages.join("/")}` : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-ink-500">
              Los DM solo pueden guiar fun dives (FD / REF fase 2). El motor
              rechaza el guardado si elegís un DM para un curso.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-ink-700" htmlFor="walkin-detail">
              Activity detail (SP/ADV subtype, opcional)
            </label>
            <input
              id="walkin-detail"
              name="activity_detail"
              placeholder="nitrox / deep / wreck / night / buoyancy …"
              className="w-full rounded border border-ink-200 bg-ink-100/60 px-2 py-1 text-ink-900 placeholder:text-ink-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-ink-700" htmlFor="walkin-codigo">
              Código del buceador (opcional)
            </label>
            <input
              id="walkin-codigo"
              name="codigo_buceador"
              placeholder="Dejar vacío → se genera solo"
              className="w-full rounded border border-ink-200 bg-ink-100/60 px-2 py-1 text-ink-900 placeholder:text-ink-500"
            />
            <p className="mt-1 text-[10px] leading-tight text-ink-500">
              ℹ️ Solo llenar si el cliente YA tiene un código del flujo de la
              AI. Si está vacío, el server genera uno automáticamente con la
              forma <code className="text-brand-300">DPM-&lt;SEDE&gt;-MMDD-XXXXXX</code>
              {" "}
              (mismo formato que usa la AI para el futuro registro online).
            </p>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-ink-700">
              <input
                type="checkbox"
                name="accepts_cap"
                value="true"
                className="accent-brand-400"
              />
              Acepta capar profundidad
            </label>
          </div>
          <div className="md:col-span-2 lg:col-span-4">
            <label className="mb-1 block text-ink-700" htmlFor="walkin-notes">
              Notas (opcional)
            </label>
            <input
              id="walkin-notes"
              name="notes"
              className="w-full rounded border border-ink-200 bg-ink-100/60 px-2 py-1 text-ink-900"
            />
          </div>
          <div className="md:col-span-2 lg:col-span-4">
            <SubmitButton variant="primary" loadingLabel="Cargando walk-in…">
              Cargar walk-in
            </SubmitButton>
          </div>
        </ActionForm>
      </section>

    </div>
  );
}
