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
    fg: "#cbd5e1",
    chip: "bg-slate-400/10 text-slate-300 ring-slate-400/30",
    columnBg: "bg-stage-new",
    warnHours: 1,
    badHours: 6,
  },
  qualified: {
    label: "Calificado",
    description: "AI detectó interés real",
    fg: "#93c5fd",
    chip: "bg-blue-400/10 text-blue-300 ring-blue-400/30",
    columnBg: "bg-stage-qualified",
    warnHours: 2,
    badHours: 12,
  },
  proposed: {
    label: "Propuesto",
    description: "AI propuso fechas / curso",
    fg: "#a5b4fc",
    chip: "bg-indigo-400/10 text-indigo-300 ring-indigo-400/30",
    columnBg: "bg-stage-proposed",
    warnHours: 4,
    badHours: 24,
  },
  deposit_pending: {
    label: "Depósito pendiente",
    description: "Esperando confirmación humana",
    fg: "#fcd34d",
    chip: "bg-amber-400/10 text-amber-300 ring-amber-400/30",
    columnBg: "bg-stage-deposit-pending",
    warnHours: 12,
    badHours: 48,
  },
  deposit_paid: {
    label: "Depósito pagado",
    description: "Confirmado, transición al humano",
    fg: "#6ee7b7",
    chip: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/30",
    columnBg: "bg-stage-deposit-paid",
    warnHours: 1,
    badHours: 4,
  },
  handed_off: {
    label: "Con humano",
    description: "Equipo de la sede tiene la conversación",
    fg: "#c4b5fd",
    chip: "bg-violet-400/10 text-violet-300 ring-violet-400/30",
    columnBg: "bg-stage-handed-off",
    warnHours: 2,
    badHours: 12,
  },
  closed: {
    label: "Cerrado",
    description: "Reserva confirmada",
    fg: "#86efac",
    chip: "bg-green-400/10 text-green-300 ring-green-400/30",
    columnBg: "bg-stage-deposit-paid",
    warnHours: 24 * 30,
    badHours: 24 * 90,
  },
  lost: {
    label: "Perdido",
    description: "Lead descartado / intent negativo",
    fg: "#fda4af",
    chip: "bg-rose-400/10 text-rose-300 ring-rose-400/30",
    columnBg: "bg-rose-400/5",
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
