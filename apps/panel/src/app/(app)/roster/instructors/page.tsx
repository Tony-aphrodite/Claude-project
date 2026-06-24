// Instructor admin page — list + create + toggle active.
// Backs the intelligent roster engine (Miguel v2.1 spec).
//
// Auth: admin only (per requireAdminContext on the actions). Office
// users see a 403 if they hit this URL.
//
// UX shape:
//   - Top: sede picker (mirrors /roster pattern).
//   - Left: form to create new instructor.
//   - Right: table of all instructors for the selected sede (active
//     first), each row with rename + activate/deactivate actions.
//   - Below: weekly availability quick-fill (per-day toggles).

import {
  createInstructor,
  renameInstructor,
  setInstructorActive,
  setAvailability,
} from "~/app/actions/roster-engine";
import { PageHeader } from "~/app/_components/page-header";
import { requireAdminContext } from "~/lib/auth-context";
import {
  listAvailability,
  listEngineSedes,
  listInstructors,
} from "~/lib/roster-engine-queries";

export const dynamic = "force-dynamic";

const VIEW_DAYS = 14;
const SLOTS_ALL = ["AM", "PM", "POOL", "NIGHT"] as const;

function todayYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

function addDays(yyyymmdd: string, n: number): string {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() + n);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;
}

