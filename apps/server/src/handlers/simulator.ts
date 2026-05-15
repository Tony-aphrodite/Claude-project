// ============================================================================
// Simulator handler (Phase 1, 2026-05-14, Miguel spec).
//
// Lets Miguel chat with John from the panel as a fake client so he can
// iterate the system prompt without burning a real WhatsApp lead and
// without polluting the production dashboard metrics.
//
// Differences from processIncomingMessage (the real-customer handler):
//   • No Respond.io webhook in front — invoked from the panel via
//     /admin/simulator/message, bearer-auth'd.
//   • No outbound Respond.io sendMessage / customField update /
//     lifecycle webhook fire / tag apply.
//   • No pilot gate / ai-test tag check (auth is the gate).
//   • No follow-up scheduling.
//   • Tools (consultar_disponibilidad, solicitar_deposito, enviar_catalogo)
//     are STUBBED — they return realistic-shape responses so Claude can
//     reason about them, but they don't hit Apps Script, don't generate
//     real ref codes, don't call the Respond.io catalog API. Side-effect-
//     free.
//   • conversaciones + mensajes rows are written with origin='simulator'
//     so the dashboard / lifecycle webhook code filters them out.
//
// Public API:
//   • createSimulatorSession({sedeId?}) -> {conversacionId, sedeId}
//   • runSimulatorMessage({conversacionId, text, promptVersionId?})
//       -> {aiText, sources, toolCalls, costUsd, ...}
//   • listSimulatorPromptVersions() -> prompt version list
//
// The 2-row chat_contact + conversaciones bootstrapping (synthetic
// identifiers, fixed simulator-shared contact) keeps the schema's FKs
// satisfied without faking real contact data.
// ============================================================================

import { randomUUID } from "node:crypto";

import { and, asc, desc, eq } from "drizzle-orm";

import {
  chatContacts,
  conversaciones,
  getDb,
  mensajes,
  promptsVersiones,
  sedes,
  simulatorSessions,
} from "@dpm/db";
import type { Sede } from "@dpm/db";
import type {
  ConsultarDisponibilidadResult,
  EnviarCatalogoResult,
  SendProductCardResult,
  SolicitarDepositoResult,
} from "@dpm/shared";

import { callClaude, type ToolHandlers } from "../services/anthropic.js";
import { promptsService } from "../services/prompts.js";
import { buildFourBlockPrompt } from "../services/prompt-builder.js";
import { getLogger } from "../logger.js";

// The synthetic chat_contact every simulator session points at. We use a
// single shared contact so we don't litter chat_contacts with one row
// per session. The FK still resolves and the row never represents a
// real person — phone/name make that obvious to anyone querying.
const SIMULATOR_CONTACT_ID = "simulator-shared";
const SIMULATOR_CONTACT_PHONE = "+00-simulator-00";
const SIMULATOR_CONTACT_NAME = "Simulator (panel test)";

/** Ensure the shared simulator chat_contact exists. Idempotent. */
async function ensureSimulatorContact(): Promise<void> {
  const db = getDb();
  const [existing] = await db
    .select({ id: chatContacts.respondIoContactId })
    .from(chatContacts)
    .where(eq(chatContacts.respondIoContactId, SIMULATOR_CONTACT_ID))
    .limit(1);
  if (existing) return;
  await db
    .insert(chatContacts)
    .values({
      respondIoContactId: SIMULATOR_CONTACT_ID,
      name: SIMULATOR_CONTACT_NAME,
      phone: SIMULATOR_CONTACT_PHONE,
      language: "es",
    })
    .onConflictDoNothing();
}

async function loadSede(sedeId: string): Promise<Sede | null> {
  const db = getDb();
  const [s] = await db.select().from(sedes).where(eq(sedes.id, sedeId)).limit(1);
  return s ?? null;
}

async function loadDefaultGtSede(): Promise<Sede | null> {
  // Fallback when caller didn't specify a sede: pick the GT row by name
  // (only sede with active AI pilot as of 2026-05-14).
  const db = getDb();
  const [s] = await db
    .select()
    .from(sedes)
    .where(eq(sedes.nombre, "Gili Trawangan"))
    .limit(1);
  return s ?? null;
}

