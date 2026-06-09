"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  fetchSimulatorRoster,
  resetSimulatorRosterGrid,
  setSimulatorRosterCell,
  type SandboxRosterRow,
} from "./actions";

// ─── Sandbox roster grid (Miguel 2026-06-09 PM) ──────────────────────────
//
// Editable 15-day × 5-turno grid embedded next to the simulator chat.
// Each cell shows `reservado/capacidad`; click to set occupancy by hand
// (sculpts arbitrary test boards). Writes target `roster_bookings_sandbox`
// only — production roster is never touched.
//
// Why this exists: chat-only fill can't produce realistic states (cargar
// 22 personas una fecha a la vez es inviable, y el OW ocupa varios días
// seguidos). With the grid an operator can set "23 jun PM = 22/22" with
// one click and then ask the AI for an OW starting 22 jun to test whether
// the AI rejects the booking (correct) or confirms based on day-1 alone
// (the bug Miguel cares about catching).

const TURNOS = ["AM", "PM", "Nocturno", "ConfinadasAM", "ConfinadasPM"] as const;
type Turno = (typeof TURNOS)[number];

const TURNO_LABEL: Record<Turno, string> = {
  AM: "AM",
  PM: "PM",
  Nocturno: "Noc",
  ConfinadasAM: "Conf AM",
  ConfinadasPM: "Conf PM",
};

/** YYYY-MM-DD for today (server timezone — close enough for the panel). */
function todayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + n);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dt);
}

