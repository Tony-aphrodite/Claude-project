// Roster panel page (Slice 3e, Miguel feedback 2026-06-05). Shows
// capacity / reserved / available / blocked per (sede, fecha, turno) for
// the next 14 days. Each cell has form-based block/unblock + capacity
// override actions. A seed-booking form below lets the office import
// existing future bookings before the AI starts selling against the new
// DB-backed roster.

import { PageHeader } from "~/app/_components/page-header";
import { requireUserContext } from "~/lib/auth-context";
import {
  blockRosterSlot,
  seedRosterBooking,
  setRosterCapacity,
  unblockRosterSlot,
} from "~/app/actions/roster";
import {
  getRosterView,
  listAllSedes,
  listRecentBookings,
  type RosterSlotData,
} from "~/lib/roster-queries";

export const dynamic = "force-dynamic";

const VIEW_DAYS = 14;

function todayYmd(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

type Search = {
  sede?: string;
  start?: string;
};

type PageData = {
  ok: true;
  allSedes: Awaited<ReturnType<typeof listAllSedes>>;
  selectedSede: { id: string; nombre: string };
  startDate: string;
  view: Awaited<ReturnType<typeof getRosterView>>;
  recentBookings: Awaited<ReturnType<typeof listRecentBookings>>;
} | {
  ok: false;
  error: string;
  stack?: string;
};

async function loadData(params: Search): Promise<PageData> {
  try {
    const allSedes = await listAllSedes();
    if (allSedes.length === 0) {
      return { ok: false, error: "No hay sedes configuradas en la base de datos." };
    }
    const selectedSedeId = params.sede ?? allSedes[0]!.id;
    const selectedSede = allSedes.find((s) => s.id === selectedSedeId) ?? allSedes[0]!;
    const startDate = params.start ?? todayYmd();
    const [view, recentBookings] = await Promise.all([
      getRosterView({ sedeId: selectedSede.id, startDate, days: VIEW_DAYS }),
      listRecentBookings({ sedeId: selectedSede.id, fechaFrom: startDate, limit: 30 }),
    ]);
    return { ok: true, allSedes, selectedSede, startDate, view, recentBookings };
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message ?? String(err),
      stack: (err as Error).stack,
    };
  }
}

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  await requireUserContext();
  const params = await searchParams;
  const data = await loadData(params);

  if (!data.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Operación"
          title="Roster"
          description="Capacidad, reservas y bloqueos por sede × fecha × turno."
        />
        <div className="card border border-bad-200 bg-bad-50 text-bad-900">
          <h3 className="font-semibold mb-2">Error al cargar el roster</h3>
          <pre className="whitespace-pre-wrap text-xs">{data.error}</pre>
          {data.stack ? (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer">Stack trace</summary>
              <pre className="whitespace-pre-wrap mt-1">{data.stack}</pre>
            </details>
          ) : null}
          <p className="text-xs mt-3 text-bad-700">
            Si el error persiste, mandá este mensaje + stack al backend team.
          </p>
        </div>
      </>
    );
  }

  const { allSedes, selectedSede, startDate, view, recentBookings } = data;

  return (
    <>
      <PageHeader
        eyebrow="Operación"
        title="Roster"
        description="Capacidad, reservas y bloqueos por sede × fecha × turno. La AI lee de acá para confirmar disponibilidad."
      />

      <form className="card mb-4 flex flex-wrap items-center gap-3">
        <label className="text-sm text-ink-700">
          Sede
          <select
            name="sede"
            defaultValue={selectedSede.id}
            className="ml-2 rounded border border-ink-200 px-2 py-1 text-sm"
          >
            {allSedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-ink-700">
          Desde
          <input
            type="date"
            name="start"
            defaultValue={startDate}
            className="ml-2 rounded border border-ink-200 px-2 py-1 text-sm"
          />
        </label>
        <button type="submit" className="btn-secondary text-sm">
          Aplicar
        </button>
      </form>

      <div className="card !p-0 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th className="pl-5">Fecha</th>
              <th>Día</th>
              <th>AM (7:00–12:00)</th>
              <th>PM (12:30–17:00)</th>
              <th className="pr-5">Nocturno (18:00–20:00)</th>
            </tr>
          </thead>
          <tbody>
            {view.map((row) => (
              <tr key={row.fecha}>
                <td className="pl-5 font-medium text-ink-900">{row.fecha}</td>
                <td className="text-sm text-ink-700">{row.weekday}</td>
                <SlotCell
                  sedeId={selectedSede.id}
                  fecha={row.fecha}
                  turno="AM"
                  data={row.am}
                />
                <SlotCell
                  sedeId={selectedSede.id}
                  fecha={row.fecha}
                  turno="PM"
                  data={row.pm}
                />
                <SlotCell
                  sedeId={selectedSede.id}
                  fecha={row.fecha}
                  turno="Nocturno"
                  data={row.nocturno}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 mb-3 text-lg font-semibold text-ink-900">
        Reservas confirmadas próximas
      </h2>
      <div className="card !p-0 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th className="pl-5">Fecha</th>
              <th>Turno</th>
              <th>Programa</th>
              <th>Pax</th>
              <th>Contact ID</th>
              <th className="pr-5">Origen</th>
            </tr>
          </thead>
          <tbody>
            {recentBookings.length === 0 ? (
              <tr>
                <td colSpan={6} className="pl-5 py-4 text-sm text-ink-500">
                  Sin reservas confirmadas a partir de {startDate}.
                </td>
              </tr>
            ) : (
              recentBookings.map((b) => (
                <tr key={b.id}>
                  <td className="pl-5 font-medium">{b.fecha}</td>
                  <td>{b.turno}</td>
                  <td>{b.programa}</td>
                  <td>{b.pax}</td>
                  <td className="font-mono text-xs">{b.contactId ?? "—"}</td>
                  <td className="pr-5 text-sm text-ink-600">{b.notes ?? "OCR"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 mb-3 text-lg font-semibold text-ink-900">
        Cargar reserva manualmente (seed)
      </h2>
      <form
        action={seedRosterBooking}
        className="card flex flex-wrap items-end gap-3"
      >
        <input type="hidden" name="sedeId" value={selectedSede.id} />
        <label className="text-sm text-ink-700">
          Fecha
          <input
            type="date"
            name="fecha"
            required
            defaultValue={startDate}
            className="block rounded border border-ink-200 px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm text-ink-700">
          Turno
          <select
            name="turno"
            required
            className="block rounded border border-ink-200 px-2 py-1 text-sm"
          >
            <option value="AM">AM</option>
            <option value="PM">PM</option>
            <option value="Nocturno">Nocturno</option>
          </select>
        </label>
        <label className="text-sm text-ink-700">
          Programa
          <input
            name="programa"
            required
            placeholder="TryScuba"
            className="block rounded border border-ink-200 px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm text-ink-700">
          Pax
          <input
            type="number"
            name="pax"
            required
            min={1}
            defaultValue={1}
            className="block w-20 rounded border border-ink-200 px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm text-ink-700">
          Notas
          <input
            name="notes"
            placeholder="Booking pre-go-live"
            className="block rounded border border-ink-200 px-2 py-1 text-sm"
          />
        </label>
        <button type="submit" className="btn-primary">
          Cargar
        </button>
      </form>
    </>
  );
}

function SlotCell({
  sedeId,
  fecha,
  turno,
  data,
}: {
  sedeId: string;
  fecha: string;
  turno: "AM" | "PM" | "Nocturno";
  data: RosterSlotData;
}) {
  const isLastCol = turno === "Nocturno";
  return (
    <td className={isLastCol ? "pr-5" : ""}>
      <div className="flex flex-col gap-1 text-xs">
        {data.blocked ? (
          <span className="inline-block rounded bg-bad-100 px-2 py-0.5 text-bad-900">
            BLOQUEADO{data.blockReason ? ` · ${data.blockReason}` : ""}
          </span>
        ) : data.available === 0 ? (
          <span className="inline-block rounded bg-warn-100 px-2 py-0.5 text-warn-900">
            LLENO ({data.reserved}/{data.capacity})
          </span>
        ) : (
          <span className="inline-block rounded bg-ok-100 px-2 py-0.5 text-ok-900">
            {data.available} libre{data.available === 1 ? "" : "s"} · cap {data.capacity} · res {data.reserved}
          </span>
        )}

        <div className="flex flex-wrap gap-1">
          {data.blocked ? (
            <form action={unblockRosterSlot}>
              <input type="hidden" name="sedeId" value={sedeId} />
              <input type="hidden" name="fecha" value={fecha} />
              <input type="hidden" name="turno" value={turno} />
              <button type="submit" className="text-xs text-brand-700 underline">
                Desbloquear
              </button>
            </form>
          ) : (
            <form action={blockRosterSlot} className="flex items-center gap-1">
              <input type="hidden" name="sedeId" value={sedeId} />
              <input type="hidden" name="fecha" value={fecha} />
              <input type="hidden" name="turno" value={turno} />
              <input
                name="reason"
                placeholder="motivo"
                className="w-20 rounded border border-ink-200 px-1 py-0.5 text-xs"
              />
              <button type="submit" className="text-xs text-bad-700 underline">
                Bloquear
              </button>
            </form>
          )}

          <form action={setRosterCapacity} className="flex items-center gap-1">
            <input type="hidden" name="sedeId" value={sedeId} />
            <input type="hidden" name="fecha" value={fecha} />
            <input type="hidden" name="turno" value={turno} />
            <input
              type="number"
              name="capacity"
              min={0}
              defaultValue={data.capacity}
              className="w-14 rounded border border-ink-200 px-1 py-0.5 text-xs"
            />
            <button type="submit" className="text-xs text-ink-600 underline">
              Set cap
            </button>
          </form>
        </div>
      </div>
    </td>
  );
}