/**
 * Create a new simulator session: inserts a `conversaciones` row with
 * origin='simulator' pointing at the shared simulator contact. Returns
 * the new conversacion id which the panel page uses as its session
 * handle.
 */
export async function createSimulatorSession(input: {
  sedeId?: string;
}): Promise<{ conversacionId: string; sedeId: string }> {
  await ensureSimulatorContact();
  const sede = input.sedeId
    ? await loadSede(input.sedeId)
    : await loadDefaultGtSede();
  if (!sede) {
    throw new Error(
      "simulator: no sede available — pass sedeId or seed a Gili Trawangan row",
    );
  }
  const db = getDb();
  const synthConversationId = `simulator-conv-${randomUUID()}`;
  const [row] = await db
    .insert(conversaciones)
    .values({
      respondIoConversationId: synthConversationId,
      respondIoContactId: SIMULATOR_CONTACT_ID,
      sedeId: sede.id,
      status: "active",
      leadStage: "new",
      origin: "simulator",
    })
    .returning({ id: conversaciones.id });
  if (!row) {
    throw new Error("simulator: insert returned no row");
  }
  return { conversacionId: row.id, sedeId: sede.id };
}

/** Load the prompt to use for this turn. If the panel asked for a
 *  specific `prompts_versiones.id`, return its content; otherwise fall
 *  back to the active prompt for the sede (same path the production
 *  handler takes). */
async function loadPromptForSimulator(
  sede: Sede,
  promptVersionId: string | undefined,
): Promise<{ text: string; versionId: string | null }> {
  if (promptVersionId) {
    const db = getDb();
    const [v] = await db
      .select()
      .from(promptsVersiones)
      .where(eq(promptsVersiones.id, promptVersionId))
      .limit(1);
    if (v && typeof v.content === "string" && v.content.length > 0) {
      return { text: v.content, versionId: v.id };
    }
    getLogger().warn(
      { promptVersionId },
      "simulator: requested promptVersionId not found — falling back to active",
    );
  }
  const { content, version } = await promptsService.loadSystemPrompt(sede);
  return { text: content, versionId: version?.id ?? null };
}

/** Stub the production tools so the simulator can show how John reacts
 *  to a tool call without producing real side effects. Each stub returns
 *  a minimally-valid result of the production type so callClaude's
 *  downstream logic doesn't choke. */
function buildStubbedToolHandlers(): ToolHandlers {
  return {
    consultar_disponibilidad: async (
      input,
    ): Promise<ConsultarDisponibilidadResult> => {
      // Simulator-mode availability: always assume the requested day +
      // course is available. Realistic enough that the prompt flows
      // normally; the operator iterating the prompt isn't trying to
      // validate Apps Script — they're testing wording.
      const startDate = input.start_date;
      return {
        ok: true,
        programa: input.programa,
        startDate,
        available: true,
        slots: [
          { date: startDate, slot: "AM", available: true, espacios: 8 },
          { date: startDate, slot: "PM", available: true, espacios: 8 },
        ],
        notes: "[simulator stub — disponibilidad asumida OK]",
      };
    },
    solicitar_deposito: async (input): Promise<SolicitarDepositoResult> => {
      const ref = `DPM-SIM-${randomUUID().slice(0, 8).toUpperCase()}`;
      const monto = input.moneda_cliente === "IDR" ? 700_000 : 40;
      const pax = input.pax ?? 1;
      return {
        ok: true,
        ref_code: ref,
        monto,
        monto_total: monto * pax,
        pax,
        moneda: input.moneda_cliente,
        instrucciones:
          "[simulator stub] Transferencia ficticia a una cuenta de prueba. " +
          "Ref: " + ref + ". No corresponde a un pago real.",
        requires_human_verification: true,
        reused_existing: false,
      };
    },
    enviar_catalogo: async (input): Promise<EnviarCatalogoResult> => {
      return {
        ok: true,
        sent: true,
        programa: input.programa,
        catalogRef: "simulator-stub",
      };
    },
    // Colomba/GA — stub the Meta product card send so the prompt flow
    // doesn't trip. We assume allowlist + delivery success unconditionally
    // (the operator iterating the prompt isn't validating Meta).
    send_product_card: async (input): Promise<SendProductCardResult> => {
      const ids = Array.isArray(input.card_id) ? input.card_id : [input.card_id];
      return { ok: true, sent: ids };
    },
  };
}

