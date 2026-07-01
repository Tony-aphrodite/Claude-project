// ============================================================================
// Panel action: send an internal note to the AI (Steve 2026-07-01).
//
// The operator writes instructions FOR the AI (not for the customer) in the
// composer, hits "Instruir a la AI", and:
//
//   1. A `sender='internal_note'` row is inserted into `mensajes` so the
//      note shows up in the conversation timeline for audit.
//   2. The note is queued on `lead_metadata.pending_internal_notes` — same
//      shape / storage the Respond.io @-mention flow uses (see
//      apps/server/src/handlers/internal-note.ts). The next AI turn reads
//      the queue and injects the note into the system prompt.
//   3. We POST to the server's `/admin/conversations/<id>/reroll` endpoint
//      to fire the AI turn immediately — the operator wants the AI to
//      answer the last customer message NOW, guided by the note, not
//      whenever the customer happens to send another message.
//
// Key difference vs. `sendOperatorMessage`:
//   - sendOperatorMessage → goes to WhatsApp + flips human_took_over=true
//     (operator is taking over, AI silenced).
//   - sendInternalNoteToAi → NEVER touches WhatsApp; leaves the AI
//     assignee alone so it can respond right after. Human doesn't take
//     over — this is a co-pilot flow, not a takeover.
//
// Both are gated by requireSedeWriteAccess (admin, matching-sede office,
// or cross-sede oficina all pass; other-sede office is blocked).
// ============================================================================

"use server";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { conversaciones, getDb, mensajes } from "@dpm/db";
import type { LeadMetadata } from "@dpm/shared";

import { requireSedeWriteAccess } from "~/lib/auth-context";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

const MAX_NOTE_LENGTH = 2000;

async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return { ok: false, error: message };
  }
}

export async function sendInternalNoteToAi(
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const conversacionId = String(formData.get("conversacionId") ?? "").trim();
    const text = String(formData.get("text") ?? "").trim();

    if (!conversacionId) {
      throw new Error("conversacionId requerido");
    }
    if (text.length === 0) {
      throw new Error("La nota está vacía. Escribí una instrucción antes de enviar.");
    }
    if (text.length > MAX_NOTE_LENGTH) {
      throw new Error(
        `La nota es muy larga (${text.length} caracteres). El máximo es ${MAX_NOTE_LENGTH}.`,
      );
    }

    const db = getDb();
    const [conv] = await db
      .select({
        id: conversaciones.id,
        sedeId: conversaciones.sedeId,
        leadMetadata: conversaciones.leadMetadata,
      })
      .from(conversaciones)
      .where(eq(conversaciones.id, conversacionId))
      .limit(1);
    if (!conv) {
      throw new Error("Conversación no encontrada");
    }
    const ctx = await requireSedeWriteAccess(conv.sedeId);

    // 1) Persist the note in `mensajes` for audit — same shape the
    //    Respond.io @-mention path uses. sender="internal_note".
    const noteId = randomUUID();
    await db.insert(mensajes).values({
      conversacionId: conv.id,
      sender: "internal_note",
      agenteName: ctx.email,
      content: text,
      metadata: {
        source: "panel_composer",
        note_id: noteId,
        by: ctx.email,
      },
    });

    // 2) Append to the pending_internal_notes queue on the conversation.
    //    Read-modify-write; no explicit lock — the server's message
    //    processor holds withConversationLock during AI turns, so a note
    //    arriving DURING an AI generation lands AFTER the consume,
    //    matching the Respond.io path's semantics exactly.
    const oldMeta = (conv.leadMetadata as LeadMetadata | null) ?? {};
    const oldNotes = oldMeta.pending_internal_notes ?? [];
    const newMeta: LeadMetadata = {
      ...oldMeta,
      pending_internal_notes: [
        ...oldNotes,
        {
          id: noteId,
          text,
          by: ctx.email,
          at: new Date().toISOString(),
          // No mentioned_ai_id here — the panel note doesn't route via
          // Respond.io users; the destination AI is the sede's default.
          mentioned_ai_id: null,
        },
      ],
    };
    await db
      .update(conversaciones)
      .set({ leadMetadata: newMeta, updatedAt: new Date() })
      .where(eq(conversaciones.id, conv.id));

    // 3) Fire the AI turn immediately so the operator sees the effect
    //    of the note without waiting for the customer's next message.
    //    Non-blocking: if the reroll endpoint hiccups, the note is
    //    already queued and will still fire on the next inbound.
    const baseUrl = process.env.DPM_SERVER_URL;
    const token = process.env.ADMIN_RESET_TOKEN;
    if (baseUrl && token) {
      const url = `${baseUrl.replace(/\/+$/, "")}/admin/conversations/${encodeURIComponent(conv.id)}/reroll`;
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
        });
        if (!res.ok) {
          // Non-fatal — the note is queued. Log via thrown error so
          // ActionForm surfaces the message; operator can retry the
          // trigger via the existing "Re-roll AI" button.
          const body = await res.text().catch(() => "");
          throw new Error(
            `Nota guardada, pero el disparo inmediato falló (${res.status}). Se ejecutará cuando el cliente escriba de nuevo, o podés apretar "Re-roll AI ahora" en Herramientas.`,
          );
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") {
          throw new Error(
            "Nota guardada, pero el disparo tardó más de 8s. Se ejecutará cuando el cliente escriba de nuevo.",
          );
        }
        // Re-throw with a friendly message if it's not already ours.
        if (
          err instanceof Error &&
          err.message.startsWith("Nota guardada")
        ) {
          throw err;
        }
        throw new Error(
          `Nota guardada, pero no pude disparar la AI: ${
            err instanceof Error ? err.message : "desconocido"
          }`,
        );
      } finally {
        clearTimeout(timer);
      }
    }

  });
}
