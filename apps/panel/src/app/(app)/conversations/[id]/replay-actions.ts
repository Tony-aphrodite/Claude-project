"use server";

// Server-action wrappers for the replay endpoints on the Railway server.
// Same pattern as simulator/actions.ts.

export type ReplayPromptVersion = {
  id: string;
  versionNumber: number;
  sedeId: string | null;
  active: boolean;
  createdAt: string;
};

export type ReplayRun = {
  id: string;
  sourceConversacionId: string;
  promptVersionId: string;
  promptVersionLabel: string | null;
  createdBy: string | null;
  status: string;
  costUsdTotal: string | null;
  messageCount: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

export type ReplayMessage = {
  id: string;
  replayRunId: string;
  idx: string;
  role: string;
  content: string;
  fuentes: unknown;
  toolCalls: unknown;
  metadata: unknown;
  createdAt: string;
};

export type ReplayRunWithMessages = {
  run: ReplayRun;
  messages: ReplayMessage[];
};

function getServerConfig(): { baseUrl: string; token: string } {
  const baseUrl = process.env.DPM_SERVER_URL;
  const token = process.env.ADMIN_RESET_TOKEN;
  if (!baseUrl || !token) {
    throw new Error(
      "Replay: DPM_SERVER_URL and ADMIN_RESET_TOKEN must be set on the panel deployment",
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
    throw new Error(`replay ${path} ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export async function fetchReplayPrompts(): Promise<ReplayPromptVersion[]> {
  // Same endpoint as simulator — both use prompts_versiones type=system.
  const data = await adminFetch<{
    ok: boolean;
    versions: ReplayPromptVersion[];
  }>("/admin/simulator/prompts", { method: "GET" });
  return data.versions ?? [];
}

export async function startReplay(input: {
  sourceConversacionId: string;
  promptVersionId: string;
}): Promise<{ id: string }> {
  const data = await adminFetch<{ ok: boolean; id: string }>(
    "/admin/replay/start",
    {
      method: "POST",
      json: input,
    },
  );
  return { id: data.id };
}

export async function fetchReplayRun(
  id: string,
): Promise<ReplayRunWithMessages> {
  const data = await adminFetch<{
    ok: boolean;
    run: ReplayRun;
    messages: ReplayMessage[];
  }>(`/admin/replay/${encodeURIComponent(id)}`, { method: "GET" });
  return { run: data.run, messages: data.messages ?? [] };
}

export async function fetchReplayRuns(
  conversacionId: string,
): Promise<ReplayRun[]> {
  const data = await adminFetch<{ ok: boolean; runs: ReplayRun[] }>(
    `/admin/replay?conversacionId=${encodeURIComponent(conversacionId)}`,
    { method: "GET" },
  );
  return data.runs ?? [];
}