/**
 * Drive one turn of a simulator conversation: append the client message,
 * call Claude with the chosen prompt + stubbed tools, append John's
 * reply, return the surface for the panel UI.
 */
export async function runSimulatorMessage(input: {
  conversacionId: string;
  text: string;
  promptVersionId?: string | undefined;
}): Promise<{
  aiText: string;
  sources: string[];
  toolCalls: string[];
  costUsd: number;
  latencyMs: number;
  model: string;
  promptVersionId: string | null;
  escalationReason: string | null;
}> {
  const db = getDb();
  const log = getLogger();

  const [conv] = await db
    .select()
    .from(conversaciones)
    .where(
      and(
        eq(conversaciones.id, input.conversacionId),
        eq(conversaciones.origin, "simulator"),
      ),
    )
    .limit(1);
  if (!conv) {
    throw new Error(
      "simulator: conversation not found or not a simulator session",
    );
  }
  const sede = await loadSede(conv.sedeId);
  if (!sede) {
    throw new Error(`simulator: sede ${conv.sedeId} not found`);
  }

  // 1. Persist the client message (origin='simulator').
  await db.insert(mensajes).values({
    conversacionId: conv.id,
    sender: "cliente",
    content: input.text,
    origin: "simulator",
  });

  // 2. Load the prompt (specific version, or active default) + KB.
  const prompt = await loadPromptForSimulator(sede, input.promptVersionId);
  const kbText = await promptsService.loadSedeKb(sede);

  // 3. Pull message history for this session in order (excludes the
  //    message we just inserted — Bloque 4 carries the current msg).
  const allHistory = await db
    .select()
    .from(mensajes)
    .where(eq(mensajes.conversacionId, conv.id))
    .orderBy(asc(mensajes.createdAt));
  // Drop the last row (the one we just inserted) so Bloque 3 = prior
  // turns only, Bloque 4 = current msg. Matches the production
  // handler's contract.
  const priorHistory = allHistory.slice(0, -1);

  // 4. Build the 4-block prompt.
  const built = buildFourBlockPrompt({
    systemPrompt: prompt.text,
    sedeKb: kbText,
    history: priorHistory,
    sede,
    roster: null, // simulator: no real availability lookup
    incomingMessage: input.text,
    detectedLanguage: "es",
    suggestedCurrency: "EUR",
  });

  // 5. Call Claude with stubbed tools.
  const toolHandlers = buildStubbedToolHandlers();
  const result = await callClaude({
    system: built.system,
    messages: built.messages,
    conversacionId: conv.id,
    sedeId: sede.id,
    promptVersionId: prompt.versionId ?? undefined,
    toolHandlers,
    expectedLanguage: "español",
    incomingMessage: input.text,
  });

  // 6. Persist John's reply (origin='simulator').
  await db.insert(mensajes).values({
    conversacionId: conv.id,
    sender: "ai",
    content: result.text,
    fuentes: result.fuentes,
    metadata: {
      synthetic: false,
      toolCalls: result.toolCalls,
      costUsd: result.cost.totalUsd,
      model: result.model,
      latencyMs: result.latencyMs,
      escalationReason: result.escalationReason,
    },
    origin: "simulator",
  });

  log.info(
    {
      conversacionId: conv.id,
      promptVersionId: prompt.versionId,
      toolCalls: result.toolCalls,
      costUsd: result.cost.totalUsd,
      latencyMs: result.latencyMs,
    },
    "simulator turn ok",
  );

  return {
    aiText: result.text,
    sources: result.fuentes,
    toolCalls: result.toolCalls,
    costUsd: result.cost.totalUsd,
    latencyMs: result.latencyMs,
    model: result.model,
    promptVersionId: prompt.versionId,
    escalationReason: result.escalationReason,
  };
}

/**
 * List available prompt versions for the panel's selector. Today we
 * return all rows of type "system" ordered by version_number desc; the
 * UI shows the active one with a badge.
 */
export async function listSimulatorPromptVersions(): Promise<
  Array<{
    id: string;
    versionNumber: number;
    sedeId: string | null;
    active: boolean;
    createdAt: Date;
  }>
