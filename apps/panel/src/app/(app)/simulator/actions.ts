"use server";

// Thin server-action wrappers around the Railway server's
// /admin/simulator/* endpoints. The Respond.io API key and the
// Anthropic key live only on the server; the panel just forwards
// auth'd HTTP calls.

export type SimulatorPromptVersion = {
  id: string;
  versionNumber: number;
  sedeId: string | null;
  active: boolean;
  createdAt: string;
};

export type SimulatorMessage = {
  id: string;
  sender: string; // "cliente" | "ai"
  content: string;
  fuentes: unknown; // string[] | null — AI's declared citations
  metadata: unknown;
  createdAt: string;
};

export type SimulatorTurnResponse = {
  aiText: string;
  sources: string[];
  toolCalls: string[];
  costUsd: number;
  latencyMs: number;
  model: string;
  promptVersionId: string | null;
  escalationReason: string | null;
};

function getServerConfig(): { baseUrl: string; token: string } {
  const baseUrl = process.env.DPM_SERVER_URL;
  const token = process.env.ADMIN_RESET_TOKEN;
  if (!baseUrl || !token) {
    throw new Error(
      "Simulator: DPM_SERVER_URL and ADMIN_RESET_TOKEN must be set on the panel deployment",
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), token };
}

async function adminFetch<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { baseUrl, token } = getServerConfig();
  const { json, ...rest } = init;
  const res = await fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(rest.headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : (rest.body ?? undefined),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `simulator ${path} ${res.status}: ${body.slice(0, 200) || "(empty)"}`,
    );
  }
  return (await res.json()) as T;
}

export async function fetchSimulatorPrompts(): Promise<SimulatorPromptVersion[]> {
  const data = await adminFetch<{
    ok: boolean;
    versions: SimulatorPromptVersion[];
  }>("/admin/simulator/prompts", { method: "GET" });
  return data.versions ?? [];
}

export async function resetSimulatorSession(
  opts: { sedeId?: string } = {},
): Promise<{ conversacionId: string; sedeId: string }> {
  const data = await adminFetch<{
    ok: boolean;
    conversacionId: string;
    sedeId: string;
  }>("/admin/simulator/session", {
    method: "POST",
    json: opts.sedeId ? { sedeId: opts.sedeId } : {},
  });
  return { conversacionId: data.conversacionId, sedeId: data.sedeId };
}

export async function sendSimulatorMessage(input: {
  conversacionId: string;
  text: string;
  promptVersionId?: string;
}): Promise<SimulatorTurnResponse> {
  const data = await adminFetch<SimulatorTurnResponse & { ok: boolean }>(
    "/admin/simulator/message",
    {
      method: "POST",
      json: input,
    },
  );
  return data;
}

export async function fetchSimulatorHistory(
  conversacionId: string,
): Promise<SimulatorMessage[]> {
  const data = await adminFetch<{ ok: boolean; messages: SimulatorMessage[] }>(
    `/admin/simulator/history?conversacionId=${encodeURIComponent(conversacionId)}`,
    { method: "GET" },
  );
  return data.messages ?? [];
}

// ── Phase 1.5 — saved sessions ─────────────────────────────────────────────

export type SimulatorSavedSession = {
  id: string;
  name: string;
  conversacionId: string;
  promptVersionId: string | null;
  createdBy: string | null;
  notes: string | null;
  createdAt: string;
};

export async function fetchSimulatorSavedSessions(): Promise<
  SimulatorSavedSession[]
> {
  const data = await adminFetch<{
    ok: boolean;
    sessions: SimulatorSavedSession[];
  }>("/admin/simulator/sessions", { method: "GET" });
  return data.sessions ?? [];
}

export async function saveSimulatorSession(input: {
  name: string;
  conversacionId: string;
  promptVersionId?: string | null;
  notes?: string | null;
}): Promise<{ id: string }> {
  const data = await adminFetch<{ ok: boolean; id: string }>(
    "/admin/simulator/sessions",
    {
      method: "POST",
      json: input,
    },
  );
  return { id: data.id };
}

export async function deleteSimulatorSavedSession(id: string): Promise<void> {
  await adminFetch<{ ok: boolean }>(
    `/admin/simulator/sessions/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}
