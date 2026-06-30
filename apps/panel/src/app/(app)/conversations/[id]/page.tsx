// ============================================================================
// Conversation detail — messenger-style center pane + right info panel
// (Steve 2026-06-30 redesign). Replaces the long single-column layout
// with:
//
//   [Chat pane]                                 [Right panel]
//   ┌─────────────────────────────────────────┐ ┌───────────────┐
//   │ Header: avatar · name · stage · phone   │ │ Info | Tools  │
//   ├─────────────────────────────────────────┤ │ | Replay      │
//   │                                         │ ├───────────────┤
//   │   ┌──────────┐                          │ │               │
//   │   │ cliente  │                          │ │  contact      │
//   │   └──────────┘                          │ │  card +       │
//   │                          ┌────────────┐ │ │  history      │
//   │                          │  AI reply  │ │ │  ...          │
//   │                          └────────────┘ │ │               │
//   │                                         │ └───────────────┘
//   ├─────────────────────────────────────────┤
//   │ [composer ___________________] [Enviar] │
//   └─────────────────────────────────────────┘
//
// The outer 3-pane shell (app sidebar | conversation sidebar | this
// page) lives in /conversations/layout.tsx. This file just paints the
// "rest" — the chat pane + the right info panel.
// ============================================================================

import { Fragment } from "react";
import { notFound } from "next/navigation";

import {
  LEAD_STAGES,
  type LeadMetadata,
  type LeadStage,
} from "@dpm/shared";

import { ActionForm } from "~/app/_components/action-form";
import { StageChip, STAGE_META } from "~/app/_components/stage";
import { SubmitButton } from "~/app/_components/submit-button";
import { markConversationSeen } from "~/app/actions/conversation-tracking";
import { releaseConversationToAi } from "~/app/actions/inbox";
import { overrideLeadStage, triggerReroll } from "~/app/actions/leads";
import { saveAiResponseAsTemplate } from "~/app/actions/saved-responses";
import { requireUserContext } from "~/lib/auth-context";
import { getConversation } from "~/lib/db-queries";
import { listQuickRepliesForSede } from "~/lib/quick-replies";