> {
  const db = getDb();
  const rows = await db
    .select()
    .from(promptsVersiones)
    .where(eq(promptsVersiones.type, "system"))
    .orderBy(desc(promptsVersiones.versionNumber));
  return rows.map((r) => ({
    id: r.id,
    versionNumber: r.versionNumber,
    sedeId: r.sedeId,
    active: r.active,
    createdAt: r.createdAt,
  }));
}

/**
 * List sedes available for the panel's sede selector. Returns the
 * minimal shape the dropdown needs (id + nombre + currency for
 * display). Used by the simulator UI to let an operator pick which
 * sede / which AI persona they want to test against.
 */
export async function listSimulatorSedes(): Promise<
  Array<{ id: string; nombre: string; pais: string; currencyCode: string }>
> {
  const db = getDb();
  const rows = await db
    .select({
      id: sedes.id,
      nombre: sedes.nombre,
      pais: sedes.pais,
      currencyCode: sedes.currencyCode,
    })
    .from(sedes)
    .orderBy(sedes.nombre);
  return rows;
}

/**
 * Load message history for a simulator session — used by the panel
 * page to render the chat surface on load / refresh.
 *
 * `fuentes` (the AI's declared citations) is selected explicitly because
 * Miguel asked for "texto + fuentes + tools invocadas" on every AI
 * bubble — without this we'd render John's reply without the cited
 * sources beneath it.
 */
export async function loadSimulatorHistory(
  conversacionId: string,
): Promise<
  Array<{
    id: string;
    sender: string;
    content: string;
    fuentes: unknown;
    metadata: unknown;
    createdAt: Date;
  }>
> {
  const db = getDb();
  return db
    .select({
      id: mensajes.id,
      sender: mensajes.sender,
      content: mensajes.content,
      fuentes: mensajes.fuentes,
      metadata: mensajes.metadata,
      createdAt: mensajes.createdAt,
    })
    .from(mensajes)
    .where(eq(mensajes.conversacionId, conversacionId))
    .orderBy(asc(mensajes.createdAt));
}

// ── Phase 1.5: saved sessions ─────────────────────────────────────────────
//
// A saved session is a labelled bookmark to a simulator conversaciones
// row + the prompt version that was active at save time. Loading a
// session re-points the panel page to that conversation; the messages
// themselves were never copied (they live on the original conversaciones/
// mensajes rows with origin='simulator'). Idempotent re-save just
// updates the existing row by name.

export async function listSimulatorSessions(): Promise<
  Array<{
    id: string;
    name: string;
    conversacionId: string;
    promptVersionId: string | null;
    createdBy: string | null;
    notes: string | null;
    createdAt: Date;
  }>
> {
  const db = getDb();
  return db
    .select()
    .from(simulatorSessions)
    .orderBy(desc(simulatorSessions.createdAt));
}

export async function saveSimulatorSession(input: {
  name: string;
  conversacionId: string;
  promptVersionId?: string | null;
  createdBy?: string | null;
  notes?: string | null;
}): Promise<{ id: string }> {
  if (!input.name.trim()) {
    throw new Error("simulator: session name is required");
  }
  const db = getDb();

  // Verify the conversacion exists and is a simulator one.
  const [conv] = await db
    .select({ id: conversaciones.id, origin: conversaciones.origin })
    .from(conversaciones)
    .where(eq(conversaciones.id, input.conversacionId))
    .limit(1);
  if (!conv) {
    throw new Error("simulator: conversation not found");
  }
  if (conv.origin !== "simulator") {
    throw new Error(
      "simulator: cannot save a non-simulator conversation as a session",
    );
  }

  const [row] = await db
    .insert(simulatorSessions)
    .values({
      name: input.name.trim(),
      conversacionId: input.conversacionId,
      promptVersionId: input.promptVersionId ?? null,
      createdBy: input.createdBy ?? null,
      notes: input.notes ?? null,
    })
    .returning({ id: simulatorSessions.id });
  if (!row) throw new Error("simulator: session insert returned no row");
  return { id: row.id };
}

export async function deleteSimulatorSession(id: string): Promise<void> {
  const db = getDb();
  await db.delete(simulatorSessions).where(eq(simulatorSessions.id, id));
}