export default async function InstructorsPage({
  searchParams,
}: {
  searchParams: Promise<{ sede?: string; from?: string }>;
}) {
  await requireAdminContext();
  const { sede: sedeParam, from: fromParam } = await searchParams;

  const allSedes = await listEngineSedes();
  if (allSedes.length === 0) {
    return (
      <div className="p-6 text-zinc-200">
        No hay sedes configuradas. Agregar una sede primero.
      </div>
    );
  }
  const selectedSede = allSedes.find((s) => s.id === sedeParam) ?? allSedes[0]!;
  const fromDate = fromParam ?? todayYmd();
  const toDate = addDays(fromDate, VIEW_DAYS - 1);

  const [instructors, availability] = await Promise.all([
    listInstructors(selectedSede.id),
    listAvailability({ sedeId: selectedSede.id, fromDate, toDate }),
  ]);

  // Build availability matrix: instructor × date → slots (string[])
  const matrix = new Map<string, Map<string, string[]>>();
  for (const a of availability) {
    let byInstructor = matrix.get(a.instructorId);
    if (!byInstructor) {
      byInstructor = new Map();
      matrix.set(a.instructorId, byInstructor);
    }
    byInstructor.set(a.fecha, a.slots);
  }

  const dateList = Array.from({ length: VIEW_DAYS }, (_, i) => addDays(fromDate, i));

  return (
    <div className="space-y-6 p-6 text-zinc-100">
      <PageHeader
        eyebrow="ROSTER ENGINE"
        title="Instructors + disponibilidad"
        description="Plantel por sede + qué slots cubre cada uno por día. Subir un instructor sube la capacidad de venta de la AI ese día."
      />

      {/* Sede picker */}
      <form className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="sede" className="text-zinc-400">
          Sede:
        </label>
        <select
          id="sede"
          name="sede"
          defaultValue={selectedSede.id}
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
        >
          {allSedes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
        <label htmlFor="from" className="ml-4 text-zinc-400">
          Desde:
        </label>
        <input
          id="from"
          name="from"
          type="date"
          defaultValue={fromDate}
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
        />
        <button
          type="submit"
          className="ml-2 rounded bg-emerald-600 px-3 py-1 text-white hover:bg-emerald-500"
        >
          Ver
        </button>
      </form>

      {/* Create + list grid */}
      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        {/* Create form */}
        <section className="rounded border border-zinc-800 bg-zinc-900/60 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Nuevo instructor
          </h2>
          <form action={createInstructor} className="space-y-3 text-sm">
            <input type="hidden" name="sede_id" value={selectedSede.id} />
            <div>
              <label className="mb-1 block text-zinc-400" htmlFor="nombre">
                Nombre (short — MIGUE / BILLY / etc.)
              </label>
              <input
                id="nombre"
                name="nombre"
                required
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
              />
            </div>
            <div>
              <label className="mb-1 block text-zinc-400" htmlFor="nombre_legal">
                Nombre legal (opcional)
              </label>
              <input
                id="nombre_legal"
                name="nombre_legal"
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
              />
            </div>
            <div>
              <label className="mb-1 block text-zinc-400" htmlFor="languages">
                Idiomas (CSV — ej: es,en,de)
              </label>
              <input
                id="languages"
                name="languages"
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded bg-emerald-600 px-3 py-2 font-medium text-white hover:bg-emerald-500"
            >
              Crear
            </button>
          </form>
        </section>

        {/* List */}
        <section className="rounded border border-zinc-800 bg-zinc-900/60 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Plantel — {selectedSede.nombre}
          </h2>
          {instructors.length === 0 ? (
            <p className="text-zinc-500">
              Sin instructores cargados todavía. Crear el primero desde la izquierda.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs uppercase text-zinc-500">
                  <th className="py-2">Nombre</th>
                  <th className="py-2">Idiomas</th>
                  <th className="py-2">Estado</th>
                  <th className="py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {instructors.map((i) => (
                  <tr key={i.id} className="border-b border-zinc-800/60">
                    <td className="py-2">
                      <form action={renameInstructor} className="flex gap-2">
                        <input type="hidden" name="id" value={i.id} />
                        <input
                          name="nombre"
                          defaultValue={i.nombre}
                          className="w-32 rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                        />
                        <button
                          type="submit"
                          className="text-xs text-zinc-400 hover:text-emerald-400"
                        >
                          guardar
                        </button>
                      </form>
                    </td>
                    <td className="py-2 text-zinc-400">{i.languages.join(", ") || "—"}</td>
                    <td className="py-2">
                      {i.active ? (
                        <span className="rounded bg-emerald-900/60 px-2 py-0.5 text-xs text-emerald-300">
                          activo
                        </span>
                      ) : (
                        <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500">
                          inactivo
                        </span>
                      )}
                    </td>
                    <td className="py-2">
                      <form action={setInstructorActive}>
                        <input type="hidden" name="id" value={i.id} />
                        <input
                          type="hidden"
                          name="active"
                          value={i.active ? "false" : "true"}
                        />
                        <button
                          type="submit"
                          className="text-xs text-zinc-400 hover:text-emerald-400"
                        >
                          {i.active ? "desactivar" : "reactivar"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {/* Availability matrix */}
      <section className="rounded border border-zinc-800 bg-zinc-900/60 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Disponibilidad — próximos {VIEW_DAYS} días
        </h2>
        <p className="mb-3 text-xs text-zinc-500">
          Marcá los slots que cubre cada instructor por día. Vacío = no
          disponible ese día. La AI usa esta tabla para decidir cuánta venta
          puede armar.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-zinc-500">
                <th className="py-2 pr-3">Instructor</th>
                {dateList.map((d) => (
                  <th key={d} className="px-2 py-2 text-center font-normal">
                    {d.slice(5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {instructors
                .filter((i) => i.active)
                .map((inst) => {
                  const byDate = matrix.get(inst.id) ?? new Map<string, string[]>();
                  return (
                    <tr key={inst.id} className="border-b border-zinc-800/40">
                      <td className="py-2 pr-3 text-zinc-200">{inst.nombre}</td>
                      {dateList.map((fecha) => {
                        const current = byDate.get(fecha) ?? [];
                        return (
                          <td key={fecha} className="px-1 py-1 align-top">
                            <form
                              action={setAvailability}
                              className="flex flex-col items-center gap-1"
                            >
                              <input type="hidden" name="sede_id" value={selectedSede.id} />
                              <input type="hidden" name="fecha" value={fecha} />
                              <input type="hidden" name="instructor_id" value={inst.id} />
                              {SLOTS_ALL.map((s) => (
                                <label key={s} className="flex items-center gap-1">
                                  <input
                                    type="checkbox"
                                    name="slots"
                                    value={s}
                                    defaultChecked={current.includes(s)}
                                    className="h-3 w-3 accent-emerald-500"
                                  />
                                  <span className="text-[10px] text-zinc-400">{s}</span>
                                </label>
                              ))}
                              <button
                                type="submit"
                                className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-700"
                              >
                                ✓
                              </button>
                            </form>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