import { ChatComposer } from "./_chat-composer";
import { MessageBubble } from "./_message-bubble";
import { QuickReplyPanel } from "./_quick-reply-panel";
import { RightPanel } from "./_right-panel";
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

  if (user.role === "office" && conv.conv.sedeId !== user.sedeId) {
    notFound();
  }

  // Fire-and-forget: stamp the operator as having viewed this thread.
  // Drives the sidebar's "Unread" tab. Failure is invisible — we never
  // block render on it. The view happens during the same SSR pass; the
  // next sidebar load (router.refresh after composer send, navigation,
  // etc.) reflects the new state.
  void markConversationSeen(id);

  const quickReplies = conv.conv.sedeId
    ? await listQuickRepliesForSede({ sedeId: conv.conv.sedeId })
    : [];

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
    <div className="flex min-w-0 flex-1">
      {/* ── Center: chat pane ─────────────────────────────────────── */}
      <section className="flex min-w-0 flex-1 flex-col">
        {/* Chat header */}
        <header className="flex items-center justify-between gap-4 border-b border-ink-300/40 bg-ink-100/30 px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-sm font-semibold text-brand-300">
              {initials || "·"}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-base font-semibold text-ink-900">
                  {contact?.name ?? "Cliente sin nombre"}
                </h1>
                <StageChip stage={stage} />
                {meta.human_took_over ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-warn-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warn-700 ring-1 ring-inset ring-warn-500/40">
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full bg-warn-500"
                    />
                    Humano
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-300 ring-1 ring-inset ring-brand-400/40">
                    AI
                  </span>
                )}
              </div>
              <div className="truncate text-xs text-ink-500">
                {conv.sedeName ?? "—"} · {contact?.phone ?? "—"}
                {contact?.language ? ` · ${contact.language}` : ""}
              </div>
            </div>
          </div>
        </header>

        {/* Deposit banner — kept visible at top of chat pane when active */}
        {meta.ref_code ? (
          <div className="flex flex-wrap items-baseline gap-3 border-b border-warn-500/30 bg-warn-50/50 px-5 py-2.5 text-xs">
            <span className="badge-warn">Depósito en curso</span>
            <span className="font-mono text-sm font-semibold text-ink-900">
              {meta.ref_code}
            </span>
            <span className="text-ink-700">
              {meta.deposit_amount} {meta.deposit_currency}
            </span>
            <span className="text-ink-500">
              {meta.requires_human_verification
                ? "verificación manual (Wise / Revolut / banco)"
                : "Stripe webhook automático"}
            </span>
          </div>
        ) : null}

        {/* Messages */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-ink-100/10 px-5 py-4">
          {conv.messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-500">
              Sin mensajes en esta conversación.
            </p>
          ) : (
            <div className="space-y-3">
              {conv.messages.map((m) => {
                const fuentes = Array.isArray(m.fuentes)
                  ? (m.fuentes as string[])
                  : [];
                const isAi = m.sender === "ai";
                return (
                  <Fragment key={m.id}>
                    <MessageBubble
                      message={{
                        id: m.id,
                        sender: m.sender,
                        content: m.content,
                        createdAt: m.createdAt,
                        agenteName: m.agenteName,
                        fuentes,
                      }}
                      contactInitials={initials}
                      saveAction={
                        isAi ? (
                          <a
                            href={`#save-${m.id}`}
                            className="text-[10px] text-white/80 underline-offset-2 hover:text-white hover:underline"
                          >
                            Guardar como respuesta rápida
                          </a>
                        ) : undefined
                      }
                    />
                    {isAi ? (
                      <div
                        id={`save-${m.id}`}
                        className="ml-auto hidden w-full max-w-lg rounded-lg border border-brand-400/30 bg-brand-400/5 p-3 target:block"
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
                  </Fragment>
                );
              })}
            </div>
          )}
        </div>

        {/* Composer pinned at bottom */}
        <div className="border-t border-ink-300/40 bg-ink-100/30 px-5 py-3">
          <ChatComposer
            conversacionId={conv.conv.id}
            humanAttending={meta.human_took_over === true}
          />
        </div>
      </section>

      {/* ── Right: info / tools / replay panel ─────────────────────── */}
      <RightPanel
        infoNode={
          <InfoTab
            contact={contact}
            sedeName={conv.sedeName}
            stage={stage}
            status={conv.conv.status}
            respondIoContactId={conv.conv.respondIoContactId}
            meta={meta}
            history={history}
          />
        }
        toolsNode={
          <ToolsTab
            conversacionId={conv.conv.id}
            currentStage={stage}
            humanTookOver={meta.human_took_over === true}
            quickReplies={quickReplies}
          />
        }
        replayNode={
          <ReplaySection
            conversacionId={conv.conv.id}
            originalMessages={conv.messages.map((m) => ({
              id: m.id,
              sender: m.sender,
              content: m.content,
              createdAt: m.createdAt.toISOString(),
            }))}
          />
        }
      />
    </div>
  );
}

// ── Tab bodies ──────────────────────────────────────────────────────────

