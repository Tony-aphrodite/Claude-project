"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  deleteSimulatorSavedSession,
  fetchSimulatorHistory,
  fetchSimulatorPrompts,
  fetchSimulatorSavedSessions,
  fetchSimulatorSedes,
  resetSimulatorSession,
  saveSimulatorSession,
  sendSimulatorMessage,
  type SimulatorMessage,
  type SimulatorPromptVersion,
  type SimulatorSavedSession,
  type SimulatorSede,
} from "./actions";

type Status = "idle" | "loading-prompts" | "creating-session" | "sending" | "error";

// Display name for the AI persona per sede. Mirrors the same map in
// /prompts page; keeping it duplicated for now to avoid pulling a shared
// constants file before we know which other surfaces need it.
const PERSONA_BY_SEDE: Record<string, string> = {
  "Gili Trawangan": "John",
  "Gili Air": "Colomba",
  "Koh Tao": "Emma",
  "Koh Phi Phi": "Francisco Emilio",
};

// Pre-canned test scenarios surfaced as one-click "starter" cards in the
// empty state. Each card seeds the composer with the FIRST customer turn
// for the scenario; the operator can keep typing follow-ups manually.
const STARTER_SCENARIOS: Array<{
  emoji: string;
  title: string;
  hint: string;
  text: string;
}> = [
  {
    emoji: "🤿",
    title: "Pareja quiere bucear juntos",
    hint: "Tests #limitaciones-fisicas + #repeat-objection",
    text: "Somos pareja queremos bucear juntos en julio",
  },
  {
    emoji: "🚪",
    title: "Sarcasmo / intención de irse",
    hint: "Tests #sentimiento-negativo + L11 exit-intent",
    text: "Gracias vamos con otra secuela que nos permite bucear juntos",
  },
  {
    emoji: "✅",
    title: "Happy path — Try Scuba mañana",
    hint: "Tests booking + solicitar_deposito + ref code",
    text: "Quiero Try Scuba mañana para una persona, primera vez",
  },
  {
    emoji: "🩺",
    title: "Condición médica",
    hint: "Tests escalation_reason: medical",
    text: "Tengo asma controlada, ¿puedo bucear?",
  },
];

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "hace segundos";
  if (diff < 3_600_000) return `hace ${Math.round(diff / 60_000)} min`;
  if (diff < 86_400_000) return `hace ${Math.round(diff / 3_600_000)} h`;
  return `hace ${Math.round(diff / 86_400_000)} días`;
}

