import Link from "next/link";
import { notFound } from "next/navigation";

import {
  LEAD_STAGES,
  type LeadMetadata,
  type LeadStage,
} from "@dpm/shared";

import { StageChip, STAGE_META } from "~/app/_components/stage";
import { overrideLeadStage } from "~/app/actions/leads";
import { getConversation } from "~/lib/db-queries";

export const dynamic = "force-dynamic";

export default async function ConversationDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const conv = await getConversation(id);
  if (!conv) notFound();

  const contact = conv.contact;
  const stage = conv.conv.leadStage as LeadStage;
  const meta = (conv.conv.leadMetadata as LeadMetadata | null) ?? {};
  const history = meta.history ?? [];

  const initials = (contact?.name ?? "—")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <>
      <div>
        <Link
          href="/conversations"
          className="text-xs text-ink-500 hover:text-ink-700 inline-flex items-center gap-1 mb-3"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-3 w-3">
            <path
              d="M12 15l-5-5 5-5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Conversaciones
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-500/10 text-brand-700 text-base font-semibold">
              {initials || "·"}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="h-page">{contact?.name ?? "Cliente sin nombre"}</h1>
                <StageChip stage={stage} />
              </div>
              <div className="text-sm text-ink-500 mt-0.5">
                {conv.sedeName} · {contact?.phone ?? "—"} · {contact?.language ?? "lang ?"}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end text-xs text-ink-500">
            <span className="font-mono">
              contact_id:{" "}
              <span className="text-ink-700">{conv.conv.respondIoContactId}</span>
            </span>
            <span>{conv.conv.status}</span>
          </div>
        </div>
      </div>

      {meta.ref_code && (
        <div className="card flex flex-wrap items-baseline gap-3 bg-warn-50/50 border-warn-500/30">
          <span className="badge-warn">Depósito en curso</span>
          <span className="font-mono text-sm font-semibold text-ink-900">
            {meta.ref_code}
          </span>
          <span className="text-sm text-ink-700">
            {meta.deposit_amount} {meta.deposit_currency}
          </span>
          <span className="text-xs text-ink-500">
            {meta.requires_human_verification
              ? "verificación manual (Wise / Revolut / banco)"
              : "Stripe webhook automático"}
          </span>
        </div>
      )}

      <section className="card">
        <header className="flex items-baseline justify-between mb-3">
          <h2 className="h-section">Override de etapa</h2>
          <span className="text-[11px] text-ink-500">
            cambio manual con auditoría
          </span>
        </header>
        <form action={overrideLeadStage} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="conversacionId" value={conv.conv.id} />
          <label className="text-xs">
            <div className="metric-label mb-1">Cambiar a</div>
            <select name="to" className="select" defaultValue={stage}>
              {LEAD_STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_META[s].label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs flex-1 min-w-[200px]">
            <div className="metric-label mb-1">Nota (opcional)</div>
            <input type="text" name="note" className="input" placeholder="motivo del override" />
          </label>
          <button className="btn-primary">Aplicar</button>
        </form>
      </section>

      {history.length > 0 && (
        <section className="card">
          <header className="flex items-baseline justify-between mb-3">
            <h2 className="h-section">Historia de etapas</h2>
            <span className="text-[11px] text-ink-500">
              últimos {history.length}
            </span>
          </header>
          <ol className="relative space-y-3 pl-5">
            <span className="absolute left-1.5 top-1 bottom-1 w-px bg-ink-200" />
            {history
              .slice()
              .reverse()
              .map((h, i) => {
                const fromMeta = STAGE_META[h.from];
                const toMeta = STAGE_META[h.to];
                return (
                  <li key={`${h.at}-${i}`} className="relative">
                    <span
                      className="absolute -left-3.5 top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white"
                      style={{ background: toMeta.fg }}
                    />
                    <div className="text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink-800">
                          {fromMeta.label} → {toMeta.label}
                        </span>
                        <span className="badge-neutral">{h.by}</span>
                      </div>
                      <div className="mt-0.5 text-ink-500">
                        <span className="font-mono">
                          {new Date(h.at).toLocaleString()}
                        </span>
                        {h.note && <span> · {h.note}</span>}
                      </div>
                    </div>
                  </li>
                );
              })}
          </ol>
        </section>
      )}

      <section className="card !p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-ink-200/60 bg-ink-50/40">
          <h2 className="h-section">Mensajes ({conv.messages.length})</h2>
        </div>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto p-5 scrollbar-thin">
          {conv.messages.map((m) => {
            const fuentes = Array.isArray(m.fuentes) ? (m.fuentes as string[]) : [];
            const isCliente = m.sender === "cliente";
            const isAi = m.sender === "ai";
            return (
              <div
                key={m.id}
                className={`flex ${isCliente ? "justify-start" : "justify-end"}`}
              >
                <div className={isCliente ? "bubble-cliente" : isAi ? "bubble-ai" : "bubble-agente"}>
                  <div className="bubble-meta flex items-center justify-between gap-3">
                    <span>
                      {isCliente
                        ? "Cliente"
                        : isAi
                          ? "AI"
                          : `Agente${m.agenteName ? ` · ${m.agenteName}` : ""}`}
                    </span>
                    <span>{new Date(m.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="whitespace-pre-wrap">{m.content}</div>
                  {isAi && fuentes.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {fuentes.map((f) => (
                        <span
                          key={f}
                          className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-[10px] text-white/90 ring-1 ring-inset ring-white/20"
                          title="Fuente declarada por la AI"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                  {isAi && fuentes.length === 0 && (
                    <div className="mt-2 text-[10px] text-warn-50/80">
                      sin fuentes declaradas
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {conv.messages.length === 0 && (
            <div className="text-center text-sm text-ink-500 py-6">
              Sin mensajes en esta conversación.
            </div>
          )}
        </div>
      </section>
    </>
  );
}
