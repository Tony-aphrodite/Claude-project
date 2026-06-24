// Roster engine view — Sheet-style daily roster grouped by instructor.
//
// Mirrors what Miguel sees in his Google Sheet: per-slot blocks with
// instructor as the row header and divers as the rows under each.
// Also exposes a walk-in entry form so office can add divers that
// didn't come through the AI conversation flow.
//
// Auth: admin or office (office user is scoped to their sede).

import {
  createWalkInDiver,
  deleteWalkInDiver,
} from "~/app/actions/roster-engine";
import { PageHeader } from "~/app/_components/page-header";
import { requireUserContext } from "~/lib/auth-context";
import {
  listDiversForDate,
  listEngineSedes,
  listGroupsForDate,
  listInstructors,
  type DiverRow,
} from "~/lib/roster-engine-queries";

export const dynamic = "force-dynamic";

const ENGINE_SLOTS = ["AM", "PM", "POOL", "NIGHT"] as const;

function todayYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
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
      <div className="p-6 text-zinc-200">
        No hay sedes configuradas.
      </div>
    );
  }
  // Office users are scoped to their sede.
  const selectableSedes =
    ctx.role === "admin"
      ? allSedes
      : allSedes.filter((s) => s.id === ctx.sedeId);
  const selectedSede =
    selectableSedes.find((s) => s.id === sedeParam) ?? selectableSedes[0]!;
  const fecha = fechaParam ?? todayYmd();

  const [divers, groups, instructors] = await Promise.all([
    listDiversForDate({ sedeId: selectedSede.id, fecha }),
    listGroupsForDate({ sedeId: selectedSede.id, fecha }),
    listInstructors(selectedSede.id),
  ]);
  const activeInstructors = instructors.filter((i) => i.active);

  // Group divers by (slot, group_id|null).
  // Divers without a group_id are "unassigned" — sale arrived but the
  // engine hasn't packed yet (or no instructor available).
  type GroupKey = string; // `${slot}::${groupId|"none"}`
  const grouped = new Map<GroupKey, DiverRow[]>();
  for (const d of divers) {
    const key: GroupKey = `${d.slot}::${d.groupId ?? "none"}`;
    let bucket = grouped.get(key);
    if (!bucket) {
      bucket = [];
      grouped.set(key, bucket);
    }
    bucket.push(d);
  }

  return (
    <div className="space-y-6 p-6 text-zinc-100">
      <PageHeader
        eyebrow="ROSTER ENGINE"
        title="Roster del día (vista por instructor)"
        description="Vista operativa estilo Google Sheet: por turno, por instructor, con sus buceadores. Agregar walk-ins manuales con el form de abajo."
      />

      {/* Sede + fecha picker */}
      <form className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="sede" className="text-zinc-400">
          Sede:
        </label>
        <select
          id="sede"
          name="sede"
          defaultValue={selectedSede.id}
          disabled={ctx.role !== "admin"}
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 disabled:opacity-60"
        >
          {selectableSedes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
        <label htmlFor="fecha" className="ml-4 text-zinc-400">
          Fecha:
        </label>
        <input
          id="fecha"
          name="fecha"
          type="date"
          defaultValue={fecha}
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
        />
        <button
          type="submit"
          className="ml-2 rounded bg-emerald-600 px-3 py-1 text-white hover:bg-emerald-500"
        >
          Ver
        </button>
      </form>

      {/* Per-slot panels */}
      <div className="grid gap-4 lg:grid-cols-2">
        {ENGINE_SLOTS.map((slot) => {
          const slotGroups = groups.filter((g) => g.slot === slot);
          const unassignedKey = `${slot}::none`;
          const unassigned = grouped.get(unassignedKey) ?? [];
          return (
            <section
              key={slot}
              className="rounded border border-zinc-800 bg-zinc-900/60 p-4"
            >
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-300">
                Turno {slot}
              </h3>

              {slotGroups.length === 0 && unassigned.length === 0 ? (
                <p className="text-xs text-zinc-500">Sin buceadores en este turno.</p>
              ) : (
                <div className="space-y-3">
                  {slotGroups.map((g) => {
                    const bucket =
                      grouped.get(`${slot}::${g.id}`) ?? [];
                    return (
                      <div
                        key={g.id}
                        className="rounded border border-zinc-800 bg-zinc-950/50 p-3"
                      >
                        <div className="mb-2 flex items-center justify-between text-xs">
                          <div className="space-x-2">
                            <span className="font-semibold text-emerald-300">
                              {g.instructorNombre ?? "(sin instructor)"}
                            </span>
                            <span className="text-zinc-500">·</span>
                            <span className="text-zinc-400">
                              {g.grupoActividad} · {g.perfilProfundidad}m · ratio{" "}
                              {g.ratioMax}
                            </span>
                          </div>
                          <span className="text-zinc-500">
                            {bucket.length}/{g.ratioMax}
                          </span>
                        </div>
                        <table className="w-full text-xs">
                          <tbody>
                            {bucket.map((d) => (
                              <tr
                                key={d.id}
                                className="border-t border-zinc-800/60"
                              >
                                <td className="py-1 pr-2 text-zinc-500">
                                  {d.groupOrder ?? "?"}
                                </td>
                                <td className="py-1 pr-2 text-zinc-200">
                                  {d.nombre}
                                </td>
                                <td className="py-1 pr-2 text-zinc-400">
                                  {d.activity}
                                  {d.activityDetail ? `:${d.activityDetail}` : ""}
                                </td>
                                <td className="py-1 pr-2 text-zinc-500">
                                  {d.nivelCertificacion}
                                </td>
                                <td className="py-1 pr-2">
                                  {d.origen === "Manual" ? (
                                    <span className="rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] text-amber-300">
                                      walk-in
                                    </span>
                                  ) : null}
                                </td>
                                <td className="py-1 text-right">
                                  {d.origen === "Manual" ? (
                                    <form action={deleteWalkInDiver}>
                                      <input type="hidden" name="id" value={d.id} />
                                      <button
                                        type="submit"
                                        className="text-[10px] text-zinc-500 hover:text-rose-400"
                                      >
                                        eliminar
                                      </button>
                                    </form>
                                  ) : null}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}

                  {unassigned.length > 0 ? (
                    <div className="rounded border border-amber-900/60 bg-amber-950/30 p-3">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-300">
                        Sin asignar a instructor — {unassigned.length} buceador
                        {unassigned.length === 1 ? "" : "es"}
                      </div>
                      <ul className="space-y-1 text-xs text-zinc-300">
                        {unassigned.map((d) => (
                          <li key={d.id}>
                            {d.nombre} ({d.activity} / {d.nivelCertificacion})
                            {d.origen === "Manual" ? " · walk-in" : ""}
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

      {/* Walk-in form */}
      <section className="rounded border border-zinc-800 bg-zinc-900/60 p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-300">
          Walk-in manual
        </h3>
        <p className="mb-3 text-xs text-zinc-500">
          Cliente que entra sin pasar por la AI. Se carga con el mismo formato
          y el motor lo agrupa al próximo cálculo.
        </p>
        <form action={createWalkInDiver} className="grid gap-3 text-sm md:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="sede_id" value={selectedSede.id} />
          <input type="hidden" name="fecha" value={fecha} />
          <div>
            <label className="mb-1 block text-zinc-400" htmlFor="walkin-slot">
              Slot
            </label>
            <select
              id="walkin-slot"
              name="slot"
              required
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
            >
              {ENGINE_SLOTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-zinc-400" htmlFor="walkin-nombre">
              Nombre
            </label>
            <input
              id="walkin-nombre"
              name="nombre"
              required
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
            />
          </div>
          <div>
            <label className="mb-1 block text-zinc-400" htmlFor="walkin-nivel">
              Nivel certificación
            </label>
            <select
              id="walkin-nivel"
              name="nivel_certificacion"
              required
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
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
            <label className="mb-1 block text-zinc-400" htmlFor="walkin-activity">
              Activity
            </label>
            <select
              id="walkin-activity"
              name="activity"
              required
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
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
          <div>
            <label className="mb-1 block text-zinc-400" htmlFor="walkin-detail">
              Activity detail (SP/ADV subtype, opcional)
            </label>
            <input
              id="walkin-detail"
              name="activity_detail"
              placeholder="nitrox / deep / wreck / night / buoyancy …"
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
            />
          </div>
          <div>
            <label className="mb-1 block text-zinc-400" htmlFor="walkin-codigo">
              Código (opcional)
            </label>
            <input
              id="walkin-codigo"
              name="codigo_buceador"
              placeholder="DPM-XX-… o se genera automático"
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-zinc-300">
              <input type="checkbox" name="accepts_cap" value="true" className="accent-emerald-500" />
              Acepta capar profundidad
            </label>
          </div>
          <div className="md:col-span-2 lg:col-span-4">
            <label className="mb-1 block text-zinc-400" htmlFor="walkin-notes">
              Notas (opcional)
            </label>
            <input
              id="walkin-notes"
              name="notes"
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
            />
          </div>
          <div className="md:col-span-2 lg:col-span-4">
            <button
              type="submit"
              className="rounded bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500"
            >
              Cargar walk-in
            </button>
          </div>
        </form>
      </section>

      <p className="text-xs text-zinc-600">
        Instructores activos hoy: {activeInstructors.length}. Si no hay
        instructores cargados o sin disponibilidad para la fecha, las ventas
        van a quedar bloqueadas — gestionar en /roster/instructors.
      </p>
    </div>
  );
}
