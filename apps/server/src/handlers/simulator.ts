// ============================================================================
// Simulator handler. Lets Miguel chat with the AI from the panel as a fake
// client to iterate the system prompt + test end-to-end flows without
// burning a real WhatsApp lead.
//
// Production-parity sandbox (Miguel rule 2026-06-09 PM, "que el simulador
// haga lo mismo que va a hacer cuando este en produccion real"):
//   • Tool handlers now run REAL logic — not stubs.
//   • Roster reads/writes go to `roster_bookings_sandbox` (NOT the
//     production `roster_bookings`), threaded via `{sandbox: true}`
//     through rosterDbService. Capacity blocks (weather/charter/festivo)
//     from production are IGNORED so test scenarios run against clean
//     sede defaults.
//   • OCR uploads land on /admin/simulator/ocr which calls the SAME
//     `runOcrOnAttachment` + `rosterDbService.confirmBooking` path the
//     production webhook uses, only with sandbox routing.
//   • Reset endpoint /admin/simulator/reset clears the sandbox table for
//     this conversation + rewinds the lead stage so an operator can run a
//     fresh scenario without restarting the server.
//
// What still differs from `processIncomingMessage`:
//   • No Respond.io outbound calls (sendMessage / customField update /
//     tags / lifecycle webhook). The simulator-shared contact is
//     synthetic — pushing to Respond.io would either no-op or error.
//   • No follow-up scheduling.
//   • No pilot gate / ai-test tag check (auth is the gate).
//   • conversaciones + mensajes rows are written with origin='simulator'
//     so the dashboard / lifecycle webhook code filters them out.
//
// Public API:
//   • createSimulatorSession({sedeId?}) -> {conversacionId, sedeId}
//   • runSimulatorMessage({conversacionId, text, promptVersionId?})
//       -> {aiText, sources, toolCalls, costUsd, ...}
//   • runSimulatorOcr({conversacionId, base64, mimeType, fileName})
//       -> {verdict, confirmedBookings}
//   • resetSimulatorSession({conversacionId}) -> {ok: true}
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
  rosterBookingsSandbox,
  sedes,
  simulatorSessions,
} from "@dpm/db";
import type { Sede } from "@dpm/db";
import {
  depositAmountFor,
  type AvailabilityProgram,
  type ConsultarDisponibilidadInput,
  type ConsultarDisponibilidadResult,
  type DepositCurrency,
  type EnviarCatalogoInput,
  type EnviarCatalogoResult,
  type LeadMetadata,
  type SendProductCardInput,
  type SendProductCardResult,
  type SolicitarDepositoInput,
  type SolicitarDepositoResult,
  type TurnoKey,
} from "@dpm/shared";

import { callClaude, type ToolHandlers } from "../services/anthropic.js";
import {
  describeMissingCatalog,
  getCatalogEntry,
} from "../services/catalog-registry.js";
import {
  buildPaymentInstructions,
  sedeHasAutomaticGateway,
  type SedeKey,
} from "../services/deposit-instructions.js";
import { detectLanguage } from "../services/language.js";
import { leadStageService } from "../services/lead-stage.js";
import {
  ExpectedDeposit,
  runOcrOnAttachment,
  type OcrVerdict,
} from "../services/ocr-comprobante.js";
import {
  addDays,
  getRequiredSlots,
  maxDayOffset,
} from "../services/program-schedule.js";
import { buildFourBlockPrompt } from "../services/prompt-builder.js";
import { promptsService } from "../services/prompts.js";
import { rosterDbService } from "../services/roster-db.js";
import {
  ALT_SCAN_DAYS_FORWARD,
  buildDetalleMap,
  findVerifiedAlternativeStartDates,
  validateRequiredSlots,
} from "../services/slot-validator.js";
import {
  generateRefCode,
  isValidRefCode,
} from "../tools/solicitar-deposito.js";
import { validateProductCardIds } from "../tools/send-product-card.js";
import { getLogger } from "../logger.js";

/** Local copy of process-message's WITA-today helper — small enough to
 *  inline rather than export from that 3k-line module. */
function wITAYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

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

/** Production-parity tool handlers routed to the sandbox roster table.
 *
 * Mirrors `process-message.ts` handler logic but:
 *   • `{sandbox: true}` is threaded through every rosterDbService call so
 *     reads/writes hit `roster_bookings_sandbox` instead of production.
 *   • All Respond.io outbound calls are SKIPPED (the simulator-shared
 *     contact is synthetic — pushing custom fields / catalog payloads
 *     would error or no-op).
 *   • `leadStageService` transitions still run on the simulator's
 *     conversaciones row so the deposit handler can read the
 *     `proposed`-stage `leadMetadata` (programa, start_date,
 *     required_slots) that consultar_disponibilidad stamped, exactly
 *     like production.
 */
