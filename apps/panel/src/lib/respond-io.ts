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
 * Apply a tag to a Respond.io contact by delegating to the server's
 * `/admin/apply-tag` endpoint.
 *
 * History: we used to call Respond.io's REST API directly from the panel,
 * first with `POST /contact/id:{id}/tag` (rejected with 400 "Tags: Cannot
 * be empty"), then with a GET+PUT merge on `/contact/id:{id}`. The PUT
 * variant returned 2xx in production but the tag did not actually land on
 * Miguel's contact 208082561 nor Tony's contact 445381935 — likely a
 * Next.js Server Action bundling / Vercel deploy interaction, since the
 * exact same GET+PUT pattern works from the server's `respondIoClient`.
 *
 * Owner spec DPM_AI_LAUNCH 2026-05-07 reply §1+§3: handoff is signaled
 * to Respond.io workflows via a contact tag (`deposit_paid` for sale
 * completion, `ai_escalation` for pre-deposit transfer). Miguel's
 * workflow "DPM GT - Onboarding Piloto" listens on `deposit_paid` and
 * dispatches assignments to the Round Robin team "Agents" (id 21595).
 *
 * Required env on the panel deployment (Vercel):
 *   • DPM_SERVER_URL          base URL of the Railway server (no trailing slash)
 *   • ADMIN_RESET_TOKEN       shared with the server's same-named env var
 */
export async function applyContactTag(
  respondIoContactId: string | null,
  tag: string,
): Promise<void> {
  if (!respondIoContactId) {
    throw new Error("respondIoContactId missing — cannot apply tag");
  }
  const baseUrl = process.env.DPM_SERVER_URL;
  const token = process.env.ADMIN_RESET_TOKEN;
  if (!baseUrl || !token) {
    throw new Error(
      "applyContactTag: DPM_SERVER_URL and ADMIN_RESET_TOKEN must be set in panel env",
    );
  }

  const url = `${baseUrl.replace(/\/+$/, "")}/admin/apply-tag`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ contactId: respondIoContactId, tag }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `apply-tag ${res.status}: ${body.slice(0, 200)}`,
      );
    }
  } finally {
    clearTimeout(timer);
  }
}
