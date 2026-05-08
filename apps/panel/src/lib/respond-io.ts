// Minimal outbound Respond.io client for server actions in the panel.
// We don't pull undici (the panel is a Next.js app — global fetch is fine);
// the call surface is intentionally tiny (one method) to avoid drift with
// the server's own client at apps/server/src/services/respond-io.ts.
//
// Env vars are read lazily at call time so the dev panel can boot without
// them (panel-only flows like browsing prompts work without Respond.io).

export type SendMessageInput = {
  conversationId: string;
  text: string;
};

export async function sendRespondIoMessage(input: SendMessageInput): Promise<void> {
  const apiKey = process.env.RESPOND_IO_API_KEY;
  const baseUrl = process.env.RESPOND_IO_API_BASE_URL ?? "https://api.respond.io/v2";
  if (!apiKey) {
    throw new Error("RESPOND_IO_API_KEY missing — cannot send outbound message");
  }

  const url = `${baseUrl}/conversation/${encodeURIComponent(input.conversationId)}/message`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        message: { type: "text", text: input.text },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`respond_io ${res.status}: ${body.slice(0, 200)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Apply a tag to a Respond.io contact. Owner spec DPM_AI_LAUNCH
 * 2026-05-07 reply §1+§3: handoff is signaled to Respond.io workflows
 * via a contact tag (`deposit_paid` for sale completion, `ai_escalation`
 * for pre-deposit transfer). Miguel's workflow listens on the tag and
 * dispatches assignments to the Round Robin team "Agents" (id 21595).
 */
export async function applyContactTag(
  respondIoContactId: string | null,
  tag: string,
): Promise<void> {
  if (!respondIoContactId) {
    throw new Error("respondIoContactId missing — cannot apply tag");
  }
  const apiKey = process.env.RESPOND_IO_API_KEY;
  const baseUrl = process.env.RESPOND_IO_API_BASE_URL ?? "https://api.respond.io/v2";
  if (!apiKey) {
    throw new Error("RESPOND_IO_API_KEY missing — cannot apply contact tag");
  }
  const url = `${baseUrl}/contact/id:${encodeURIComponent(respondIoContactId)}/tag`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ tags: [tag] }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`respond_io tag ${res.status}: ${body.slice(0, 200)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