function buildSandboxToolHandlers(input: {
  sede: Sede;
  conversation: { id: string; leadMetadata: unknown; sedeId: string };
  contactId: string;
  detectedLanguage: string | undefined;
}): ToolHandlers {
  const { sede, conversation, contactId } = input;
  const log = getLogger();
  const sandbox = { sandbox: true } as const;

  const reloadLeadMetadata = async (): Promise<LeadMetadata> => {
    const db = getDb();
    const [row] = await db
      .select({ leadMetadata: conversaciones.leadMetadata })
      .from(conversaciones)
      .where(eq(conversaciones.id, conversation.id))
      .limit(1);
    return (row?.leadMetadata as LeadMetadata | null) ?? {};
  };

  const consultarDisponibilidadHandler = async (
    toolInput: ConsultarDisponibilidadInput,
  ): Promise<ConsultarDisponibilidadResult> => {
    const required = getRequiredSlots(toolInput.programa, toolInput.fundive_slot);
    if (!required) {
      return {
        ok: false,
        reason: "program_not_scheduled",
        message: `${toolInput.programa} no tiene un patrón de barco definido — derivar a humano para confirmar disponibilidad.`,
      };
    }

    // Programs without boat capacity (e.g. ReactRight, theory-only).
    if (required.length === 0) {
      void leadStageService
        .transition({
          conversacionId: conversation.id,
          to: "proposed",
          by: "ai",
          note: `[sim] consultar_disponibilidad ${toolInput.programa} ${toolInput.start_date} (no boat)`,
          metadataPatch: {
            programa: toolInput.programa,
            start_date: toolInput.start_date,
            pax: toolInput.pax,
          },
        })
        .catch(() => {});
      return {
        ok: true,
        programa: toolInput.programa,
        startDate: toolInput.start_date,
        available: true,
        slots: [],
        notes:
          "Programa sin requerimiento de barco — cualquier fecha funciona, confirmá horario con la sede.",
      };
    }

    const baseWindow = maxDayOffset(required) + 1;
    const windowDays = baseWindow + ALT_SCAN_DAYS_FORWARD;
    const fresh = await rosterDbService
      .fetchAvailability(sede.id, { date: toolInput.start_date, days: windowDays }, sandbox)
      .catch((err) => {
        log.warn(
          { err: (err as Error).message, sede: sede.nombre },
          "[sim] roster_db fetchAvailability failed",
        );
        return null;
      });
    if (!fresh) {
      return {
        ok: false,
        reason: "timeout",
        message:
          "El sistema de disponibilidad sandbox no respondió. Reintentá en unos segundos.",
      };
    }

    const detalleByDate = buildDetalleMap(fresh);
    const todayWitaStr = wITAYmd();
    const validation = validateRequiredSlots({
      required,
      detalleByDate,
      horaActualWita: fresh.hora_actual_wita,
      todayWitaStr,
      startDate: toolInput.start_date,
      pax: toolInput.pax,
    });
    const { slots, allAvailable } = validation;

    const verifiedAlternativeStartDates = allAvailable
      ? []
      : findVerifiedAlternativeStartDates({
          programa: toolInput.programa,
          fundiveSlot: toolInput.fundive_slot,
          fromDate: toolInput.start_date,
          detalleByDate,
          horaActualWita: fresh.hora_actual_wita,
          todayWitaStr,
          pax: toolInput.pax,
        });

    void leadStageService
      .transition({
        conversacionId: conversation.id,
        to: "proposed",
        by: "ai",
        note: `[sim] consultar_disponibilidad ${toolInput.programa} ${toolInput.start_date}`,
        metadataPatch: {
          programa: toolInput.programa,
          start_date: toolInput.start_date,
          pax: toolInput.pax,
          required_slots: required.map((r) => ({
            dayOffset: r.dayOffset,
            slot: r.slot,
          })),
        },
      })
      .catch(() => {});

    const failingSlots = validation.failingSlots;
    return {
      ok: true,
      programa: toolInput.programa,
      startDate: toolInput.start_date,
      horaActualWita: fresh.hora_actual_wita,
      available: allAvailable,
      slots,
      ...(failingSlots.length > 0 ? { failingSlots } : {}),
      ...(verifiedAlternativeStartDates.length > 0
        ? { verifiedAlternativeStartDates }
        : {}),
      ...(fresh.primer_dia_disponible &&
      fresh.primer_dia_disponible !== toolInput.start_date
        ? { alternativeStartDate: fresh.primer_dia_disponible }
        : {}),
      ...(typeof fresh.offset_dias === "number" && fresh.offset_dias > 0
        ? { offsetDias: fresh.offset_dias }
        : {}),
    };
  };

  const solicitarDepositoHandler = async (
    toolInput: SolicitarDepositoInput,
  ): Promise<SolicitarDepositoResult> => {
    const meta = await reloadLeadMetadata();
    const preflightPrograma = meta.programa;
    const preflightStartDate = meta.start_date;
    if (!preflightPrograma || !preflightStartDate) {
      return {
        ok: false,
        reason: "booking_not_finalized",
        message:
          "El AI no completó consultar_disponibilidad antes de pedir el depósito. Llamá esa tool primero con el programa y fecha de inicio del cliente.",
      };
    }

    const preflightRequired = getRequiredSlots(
      preflightPrograma as AvailabilityProgram,
      undefined,
    );
    if (preflightRequired && preflightRequired.length > 0) {
      const preflightWindow = maxDayOffset(preflightRequired) + 1 + ALT_SCAN_DAYS_FORWARD;
      const preflightFresh = await rosterDbService
        .fetchAvailability(
          sede.id,
          { date: preflightStartDate, days: preflightWindow },
          sandbox,
        )
        .catch(() => null);
      if (!preflightFresh) {
        return {
          ok: false,
          reason: "slot_unavailable",
          message:
            "No pude re-verificar disponibilidad sandbox. Volvé a llamar consultar_disponibilidad antes de pedir la seña.",
        };
      }
      const preflightDetalle = buildDetalleMap(preflightFresh);
      const todayWita = wITAYmd();
      const preflightVerdict = validateRequiredSlots({
        required: preflightRequired,
        detalleByDate: preflightDetalle,
        horaActualWita: preflightFresh.hora_actual_wita,
        todayWitaStr: todayWita,
        startDate: preflightStartDate,
        pax: toolInput.pax,
      });
      if (!preflightVerdict.allAvailable) {
        const verifiedAlternativeStartDates = findVerifiedAlternativeStartDates({
          programa: preflightPrograma as AvailabilityProgram,
          fundiveSlot: undefined,
          fromDate: preflightStartDate,
          detalleByDate: preflightDetalle,
          horaActualWita: preflightFresh.hora_actual_wita,
          todayWitaStr: todayWita,
          pax: toolInput.pax,
        });
        return {
          ok: false,
          reason: "slot_unavailable",
          message:
            "Re-verifiqué la disponibilidad y uno o más días del programa ya no tienen lugar. Ofrecé una fecha alternativa de la lista verificada.",
          failingSlots: preflightVerdict.failingSlots,
          ...(verifiedAlternativeStartDates.length > 0
            ? { verifiedAlternativeStartDates }
            : {}),
        };
      }
    }

    const currency = toolInput.moneda_cliente as DepositCurrency;
    const monto = depositAmountFor(currency);
    const pax = toolInput.pax;
    const montoTotal = monto * pax;

    const existingRefCode =
      meta.ref_code && isValidRefCode(meta.ref_code) ? meta.ref_code : null;
    const reused = existingRefCode !== null;

    // Resolve program list (same precedence as production handler).
    let programaList: string[] = [];
    if (toolInput.programas && toolInput.programas.length > 0) {
      const seen = new Set<string>();
      for (const p of toolInput.programas) {
        if (!seen.has(p)) {
          seen.add(p);
          programaList.push(p);
        }
      }
    } else if (meta.ref_codes_by_program) {
      programaList = Object.keys(meta.ref_codes_by_program);
    } else if (meta.programa) {
      programaList = [meta.programa];
    }

    // Per-pax programs (Miguel 2026-06-09).
    let paxPrograms: string[][];
    if (toolInput.pax_programs && toolInput.pax_programs.length > 0) {
      paxPrograms = toolInput.pax_programs;
    } else if (meta.pax_programs && meta.pax_programs.length === pax) {
      paxPrograms = meta.pax_programs;
    } else {
      paxPrograms = Array.from({ length: pax }, () => [...programaList]);
    }
    if (paxPrograms.length > pax) paxPrograms = paxPrograms.slice(0, pax);
    while (paxPrograms.length < pax) {
      paxPrograms.push([...programaList]);
    }

    // Mint per-pax codes (reuse if already on this lead).
    const existingRefCodesByPax = meta.ref_codes_by_pax ?? null;
    const refCodesByPax: string[] = [];
    for (let i = 0; i < pax; i++) {
      const existing = existingRefCodesByPax?.[i];
      refCodesByPax.push(
        existing && isValidRefCode(existing) ? existing : generateRefCode(sede.nombre),
      );
    }
    const refCode = refCodesByPax[0] ?? existingRefCode ?? generateRefCode(sede.nombre);

    let refCodesByProgram: Record<string, string> | undefined;
    if (programaList.length > 0) {
      const map: Record<string, string> = {};
      for (let i = 0; i < pax; i++) {
        for (const p of paxPrograms[i] ?? []) {
          if (!map[p]) map[p] = refCodesByPax[i]!;
        }
      }
      if (Object.keys(map).length > 0) refCodesByProgram = map;
    }

    const requiresHumanVerification = !sedeHasAutomaticGateway(
      sede.nombre as SedeKey,
    );

    const instrucciones = buildPaymentInstructions({
      sedeNombre: sede.nombre,
      language: toolInput.cliente_idioma,
      currency,
      refCode,
      pax,
      refCodesByPax,
    });

    // Sandbox pending hold (Miguel 4h TTL — release sweep targets prod
    // bookings by default, sandbox holds linger until /reset).
    const requiredSlotsForHold = meta.required_slots ?? [];
    if (
      preflightStartDate &&
      preflightPrograma &&
      Array.isArray(requiredSlotsForHold) &&
      requiredSlotsForHold.length > 0
    ) {
      const slotsForHold = requiredSlotsForHold.map((s) => ({
        fecha: addDays(preflightStartDate, s.dayOffset),
        turno: s.slot as TurnoKey as unknown as Parameters<
          typeof rosterDbService.holdPendingBookings
        >[0]["slots"][number]["turno"],
        programa: preflightPrograma,
        pax,
      }));
      const holdResult = await rosterDbService.holdPendingBookings(
        {
          sedeId: sede.id,
          conversacionId: conversation.id,
          contactId,
          slots: slotsForHold,
          notes: `[sim] pending hold for ${refCode} (${currency} × ${pax})`,
        },
        sandbox,
      );
      if (!holdResult.ok) {
        if (holdResult.reason === "overbooked") {
          return {
            ok: false,
            reason: "slot_unavailable",
            message:
              "Sandbox roster: el cupo se llenó justo al generar la seña. Ofrecé otra fecha.",
            failingSlots: [
              {
                date: holdResult.failingSlot.fecha,
                slot: holdResult.failingSlot.turno as TurnoKey,
                available: false,
                espacios: holdResult.failingSlot.available,
                reason: "full",
              },
            ],
          };
        }
        log.error(
          { conversationId: conversation.id, holdResult },
          "[sim] solicitar_deposito hold failed with invalid_input",
        );
        return {
          ok: false,
          reason: "internal_error",
          message:
            "Sandbox no pudo reservar el cupo. Reseteá la sesión desde el panel y reintentá.",
        };
      }
      log.info(
        {
          conversationId: conversation.id,
          heldRows: holdResult.holds.length,
        },
        "[sim] sandbox pending holds created",
      );
    }

    await leadStageService
      .transition({
        conversacionId: conversation.id,
        to: "deposit_pending",
        by: "ai",
        note: reused
          ? `[sim] solicitar_deposito reuse ${refCode} ${currency}`
          : `[sim] solicitar_deposito ${refCode} ${currency}`,
        metadataPatch: {
          ref_code: refCode,
          ref_codes_by_pax: refCodesByPax,
          pax_programs: paxPrograms,
          ...(refCodesByProgram ? { ref_codes_by_program: refCodesByProgram } : {}),
          deposit_amount: monto,
          deposit_amount_total: montoTotal,
          deposit_currency: currency,
          pax,
          programa: meta.programa,
          start_date: meta.start_date,
          payment_instructions_snapshot: instrucciones,
          requires_human_verification: requiresHumanVerification,
        },
      })
      .catch((err) =>
        log.warn({ err }, "[sim] solicitar_deposito transition failed"),
      );

    return {
      ok: true,
      ref_code: refCode,
      ref_codes_by_pax: refCodesByPax,
      ...(refCodesByProgram && Object.keys(refCodesByProgram).length > 1
        ? { ref_codes_by_program: refCodesByProgram }
        : {}),
      monto,
      monto_total: montoTotal,
      pax,
      moneda: currency,
      instrucciones,
      requires_human_verification: requiresHumanVerification,
      reused_existing: reused,
    };
  };

  const enviarCatalogoHandler = async (
    toolInput: EnviarCatalogoInput,
  ): Promise<EnviarCatalogoResult> => {
    const entry = getCatalogEntry(sede.nombre, toolInput.programa, input.detectedLanguage);
    if (!entry) {
      const message = describeMissingCatalog(sede.nombre, toolInput.programa);
      return {
        ok: false,
        reason: "not_configured",
        message,
        programa: toolInput.programa,
      };
    }
    void leadStageService
      .transition({
        conversacionId: conversation.id,
        to: "proposed",
        by: "ai",
        note: `[sim] enviar_catalogo ${toolInput.programa}`,
      })
      .catch(() => {});
    log.info(
      { conversationId: conversation.id, programa: toolInput.programa, catalogRef: entry.label },
      "[sim] enviar_catalogo — simulated send (no Respond.io outbound)",
    );
    return {
      ok: true,
      sent: true,
      programa: toolInput.programa,
      catalogRef: entry.label,
    };
  };

  const sendProductCardHandler = async (
    toolInput: SendProductCardInput,
  ): Promise<SendProductCardResult> => {
    const validated = validateProductCardIds(toolInput);
    if (!validated.ok) return validated;
    void leadStageService
      .transition({
        conversacionId: conversation.id,
        to: "proposed",
        by: "ai",
        note: `[sim] send_product_card ${validated.ids.join(",")}`,
      })
      .catch(() => {});
    log.info(
      { conversationId: conversation.id, ids: validated.ids },
      "[sim] send_product_card — simulated send (no Respond.io outbound)",
    );
    return { ok: true, sent: validated.ids };
  };

  // Same per-sede tool surface as production.
  if (sede.nombre === "Gili Air") {
    // 2026-06-15: enviar_catalogo added (Cloudinary path). send_product_card
    // kept as legacy fallback. See process-message.ts for full rationale.
    return {
      consultar_disponibilidad: consultarDisponibilidadHandler,
      enviar_catalogo: enviarCatalogoHandler,
      send_product_card: sendProductCardHandler,
    };
  }
  if (sede.nombre === "Koh Tao") {
    return { consultar_disponibilidad: consultarDisponibilidadHandler };
  }
  return {
    consultar_disponibilidad: consultarDisponibilidadHandler,
    solicitar_deposito: solicitarDepositoHandler,
    enviar_catalogo: enviarCatalogoHandler,
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
  //
  // 2026-05-17 Miguel feedback (Colomba GA simulator test): customer wrote
  // in English, Colomba replied in Spanish. Root cause was hardcoded
  // detectedLanguage="es" / expectedLanguage="español" — Bloque 4 then
  // injects "IDIOMA OBLIGATORIO DE TU RESPUESTA: es" and the AI obeys.
  // Mirror production: run detectLanguage() on the incoming text; fall
  // through to undefined when franc can't classify (short messages) so
  // the prompt-builder emits the soft "detect from message" fallback
  // instead of forcing a wrong language.
  const detectedLanguage = detectLanguage(input.text);
  const built = buildFourBlockPrompt({
    systemPrompt: prompt.text,
    sedeKb: kbText,
    history: priorHistory,
    sede,
    roster: null, // simulator: no real availability lookup
    incomingMessage: input.text,
    detectedLanguage,
    suggestedCurrency: "EUR",
  });

  // 5. Call Claude with sandbox-mode real handlers.
  const toolHandlers = buildSandboxToolHandlers({
    sede,
    conversation: {
      id: conv.id,
      leadMetadata: conv.leadMetadata,
      sedeId: conv.sedeId,
    },
    contactId: SIMULATOR_CONTACT_ID,
    detectedLanguage,
  });
  const result = await callClaude({
    system: built.system,
    messages: built.messages,
    conversacionId: conv.id,
    sedeId: sede.id,
    promptVersionId: prompt.versionId ?? undefined,
    toolHandlers,
    expectedLanguage: detectedLanguage,
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

// ─── Sandbox OCR upload ───────────────────────────────────────────────────
//
// Operator uploads a comprobante image from the simulator panel. We run
// the same `runOcrOnAttachment` Vision call the production webhook uses
// (with the pre-fetched bytes — there is no Respond.io CDN URL for
// panel uploads), reconcile against the deposit metadata stamped by
// `solicitar_deposito`, and on validate=true upgrade the sandbox pending
// holds to `confirmed`. Mirrors production close-sale semantics: one
// confirmBooking per (programa, required_slot) pair.

export type SimulatorOcrResult = {
  verdict: OcrVerdict;
  bookings: Array<{
    fecha: string;
    turno: string;
    programa: string;
    pax: number;
    upgradedFromPending: boolean;
  }>;
  /** Total rows touched in the sandbox table. */
  rowsConfirmed: number;
  /** Human-readable summary line for the chat UI. */
  message: string;
};

export async function runSimulatorOcr(input: {
  conversacionId: string;
  base64: string;
  mimeType: string;
  fileName?: string | undefined;
}): Promise<SimulatorOcrResult> {
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
    throw new Error("simulator: conversation not found or not a simulator session");
  }
  const sede = await loadSede(conv.sedeId);
  if (!sede) {
    throw new Error(`simulator: sede ${conv.sedeId} not found`);
  }

  // Helper so EVERY OCR outcome lands as a chat message — operator sees
  // what happened no matter the verdict (success, mismatch, missing
  // metadata, fetch failure, etc). Before this, only the validated path
  // inserted a message and Miguel reported "subo PDF y no pasa nada".
  const appendOcrMessage = async (content: string, source: string) => {
    await db.insert(mensajes).values({
      conversacionId: conv.id,
      sender: "ai",
      content,
      metadata: { synthetic: true, source },
      origin: "simulator",
    });
  };

  const meta = (conv.leadMetadata as LeadMetadata | null) ?? {};
  if (!meta.deposit_currency || typeof meta.deposit_amount_total !== "number" || !meta.ref_code) {
    const msg =
      "❌ Sandbox OCR rechazado: la AI todavía no llamó solicitar_deposito. Hacé que el cliente pida la seña primero.";
    await appendOcrMessage(msg, "simulator_ocr_no_metadata");
    return {
      verdict: {
        ok: false,
        reason: "fetch_failed",
        message: "no_deposit_metadata",
        attachmentMime: input.mimeType,
      },
      bookings: [],
      rowsConfirmed: 0,
      message: msg,
    };
  }

  const expected: ExpectedDeposit = {
    refCode: meta.ref_code,
    currency: meta.deposit_currency as DepositCurrency,
    amount: meta.deposit_amount_total,
  };

  const verdict = await runOcrOnAttachment({
    attachmentUrl: `simulator-upload://${input.fileName ?? "comprobante"}`,
    attachmentMime: input.mimeType,
    expected,
    prefetchedBytes: { base64: input.base64, mimeType: input.mimeType },
  });

  // Persist verdict on lead_metadata.ocr_result so the panel can render it
  // the same way it would for a real customer.
  const nowIso = new Date().toISOString();
  const ocrSummary: NonNullable<LeadMetadata["ocr_result"]> = verdict.ok
    ? {
        at: nowIso,
        ok: true,
        validated: verdict.validated,
        mismatches: verdict.mismatches,
        extraction: verdict.extraction,
        attachmentMime: verdict.attachmentMime,
      }
    : {
        at: nowIso,
        ok: false,
        reason: verdict.reason,
        attachmentMime: verdict.attachmentMime ?? null,
      };
  await db
    .update(conversaciones)
    .set({
      leadMetadata: { ...meta, ocr_result: ocrSummary },
      updatedAt: new Date(),
    })
    .where(eq(conversaciones.id, conv.id))
    .catch((err) => log.warn({ err }, "[sim] ocr_result metadata patch failed"));

  // Reject paths: not auto-confirmable, surface as a chat message.
  if (!verdict.ok) {
    const msg = `❌ Sandbox OCR falló (${verdict.reason}). ${
      verdict.reason === "no_anthropic_key"
        ? "Falta ANTHROPIC_API_KEY en el server."
        : verdict.reason === "model_failed"
          ? "Vision no pudo extraer datos del comprobante."
          : verdict.reason === "fetch_failed"
            ? "No se pudo procesar el archivo subido (mime no soportado o corrupto)."
            : ""
    }`.trim();
    await appendOcrMessage(msg, "simulator_ocr_failed");
    return {
      verdict,
      bookings: [],
      rowsConfirmed: 0,
      message: msg,
    };
  }
  if (!verdict.validated) {
    const extractionLine = `Vision leyó: ${verdict.extraction.amount ?? "?"} ${
      verdict.extraction.currency ?? "?"
    }, ref ${verdict.extraction.refCode ?? "?"}`;
    const expectedLine = `Esperado: ${expected.amount} ${expected.currency}, ref ${expected.refCode}`;
    const msg = `⚠️ Sandbox OCR procesó el comprobante pero NO validó.\nMotivos: ${verdict.mismatches.join(
      ", ",
    )}\n${extractionLine}\n${expectedLine}`;
    await appendOcrMessage(msg, "simulator_ocr_mismatch");
    return {
      verdict,
      bookings: [],
      rowsConfirmed: 0,
      message: msg,
    };
  }

  // Validated. Upgrade pending → confirmed for every required slot of the
  // proposed booking. Mirrors the production path in
  // process-message.ts (around line 575): one confirmBooking per slot,
  // with conversacionId so the holdPendingBookings hold is promoted in
  // place rather than duplicated.
  const startDate = meta.start_date;
  const programa = meta.programa;
  const required = meta.required_slots ?? [];
  const pax = meta.pax ?? 1;
  const bookings: SimulatorOcrResult["bookings"] = [];
  if (!startDate || !programa || required.length === 0) {
    log.info(
      { conversationId: conv.id },
      "[sim] OCR validated but no required_slots — skipping confirm",
    );
  } else {
    for (const slot of required) {
      const fecha = addDays(startDate, slot.dayOffset);
      const turno = slot.slot as unknown as Parameters<
        typeof rosterDbService.confirmBooking
      >[0]["turno"];
      const result = await rosterDbService.confirmBooking(
        {
          sedeId: sede.id,
          fecha,
          turno,
          programa,
          pax,
          conversacionId: conv.id,
          contactId: SIMULATOR_CONTACT_ID,
          notes: `[sim] booked by ai after OCR auto-confirm (${meta.ref_code})`,
        },
        { sandbox: true },
      );
      if (result.ok) {
        bookings.push({
          fecha,
          turno: String(turno),
          programa,
          pax,
          upgradedFromPending: result.booking.notes?.includes("pending") ?? false,
        });
      } else {
        log.warn(
          { conversationId: conv.id, result },
          "[sim] confirmBooking failed during OCR auto-confirm",
        );
      }
    }
  }

  // Transition the lead — same lifecycle as production after auto-confirm.
  await leadStageService
    .transition({
      conversacionId: conv.id,
      to: "deposit_paid",
      by: "ai",
      note: `[sim] ocr_auto_confirmed`,
      metadataPatch: { ocr_result: ocrSummary },
    })
    .catch((err) =>
      log.warn({ err }, "[sim] transition to deposit_paid failed"),
    );

  // Drop a system message into the chat so the operator sees what happened.
  const summary =
    bookings.length > 0
      ? `✅ Sandbox OCR validó. Reservas confirmadas: ${bookings
          .map((b) => `${b.fecha} ${b.turno}`)
          .join(", ")}.`
      : `✅ Sandbox OCR validó el comprobante. (No había holds pendientes para confirmar — la AI no terminó solicitar_deposito antes del comprobante.)`;
  await appendOcrMessage(summary, "simulator_ocr_validated");

  return {
    verdict,
    bookings,
    rowsConfirmed: bookings.length,
    message: summary,
  };
}

// ─── Sandbox reset ────────────────────────────────────────────────────────
//
// Rewinds a simulator conversation back to a clean slate for the next
// test scenario:
//   1. Delete the sandbox roster rows (`roster_bookings_sandbox`) for
//      THIS conversation only. Other simulator sessions keep their data.
//   2. Reset the conversation: leadStage='new', clear leadMetadata.
//   3. Delete all messages so the chat surface is empty.
//
// The conversation row itself is preserved (and its saved-session
// references stay intact) — only its contents are wiped.

export async function resetSimulatorSession(input: {
  conversacionId: string;
}): Promise<{ ok: true; deletedMessages: number; deletedBookings: number }> {
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
    throw new Error("simulator: conversation not found or not a simulator session");
  }

  // 1. Clear sandbox bookings tied to this conversation.
  const deletedBookings = await db
    .delete(rosterBookingsSandbox)
    .where(eq(rosterBookingsSandbox.conversacionId, input.conversacionId))
    .returning({ id: rosterBookingsSandbox.id });

  // 2. Reset conversation state — back to lead_stage='new', no metadata.
  await db
    .update(conversaciones)
    .set({
      leadStage: "new",
      leadStageChangedAt: new Date(),
      leadMetadata: null,
      followUpState: null,
      closedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(conversaciones.id, input.conversacionId));

  // 3. Drop all messages.
  const deletedMessages = await db
    .delete(mensajes)
    .where(eq(mensajes.conversacionId, input.conversacionId))
    .returning({ id: mensajes.id });

  log.info(
    {
      conversationId: input.conversacionId,
      deletedMessages: deletedMessages.length,
      deletedBookings: deletedBookings.length,
    },
    "[sim] sandbox session reset",
  );

  return {
    ok: true,
    deletedMessages: deletedMessages.length,
    deletedBookings: deletedBookings.length,
  };
}

// ─── Sandbox roster grid (Miguel 2026-06-09 PM) ──────────────────────────
//
// Miguel needs to sculpt arbitrary occupancy boards to test the AI's
// multi-day availability logic (e.g. OW spans 3 days — if day N+1 is
// full, the AI must reject a start on day N even if N and N+2 are free).
// Chat-only fill can't produce these states (cargar 22 personas una
// fecha a la vez es inviable, y el OW ocupa varios días seguidos).
//
// Approach: grid cells map 1:1 to `roster_bookings_sandbox` rows tagged
// with a `[grid-seed]` notes marker. Setting a cell deletes all
// grid-seed rows for that (sede, fecha, turno) and inserts a fresh row
// with the requested pax. Real chat bookings (notes without that
// marker) are left untouched so the grid + chat compose cleanly.
//
// Block semantics: there is no separate "blocked" flag in the sandbox.
// Setting pax = sede capacity (default 22 for boat / 30 for confined)
// fills the cell — the AI sees 0 available, which is functionally the
// same as a block for testing purposes.

const GRID_SEED_NOTES = "[grid-seed]";
const GRID_SEED_PROGRAMA = "_grid_seed";

export type SandboxRosterRow = {
  fecha: string;
  turno: string;
  capacidad: number;
  reservado: number;
  disponible: number;
};

export async function fetchSandboxRoster(input: {
  sedeId: string;
  fromDate: string; // YYYY-MM-DD
  days: number;
}): Promise<{ ok: true; sedeId: string; fromDate: string; days: number; rows: SandboxRosterRow[] }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fromDate)) {
    throw new Error(`fetchSandboxRoster: bad fromDate ${input.fromDate}`);
  }
  const days = Math.max(1, Math.min(31, input.days)); // hard cap for safety
  const availability = await rosterDbService.fetchAvailability(
    input.sedeId,
    { date: input.fromDate, days },
    { sandbox: true },
  );
  // Flatten the AvailabilityResponse `detalle` into one row per
  // (fecha, turno) for the grid renderer.
  const rows: SandboxRosterRow[] = [];
  for (const day of availability.detalle) {
    const push = (turnoKey: string, slot: { disponible: boolean; espacios: number; capacidad: number } | undefined) => {
      if (!slot) return;
      rows.push({
        fecha: day.fecha,
        turno: turnoKey,
        capacidad: slot.capacidad,
        // `espacios` from fetchAvailability is already `available`
        // (capacity − reserved). Reverse to compute reserved for the
        // grid header so operators see how many slots are taken.
        reservado: Math.max(0, slot.capacidad - slot.espacios),
        disponible: slot.espacios,
      });
    };
    push("AM", day.turno_manana);
    push("PM", day.turno_tarde);
    push("Nocturno", day.turno_nocturno);
    push("ConfinadasAM", day.turno_confinadas_am);
    push("ConfinadasPM", day.turno_confinadas_pm);
    // Legacy single "Confinadas" turno — fetchAvailability only emits
    // this when there's actual booking data against it (Miguel
    // 2026-06-07 split). OW's required_slots still target the legacy
    // bucket for Día 1 in production prompts, so without this push the
    // grid hides those holds and the operator thinks the booking
    // didn't land.
    push("Confinadas", day.turno_confinadas);
  }
  return { ok: true, sedeId: input.sedeId, fromDate: input.fromDate, days, rows };
}

