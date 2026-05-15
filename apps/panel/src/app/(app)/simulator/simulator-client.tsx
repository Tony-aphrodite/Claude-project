"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  deleteSimulatorSavedSession,
  fetchSimulatorHistory,
  fetchSimulatorPrompts,
  fetchSimulatorSavedSessions,
  resetSimulatorSession,
  saveSimulatorSession,
  sendSimulatorMessage,
  type SimulatorMessage,
  type SimulatorPromptVersion,
  type SimulatorSavedSession,
} from "./actions";

type Status = "idle" | "loading-prompts" | "creating-session" | "sending" | "error";

export function SimulatorClient() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<SimulatorPromptVersion[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string>("");
  const [conversacionId, setConversacionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SimulatorMessage[]>([]);
  const [input, setInput] = useState("");
  const [savedSessions, setSavedSessions] = useState<SimulatorSavedSession[]>(
    [],
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const refreshSavedSessions = useCallback(async () => {
    try {
      const list = await fetchSimulatorSavedSessions();
      setSavedSessions(list);
    } catch (err) {
      console.warn("simulator: failed to load saved sessions", err);
    }
  }, []);

  // On mount: load prompt versions + create a fresh session.
  useEffect(() => {
    (async () => {
      try {
        setStatus("loading-prompts");
        const versions = await fetchSimulatorPrompts();
        setPrompts(versions);
        // default selection = the active one
        const active = versions.find((v) => v.active);
        if (active) setSelectedPromptId(active.id);

        setStatus("creating-session");
        const { conversacionId: id } = await resetSimulatorSession();
        setConversacionId(id);
        setMessages([]);
        setStatus("idle");
        // Pull saved sessions list in parallel (best-effort).
        void refreshSavedSessions();
      } catch (err) {
        setStatus("error");
        setErrorMsg((err as Error).message);
      }
    })();
  }, [refreshSavedSessions]);

  // Auto-scroll to bottom on new message.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleReset = useCallback(async () => {
    try {
      setStatus("creating-session");
      setErrorMsg(null);
      const { conversacionId: id } = await resetSimulatorSession();
      setConversacionId(id);
      setMessages([]);
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setErrorMsg((err as Error).message);
    }
  }, []);

  const handleSend = useCallback(async () => {
    if (!conversacionId || !input.trim() || status === "sending") return;
    const text = input.trim();
    setInput("");
    setStatus("sending");
    setErrorMsg(null);
    // Optimistic client message
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
      // Refresh history from server so we get the authoritative IDs +
      // John's reply with metadata.
      const fresh = await fetchSimulatorHistory(conversacionId);
      setMessages(fresh);
      setStatus("idle");
      // For dev: log the surface payload so we can compare to production.
      console.debug("simulator turn", res);
    } catch (err) {
      setStatus("error");
      setErrorMsg((err as Error).message);
    }
  }, [conversacionId, input, selectedPromptId, status]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

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

  return (
    <>
      {/* Controls bar */}
      <section className="card flex flex-wrap items-center gap-3 !py-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-600">Prompt</span>
          <select
            value={selectedPromptId}
            onChange={(e) => setSelectedPromptId(e.target.value)}
            className="rounded-md border border-ink-200 bg-white px-2 py-1 text-sm"
          >
            {prompts.length === 0 && <option value="">— sin prompts —</option>}
            {prompts.map((p) => (
              <option key={p.id} value={p.id}>
                v{p.versionNumber}
                {p.active ? " (activo)" : ""}
                {p.sedeId ? " · sede" : " · global"}
              </option>
            ))}
          </select>
        </label>
        {selectedPrompt && (
          <span className="text-xs text-ink-400 font-mono">
            id: {selectedPrompt.id.slice(0, 8)}…
          </span>
        )}
        <span className="ml-auto flex items-center gap-3">
          {status === "sending" && (
            <span className="text-xs text-ink-500">John está pensando…</span>
          )}
          {status === "creating-session" && (
            <span className="text-xs text-ink-500">creando sesión…</span>
          )}
          {status === "loading-prompts" && (
            <span className="text-xs text-ink-500">cargando prompts…</span>
          )}
          <button
            type="button"
            onClick={handleSaveSession}
            className="btn-ghost"
            disabled={
              status === "sending" ||
              status === "creating-session" ||
              !conversacionId ||
              messages.length === 0
            }
            title="Guardá esta sesión con un nombre para volver a usarla"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="btn-ghost"
            disabled={status === "sending" || status === "creating-session"}
            title="Limpia el contexto y arranca una conversación nueva"
          >
            Reset
          </button>
        </span>
      </section>

      {/* Saved sessions */}
      {savedSessions.length > 0 && (
        <section className="card !py-3">
          <div className="text-xs text-ink-500 mb-2">Sesiones guardadas</div>
          <div className="flex flex-wrap gap-2">
            {savedSessions.map((s) => (
              <span
                key={s.id}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ring-1 ring-inset ${
                  conversacionId === s.conversacionId
                    ? "bg-brand-500/10 text-brand-700 ring-brand-500/30"
                    : "bg-ink-50 text-ink-700 ring-ink-200"
                }`}
              >
                <button
                  type="button"
                  onClick={() => void handleLoadSession(s)}
                  className="hover:underline"
                  title={`${s.name} · ${new Date(s.createdAt).toLocaleString()}`}
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
            ))}
          </div>
        </section>
      )}

      {/* Error banner */}
      {errorMsg && (
        <div className="card border border-bad-500/30 bg-bad-50 text-bad-700 text-sm !py-3">
          <strong>Error:</strong> {errorMsg}
        </div>
      )}

      {/* Chat surface */}
      <section className="card !p-0 overflow-hidden">
        <div className="flex h-[60vh] flex-col">
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-sm text-ink-400 py-12">
                Mandá un mensaje como si fueras un cliente. John va a
                responder con el prompt seleccionado.
              </div>
            )}
            {messages.map((m) => (
              <SimulatorBubble key={m.id} msg={m} />
            ))}
            <div ref={messagesEndRef} />
          </div>
          {/* Composer */}
          <div className="border-t border-ink-100 bg-white p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder='Escribí como cliente… (Enter = enviar, Shift+Enter = nueva línea)'
                rows={2}
                className="flex-1 resize-none rounded-md border border-ink-200 px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                disabled={status === "sending" || !conversacionId}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={
                  status === "sending" || !conversacionId || !input.trim()
                }
                className="btn-primary"
              >
                Enviar
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
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
        className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
          isClient
            ? "bg-brand-500 text-white"
            : "bg-ink-50 text-ink-900 ring-1 ring-inset ring-ink-100"
        }`}
      >
        <div>{msg.content}</div>
        {!isClient && fuentes.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {fuentes.map((f) => (
              <span
                key={f}
                className="rounded bg-ink-900/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-ink-700 ring-1 ring-inset ring-ink-200"
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
              <span className="text-warn-700" title="AI marcó escalation_reason">
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