function InfoTab({
  contact,
  sedeName,
  stage,
  status,
  respondIoContactId,
  meta,
  history,
}: {
  contact: { name?: string | null; phone?: string | null; language?: string | null } | null;
  sedeName: string | null;
  stage: LeadStage;
  status: string;
  respondIoContactId: string;
  meta: LeadMetadata;
  history: NonNullable<LeadMetadata["history"]>;
}) {
  return (
    <div className="flex flex-col gap-4 text-xs">
      <div className="rounded-lg border border-ink-300/40 bg-white/40 p-3">
        <dl className="grid grid-cols-[80px_1fr] gap-y-1.5">
          <dt className="text-ink-500">Nombre</dt>
          <dd className="text-ink-900">{contact?.name ?? "—"}</dd>
          <dt className="text-ink-500">Teléfono</dt>
          <dd className="font-mono text-ink-900">{contact?.phone ?? "—"}</dd>
          <dt className="text-ink-500">Idioma</dt>
          <dd className="uppercase text-ink-900">{contact?.language ?? "—"}</dd>
          <dt className="text-ink-500">Sede</dt>
          <dd className="text-ink-900">{sedeName ?? "—"}</dd>
          <dt className="text-ink-500">Etapa</dt>
          <dd>
            <StageChip stage={stage} />
          </dd>
          <dt className="text-ink-500">Estado</dt>
          <dd className="text-ink-900">{status}</dd>
          <dt className="text-ink-500">contact_id</dt>
          <dd className="font-mono text-[10px] text-ink-700">
            {respondIoContactId}
          </dd>
        </dl>
      </div>

      {meta.ref_code ? (
        <div className="rounded-lg border border-warn-500/30 bg-warn-50/40 p-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-warn-700">
            Depósito en curso
          </div>
          <div className="font-mono text-sm font-semibold text-ink-900">
            {meta.ref_code}
          </div>
          <div className="mt-0.5 text-ink-700">
            {meta.deposit_amount} {meta.deposit_currency}
          </div>
          <div className="mt-1 text-[10px] text-ink-500">
            {meta.requires_human_verification
              ? "verificación manual"
              : "Stripe webhook automático"}
          </div>
        </div>
      ) : null}

      {history.length > 0 ? (
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
              Historia de etapas
            </h3>
            <span className="text-[10px] text-ink-500">
              últimos {history.length}
            </span>
          </div>
          <ol className="relative space-y-2.5 pl-4">
            <span className="absolute left-1 top-1 bottom-1 w-px bg-ink-200" />
            {history
              .slice()
              .reverse()
              .map((h, i) => {
                const fromMeta = STAGE_META[h.from];
                const toMeta = STAGE_META[h.to];
                return (
                  <li key={`${h.at}-${i}`} className="relative">
                    <span
                      className="absolute -left-[15px] top-1 h-2 w-2 rounded-full ring-2 ring-white"
                      style={{ background: toMeta.fg }}
                    />
                    <div className="text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-ink-800">
                          {fromMeta.label} → {toMeta.label}
                        </span>
                      </div>
                      <div className="text-ink-500">
                        <span className="font-mono text-[10px]">
                          {new Date(h.at).toLocaleString()}
                        </span>
                        {" · "}
                        <span className="badge-neutral">{h.by}</span>
                        {h.note ? <span> · {h.note}</span> : null}
                      </div>
                    </div>
                  </li>
                );
              })}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

function ToolsTab({
  conversacionId,
  currentStage,
  humanTookOver,
  quickReplies,
}: {
  conversacionId: string;
  currentStage: LeadStage;
  humanTookOver: boolean;
  quickReplies: Awaited<ReturnType<typeof listQuickRepliesForSede>>;
}) {
  return (
    <div className="flex flex-col gap-4 text-xs">
      {/* Re-roll or release */}
      <div className="rounded-lg border border-ink-300/40 bg-white/40 p-3">
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
          AI control
        </h3>
        {humanTookOver ? (
          <>
            <p className="mb-2 text-[11px] text-ink-700">
              Humano atendiendo · AI silenciada. Liberar devuelve la
              conversación a la AI sin generar respuesta inmediata.
            </p>
            <ActionForm action={releaseConversationToAi}>
              <input
                type="hidden"
                name="conversacionId"
                value={conversacionId}
              />
              <SubmitButton variant="primary" loadingLabel="Liberando…">
                Liberar a AI
              </SubmitButton>
            </ActionForm>
          </>
        ) : (
          <>
            <p className="mb-2 text-[11px] text-ink-700">
              Si la AI se trabó, este botón limpia la bandera, vuelve
              <code className="font-mono"> handed_off → qualified</code>
              {" "}y dispara una respuesta nueva.
            </p>
            <form action={triggerReroll}>
              <input
                type="hidden"
                name="conversacionId"
                value={conversacionId}
              />
              <button className="btn-primary text-xs">Re-roll AI ahora</button>
            </form>
          </>
        )}
      </div>

      {/* Stage override */}
      <div className="rounded-lg border border-ink-300/40 bg-white/40 p-3">
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
          Override etapa
        </h3>
        <form action={overrideLeadStage} className="flex flex-col gap-2">
          <input type="hidden" name="conversacionId" value={conversacionId} />
          <label className="flex flex-col gap-0.5">
            <span className="text-ink-500">Cambiar a</span>
            <select name="to" className="select text-xs" defaultValue={currentStage}>
              {LEAD_STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_META[s].label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-ink-500">Nota (opcional)</span>
            <input
              type="text"
              name="note"
              className="input text-xs"
              placeholder="motivo del override"
            />
          </label>
          <button className="btn-primary text-xs">Aplicar</button>
        </form>
      </div>

      {/* Quick replies */}
      <QuickReplyPanel items={quickReplies} />
    </div>
  );
}