/**
 * Set the occupancy of a single (fecha, turno) cell in the sandbox.
 *
 * pax = 0 → clear the cell (delete grid-seed rows for that slot).
 * pax > 0 → wipe existing grid-seed rows + insert one row with the new pax.
 *
 * Real chat-driven bookings (notes != GRID_SEED_NOTES) are NOT touched —
 * grid edits and chat reservations live side-by-side in the same table.
 */
export async function setSandboxRosterCell(input: {
  sedeId: string;
  fecha: string;
  turno: string;
  pax: number;
}): Promise<{ ok: true; cleared: number; inserted: boolean; pax: number }> {
  const log = getLogger();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) {
    throw new Error(`setSandboxRosterCell: bad fecha ${input.fecha}`);
  }
  // "Confinadas" (legacy single bucket) is allowed so operators can
  // sculpt the same slot OW's Día 1 holds land on. See the comment in
  // fetchSandboxRoster's push() for context.
  const VALID_TURNOS = [
    "AM",
    "PM",
    "Nocturno",
    "ConfinadasAM",
    "ConfinadasPM",
    "Confinadas",
  ] as const;
  if (!(VALID_TURNOS as readonly string[]).includes(input.turno)) {
    throw new Error(`setSandboxRosterCell: bad turno ${input.turno}`);
  }
  if (!Number.isInteger(input.pax) || input.pax < 0 || input.pax > 200) {
    throw new Error(`setSandboxRosterCell: bad pax ${input.pax}`);
  }
  const db = getDb();
  // 1. Delete prior grid-seed rows for this exact cell.
  const cleared = await db
    .delete(rosterBookingsSandbox)
    .where(
      and(
        eq(rosterBookingsSandbox.sedeId, input.sedeId),
        eq(rosterBookingsSandbox.fecha, input.fecha),
        eq(rosterBookingsSandbox.turno, input.turno),
        eq(rosterBookingsSandbox.notes, GRID_SEED_NOTES),
      ),
    )
    .returning({ id: rosterBookingsSandbox.id });

  // 2. Insert a fresh seed row if pax > 0.
  let inserted = false;
  if (input.pax > 0) {
    await db.insert(rosterBookingsSandbox).values({
      sedeId: input.sedeId,
      fecha: input.fecha,
      turno: input.turno,
      programa: GRID_SEED_PROGRAMA,
      pax: input.pax,
      status: "confirmed",
      contactId: null,
      conversacionId: null,
      notes: GRID_SEED_NOTES,
    });
    inserted = true;
  }
  log.info(
    {
      sedeId: input.sedeId,
      fecha: input.fecha,
      turno: input.turno,
      pax: input.pax,
      clearedRows: cleared.length,
      inserted,
    },
    "[sim] sandbox grid cell set",
  );
  return { ok: true, cleared: cleared.length, inserted, pax: input.pax };
}

/**
 * Wipe the entire sandbox roster for a sede — grid edits AND chat-driven
 * holds. Intuitive "nuke" semantics so the operator can always start
 * from a known-empty board.
 *
 * Earlier design preserved chat bookings (only deleted GRID_SEED_NOTES
 * rows). Miguel reported it as confusing 2026-06-09 PM ("Reset no
 * limpia las celdas que vinieron del chat anterior") — switched to
 * full-sede wipe to match operator expectation.
 */
export async function resetSandboxRosterGrid(input: {
  sedeId: string;
}): Promise<{ ok: true; cleared: number }> {
  const log = getLogger();
  const db = getDb();
  const cleared = await db
    .delete(rosterBookingsSandbox)
    .where(eq(rosterBookingsSandbox.sedeId, input.sedeId))
    .returning({ id: rosterBookingsSandbox.id });
  log.info(
    { sedeId: input.sedeId, clearedRows: cleared.length },
    "[sim] sandbox grid reset (full wipe)",
  );
  return { ok: true, cleared: cleared.length };
}
