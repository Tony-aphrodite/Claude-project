// ============================================================================
// Saved responses — Miguel 2026-06-12 resilience layer #7.
//
// One action today: `saveAiResponseAsTemplate`. Fed by an inline form
// rendered next to each AI bubble on /conversations/[id]. The form
// captures:
//
//   - name      → short label the operator will see in the quick-reply
//                 picker (#6, future).
//   - tags      → CSV string; we parse + trim + dedupe on save.
//   - scope     → "general" (sede_id NULL) | "sede" (sede_id = the
//                 conversation's sede). Default "general" because the
//                 most reusable replies are universal; sede-scoped is
//                 the opt-in.
//   - includePrompt → boolean; when true, also captures the most
//                 recent cliente message before the AI reply as the
//                 prompt_text (the question that triggered the reply).
//   - source    → mensajeId + conversacionId (hidden, for audit).
//
// We DON'T:
//   - duplicate-check by text (operators may want slight variants).
//   - auto-tag based on content (out of scope; tagging is human work).
//   - touch lead_metadata / lead_stage (this is a library curation
//     action, not a conversation state change).
// ============================================================================

"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  conversaciones,
  getDb,
  mensajes,
  savedResponses,
} from "@dpm/db";

import { requireSedeWriteAccess } from "~/lib/auth-context";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return { ok: false, error: message };
  }
}

/**
 * Parse the operator's CSV tag input.
 *
 * "objecion_precio, curso ow ,  precios" →
 *   ["objecion_precio", "curso ow", "precios"]
 *
 * Trim each segment, drop blanks, normalise repeated separators, cap
 * at 20 tags (well above any reasonable use; protects against runaway
 * paste).
 */
function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 20);
}

const MAX_NAME_LENGTH = 80;
const MAX_TAG_LENGTH = 40;
const MAX_RESPONSE_LENGTH = 8192; // generous; AI replies are usually < 2k

export async function saveAiResponseAsTemplate(
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const conversacionId = String(formData.get("conversacionId") ?? "").trim();
    const mensajeId = String(formData.get("mensajeId") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const tagsRaw = String(formData.get("tags") ?? "").trim();
    const scopeRaw = String(formData.get("scope") ?? "general");
    const includePrompt = String(formData.get("include_prompt") ?? "") === "true";

    if (!conversacionId) throw new Error("conversacionId requerido");
    if (!mensajeId) throw new Error("mensajeId requerido");
    if (name.length === 0) {
      throw new Error("Ponele un nombre corto a la respuesta para identificarla después.");
    }
    if (name.length > MAX_NAME_LENGTH) {
      throw new Error(
        `El nombre es muy largo (${name.length}). Máximo ${MAX_NAME_LENGTH} caracteres.`,
      );
    }
    if (scopeRaw !== "general" && scopeRaw !== "sede") {
      throw new Error("scope debe ser 'general' o 'sede'");
    }

    const tags = parseTags(tagsRaw);
    for (const t of tags) {
      if (t.length > MAX_TAG_LENGTH) {
        throw new Error(
          `El tag "${t.slice(0, 20)}…" es muy largo. Máximo ${MAX_TAG_LENGTH} caracteres por tag.`,
        );
      }
    }

    const db = getDb();
    const [conv] = await db
      .select({
        id: conversaciones.id,
        sedeId: conversaciones.sedeId,
      })
      .from(conversaciones)
      .where(eq(conversaciones.id, conversacionId))
      .limit(1);
    if (!conv) throw new Error("Conversación no encontrada");

    // Auth check: same gate as roster actions — admin OR matching-sede
    // office. Office users can't curate a library row attached to a
    // sede they don't manage.
    const ctx = await requireSedeWriteAccess(conv.sedeId);

    // Load the AI message + (optionally) the most recent cliente
    // message before it. Doing both in one read so we make one trip
    // even when includePrompt is true.
    const [aiMsg] = await db
      .select({
        id: mensajes.id,
        content: mensajes.content,
        sender: mensajes.sender,
        createdAt: mensajes.createdAt,
      })
      .from(mensajes)
      .where(eq(mensajes.id, mensajeId))
      .limit(1);
    if (!aiMsg) throw new Error("Mensaje no encontrado");
    if (aiMsg.sender !== "ai") {
      throw new Error(
        "Solo se pueden guardar respuestas de la AI (sender='ai').",
      );
    }
    if (aiMsg.content.length > MAX_RESPONSE_LENGTH) {
      throw new Error(
        `La respuesta es excepcionalmente larga (${aiMsg.content.length} caracteres). No se puede guardar.`,
      );
    }

    let promptText: string | null = null;
    if (includePrompt) {
      // Most recent cliente message strictly before this AI message in
      // the same conversation. The (conversacion_id, created_at) index
      // covers the read; conversations average < 50 rows so we just
      // fetch the projection and walk backward in JS.
      const all = await db
        .select({
          content: mensajes.content,
          sender: mensajes.sender,
          createdAt: mensajes.createdAt,
        })
        .from(mensajes)
        .where(eq(mensajes.conversacionId, conversacionId))
        .orderBy(mensajes.createdAt);
      for (let i = all.length - 1; i >= 0; i--) {
        const r = all[i]!;
        if (r.createdAt >= aiMsg.createdAt) continue;
        if (r.sender === "cliente") {
          promptText = r.content.slice(0, 4096);
          break;
        }
      }
    }

    const sedeId = scopeRaw === "sede" ? conv.sedeId : null;

    await db.insert(savedResponses).values({
      sedeId,
      name,
      responseText: aiMsg.content,
      promptText,
      tags,
      language: "es", // TODO: derive from conversation when language detection lands here
      createdByUserId: ctx.userId,
      createdByLabel: ctx.email,
      sourceConversacionId: conversacionId,
      sourceMensajeId: mensajeId,
    });

    revalidatePath(`/conversations/${conversacionId}`);
  });
}
