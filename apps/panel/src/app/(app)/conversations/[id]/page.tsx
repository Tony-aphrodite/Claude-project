import Link from "next/link";
import { notFound } from "next/navigation";

import {
  LEAD_STAGES,
  type LeadMetadata,
  type LeadStage,
} from "@dpm/shared";

import { ActionForm } from "~/app/_components/action-form";
import { StageChip, STAGE_META } from "~/app/_components/stage";
import { SubmitButton } from "~/app/_components/submit-button";
import { releaseConversationToAi } from "~/app/actions/inbox";
import { overrideLeadStage, triggerReroll } from "~/app/actions/leads";
import { saveAiResponseAsTemplate } from "~/app/actions/saved-responses";
import { requireUserContext } from "~/lib/auth-context";
import { getConversation } from "~/lib/db-queries";

import { ChatComposer } from "./_chat-composer";
import { ReplaySection } from "./replay-section";

export const dynamic = "force-dynamic";

export default async function ConversationDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, user] = await Promise.all([params, requireUserContext()]);
  const conv = await getConversation(id);
  if (!conv) notFound();

  // Office users can only view conversations from their own sede. Return
  // 404 (not 403) so we don't reveal that the conversation exists at all.
  if (user.role === "office" && conv.conv.sedeId !== user.sedeId) {
    notFound();
  }

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

      <section className="card">
        <header className="flex items-baseline justify-between mb-3">
          <h2 className="h-section">Re-roll AI</h2>
          <span className="text-[11px] text-ink-500">
            Miguel 2026-06-18 — destrabar conversación
          </span>
        </header>
        <p className="text-xs text-ink-600 mb-3 max-w-prose">
          Si la AI dejó de contestar en medio de una conversación (race de
          asignación humano→bot), este botón limpia la bandera
          `human_took_over`, vuelve la etapa de `handed_off` a `qualified`
          si aplica, y dispara una respuesta nueva contra el último
          mensaje del cliente. La AI vuelve a escribir sin que tengas
          que mandar mensaje manual primero.
        </p>
        <form action={triggerReroll}>
          <input type="hidden" name="conversacionId" value={conv.conv.id} />
          <button className="btn-primary">Re-roll AI ahora</button>
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

      {/* ------------------------------------------------------------ */}
      {/* Operator inbox — Miguel 2026-06-12 #2.                       */}
      {/* Composer (write+send) + AI-vs-human attendant indicator +    */}
      {/* release-to-AI control. All gated behind sede write access    */}
      {/* in the server action.                                        */}
      {/* ------------------------------------------------------------ */}
      <section className="card">
        <header className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h2 className="h-section">Responder al cliente</h2>
            {/* Attendant indicator — single source of truth: the
                human_took_over flag on leadMetadata. Set by the
                operator's own send (this page) OR by Respond.io
                assignee-change webhook (process-agent-message
                already manages it). */}
            {meta.human_took_over ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-warn-700 ring-1 ring-inset ring-warn-500/40">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-warn-500"
                />
                Humano atendiendo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-400/15 px-2.5 py-0.5 text-[11px] font-semibold text-brand-300 ring-1 ring-inset ring-brand-400/40">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-brand-400"
                />
                AI activa
              </span>
            )}
          </div>
          {meta.human_took_over ? (
            // When the conversation is human-attended, expose the
            // release-to-AI control inline. Two clicks max: this one,
            // and then the AI naturally picks up on the next inbound.
            // (For an instant re-roll, the existing "Re-roll AI"
            // section below stays available.)
            <ActionForm action={releaseConversationToAi}>
              <input
                type="hidden"
                name="conversacionId"
                value={conv.conv.id}
              />
              <SubmitButton variant="ghost" loadingLabel="Liberando…">
                Liberar a AI
              </SubmitButton>
            </ActionForm>
          ) : null}
        </header>
        <p className="mb-3 text-xs text-ink-600">
          El mensaje va por WhatsApp al instante. Al enviar, la AI se
          silencia automáticamente — vos quedás al mando hasta que la
          liberes (botón arriba) o la re-arranques con Re-roll AI.
        </p>
        <ChatComposer
          conversacionId={conv.conv.id}
          humanAttending={meta.human_took_over === true}
        />
      </section>

      <section className="card !p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-ink-300/40 bg-ink-200/40">
          <h2 className="h-section">Mensajes ({conv.messages.length})</h2>
        </div>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto p-5 scrollbar-thin">
          {conv.messages.map((m) => {
            const fuentes = Array.isArray(m.fuentes) ? (m.fuentes as string[]) : [];
            const isCliente = m.sender === "cliente";
            const isAi = m.sender === "ai";
            return (
              <div key={m.id} className="space-y-1">
                <div
                  className={`flex ${isCliente ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={
                      isCliente
                        ? "bubble-cliente"
                        : isAi
                          ? "bubble-ai"
                          : "bubble-agente"
                    }
                  >
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
                            className="rounded bg-ink-900/15 px-1.5 py-0.5 font-mono text-[10px] text-ink-900/95 ring-1 ring-inset ring-ink-900/20"
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
                    {/* Resilience layer #7 (Miguel 2026-06-12): per-AI-message
                        "Guardar respuesta" action. Hidden expandable form
                        below; this anchor toggles it via #save-{id}. */}
                    {isAi && (
                      <div className="mt-2 text-right">
                        <a
                          href={`#save-${m.id}`}
                          className="text-[10px] text-white/70 hover:text-white underline-offset-2 hover:underline"
                        >
                          Guardar como respuesta rápida
                        </a>
                      </div>
                    )}
                  </div>
                </div>
                {/* Inline save form — sits BELOW the bubble, full-width
                    so the operator can name + tag without cramping the
                    chat. CSS-only show/hide via :target hash. */}
                {isAi ? (
                  <div
                    id={`save-${m.id}`}
                    className="hidden target:block ml-auto w-full max-w-lg rounded-lg border border-brand-400/30 bg-brand-400/5 p-3"
                  >
                    <ActionForm
                      action={saveAiResponseAsTemplate}
                      className="flex flex-col gap-2 text-xs"
                      resetOnSuccess
                      successMessage="Respuesta guardada en la biblioteca"
                    >
                      <input
                        type="hidden"
                        name="conversacionId"
                        value={conv.conv.id}
                      />
                      <input type="hidden" name="mensajeId" value={m.id} />
                      <label className="flex flex-col gap-0.5">
                        <span className="text-ink-500">Nombre corto</span>
                        <input
                          name="name"
                          required
                          placeholder='Ej: "Explicación OW + bancos GA"'
                          className="rounded border border-ink-200 bg-ink-100/60 px-2 py-1 text-ink-900"
                        />
                      </label>
                      <label className="flex flex-col gap-0.5">
                        <span className="text-ink-500">
                          Tags (separados por coma)
                        </span>
                        <input
                          name="tags"
                          placeholder="ej: curso_ow, precios, objecion"
                          className="rounded border border-ink-200 bg-ink-100/60 px-2 py-1 text-ink-900"
                        />
                      </label>
                      <fieldset className="flex flex-col gap-0.5">
                        <legend className="text-ink-500">Alcance</legend>
                        <label className="flex items-center gap-1.5">
                          <input
                            type="radio"
                            name="scope"
                            value="general"
                            defaultChecked
                            className="accent-brand-400"
                          />
                          <span>General (todas las sedes)</span>
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input
                            type="radio"
                            name="scope"
                            value="sede"
                            className="accent-brand-400"
                          />
                          <span>Solo {conv.sedeName}</span>
                        </label>
                      </fieldset>
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          name="include_prompt"
                          value="true"
                          defaultChecked
                          className="accent-brand-400"
                        />
                        <span>
                          Guardar también la pregunta del cliente que generó
                          esto
                        </span>
                      </label>
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href="#"
                          className="text-ink-500 hover:text-ink-700"
                        >
                          cancelar
                        </a>
                        <SubmitButton
                          variant="primary"
                          loadingLabel="Guardando…"
                        >
                          Guardar
                        </SubmitButton>
                      </div>
                    </ActionForm>
                  </div>
                ) : null}
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

      <ReplaySection
        conversacionId={conv.conv.id}
        originalMessages={conv.messages.map((m) => ({
          id: m.id,
          sender: m.sender,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
