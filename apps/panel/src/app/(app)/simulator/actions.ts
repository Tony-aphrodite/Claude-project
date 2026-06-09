"use server";

// Thin server-action wrappers around the Railway server's
// /admin/simulator/* endpoints. The Respond.io API key and the
// Anthropic key live only on the server; the panel just forwards
// auth'd HTTP calls.
//
// Per-user sede scoping: actions consult the user context and, when the
// caller is an office staffer (role=office), force the request to their
// assigned sede regardless of the inputs. This protects against a
// modified client bypassing the locked dropdown.

import { requireUserContext } from "~/lib/auth-context";

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

export type SimulatorSede = {
  id: string;
  nombre: string;
  pais: string;
  currencyCode: string;
};

export async function fetchSimulatorSedes(): Promise<SimulatorSede[]> {
  const data = await adminFetch<{ ok: boolean; sedes: SimulatorSede[] }>(
    "/admin/simulator/sedes",
    { method: "GET" },
  );
  return data.sedes ?? [];
}

export async function resetSimulatorSession(
  opts: { sedeId?: string } = {},
): Promise<{ conversacionId: string; sedeId: string }> {
  const user = await requireUserContext();
  // Office users always get their own sede — ignore any value coming in
  // from the (potentially-modified) client. Admins pass through unchanged.
  const sedeId =
    user.role === "office" ? user.sedeId ?? undefined : opts.sedeId;

  const data = await adminFetch<{
    ok: boolean;
    conversacionId: string;
    sedeId: string;
  }>("/admin/simulator/session", {
    method: "POST",
    json: sedeId ? { sedeId } : {},
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

// ── Phase 2 — sandbox OCR + rewind ────────────────────────────────────────
//
// Miguel rule 2026-06-09 PM: simulator runs against a sandbox copy of the
// roster. The panel can upload comprobantes through the same OCR path
// production uses (Vision → reconcile → confirmBooking) and reset the
// scenario between test runs.

export type SimulatorOcrResponse = {
  ok: true;
  verdict: unknown;
  bookings: Array<{
    fecha: string;
    turno: string;
    programa: string;
    pax: number;
    upgradedFromPending: boolean;
  }>;
  rowsConfirmed: number;
  message: string;
};

export async function uploadSimulatorOcr(input: {
  conversacionId: string;
  base64: string;
  mimeType: string;
  fileName?: string;
}): Promise<SimulatorOcrResponse> {
  return adminFetch<SimulatorOcrResponse>("/admin/simulator/ocr", {
    method: "POST",
    json: input,
  });
}

export async function rewindSimulatorSession(input: {
  conversacionId: string;
}): Promise<{ ok: true; deletedMessages: number; deletedBookings: number }> {
  return adminFetch<{
    ok: true;
    deletedMessages: number;
    deletedBookings: number;
  }>("/admin/simulator/reset", { method: "POST", json: input });
}

// ── Phase 3 — sandbox roster grid (Miguel 2026-06-09 PM) ─────────────────
//
// Editable 15-day grid embedded next to the chat. Operator can sculpt
// arbitrary occupancy boards to test the AI's multi-day availability
// logic (e.g. fill day N+1, leave N and N+2 free → OW starting N must
// be rejected because day N+1 is full).

export type SandboxRosterRow = {
  fecha: string; // YYYY-MM-DD
  turno: string; // AM | PM | Nocturno | ConfinadasAM | ConfinadasPM
  capacidad: number;
  reservado: number;
  disponible: number;
};

export async function fetchSimulatorRoster(input: {
  sedeId: string;
  fromDate: string;
  days?: number;
}): Promise<{ rows: SandboxRosterRow[]; fromDate: string; days: number }> {
  const days = input.days ?? 15;
  const q = new URLSearchParams({
    sedeId: input.sedeId,
    fromDate: input.fromDate,
    days: String(days),
  }).toString();
  const data = await adminFetch<{
    ok: boolean;
    sedeId: string;
    fromDate: string;
    days: number;
    rows: SandboxRosterRow[];
  }>(`/admin/simulator/roster?${q}`, { method: "GET" });
  return { rows: data.rows, fromDate: data.fromDate, days: data.days };
}

export async function setSimulatorRosterCell(input: {
  sedeId: string;
  fecha: string;
  turno: string;
  pax: number;
}): Promise<{ ok: true; cleared: number; inserted: boolean; pax: number }> {
  return adminFetch<{ ok: true; cleared: number; inserted: boolean; pax: number }>(
    "/admin/simulator/roster/set-cell",
    { method: "POST", json: input },
  );
}

export async function resetSimulatorRosterGrid(input: {
  sedeId: string;
}): Promise<{ ok: true; cleared: number }> {
  return adminFetch<{ ok: true; cleared: number }>(
    "/admin/simulator/roster/reset",
    { method: "POST", json: input },
  );
}
