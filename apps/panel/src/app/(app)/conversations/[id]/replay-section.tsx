"use client";

import { useCallback, useEffect, useState } from "react";

import {
  fetchReplayPrompts,
  fetchReplayRun,
  fetchReplayRuns,
  startReplay,
  type ReplayPromptVersion,
  type ReplayRun,
  type ReplayRunWithMessages,
} from "./replay-actions";

type Props = {
  conversacionId: string;
  originalMessages: Array<{
    id: string;
    sender: string;
    content: string;
    createdAt: string;
  }>;
};

export function ReplaySection({ conversacionId, originalMessages }: Props) {
  const [prompts, setPrompts] = useState<ReplayPromptVersion[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string>("");
  const [runs, setRuns] = useState<ReplayRun[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<ReplayRunWithMessages | null>(
    null,
  );
  const [starting, setStarting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const refreshRuns = useCallback(async () => {
    try {
      const r = await fetchReplayRuns(conversacionId);
      setRuns(r);
    } catch (err) {
      console.warn("replay: failed to list runs", err);
    }
  }, [conversacionId]);

  // On mount: prompts + run list.
  useEffect(() => {
    (async () => {
      try {
        const p = await fetchReplayPrompts();
        setPrompts(p);
      } catch (err) {
        setErrorMsg((err as Error).message);
      }
      void refreshRuns();
    })();
  }, [refreshRuns]);

  // When activeRunId changes, poll until status='done' or 'failed'.
  useEffect(() => {
    if (!activeRunId) return;
    let cancelled = false;
    let attempts = 0;
    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const r = await fetchReplayRun(activeRunId);
        setActiveRun(r);
        if (r.run.status === "done" || r.run.status === "failed") {
          await refreshRuns();
          return;
        }
      } catch (err) {
        console.warn("replay: poll failed", err);
      }
      // Backoff: every 2s for first 30s, then every 5s, capped at 5 min.
      if (attempts < 150) {
        setTimeout(() => void tick(), attempts < 15 ? 2_000 : 5_000);
      }
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [activeRunId, refreshRuns]);

  const handleStart = useCallback(async () => {
    if (!selectedPromptId) return;
    setStarting(true);
    setErrorMsg(null);
    try {
      const { id } = await startReplay({
        sourceConversacionId: conversacionId,
        promptVersionId: selectedPromptId,
      });
      setActiveRunId(id);
      setActiveRun(null);
      await refreshRuns();
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setStarting(false);
    }
  }, [conversacionId, selectedPromptId, refreshRuns]);

  return (
    <section className="card !p-0">
      <header className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-ink-100">
        <h2 className="text-sm font-semibold text-ink-900">
          Replay con otra versión del prompt
        </h2>
        <span className="text-xs text-ink-500">
          Re-corre los mensajes del cliente contra una versión distinta
          del prompt para comparar respuestas.
        </span>
        <span className="ml-auto flex items-center gap-2">
          <select
            value={selectedPromptId}
            onChange={(e) => setSelectedPromptId(e.target.value)}
            className="rounded-md border border-ink-200 bg-white px-2 py-1 text-sm"
          >
            <option value="">— elegí versión —</option>
            {prompts.map((p) => (
              <option key={p.id} value={p.id}>
                v{p.versionNumber}
                {p.active ? " (activo)" : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleStart}
            disabled={!selectedPromptId || starting}
            className="btn-primary"
          >
            {starting ? "Iniciando…" : "Replay"}
          </button>
        </span>
      </header>

      {errorMsg && (
        <div className="border-b border-bad-500/30 bg-bad-50 px-5 py-2 text-sm text-bad-700">
          {errorMsg}
        </div>
      )}

      {runs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-5 py-2 border-b border-ink-100 text-xs">
          <span className="text-ink-500">Replays:</span>
          {runs.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                setActiveRunId(r.id);
                setActiveRun(null);
              }}
              className={`rounded-full px-2 py-0.5 ring-1 ring-inset ${
                activeRunId === r.id
                  ? "bg-brand-500/10 text-brand-700 ring-brand-500/30"
                  : "bg-ink-50 text-ink-700 ring-ink-200"
              }`}
              title={`${r.promptVersionLabel ?? r.promptVersionId} · ${new Date(r.createdAt).toLocaleString()}`}
            >
              {r.promptVersionLabel ?? "v?"} · {r.status}
            </button>
          ))}
        </div>
      )}

      <div className="p-5">
        {!activeRunId && (
          <div className="text-sm text-ink-500 text-center py-6">
            Elegí una versión de prompt arriba y clickeá Replay para empezar,
            o seleccioná un replay previo de la lista.
          </div>
        )}
        {activeRunId && !activeRun && (
          <div className="text-sm text-ink-500 text-center py-6">
            Cargando replay…
          </div>
        )}
        {activeRun && activeRun.run.status === "failed" && (
          <div className="text-sm text-bad-700 text-center py-6">
            Replay falló: {activeRun.run.errorMessage ?? "(sin mensaje)"}
          </div>
        )}
        {activeRun &&
          (activeRun.run.status === "pending" ||
            activeRun.run.status === "running") && (
            <div className="text-sm text-ink-500 text-center py-6">
              Replay en curso… {activeRun.messages.length} mensajes hasta ahora.
            </div>
          )}
        {activeRun && activeRun.run.status === "done" && (
          <SideBySide
            original={originalMessages}
            replay={activeRun.messages}
          />
        )}
      </div>
    </section>
  );
}

type ProdMsg = {
  id: string;
  sender: string;
  content: string;
  createdAt: string;
};
type ReplayMsg = {
  id: string;
  idx: string;
  role: string;
  content: string;
  fuentes: unknown;
  toolCalls: unknown;
  metadata: unknown;
};
type Row = {
  cliente?: string;
  prodAi?: ProdMsg;
  replayAi?: ReplayMsg;
};

function SideBySide({
  original,
  replay,
}: {
  original: ProdMsg[];
  replay: ReplayMsg[];
}) {
  // Pair production (sender='cliente' or 'ai') with replay (role='cliente'
  // or 'ai') by walking both in order. Production rows include human
  // agent + synthetic notes — for replay comparison we only care about
  // cliente and ai turns.
  const prodTurns = original.filter(
    (m) => m.sender === "cliente" || m.sender === "ai",
  );
  // Group replay messages into turn pairs (cliente -> ai) by walking in
  // order; idx prefix isn't actually needed since the worker writes
  // strictly alternating roles.
  const rows: Row[] = [];
  for (const r of replay) {
    if (r.role === "cliente") {
      rows.push({ cliente: r.content });
    } else if (r.role === "ai") {
      const last = rows[rows.length - 1];
      if (last) last.replayAi = r;
    }
  }
  // Walk prod turns to attach prodAi to each row by matching client msg.
  let i = 0;
  for (const row of rows) {
    while (i < prodTurns.length && prodTurns[i]?.sender !== "cliente") i += 1;
    if (i < prodTurns.length) {
      i += 1; // past the client msg
      while (i < prodTurns.length && prodTurns[i]?.sender !== "ai") i += 1;
      if (i < prodTurns.length) {
        row.prodAi = prodTurns[i];
        i += 1;
      }
    }
  }

  return (
    <div className="space-y-4">
      {rows.map((row, idx) => (
        <div key={idx} className="space-y-2">
          {row.cliente && (
            <div className="text-xs uppercase text-ink-500 font-mono">
              Cliente · turno {idx + 1}
            </div>
          )}
          {row.cliente && (
            <div className="rounded-md bg-ink-50 px-3 py-2 text-sm">
              {row.cliente}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ReplayBubble label="John (original)" prod={row.prodAi} />
            <ReplayBubble label="John (replay)" replay={row.replayAi} accent />
          </div>
        </div>
      ))}
      {rows.length === 0 && (
        <div className="text-sm text-ink-500 text-center py-6">
          No hay turnos para comparar.
        </div>
      )}
    </div>
  );
}

function ReplayBubble({
  label,
  prod,
  replay,
  accent,
}: {
  label: string;
  prod?: ProdMsg;
  replay?: ReplayMsg;
  accent?: boolean;
}) {
  // We accept either a prod message (no metadata/tools/fuentes — the
  // panel doesn't currently fetch those for the original rows) OR a
  // replay message (full metadata available). Keeps the side-by-side
  // symmetric in shape while only rendering the extras we actually
  // have.
  const content = prod?.content ?? replay?.content;
  const fuentes = replay && Array.isArray(replay.fuentes)
    ? (replay.fuentes as unknown[]).filter(
        (f): f is string => typeof f === "string",
      )
    : [];
  const toolCalls =
    replay && Array.isArray(replay.toolCalls)
      ? (replay.toolCalls as unknown[]).filter(
          (t): t is string => typeof t === "string",
        )
      : [];
  const meta =
    replay && replay.metadata && typeof replay.metadata === "object"
      ? (replay.metadata as {
          costUsd?: number;
          latencyMs?: number;
          model?: string;
          escalationReason?: string | null;
        })
      : null;
  return (
    <div
      className={`rounded-md p-3 text-sm ${
        accent
          ? "border border-brand-200 bg-brand-50/30"
          : "border border-ink-200 bg-white"
      }`}
    >
      <div
        className={`text-[10px] uppercase mb-1 ${
          accent ? "text-brand-700" : "text-ink-500"
        }`}
      >
        {label}
      </div>
      <div className="whitespace-pre-wrap">
        {content ?? <span className="text-ink-400">—</span>}
      </div>
      {fuentes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {fuentes.map((f) => (
            <span
              key={f}
              className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-ink-700 ring-1 ring-inset ring-ink-200"
              title="Fuente declarada por la AI"
            >
              {f}
            </span>
          ))}
        </div>
      )}
      {(toolCalls.length > 0 ||
        typeof meta?.costUsd === "number" ||
        meta?.escalationReason) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink-500 font-mono">
          {toolCalls.length > 0 && (
            <span title="Tools que invocó John (stubeadas en replay)">
              🔧 {toolCalls.join(", ")}
            </span>
          )}
          {typeof meta?.costUsd === "number" && (
            <span>${meta.costUsd.toFixed(4)}</span>
          )}
          {typeof meta?.latencyMs === "number" && (
            <span>{(meta.latencyMs / 1000).toFixed(1)}s</span>
          )}
          {meta?.escalationReason && (
            <span className="text-warn-700">⚠ {meta.escalationReason}</span>
          )}
        </div>
      )}
    </div>
  );
}
