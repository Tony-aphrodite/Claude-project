// Stage chip + metadata helpers shared across pages. One source of truth so
// the kanban, the conversation header, and the payments page all render the
// same colors / labels for a given lead_stage.

import type { LeadStage } from "@dpm/shared";

export const STAGE_META: Record<
  LeadStage,
  {
    label: string;
    description: string;
    /** Used for the chip text + dot. */
    fg: string;
    /** Tailwind class for the chip background + ring. */
    chip: string;
    /** Background used in the kanban column header. */
    columnBg: string;
    /** Warn / bad thresholds in hours. */
    warnHours: number;
    badHours: number;
  }
> = {
  new: {
    label: "Nuevo",
    description: "Conversación recién abierta",
    fg: "#475569",
    chip: "bg-slate-100 text-slate-700 ring-slate-300",
    columnBg: "bg-stage-new",
    warnHours: 1,
    badHours: 6,
  },
  qualified: {
    label: "Calificado",
    description: "AI detectó interés real",
    fg: "#1d4ed8",
    chip: "bg-blue-50 text-blue-700 ring-blue-300",
    columnBg: "bg-stage-qualified",
    warnHours: 2,
    badHours: 12,
  },
  proposed: {
    label: "Propuesto",
    description: "AI propuso fechas / curso",
    fg: "#4338ca",
    chip: "bg-indigo-50 text-indigo-700 ring-indigo-300",
    columnBg: "bg-stage-proposed",
    warnHours: 4,
    badHours: 24,
  },
  deposit_pending: {
    label: "Depósito pendiente",
    description: "Esperando confirmación humana",
    fg: "#b45309",
    chip: "bg-amber-50 text-amber-700 ring-amber-300",
    columnBg: "bg-stage-deposit-pending",
    warnHours: 12,
    badHours: 48,
  },
  deposit_paid: {
    label: "Depósito pagado",
    description: "Confirmado, transición al humano",
    fg: "#047857",
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-300",
    columnBg: "bg-stage-deposit-paid",
    warnHours: 1,
    badHours: 4,
  },
  handed_off: {
    label: "Con humano",
    description: "Equipo de la sede tiene la conversación",
    fg: "#6d28d9",
    chip: "bg-violet-50 text-violet-700 ring-violet-300",
    columnBg: "bg-stage-handed-off",
    warnHours: 2,
    badHours: 12,
  },
  closed: {
    label: "Cerrado",
    description: "Reserva confirmada",
    fg: "#15803d",
    chip: "bg-green-50 text-green-700 ring-green-300",
    columnBg: "bg-stage-deposit-paid",
    warnHours: 24 * 30,
    badHours: 24 * 90,
  },
  lost: {
    label: "Perdido",
    description: "Lead descartado / intent negativo",
    fg: "#be123c",
    chip: "bg-rose-50 text-rose-700 ring-rose-300",
    columnBg: "bg-rose-50/40",
    warnHours: 24 * 30,
    badHours: 24 * 90,
  },
};

export function StageChip({ stage }: { stage: LeadStage }) {
  const meta = STAGE_META[stage];
  return (
    <span className={`stage-chip ${meta.chip}`}>
      <span className="stage-dot" style={{ background: meta.fg }} />
      {meta.label}
    </span>
  );
}

export function elapsedHours(d: Date | string): number {
  const t = typeof d === "string" ? new Date(d).getTime() : d.getTime();
  return Math.max(0, (Date.now() - t) / (60 * 60 * 1000));
}

export function formatElapsed(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export function ageTone(stage: LeadStage, hours: number): "ok" | "warn" | "bad" {
  const meta = STAGE_META[stage];
  if (hours >= meta.badHours) return "bad";
  if (hours >= meta.warnHours) return "warn";
  return "ok";
}