function shortDate(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${d}/${m}`;
}

function weekday(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  return new Intl.DateTimeFormat("es", { weekday: "short", timeZone: "UTC" })
    .format(dt)
    .replace(".", "");
}

type Props = {
  sedeId: string;
  /** Bump this number to force a refresh — used by parent after AI turns. */
  refreshNonce: number;
};

export function SandboxRosterGrid({ sedeId, refreshNonce }: Props) {
  const [rows, setRows] = useState<SandboxRosterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState<string>(todayYmd());
  const [days] = useState(15);
  const [editing, setEditing] = useState<{
    fecha: string;
    turno: Turno;
    capacity: number;
    current: number;
  } | null>(null);

  // Used to ignore stale fetch responses if the user changes sede / date
  // before the previous fetch resolves.
  const fetchSeqRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!sedeId) return;
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const { rows: fresh } = await fetchSimulatorRoster({
        sedeId,
        fromDate,
        days,
      });
      if (seq !== fetchSeqRef.current) return; // stale
      setRows(fresh);
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      setError((err as Error).message);
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  }, [sedeId, fromDate, days]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshNonce]);

  // Build a lookup map: `${fecha}|${turno}` → row, for O(1) cell access.
  const byKey = useMemo(() => {
    const m = new Map<string, SandboxRosterRow>();
    for (const r of rows) m.set(`${r.fecha}|${r.turno}`, r);
    return m;
  }, [rows]);

  // Compute the date range to render (independent of what came back, so
  // we render an empty cell with "—" if the server omitted a day).
  const dateList = useMemo(() => {
    const list: string[] = [];
    for (let i = 0; i < days; i++) list.push(addDays(fromDate, i));
    return list;
  }, [fromDate, days]);

  const handleCellClick = (fecha: string, turno: Turno) => {
    const row = byKey.get(`${fecha}|${turno}`);
    if (!row) {
      // Try to infer capacity from any same-turno row of any date.
      const fallbackCapacity =
        rows.find((r) => r.turno === turno)?.capacidad ??
        (turno.startsWith("Confinadas") ? 30 : 22);
      setEditing({ fecha, turno, capacity: fallbackCapacity, current: 0 });
      return;
    }
    setEditing({ fecha, turno, capacity: row.capacidad, current: row.reservado });
  };

  const handleSaveEdit = async (pax: number) => {
    if (!editing) return;
    try {
      await setSimulatorRosterCell({
        sedeId,
        fecha: editing.fecha,
        turno: editing.turno,
        pax,
      });
      setEditing(null);
      void refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleResetGrid = async () => {
    if (
      !window.confirm(
        "Borrar TODAS las celdas seteadas a mano en el sandbox (reservas de chat NO se tocan). ¿Continuar?",
      )
    ) {
      return;
    }
    try {
      await resetSimulatorRosterGrid({ sedeId });
      void refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="flex h-full flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-ink-800">
            Roster sandbox · 15 días
          </div>
          <div className="text-[10px] text-ink-500">
            Click en una celda para fijar ocupación (chat bookings preservados)
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setFromDate(todayYmd())}
            className="btn-ghost !px-2 !py-1 text-[11px]"
            title="Volver a partir de hoy"
            disabled={loading}
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            className="btn-ghost !px-2 !py-1 text-[11px]"
            disabled={loading}
          >
            {loading ? "…" : "↻"}
          </button>
          <button
            type="button"
            onClick={() => void handleResetGrid()}
            className="btn-ghost !px-2 !py-1 text-[11px] text-warn-700"
            title="Borrar todas las celdas seteadas a mano"
            disabled={loading}
          >
            Reset
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-bad-500/30 bg-bad-500/10 px-2 py-1 text-[11px] text-bad-700">
          {error}
        </div>
      )}

      {/* Grid */}
      <div className="overflow-auto rounded-lg border border-ink-300/40 bg-ink-100/30 scrollbar-thin">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-ink-200/80 backdrop-blur-sm">
            <tr>
              <th className="px-2 py-1.5 text-left font-semibold text-ink-700">
                Fecha
              </th>
              {TURNOS.map((t) => (
                <th
                  key={t}
                  className="px-2 py-1.5 text-center font-semibold text-ink-700"
                  title={t}
                >
                  {TURNO_LABEL[t]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dateList.map((fecha) => (
              <tr key={fecha} className="border-t border-ink-300/30">
                <td className="px-2 py-1 text-ink-700 whitespace-nowrap">
                  <div className="font-mono">{shortDate(fecha)}</div>
                  <div className="text-[9px] text-ink-500 uppercase tracking-wide">
                    {weekday(fecha)}
                  </div>
                </td>
                {TURNOS.map((turno) => {
                  const row = byKey.get(`${fecha}|${turno}`);
                  const reserved = row?.reservado ?? 0;
                  const capacity = row?.capacidad ?? (turno.startsWith("Confinadas") ? 30 : 22);
                  const isFull = reserved >= capacity;
                  const isPartial = reserved > 0 && !isFull;
                  return (
                    <td
                      key={turno}
                      className="p-0 text-center"
                      onClick={() => handleCellClick(fecha, turno)}
                    >
                      <button
                        type="button"
                        className={`m-0.5 w-full rounded px-1.5 py-1 font-mono text-[10px] transition-colors ${
                          isFull
                            ? "bg-bad-500/25 text-bad-700 hover:bg-bad-500/40"
                            : isPartial
                              ? "bg-warn-500/25 text-warn-700 hover:bg-warn-500/40"
                              : "bg-ink-200/40 text-ink-500 hover:bg-brand-500/20 hover:text-brand-300"
                        }`}
                        title={`${fecha} ${turno} — click para editar`}
                      >
                        {reserved}/{capacity}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit modal */}
      {editing && (
        <CellEditModal
          fecha={editing.fecha}
          turno={editing.turno}
          capacity={editing.capacity}
          current={editing.current}
          onSave={handleSaveEdit}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function CellEditModal({
  fecha,
  turno,
  capacity,
  current,
  onSave,
  onClose,
}: {
  fecha: string;
  turno: string;
  capacity: number;
  current: number;
  onSave: (pax: number) => void | Promise<void>;
  onClose: () => void;
}) {
  const [pax, setPax] = useState<string>(String(current));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = async (value: number) => {
    setSaving(true);
    try {
      await onSave(value);
    } finally {
      setSaving(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(pax, 10);
    if (!Number.isInteger(n) || n < 0 || n > capacity) return;
    void submit(n);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="card flex flex-col gap-3 !p-5 min-w-[280px] max-w-sm"
      >
        <div>
          <div className="text-sm font-semibold text-ink-800">
            Fijar ocupación
          </div>
          <div className="text-xs text-ink-500 font-mono">
            {fecha} · {turno} · cap {capacity}
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-600">Pax ocupados (0 = vacío)</span>
          <input
            ref={inputRef}
            type="number"
            min={0}
            max={capacity}
            value={pax}
            onChange={(e) => setPax(e.target.value)}
            className="input"
            disabled={saving}
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => void submit(0)}
            className="btn-ghost !px-2 !py-1 text-[11px]"
            disabled={saving}
            title="Vaciar esta celda"
          >
            Vacío
          </button>
          <button
            type="button"
            onClick={() => void submit(Math.floor(capacity / 2))}
            className="btn-ghost !px-2 !py-1 text-[11px]"
            disabled={saving}
          >
            Mitad
          </button>
          <button
            type="button"
            onClick={() => void submit(capacity - 1)}
            className="btn-ghost !px-2 !py-1 text-[11px]"
            disabled={saving}
            title="Llenar dejando 1 libre"
          >
            Casi lleno
          </button>
          <button
            type="button"
            onClick={() => void submit(capacity)}
            className="btn-ghost !px-2 !py-1 text-[11px] text-bad-700"
            disabled={saving}
            title="Llenar completamente"
          >
            Lleno
          </button>
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost"
            disabled={saving}
          >
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
