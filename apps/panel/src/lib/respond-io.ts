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