export function SimulatorClient() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<SimulatorPromptVersion[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string>("");
  const [sedeList, setSedeList] = useState<SimulatorSede[]>([]);
  const [selectedSedeId, setSelectedSedeId] = useState<string>("");
  const [conversacionId, setConversacionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SimulatorMessage[]>([]);
  const [input, setInput] = useState("");
  const [savedSessions, setSavedSessions] = useState<SimulatorSavedSession[]>(
    [],
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const refreshSavedSessions = useCallback(async () => {
    try {
      const list = await fetchSimulatorSavedSessions();
      setSavedSessions(list);
    } catch (err) {
      console.warn("simulator: failed to load saved sessions", err);
    }
  }, []);

  // Pick the prompt that's active for a given sede. Prefers a sede-specific
  // active row (e.g. Colomba's v1 for Gili Air); falls back to the global
  // active row (John's v11) when the sede has no dedicated prompt yet. This
  // mirrors what production resolution does in prompts.ts: order by
  // sede_id desc so non-null sede rows win, then by version_number.
  const pickPromptForSede = useCallback(
    (sedeId: string, list: SimulatorPromptVersion[]): string | "" => {
      const sedeSpecific = list.find((p) => p.active && p.sedeId === sedeId);
      if (sedeSpecific) return sedeSpecific.id;
      const globalActive = list.find((p) => p.active && p.sedeId === null);
      return globalActive?.id ?? "";
    },
    [],
  );

  useEffect(() => {
    (async () => {
      try {
        setStatus("loading-prompts");
        const [versions, sedes] = await Promise.all([
          fetchSimulatorPrompts(),
          fetchSimulatorSedes(),
        ]);
        setPrompts(versions);
        setSedeList(sedes);

        setStatus("creating-session");
        const { conversacionId: id, sedeId: createdSedeId } =
          await resetSimulatorSession();
        setConversacionId(id);
        setSelectedSedeId(createdSedeId);
        // Auto-select the active prompt for whichever sede the session
        // landed on. Without this we'd always pick the first global
        // active row, which silently tests John's prompt against a
        // Gili Air session — the bug Miguel reported 2026-05-16.
        setSelectedPromptId(pickPromptForSede(createdSedeId, versions));
        setMessages([]);
        setStatus("idle");
        void refreshSavedSessions();
      } catch (err) {
        setStatus("error");
        setErrorMsg((err as Error).message);
      }
    })();
  }, [pickPromptForSede, refreshSavedSessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleReset = useCallback(
    async (overrideSedeId?: string) => {
      try {
        setStatus("creating-session");
        setErrorMsg(null);
        const sedeId = overrideSedeId ?? selectedSedeId;
        const { conversacionId: id, sedeId: createdSedeId } =
          await resetSimulatorSession({ sedeId: sedeId || undefined });
        setConversacionId(id);
        setSelectedSedeId(createdSedeId);
        // Re-pick the active prompt for the resolved sede. Same reason
        // as on initial load — without this, after a sede swap the
        // prompt stays whatever was selected before (likely the wrong
        // persona).
        setSelectedPromptId(pickPromptForSede(createdSedeId, prompts));
        setMessages([]);
        setStatus("idle");
      } catch (err) {
        setStatus("error");
        setErrorMsg((err as Error).message);
      }
    },
    [selectedSedeId, prompts, pickPromptForSede],
  );

  // Switching sede creates a fresh session for that sede (different
  // prompts/KB/tools, so reusing the old conversacion would be invalid).
  const handleSedeChange = useCallback(
    (sedeId: string) => {
      setSelectedSedeId(sedeId);
      void handleReset(sedeId);
    },
    [handleReset],
  );

  const handleSend = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? input).trim();
      if (!conversacionId || !text || status === "sending") return;
      setInput("");
      setStatus("sending");
      setErrorMsg(null);
      setMessages((prev) => [
        ...prev,
        {
          id: `temp-${Date.now()}`,
          sender: "cliente",
          content: text,
          fuentes: null,
          metadata: null,
          createdAt: new Date().toISOString(),
        },
      ]);
      try {
        const res = await sendSimulatorMessage({
          conversacionId,
          text,
          promptVersionId: selectedPromptId || undefined,
        });
        const fresh = await fetchSimulatorHistory(conversacionId);
        setMessages(fresh);
        setStatus("idle");
        console.debug("simulator turn", res);
      } catch (err) {
        setStatus("error");
        setErrorMsg((err as Error).message);
      }
    },
    [conversacionId, input, selectedPromptId, status],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleStarter = useCallback(
    (text: string) => {
      // Single click drops the starter text into the composer + focuses it,
      // so the operator can edit before sending. Double-click sends straight
      // away. Keeps test-driving fast without losing manual control.
      setInput(text);
      composerRef.current?.focus();
    },
    [],
  );

  const selectedPrompt = prompts.find((p) => p.id === selectedPromptId);

  const handleSaveSession = useCallback(async () => {
    if (!conversacionId) return;
    const name = window.prompt(
      "Nombre para guardar esta sesión:",
      `Sesión ${new Date().toLocaleString()}`,
    );
    if (!name || !name.trim()) return;
    try {
      await saveSimulatorSession({
        name: name.trim(),
        conversacionId,
        promptVersionId: selectedPromptId || null,
      });
      await refreshSavedSessions();
    } catch (err) {
      setStatus("error");
      setErrorMsg((err as Error).message);
    }
  }, [conversacionId, selectedPromptId, refreshSavedSessions]);

  const handleLoadSession = useCallback(
    async (s: SimulatorSavedSession) => {
      try {
        setStatus("creating-session");
        setConversacionId(s.conversacionId);
        if (s.promptVersionId) setSelectedPromptId(s.promptVersionId);
        const history = await fetchSimulatorHistory(s.conversacionId);
        setMessages(history);
        setStatus("idle");
      } catch (err) {
        setStatus("error");
        setErrorMsg((err as Error).message);
      }
    },
    [],
  );

  const handleDeleteSession = useCallback(
    async (id: string) => {
      if (!window.confirm("¿Eliminar esta sesión guardada?")) return;
      try {
        await deleteSimulatorSavedSession(id);
        await refreshSavedSessions();
      } catch (err) {
        setStatus("error");
        setErrorMsg((err as Error).message);
      }
    },
    [refreshSavedSessions],
  );

  // Aggregate totals for the small footer chip.
  const turnCount = messages.filter((m) => m.sender === "cliente").length;
  const totalCost = messages.reduce((acc, m) => {
    if (m.sender !== "ai" || !m.metadata || typeof m.metadata !== "object")
      return acc;
    const c = (m.metadata as { costUsd?: number }).costUsd;
    return acc + (typeof c === "number" ? c : 0);
  }, 0);

  const isBusy = status === "sending" || status === "creating-session";

  return (
    <>
      {/* ── Control bar ─────────────────────────────────────────────── */}
      <section className="card flex flex-wrap items-center gap-3 !py-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="metric-label">Sede</span>
          <select
            value={selectedSedeId}
            onChange={(e) => handleSedeChange(e.target.value)}
            className="select min-w-[170px]"
            disabled={isBusy}
            title="Cambiar de sede inicia una conversación nueva con el prompt + KB + tools de esa sede"
          >
            {sedeList.length === 0 && <option value="">—</option>}
            {sedeList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="metric-label">Prompt</span>
          <select
            value={selectedPromptId}
            onChange={(e) => setSelectedPromptId(e.target.value)}
            className="select min-w-[260px]"
            disabled={isBusy}
          >
            {prompts.length === 0 && <option value="">— sin prompts —</option>}
            {/* Show ALL prompts (no sede filter). Each row makes the persona
                explicit — Colomba (Gili Air), John (global), etc. — so the
                operator can pick any prompt+sede combination, even
                cross-sede for edge-case testing (e.g. "what would Colomba
                say to a Gili Trawangan customer?"). Without the persona
                label the dropdown was unreadable per Miguel 2026-05-16. */}
            {prompts.map((p) => {
              const sedeName = sedeList.find((s) => s.id === p.sedeId)?.nombre;
              const persona = sedeName
                ? PERSONA_BY_SEDE[sedeName] ?? sedeName
                : "John";
              const scopeLabel = sedeName ? sedeName : "fallback global";
              return (
                <option key={p.id} value={p.id}>
                  {persona} · v{p.versionNumber}
                  {p.active ? " · activo" : ""} · {scopeLabel} ·{" "}
                  {relativeTime(p.createdAt)}
                </option>
              );
            })}
          </select>
        </label>
        {selectedPrompt && (
          <span
            className="hidden md:inline text-[10px] text-ink-400 font-mono"
            title={`Prompt version id: ${selectedPrompt.id}`}
          >
            #{selectedPrompt.id.slice(0, 6)}
          </span>
        )}

        <span className="ml-auto flex items-center gap-2">
          {status === "sending" && (
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-500">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-pulse" />
              John está pensando…
            </span>
          )}
          {status === "creating-session" && (
            <span className="text-xs text-ink-500">creando sesión…</span>
          )}
          {status === "loading-prompts" && (
            <span className="text-xs text-ink-500">cargando prompts…</span>
          )}
          {turnCount > 0 && (
            <span
              className="text-[10px] text-ink-500 font-mono"
              title="Turnos del cliente · costo total acumulado"
            >
              {turnCount} turnos · ${totalCost.toFixed(4)}
            </span>
          )}
          <button
            type="button"
            onClick={handleSaveSession}
            className="btn-ghost"
            disabled={isBusy || !conversacionId || messages.length === 0}
            title="Guardá esta sesión con un nombre para volver a ella"
          >
            💾 Guardar
          </button>
          <button
            type="button"
            onClick={() => void handleReset()}
            className="btn-ghost"
            disabled={isBusy}
            title="Limpia el contexto y arranca una conversación nueva"
          >
            ↻ Reset
          </button>
        </span>
      </section>

      {/* ── Saved sessions row ─────────────────────────────────────── */}
      {savedSessions.length > 0 && (
        <section className="card !py-3">
          <div className="metric-label mb-2">Sesiones guardadas</div>
          <div className="flex flex-wrap gap-2">
            {savedSessions.map((s) => {
              const active = conversacionId === s.conversacionId;
              return (
                <span
                  key={s.id}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ring-1 ring-inset transition-colors ${
                    active
                      ? "bg-brand-500/15 text-brand-300 ring-brand-400/40"
                      : "bg-ink-200/40 text-ink-700 ring-ink-300/50 hover:bg-ink-200/70"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void handleLoadSession(s)}
                    title={`${s.name} · ${new Date(s.createdAt).toLocaleString()}`}
                    className="font-medium"
                  >
                    {s.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteSession(s.id)}
                    className="text-ink-400 hover:text-bad-600"
                    title="Eliminar sesión guardada"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Error banner ──────────────────────────────────────────── */}
      {errorMsg && (
        <div className="card border border-bad-500/30 bg-bad-50 text-bad-700 text-sm !py-3">
          <strong>Error:</strong> {errorMsg}
        </div>
      )}

      {/* ── Chat surface ──────────────────────────────────────────── */}
      <section className="card !p-0 overflow-hidden">
        <div className="flex h-[65vh] flex-col">
          <div className="flex-1 overflow-y-auto p-5 space-y-3 scrollbar-thin">
            {messages.length === 0 ? (
              <EmptyState
                onPick={handleStarter}
                disabled={isBusy || !conversacionId}
              />
            ) : (
              messages.map((m) => <SimulatorBubble key={m.id} msg={m} />)
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Composer — dark glass surface matching the rest of the panel */}
          <div className="border-t border-ink-300/40 bg-ink-100/40 p-3 backdrop-blur-sm">
            <div className="flex items-end gap-2">
              <textarea
                ref={composerRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Escribí como cliente…"
                rows={2}
                className="input flex-1 resize-none font-sans"
                disabled={isBusy || !conversacionId}
              />
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={isBusy || !conversacionId || !input.trim()}
                className="btn-primary self-stretch px-5"
              >
                Enviar
              </button>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-ink-400">
              <span>
                <kbd className="rounded bg-ink-100 px-1 py-0.5 font-mono text-[10px]">
                  Enter
                </kbd>{" "}
                enviar ·{" "}
                <kbd className="rounded bg-ink-100 px-1 py-0.5 font-mono text-[10px]">
                  Shift+Enter
                </kbd>{" "}
                nueva línea
              </span>
              {selectedPrompt && (
                <span className="font-mono">
                  prompt v{selectedPrompt.versionNumber}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/**
 * Empty-state hero with one-click starter scenarios. Each card seeds the
 * composer with the first cliente turn for a known test path (couple
 * scenario, sarcasm exit, happy path, medical) so an operator without
 * Spanish fluency can still test the AI's behaviour reliably.
 */
function EmptyState({
  onPick,
  disabled,
}: {
  onPick: (text: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 py-6">
      <div className="text-center">
        <div className="text-3xl mb-2">🤿</div>
        <div className="text-sm font-semibold text-ink-700">
          Empezá una conversación
        </div>
        <div className="text-xs text-ink-500 mt-0.5">
          Cliqueá un escenario o escribí tu propio mensaje abajo
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 w-full max-w-2xl">
        {STARTER_SCENARIOS.map((s) => (
          <button
            key={s.title}
            type="button"
            onClick={() => onPick(s.text)}
            disabled={disabled}
            className="card-hover text-left !p-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-start gap-2">
              <span className="text-lg leading-none">{s.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-ink-800">
                  {s.title}
                </div>
                <div className="text-[11px] text-ink-500 mt-0.5">
                  {s.hint}
                </div>
                <div className="text-xs text-ink-700 mt-1.5 italic truncate">
                  &ldquo;{s.text}&rdquo;
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function SimulatorBubble({ msg }: { msg: SimulatorMessage }) {
  const isClient = msg.sender === "cliente";
  const meta =
    msg.metadata && typeof msg.metadata === "object"
      ? (msg.metadata as {
          toolCalls?: string[];
          costUsd?: number;
          latencyMs?: number;
          model?: string;
          escalationReason?: string | null;
        })
      : null;
  const fuentes = Array.isArray(msg.fuentes)
    ? (msg.fuentes as unknown[]).filter(
        (f): f is string => typeof f === "string",
      )
    : [];
  return (
    <div className={`flex ${isClient ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap shadow-card ${
          isClient
            ? "bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow-soft"
            : "bg-ink-200/70 text-ink-900 ring-1 ring-inset ring-ink-300/60 backdrop-blur-sm"
        }`}
      >
        <div>{msg.content}</div>
        {!isClient && fuentes.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {fuentes.map((f) => (
              <span
                key={f}
                className={`rounded px-1.5 py-0.5 font-mono text-[10px] ring-1 ring-inset ${
                  isClient
                    ? "bg-ink-900/15 text-ink-900/95 ring-ink-900/25"
                    : "bg-ink-100/60 text-ink-700 ring-ink-300/50"
                }`}
                title="Fuente declarada por la AI (Bloque 2 KB / historial)"
              >
                {f}
              </span>
            ))}
          </div>
        )}
        {!isClient && meta && (meta.toolCalls?.length || meta.costUsd) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink-500 font-mono">
            {meta.toolCalls && meta.toolCalls.length > 0 && (
              <span title="Tools que invocó John en este turno (stubeadas en simulador)">
                🔧 {meta.toolCalls.join(", ")}
              </span>
            )}
            {typeof meta.costUsd === "number" && (
              <span>${meta.costUsd.toFixed(4)}</span>
            )}
            {typeof meta.latencyMs === "number" && (
              <span>{(meta.latencyMs / 1000).toFixed(1)}s</span>
            )}
            {meta.escalationReason && (
              <span
                className="text-warn-700 font-semibold"
                title="AI marcó escalation_reason — handoff a humano"
              >
                ⚠ {meta.escalationReason}
              </span>
            )}
          </div>
        )}
        {!isClient && fuentes.length === 0 && (
          <div className="mt-2 text-[10px] text-warn-700/80">
            sin fuentes declaradas
          </div>
        )}
      </div>
    </div>
  );
}
