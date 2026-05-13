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
 *
 * Implementation note (2026-05-13): we previously POSTed to the dedicated
 * `/contact/id:{id}/tag` endpoint with `{tags: [tag]}`. Respond.io v2
 * silently rejects that path with 400 "Tags: Cannot be empty" regardless
 * of body shape — Miguel hit this when clicking "Confirmar depósito" in
 * the panel and the deposit_paid tag never landed, which meant the
 * onboarding workflow never fired and the conversation was never
 * reassigned. Server's respond-io.ts confirmed the canonical path back
 * in May (Phase F probing).
 *
 * The working pattern (mirrored from apps/server/src/services/respond-io.ts
 * addContactTag):
 *   1. GET /contact/id:{id} to read the existing tags array
 *   2. Merge the new tag in (Set-dedupe so a re-apply is idempotent)
 *   3. PUT /contact/id:{id} with the FULL merged tags array
 *
 * Why the merge: PUT replaces the resource. Sending `{tags: ["deposit_paid"]}`
 * alone wipes ai-test (pilot gate) and any other contact tags. Workflows
 * trigger on the tag-update diff, so an unintended replacement also fails
 * to fire the "tag added: deposit_paid" trigger reliably.
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

  const contactUrl = `${baseUrl}/contact/id:${encodeURIComponent(respondIoContactId)}`;
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };

  // Step 1: GET existing tags. Best-effort: if the read fails (404,
  // network), we proceed with `[tag]` only. That risks dropping other
  // tags, but a failed-then-skipped tag application would be a worse
  // user-facing outcome (no onboarding workflow at all). Log/throw on
  // unrecoverable errors so the caller can persist them to `errores`.
  let existingTags: string[] = [];
  {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(contactUrl, {
        method: "GET",
        signal: controller.signal,
        headers,
      });
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { tags?: unknown }
          | null;
        if (data && Array.isArray(data.tags)) {
          existingTags = data.tags.filter(
            (t): t is string => typeof t === "string",
          );
        }
      } else if (res.status !== 404) {
        // 404 = contact gone (we'll fail loudly on the PUT below anyway).
        // Other non-2xx is suspicious — log via console so it shows up in
        // Vercel function logs, but keep going with empty existing tags.
        const body = await res.text().catch(() => "");
        console.warn(
          `respond_io get_contact non-2xx (${res.status}) before tag merge: ${body.slice(0, 200)}`,
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }
  const merged = Array.from(new Set([...existingTags, tag]));

  // Step 2: PUT the full merged tags array.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(contactUrl, {
      method: "PUT",
      signal: controller.signal,
      headers,
      body: JSON.stringify({ tags: merged }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`respond_io tag ${res.status}: ${body.slice(0, 200)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
