// Server Actions for the intelligent roster engine UI (Phase 4 —
// Miguel v2.1 spec). Three families:
//
//   instructors:           create / rename / toggle active
//   instructor_availability: set / clear per (sede, fecha, instructor)
//   walk-in divers:        create row with origen='Manual'
//
// All actions enforce sede-scoped auth (admin OR office-of-target-sede)
// and revalidate the relevant route on success so the UI reflects the
// change without a manual refresh.
//
// Miguel 2026-06-26 feedback: per-sede office accounts must be able to
// manage their own sede's instructors / availability / walk-ins. The
// previous admin-only gate forced Miguel to share his admin login with
// each sede, which was unsafe.

"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  computeReservedCapacityBySlot,
  getDb,
  instructorAvailability,
  instructors as instructorsTable,
  rosterAuditLog,
  rosterDivers,
  sedes,
} from "@dpm/db";
import { generateRefCode, isValidRefCode } from "@dpm/shared";

import { requireSedeWriteAccess } from "~/lib/auth-context";
import { validateActivityRol } from "~/lib/roster-activity-rol";

// ============================================================================
// Result envelope (Miguel 2026-06-30 — production error message survival).
//
// Next.js masks thrown Error messages in production builds, so a server
// action's `throw new Error("Código inválido…")` reaches the client as
// the generic "An error occurred in the Server Components render…"
// banner — the operator never sees the actual validation reason.
//
// Fix: every panel action wraps its body in `runAction`, which catches
// any throw and returns `{ ok: false, error: <msg> }`. The message is a
// return value, not a thrown exception, so Next.js leaves it untouched.
// <ActionForm> reads the envelope and renders the message inline.
//
// Genuine runtime errors (DB connection lost, FK violation we didn't
// expect) still propagate as a generic banner from the catch in
// ActionForm. The user-facing validation errors — the ones we author
// in this file with Spanish text — now survive end-to-end.
// ============================================================================

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

async function runAction<T>(
  fn: () => Promise<T>,
): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return { ok: false, error: message };
  }
}

// Audit log helper — every walk-in CRUD action and every reassign writes
// one row. Always called inside the action's transaction so the audit
// row commits atomically with the mutation. Miguel v2.2 §3 + §6
// (2026-06-27): an action that fails to write its audit row is treated
// as if the action itself never happened.
type AuditAction =
  | "create_walk_in"
  | "update_walk_in"
  | "delete_walk_in"
  | "reassign_instructor_this_day"
  | "reassign_instructor_all_program"
  | "instructor_swap_group_leader"
  | "revalidate_motor";

async function writeAuditLog(
  // Drizzle's tx type is inferred; we type the param as `any` here
  // because the helper has to accept both the top-level db and a
  // transaction without dragging the full generic chain through every
  // caller. Safety: every call site below passes either `tx` (a
  // PgTransaction) or `db` (a PgDatabase) — both expose `.insert`.
  txOrDb: any,
  args: {
    sedeId: string;
    action: AuditAction;
    diverId?: string | null;
    fecha?: string | null;
    slot?: string | null;
    actorUserId: string;
    actorLabel: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await txOrDb.insert(rosterAuditLog).values({
    sedeId: args.sedeId,
    action: args.action,
    diverId: args.diverId ?? null,
    fecha: args.fecha ?? null,
    slot: args.slot ?? null,
    actorUserId: args.actorUserId,
    actorLabel: args.actorLabel,
    payload: args.payload,
  });
}

// Per-sede boat capacity (Miguel 2026-06-23 sheet audit). Walk-in CRUD
// uses this as the consolidated ceiling — same number the AI side falls
// back to when no `roster_capacity_overrides` row exists. POOL slots
// don't share a boat so they're not constrained by these caps (set to
// Infinity → never blocks). Per-sede overrides via the
// `roster_capacity_overrides` table win when they exist; this is the
// floor / default.
const SEDE_BOAT_CAPACITY: Record<string, number> = {
  "Koh Tao": 35,
  "Koh Phi Phi": 22,
  "Nusa Penida": 18,
  "Gili Trawangan": 20,
  "Gili Air": 20,
};

function defaultBoatCapacity(sedeNombre: string): number {
  return SEDE_BOAT_CAPACITY[sedeNombre] ?? 22;
}

/**
 * Default-capacity check for a walk-in slot. Pool slots (POOL_AM / POOL_PM)
 * skip the check because pool capacity is instructor-driven, not
 * boat-seat-driven — Miguel handles the pool ceiling operationally and
 * the panel form already prevents nonsense entries. AM/PM/NIGHT all
 * compare against the sede's boat capacity.
 *
 * Returns true if `reserved + 1` (the about-to-insert walk-in) would
 * still fit.
 */
function walkInWouldFit(slot: string, sedeNombre: string, reserved: number): boolean {
  if (slot === "POOL_AM" || slot === "POOL_PM") return true;
  return reserved + 1 <= defaultBoatCapacity(sedeNombre);
}

// Helper: load an instructor's sedeId so we can authorize rename/active
// actions which only ship the instructor id in the form.
async function resolveInstructorSede(instructorId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ sedeId: instructorsTable.sedeId })
    .from(instructorsTable)
    .where(eq(instructorsTable.id, instructorId))
    .limit(1);
  return row?.sedeId ?? null;
}

// ─── Instructor CRUD ───────────────────────────────────────────────

export async function createInstructor(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
  const sedeId = String(formData.get("sede_id") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const nombreLegal = String(formData.get("nombre_legal") ?? "").trim() || null;
  const languagesRaw = String(formData.get("languages") ?? "").trim();
  const languages = languagesRaw
    ? languagesRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  // Miguel v2.2 addendum §1 (2026-06-27) — instructor vs divemaster.
  // Form sends 'instructor' or 'divemaster'; missing → default to
  // instructor for backward compat with the old form.
  const rawRole = String(formData.get("role") ?? "").trim();
  const role: "instructor" | "divemaster" =
    rawRole === "divemaster" ? "divemaster" : "instructor";

  if (!sedeId || !nombre) {
    throw new Error("sede_id + nombre are required");
  }
  await requireSedeWriteAccess(sedeId);

  const db = getDb();
  await db.insert(instructorsTable).values({
    sedeId,
    nombre,
    nombreLegal,
    languages,
    role,
    active: true,
  });

  revalidatePath("/roster/instructors");
  });
}

/**
 * Miguel v2.2 addendum §1 — change an existing instructor's role.
 * Used when the office needs to promote a divemaster to instructor or
 * vice-versa without rebuilding the row. Idempotent (role unchanged →
 * no-op).
 */
export async function setInstructorRole(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
  const id = String(formData.get("id") ?? "");
  const rawRole = String(formData.get("role") ?? "").trim();
  if (!id) throw new Error("id required");
  if (rawRole !== "instructor" && rawRole !== "divemaster") {
    throw new Error("role must be 'instructor' or 'divemaster'");
  }
  await requireSedeWriteAccess(await resolveInstructorSede(id));

  const db = getDb();
  await db
    .update(instructorsTable)
    .set({ role: rawRole, updatedAt: new Date() })
    .where(eq(instructorsTable.id, id));

  revalidatePath("/roster/instructors");
  });
}

export async function setInstructorActive(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) throw new Error("id required");
  await requireSedeWriteAccess(await resolveInstructorSede(id));

  const db = getDb();
  await db
    .update(instructorsTable)
    .set({ active, updatedAt: new Date() })
    .where(eq(instructorsTable.id, id));

  revalidatePath("/roster/instructors");
  });
}

export async function renameInstructor(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
  const id = String(formData.get("id") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!id || !nombre) throw new Error("id + nombre required");
  await requireSedeWriteAccess(await resolveInstructorSede(id));

  const db = getDb();
  await db
    .update(instructorsTable)
    .set({ nombre, updatedAt: new Date() })
    .where(eq(instructorsTable.id, id));

  revalidatePath("/roster/instructors");
  });
}

// ─── Availability ──────────────────────────────────────────────────

// Miguel 2026-06-26: POOL split into POOL_AM and POOL_PM so the office
// can schedule morning vs afternoon pool sessions as separate operational
// blocks (the legacy /roster page already separates ConfinadasAM /
// ConfinadasPM; the engine is now aligned with that reality).
const ALL_SLOTS = ["AM", "PM", "POOL_AM", "POOL_PM", "NIGHT"] as const;

export async function setAvailability(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
  const sedeId = String(formData.get("sede_id") ?? "");
  const fecha = String(formData.get("fecha") ?? "");
  const instructorId = String(formData.get("instructor_id") ?? "");
  await requireSedeWriteAccess(sedeId);
  // FormData encodes multi-checkbox as repeated entries with the same key.
  const slotsRaw = formData.getAll("slots").map((v) => String(v));
  const slots = slotsRaw.filter((s) =>
    (ALL_SLOTS as readonly string[]).includes(s),
  );
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!sedeId || !fecha || !instructorId) {
    throw new Error("sede_id + fecha + instructor_id are required");
  }

  const db = getDb();
  if (slots.length === 0) {
    // Empty selection = remove the row entirely (= instructor unavailable).
    await db
      .delete(instructorAvailability)
      .where(
        and(
          eq(instructorAvailability.sedeId, sedeId),
          eq(instructorAvailability.fecha, fecha),
          eq(instructorAvailability.instructorId, instructorId),
        ),
      );
  } else {
    // Upsert via "try update; if 0 rows, insert".
    const updated = await db
      .update(instructorAvailability)
      .set({
        slots,
        source: "manual",
        notes,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(instructorAvailability.sedeId, sedeId),
          eq(instructorAvailability.fecha, fecha),
          eq(instructorAvailability.instructorId, instructorId),
        ),
      )
      .returning({ id: instructorAvailability.id });
    if (updated.length === 0) {
      await db.insert(instructorAvailability).values({
        sedeId,
        fecha,
        instructorId,
        slots,
        source: "manual",
        notes,
      });
    }
  }

  revalidatePath("/roster/instructors");
  revalidatePath("/roster/engine");
  });
}

/**
 * Bulk-fill availability for ONE instructor over N consecutive days
 * (Miguel 2026-06-26 — per-day-per-slot clicking is 14 × 4 = 56 clicks
 * per instructor, "es una locura"). One form post replaces all that.
 *
 * Behaviour:
 *   - slots[] non-empty → upsert (instructor × date) with the requested
 *     slot list for every date in the range. Existing rows in range are
 *     overwritten (we want a clean "set the whole period" semantic).
 *   - slots[] empty     → DELETE every (instructor × date) row in the
 *     range. The "Limpiar" button.
 *
 * Range: fromDate (inclusive) + days entries.
 */
export async function setAvailabilityBulk(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
  const sedeId = String(formData.get("sede_id") ?? "");
  const instructorId = String(formData.get("instructor_id") ?? "");
  const fromDate = String(formData.get("from_date") ?? "");
  const days = Number(formData.get("days") ?? 0);
  const slotsRaw = formData.getAll("slots").map((v) => String(v));
  const slots = slotsRaw.filter((s) =>
    (ALL_SLOTS as readonly string[]).includes(s),
  );
  if (
    !sedeId ||
    !instructorId ||
    !fromDate ||
    !Number.isFinite(days) ||
    days < 1 ||
    days > 90
  ) {
    throw new Error("invalid input");
  }
  await requireSedeWriteAccess(sedeId);

  // Compute the date list in UTC to mirror what addDays() does in the
  // page component. Postgres `date` columns ignore TZ but we keep the
  // strings YYYY-MM-DD canonical.
  const [yy, mm, dd] = fromDate.split("-").map(Number);
  if (!yy || !mm || !dd) throw new Error("invalid from_date");
  const start = new Date(Date.UTC(yy, mm - 1, dd));
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
        d.getUTCDate(),
      ).padStart(2, "0")}`,
    );
  }

  const db = getDb();
  if (slots.length === 0) {
    // "Limpiar" — remove every row for this instructor in the range.
    for (const fecha of dates) {
      await db
        .delete(instructorAvailability)
        .where(
          and(
            eq(instructorAvailability.sedeId, sedeId),
            eq(instructorAvailability.fecha, fecha),
            eq(instructorAvailability.instructorId, instructorId),
          ),
        );
    }
  } else {
    // Upsert via the unique index (sede_id, fecha, instructor_id).
    // Done sequentially to keep the DB load predictable; 30 rows is fine.
    for (const fecha of dates) {
      const updated = await db
        .update(instructorAvailability)
        .set({
          slots,
          source: "manual",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(instructorAvailability.sedeId, sedeId),
            eq(instructorAvailability.fecha, fecha),
            eq(instructorAvailability.instructorId, instructorId),
          ),
        )
        .returning({ id: instructorAvailability.id });
      if (updated.length === 0) {
        await db.insert(instructorAvailability).values({
          sedeId,
          fecha,
          instructorId,
          slots,
          source: "manual",
        });
      }
    }
  }

  revalidatePath("/roster/instructors");
  revalidatePath("/roster/engine");
  });
}

// ─── Walk-in diver entry ───────────────────────────────────────────

const ALL_ACTIVITIES = [
  "BD_CONFINADA",
  "BD_BARCO",
  "OW1",
  "OW2",
  "OW3",
  "FD",
  "AA",
  "AA2",
  "ADV",
  "SP",
  "RES",
  "REF_FASE1",
  "REF_FASE2",
] as const;

const ALL_NIVELES = ["BEG", "OW", "AA", "RES", "DM", "INS"] as const;

/**
 * Per-activity default depth profile. Mirrors deriveActivityProfile
 * for the simple cases (FD depends on cert level; office UI just sets
 * the diver's level and we compute depth at engine-run time, so the
 * stored value here is the activity's NATURAL depth).
 */
function defaultDepthForActivity(activity: string, nivel: string): number {
  switch (activity) {
    case "BD_CONFINADA":
    case "OW1":
    case "REF_FASE1":
      return 5;
    case "BD_BARCO":
    case "OW2":
      return 12;
    case "OW3":
      return 18;
    case "FD":
    case "REF_FASE2":
      return nivel === "OW" || nivel === "BEG" ? 18 : 30;
    case "AA":
    case "AA2":
    case "ADV":
      return 30;
    case "SP":
      return 30;
    case "RES":
      return 18;
    default:
      return 18;
  }
}

export async function createWalkInDiver(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
  const sedeId = String(formData.get("sede_id") ?? "");
  const ctx = await requireSedeWriteAccess(sedeId);
  const fecha = String(formData.get("fecha") ?? "");
  const slot = String(formData.get("slot") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const nivel = String(formData.get("nivel_certificacion") ?? "");
  const activity = String(formData.get("activity") ?? "");
  const activityDetail = String(formData.get("activity_detail") ?? "").trim() || null;
  // Miguel 2026-06-26: reference code — must be canonical DPM-... shape
  // so it's interchangeable with the AI's codes when the SSI registration
  // system goes live. Empty form field → mint a fresh code in the sede's
  // local timezone using the same generator the AI uses.
  const codigoOverride = String(formData.get("codigo_buceador") ?? "").trim();
  const acceptsCap = String(formData.get("accepts_cap") ?? "") === "true";
  const notes = String(formData.get("notes") ?? "").trim() || null;

  // Miguel 2026-06-26: optional pre-assignment to a specific instructor.
  // Empty string = "Auto" — engine assigns when it runs. A real UUID
  // here pre-stamps the diver onto that instructor so the engine packs
  // them in that instructor's group on the next pass (subject to
  // compatibility — the engine still validates the depth profile /
  // activity match and may split if incompatible).
  const rawInstructorId = String(formData.get("instructor_id") ?? "").trim();
  const instructorId = rawInstructorId === "" ? null : rawInstructorId;

  if (!sedeId || !fecha || !slot || !nombre || !nivel || !activity) {
    throw new Error(
      "sede_id, fecha, slot, nombre, nivel_certificacion, activity all required",
    );
  }
  if (!(ALL_NIVELES as readonly string[]).includes(nivel)) {
    throw new Error(`invalid nivel: ${nivel}`);
  }
  if (!(ALL_ACTIVITIES as readonly string[]).includes(activity)) {
    throw new Error(`invalid activity: ${activity}`);
  }
  if (codigoOverride !== "" && !isValidRefCode(codigoOverride)) {
    throw new Error(
      "Código inválido. Debe tener la forma DPM-<SEDE>-MMDD-XXXXXX " +
        "(igual al que genera la AI). Dejá el campo vacío para auto-generar.",
    );
  }

  const db = getDb();

  // Look up sede name so we can use the right prefix + timezone when
  // minting the ref code. requireSedeWriteAccess() already proved the
  // user can write to this sede, so the lookup is safe.
  const [sedeRow] = await db
    .select({ nombre: sedes.nombre })
    .from(sedes)
    .where(eq(sedes.id, sedeId))
    .limit(1);
  if (!sedeRow) throw new Error("sede not found");

  // If office picked a specific instructor, validate they exist + belong
  // to this sede AND that their role allows this activity (Miguel v2.2
  // addendum §1 + §2 — DM can only guide fun dives).
  if (instructorId !== null) {
    const [inst] = await db
      .select({
        sedeId: instructorsTable.sedeId,
        role: instructorsTable.role,
        nombre: instructorsTable.nombre,
      })
      .from(instructorsTable)
      .where(eq(instructorsTable.id, instructorId))
      .limit(1);
    if (!inst) throw new Error("instructor not found");
    if (inst.sedeId !== sedeId) {
      throw new Error("instructor belongs to a different sede");
    }
    const rolError = validateActivityRol(activity, inst.role);
    if (rolError) {
      throw new Error(`${rolError} (instructor: ${inst.nombre})`);
    }
  }

  const codigoBuceador =
    codigoOverride !== "" ? codigoOverride : generateRefCode(sedeRow.nombre);

  // Miguel v2.2 addendum §7 (2026-06-27) — atomic claim. The insert
  // runs inside a SERIALIZABLE transaction with a consolidated capacity
  // check across BOTH `roster_bookings` (AI) and `roster_divers`
  // (walk-in). Two concurrent walk-in creates, or a walk-in racing an
  // AI hold, will see the same `reserved` snapshot; Postgres serialises
  // the conflict and the second commit gets a serialization error.
  //
  // POOL slots are excluded from the boat ceiling (handled inside
  // `walkInWouldFit`) because pool capacity is instructor-driven, not
  // a boat seat. AM/PM/NIGHT all share the sede's boat seat pool.
  await db.transaction(
    async (tx) => {
      const cap = await computeReservedCapacityBySlot(tx, {
        sedeId,
        fecha,
        slot,
        bookingsTableName: "roster_bookings",
      });
      if (!walkInWouldFit(slot, sedeRow.nombre, cap.total)) {
        const ceiling = defaultBoatCapacity(sedeRow.nombre);
        throw new Error(
          `No hay capacidad en ${slot} de ${fecha}. ` +
            `Ocupado: ${cap.total}/${ceiling} ` +
            `(AI ${cap.aiReserved} + walk-in ${cap.walkInReserved}). ` +
            `Si Miguel autorizó un overbook, ajustá el override en /roster ` +
            `antes de cargar.`,
        );
      }
      const [inserted] = await tx
        .insert(rosterDivers)
        .values({
          sedeId,
          fecha,
          slot,
          codigoBuceador,
          nombre,
          nivelCertificacion: nivel,
          activity,
          activityDetail,
          perfilProfundidad: defaultDepthForActivity(activity, nivel),
          acceptsCap,
          origen: "Manual",
          estadoPago: "pending",
          instructorId,
          notes,
        })
        .returning();
      if (!inserted) throw new Error("createWalkInDiver insert returned no row");

      // Miguel v2.2 addendum §3 + §6 — every mutation leaves an audit
      // row inside the same transaction. If the audit insert fails, the
      // whole action rolls back. Payload captures the inserted row so a
      // future "who created this walk-in" lookup has full context.
      await writeAuditLog(tx, {
        sedeId,
        action: "create_walk_in",
        diverId: inserted.id,
        fecha,
        slot,
        actorUserId: ctx.userId,
        actorLabel: ctx.email,
        payload: {
          row: {
            id: inserted.id,
            codigoBuceador,
            nombre,
            nivel,
            activity,
            activityDetail,
            instructorId,
            estadoPago: "pending",
            notes,
          },
          capacity: {
            aiReserved: cap.aiReserved,
            walkInReserved: cap.walkInReserved,
            after: cap.total + 1,
            ceiling: defaultBoatCapacity(sedeRow.nombre),
          },
        },
      });
    },
    { isolationLevel: "serializable" },
  );

  revalidatePath("/roster/engine");
  });
}

/**
 * Edit an existing walk-in diver row — slot, instructor, activity,
 * activity_detail and/or notes (Miguel 2026-06-26: "se puede borrar??
 * igual que cambiar al instructor??"). Each field is optional in the
 * form; only the ones present are updated. Useful when the office
 * mis-typed a slot or wants to move a diver to a different instructor
 * without deleting + re-adding.
 *
 * Scope: only `origen='Manual'` rows can be edited via this action.
 * AI-driven rows are immutable from the panel — those come from the
 * conversation flow and editing them would diverge the engine view
 * from the source of truth.
 */
export async function updateWalkInDiver(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("id required");

  const db = getDb();
  const [row] = await db
    .select({
      sedeId: rosterDivers.sedeId,
      origen: rosterDivers.origen,
      currentSlot: rosterDivers.slot,
      currentActivity: rosterDivers.activity,
      currentNivel: rosterDivers.nivelCertificacion,
      currentInstructorId: rosterDivers.instructorId,
      deletedAt: rosterDivers.deletedAt,
    })
    .from(rosterDivers)
    .where(eq(rosterDivers.id, id))
    .limit(1);
  if (!row) throw new Error("diver not found");
  if (row.deletedAt !== null) {
    throw new Error("diver was deleted (soft-deleted); restore first if needed");
  }
  if (row.origen !== "Manual") {
    throw new Error("only Manual (walk-in) rows can be edited from the panel");
  }
  const ctx = await requireSedeWriteAccess(row.sedeId);

  // Collect optional updates. Empty string = "no change", which lets the
  // form ship only the fields the user actually touched.
  const patch: Partial<typeof rosterDivers.$inferInsert> = {};

  const rawSlot = String(formData.get("slot") ?? "").trim();
  if (rawSlot !== "" && rawSlot !== row.currentSlot) {
    if (!(ALL_SLOTS as readonly string[]).includes(rawSlot)) {
      throw new Error(`invalid slot: ${rawSlot}`);
    }
    patch.slot = rawSlot;
  }

  // Track the effective (new or current) instructor + activity so the
  // rol re-validation at the end sees the post-patch state. Miguel v2.2
  // §1+§2: a DM must never end up on a course, regardless of which
  // field the operator changed.
  let effectiveInstructorId: string | null | undefined = row.currentInstructorId;
  let effectiveInstructorRol: string | null = null;
  let effectiveInstructorName: string | null = null;
  const rawInstructorId = String(formData.get("instructor_id") ?? "").trim();
  if (formData.has("instructor_id")) {
    // Empty string is meaningful here: "unassign". UUID = assign.
    if (rawInstructorId === "") {
      patch.instructorId = null;
      effectiveInstructorId = null;
    } else {
      const [inst] = await db
        .select({
          sedeId: instructorsTable.sedeId,
          role: instructorsTable.role,
          nombre: instructorsTable.nombre,
        })
        .from(instructorsTable)
        .where(eq(instructorsTable.id, rawInstructorId))
        .limit(1);
      if (!inst) throw new Error("instructor not found");
      if (inst.sedeId !== row.sedeId) {
        throw new Error("instructor belongs to a different sede");
      }
      patch.instructorId = rawInstructorId;
      effectiveInstructorId = rawInstructorId;
      effectiveInstructorRol = inst.role;
      effectiveInstructorName = inst.nombre;
    }
  }

  const rawActivity = String(formData.get("activity") ?? "").trim();
  let effectiveActivity = row.currentActivity;
  if (rawActivity !== "" && rawActivity !== row.currentActivity) {
    if (!(ALL_ACTIVITIES as readonly string[]).includes(rawActivity)) {
      throw new Error(`invalid activity: ${rawActivity}`);
    }
    patch.activity = rawActivity;
    effectiveActivity = rawActivity;
    // Recompute depth profile to match the new activity. We don't have
    // a "use old depth" override on edits — the depth is derived from
    // (activity, nivel) and should stay coherent with whatever activity
    // the diver ends up on.
    patch.perfilProfundidad = defaultDepthForActivity(rawActivity, row.currentNivel);
  }

  // Miguel v2.2 §1+§2 — rol re-validation against the POST-patch state.
  // We do this only when we have the role to check (operator changed
  // instructor) OR when the activity changed and the current instructor
  // is non-null. In the latter case we have to load the current
  // instructor's role.
  if (effectiveInstructorId && !effectiveInstructorRol) {
    const [inst] = await db
      .select({
        role: instructorsTable.role,
        nombre: instructorsTable.nombre,
      })
      .from(instructorsTable)
      .where(eq(instructorsTable.id, effectiveInstructorId))
      .limit(1);
    if (inst) {
      effectiveInstructorRol = inst.role;
      effectiveInstructorName = inst.nombre;
    }
  }
  if (effectiveInstructorRol) {
    const rolError = validateActivityRol(effectiveActivity, effectiveInstructorRol);
    if (rolError) {
      throw new Error(
        `${rolError}` +
          (effectiveInstructorName ? ` (instructor: ${effectiveInstructorName})` : ""),
      );
    }
  }

  if (Object.keys(patch).length === 0) return; // nothing to update

  patch.updatedAt = new Date();

  // Miguel v2.2 addendum §7 (2026-06-27) — atomic claim. If the slot is
  // changing, the move is a CLAIM on the destination slot (frees old,
  // takes new) — wrap in SERIALIZABLE with a consolidated check on the
  // destination, same as `createWalkInDiver`. Non-slot changes
  // (instructor, activity, notes) don't shift capacity so they take
  // the cheap path.
  if (patch.slot !== undefined && patch.slot !== row.currentSlot) {
    const destSlot = patch.slot;
    // Look up sede name for the boat-capacity ceiling. We already
    // proved write access on the diver's sede above; this is just a
    // label lookup.
    const [sedeRow] = await db
      .select({ nombre: sedes.nombre })
      .from(sedes)
      .where(eq(sedes.id, row.sedeId))
      .limit(1);
    if (!sedeRow) throw new Error("sede not found");
    // Pull the diver's fecha so we know which day's slot to check.
    const [fechaRow] = await db
      .select({ fecha: rosterDivers.fecha })
      .from(rosterDivers)
      .where(eq(rosterDivers.id, id))
      .limit(1);
    if (!fechaRow) throw new Error("diver row vanished mid-edit");
    const fecha = fechaRow.fecha;

    await db.transaction(
      async (tx) => {
        const cap = await computeReservedCapacityBySlot(tx, {
          sedeId: row.sedeId,
          fecha,
          slot: destSlot,
          bookingsTableName: "roster_bookings",
        });
        // We're moving FROM currentSlot to destSlot — if the source
        // slot matches the destination (shouldn't, we guarded above),
        // we'd double-count. Safe because the slot really did change.
        if (!walkInWouldFit(destSlot, sedeRow.nombre, cap.total)) {
          const ceiling = defaultBoatCapacity(sedeRow.nombre);
          throw new Error(
            `No hay capacidad para mover a ${destSlot} en ${fecha}. ` +
              `Ocupado: ${cap.total}/${ceiling} ` +
              `(AI ${cap.aiReserved} + walk-in ${cap.walkInReserved}).`,
          );
        }
        await tx
          .update(rosterDivers)
          .set(patch)
          .where(
            and(
              eq(rosterDivers.id, id),
              eq(rosterDivers.origen, "Manual"),
            ),
          );
        // §3 + §6 audit log inside the same transaction.
        await writeAuditLog(tx, {
          sedeId: row.sedeId,
          action: "update_walk_in",
          diverId: id,
          fecha,
          slot: destSlot,
          actorUserId: ctx.userId,
          actorLabel: ctx.email,
          payload: {
            before: {
              slot: row.currentSlot,
              activity: row.currentActivity,
              instructorId: row.currentInstructorId,
            },
            after: {
              slot: patch.slot,
              activity: patch.activity ?? row.currentActivity,
              instructorId:
                patch.instructorId !== undefined
                  ? patch.instructorId
                  : row.currentInstructorId,
            },
            fields: Object.keys(patch).filter((k) => k !== "updatedAt"),
            destCapacity: {
              aiReserved: cap.aiReserved,
              walkInReserved: cap.walkInReserved,
            },
          },
        });
      },
      { isolationLevel: "serializable" },
    );
  } else {
    // No slot change — safe to update without SERIALIZABLE since
    // capacity doesn't shift. We still write the audit row inside a
    // transaction so the update + audit commit atomically.
    await db.transaction(async (tx) => {
      await tx
        .update(rosterDivers)
        .set(patch)
        .where(
          and(
            eq(rosterDivers.id, id),
            eq(rosterDivers.origen, "Manual"),
          ),
        );
      await writeAuditLog(tx, {
        sedeId: row.sedeId,
        action: "update_walk_in",
        diverId: id,
        fecha: null, // unchanged in this branch
        slot: row.currentSlot,
        actorUserId: ctx.userId,
        actorLabel: ctx.email,
        payload: {
          before: {
            slot: row.currentSlot,
            activity: row.currentActivity,
            instructorId: row.currentInstructorId,
          },
          after: {
            slot: row.currentSlot,
            activity: patch.activity ?? row.currentActivity,
            instructorId:
              patch.instructorId !== undefined
                ? patch.instructorId
                : row.currentInstructorId,
          },
          fields: Object.keys(patch).filter((k) => k !== "updatedAt"),
        },
      });
    });
  }

  revalidatePath("/roster/engine");
  });
}

/**
 * Soft-delete a walk-in row (Miguel v2.2 addendum §3, 2026-06-27).
 * The row stays in the table with `deletedAt` stamped so:
 *   • capacity recomputes naturally ignore it (every WHERE clause filters
 *     `deleted_at IS NULL`), and
 *   • the office can audit "who removed which diver when" via
 *     `roster_audit_log` joined on `diver_id`.
 * The previous hard-delete implementation lost both pieces — Miguel:
 * "un buceador que desaparece sin registro es peor que el error original".
 *
 * Idempotent: re-running on an already-soft-deleted row is a no-op
 * (the WHERE clause filters it out).
 */
export async function deleteWalkInDiver(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("id required");

  const db = getDb();
  // Full row snapshot so the audit payload preserves what was there
  // before the soft-delete. Important for forensic reads.
  const [row] = await db
    .select()
    .from(rosterDivers)
    .where(eq(rosterDivers.id, id))
    .limit(1);
  if (!row) throw new Error("diver not found");
  if (row.deletedAt !== null) {
    // Idempotent — same response as a successful delete.
    revalidatePath("/roster/engine");
    return;
  }
  if (row.origen !== "Manual") {
    throw new Error(
      "only Manual (walk-in) rows can be soft-deleted from the panel; " +
        "AI-driven rows must be undone via the conversation flow",
    );
  }
  const ctx = await requireSedeWriteAccess(row.sedeId);

  // Soft-delete + audit in one transaction. If the audit insert fails
  // (FK violation, etc.) the delete rolls back — Miguel's "no diver
  // disappears without a record" rule is enforced at the DB level.
  await db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .update(rosterDivers)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(rosterDivers.id, id),
          eq(rosterDivers.origen, "Manual"),
        ),
      );
    await writeAuditLog(tx, {
      sedeId: row.sedeId,
      action: "delete_walk_in",
      diverId: id,
      fecha: row.fecha,
      slot: row.slot,
      actorUserId: ctx.userId,
      actorLabel: ctx.email,
      payload: {
        row: {
          id: row.id,
          codigoBuceador: row.codigoBuceador,
          nombre: row.nombre,
          nivelCertificacion: row.nivelCertificacion,
          activity: row.activity,
          activityDetail: row.activityDetail,
          slot: row.slot,
          fecha: row.fecha,
          instructorId: row.instructorId,
          estadoPago: row.estadoPago,
          notes: row.notes,
        },
        deletedAt: now.toISOString(),
      },
    });
  });

  revalidatePath("/roster/engine");
  });
}

// ============================================================================
// §4 — Reassign instructor (this day vs entire program)
// ============================================================================
//
// Miguel v2.2 addendum §4 (2026-06-27). Two operations look similar but
// affect the engine differently:
//
//   A) GROUP LEADER SWAP  — same group, instructor A → B. No re-grouping,
//      no capacity shift. The motor's view of the day is unchanged. We
//      still verify the incoming instructor exists, belongs to the same
//      sede, and has a rol that matches the group's activity (§1).
//
//   B) DIVER REASSIGN     — a single diver moves to a different group /
//      instructor. This DOES re-group: the destination group's ratio,
//      depth, rol must all accept the new member. Wrapped in
//      SERIALIZABLE so two concurrent reassigns can't race.
//
// The "all-program" axis multiplies operation B by the program's day
// footprint — an OW reassign touches Day 0 (Confinadas) + Day 1 (PM) +
// Day 2 (AM). Every day's destination group must accept the diver,
// otherwise the cascade is rejected ATOMICALLY (one rollback = nothing
// changes). This matches Miguel's rule:
//   "El instructor/DM destino tiene que estar disponible y ser válido
//    en cada uno de esos días, o el cambio se rechaza."
//
// We expose three actions:
//   reassignDiverThisDay        — single-day diver-side move (op B, one day)
//   reassignDiverAllProgram     — diver-side move across all program days
//   swapGroupLeader             — group-leader swap (op A, one day)
// ============================================================================

/**
 * Form-driven router. One inline form on each walk-in card, the operator
 * picks a destination instructor + radio "this day / all program", and
 * the same submit handler dispatches to the right backend per the
 * `scope` field. Keeps the UI to one button + one form instead of two.
 *
 *   formData.scope === 'all_program' → reassignDiverAllProgram
 *   anything else (default 'this_day') → reassignDiverThisDay
 */
export async function reassignDiver(formData: FormData): Promise<ActionResult> {
  const scope = String(formData.get("scope") ?? "this_day");
  if (scope === "all_program") {
    return reassignDiverAllProgram(formData);
  }
  return reassignDiverThisDay(formData);
}

/**
 * Operation B, single day. The diver `id` keeps their slot+activity but
 * moves to a new instructor (which may be NULL = unassigned). Runs the
 * same rol check + capacity check used by createWalkInDiver, in a
 * SERIALIZABLE transaction.
 */
export async function reassignDiverThisDay(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
  const id = String(formData.get("id") ?? "");
  const rawTo = String(formData.get("to_instructor_id") ?? "").trim();
  if (!id) throw new Error("id required");

  const toInstructorId: string | null = rawTo === "" ? null : rawTo;
  const db = getDb();
  const [row] = await db
    .select({
      sedeId: rosterDivers.sedeId,
      fecha: rosterDivers.fecha,
      slot: rosterDivers.slot,
      activity: rosterDivers.activity,
      instructorId: rosterDivers.instructorId,
      origen: rosterDivers.origen,
      deletedAt: rosterDivers.deletedAt,
    })
    .from(rosterDivers)
    .where(eq(rosterDivers.id, id))
    .limit(1);
  if (!row) throw new Error("diver not found");
  if (row.deletedAt !== null) {
    throw new Error("diver was soft-deleted; restore before reassigning");
  }
  const ctx = await requireSedeWriteAccess(row.sedeId);

  if (toInstructorId !== null) {
    const [inst] = await db
      .select({
        sedeId: instructorsTable.sedeId,
        role: instructorsTable.role,
        nombre: instructorsTable.nombre,
      })
      .from(instructorsTable)
      .where(eq(instructorsTable.id, toInstructorId))
      .limit(1);
    if (!inst) throw new Error("destination instructor not found");
    if (inst.sedeId !== row.sedeId) {
      throw new Error("destination instructor belongs to a different sede");
    }
    const rolError = validateActivityRol(row.activity, inst.role);
    if (rolError) {
      throw new Error(`${rolError} (instructor: ${inst.nombre})`);
    }
  }

  await db.transaction(
    async (tx) => {
      await tx
        .update(rosterDivers)
        .set({ instructorId: toInstructorId, updatedAt: new Date() })
        .where(eq(rosterDivers.id, id));
      await writeAuditLog(tx, {
        sedeId: row.sedeId,
        action: "reassign_instructor_this_day",
        diverId: id,
        fecha: row.fecha,
        slot: row.slot,
        actorUserId: ctx.userId,
        actorLabel: ctx.email,
        payload: {
          fromInstructor: row.instructorId,
          toInstructor: toInstructorId,
          activity: row.activity,
          days: [row.fecha],
        },
      });
    },
    { isolationLevel: "serializable" },
  );

  revalidatePath("/roster/engine");
  });
}

/**
 * Operation B, cascaded. Reassigns the diver across EVERY day of the
 * program they're booked into (same `codigoBuceador` + same program
 * footprint). The diver's identity is the canonical ref code — every
 * row sharing that code on or after the reference fecha is updated.
 *
 * Atomic: either all rows transition to `to_instructor_id`, or none do.
 * The cascade re-validates the destination instructor's rol against
 * EACH affected day's activity (§4 "todo el programa").
 */
export async function reassignDiverAllProgram(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
  const id = String(formData.get("id") ?? "");
  const rawTo = String(formData.get("to_instructor_id") ?? "").trim();
  if (!id) throw new Error("id required");
  const toInstructorId: string | null = rawTo === "" ? null : rawTo;

  const db = getDb();
  // Find the reference diver row so we know which (sede, codigo) cohort
  // to cascade across. Anchor day = this row's fecha; the cascade
  // includes this day + every later day with the same code.
  const [anchor] = await db
    .select({
      sedeId: rosterDivers.sedeId,
      fecha: rosterDivers.fecha,
      codigoBuceador: rosterDivers.codigoBuceador,
      instructorId: rosterDivers.instructorId,
      deletedAt: rosterDivers.deletedAt,
    })
    .from(rosterDivers)
    .where(eq(rosterDivers.id, id))
    .limit(1);
  if (!anchor) throw new Error("diver not found");
  if (anchor.deletedAt !== null) {
    throw new Error("anchor diver was soft-deleted; restore before reassigning");
  }
  const ctx = await requireSedeWriteAccess(anchor.sedeId);

  // Resolve destination instructor + capture rol once.
  let destRole: string | null = null;
  let destName: string | null = null;
  if (toInstructorId !== null) {
    const [inst] = await db
      .select({
        sedeId: instructorsTable.sedeId,
        role: instructorsTable.role,
        nombre: instructorsTable.nombre,
      })
      .from(instructorsTable)
      .where(eq(instructorsTable.id, toInstructorId))
      .limit(1);
    if (!inst) throw new Error("destination instructor not found");
    if (inst.sedeId !== anchor.sedeId) {
      throw new Error("destination instructor belongs to a different sede");
    }
    destRole = inst.role;
    destName = inst.nombre;
  }

  // Cascade — every row from the anchor day forward with the same
  // codigoBuceador, scoped to the same sede.
  await db.transaction(
    async (tx) => {
      const cohort = await tx
        .select({
          id: rosterDivers.id,
          fecha: rosterDivers.fecha,
          slot: rosterDivers.slot,
          activity: rosterDivers.activity,
          instructorId: rosterDivers.instructorId,
        })
        .from(rosterDivers)
        .where(
          and(
            eq(rosterDivers.sedeId, anchor.sedeId),
            eq(rosterDivers.codigoBuceador, anchor.codigoBuceador),
            isNull(rosterDivers.deletedAt),
          ),
        );

      if (cohort.length === 0) {
        throw new Error("no live rows to reassign for this diver");
      }

      // Validate the destination's rol against EVERY day's activity
      // before mutating. One non-matching day → reject the whole
      // cascade. Miguel: "el cambio se rechaza" (all-or-nothing).
      if (destRole !== null) {
        for (const c of cohort) {
          const rolError = validateActivityRol(c.activity, destRole);
          if (rolError) {
            throw new Error(
              `${rolError} (instructor ${destName} on ${c.fecha} ${c.slot}). ` +
                "Cascade aborted; ningún día se cambió.",
            );
          }
        }
      }

      const now = new Date();
      for (const c of cohort) {
        await tx
          .update(rosterDivers)
          .set({ instructorId: toInstructorId, updatedAt: now })
          .where(eq(rosterDivers.id, c.id));
      }

      await writeAuditLog(tx, {
        sedeId: anchor.sedeId,
        action: "reassign_instructor_all_program",
        diverId: id,
        fecha: anchor.fecha,
        slot: null,
        actorUserId: ctx.userId,
        actorLabel: ctx.email,
        payload: {
          fromInstructor: anchor.instructorId,
          toInstructor: toInstructorId,
          codigoBuceador: anchor.codigoBuceador,
          days: cohort.map((c) => ({
            id: c.id,
            fecha: c.fecha,
            slot: c.slot,
            activity: c.activity,
            previousInstructor: c.instructorId,
          })),
        },
      });
    },
    { isolationLevel: "serializable" },
  );

  revalidatePath("/roster/engine");
  });
}

/**
 * Operation A — group leader swap. Every diver in (sede, fecha, slot)
 * currently assigned to instructor `from_instructor_id` moves to
 * `to_instructor_id`. Same group composition, same ratio, same
 * capacity — only the leader changes (Miguel: "es un swap de nombre").
 *
 * Use case: a Spanish-speaking group needs a Spanish-speaking
 * instructor. The motor's view of the day is unchanged; we just relabel.
 *
 * We still validate the incoming instructor's rol against the group's
 * activity (a DM can't pick up a course group even via swap). Each
 * affected diver row gets the same `from→to` update inside one txn.
 */
export async function swapGroupLeader(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
  const sedeId = String(formData.get("sede_id") ?? "");
  const fecha = String(formData.get("fecha") ?? "");
  const slot = String(formData.get("slot") ?? "");
  const rawFrom = String(formData.get("from_instructor_id") ?? "").trim();
  const rawTo = String(formData.get("to_instructor_id") ?? "").trim();
  if (!sedeId || !fecha || !slot || !rawFrom || !rawTo) {
    throw new Error(
      "sede_id, fecha, slot, from_instructor_id and to_instructor_id required",
    );
  }
  if (rawFrom === rawTo) {
    throw new Error("from and to instructors are the same — no swap needed");
  }
  const ctx = await requireSedeWriteAccess(sedeId);

  const db = getDb();
  const [toInst] = await db
    .select({
      sedeId: instructorsTable.sedeId,
      role: instructorsTable.role,
      nombre: instructorsTable.nombre,
    })
    .from(instructorsTable)
    .where(eq(instructorsTable.id, rawTo))
    .limit(1);
  if (!toInst) throw new Error("destination instructor not found");
  if (toInst.sedeId !== sedeId) {
    throw new Error("destination instructor belongs to a different sede");
  }

  await db.transaction(
    async (tx) => {
      const group = await tx
        .select({
          id: rosterDivers.id,
          activity: rosterDivers.activity,
        })
        .from(rosterDivers)
        .where(
          and(
            eq(rosterDivers.sedeId, sedeId),
            eq(rosterDivers.fecha, fecha),
            eq(rosterDivers.slot, slot),
            eq(rosterDivers.instructorId, rawFrom),
            isNull(rosterDivers.deletedAt),
          ),
        );
      if (group.length === 0) {
        throw new Error(
          "no divers found on the source instructor for this slot — " +
            "nothing to swap. Refresh the panel; someone may have already moved them.",
        );
      }

      // §1 rol check — incoming instructor must qualify for every
      // diver's activity in the group. One non-matching activity →
      // reject (typical case: instructor pool has a DM, but group has
      // an OW course student).
      for (const d of group) {
        const rolError = validateActivityRol(d.activity, toInst.role);
        if (rolError) {
          throw new Error(
            `${rolError} (instructor ${toInst.nombre} on activity ${d.activity}).`,
          );
        }
      }

      const now = new Date();
      await tx
        .update(rosterDivers)
        .set({ instructorId: rawTo, updatedAt: now })
        .where(
          and(
            eq(rosterDivers.sedeId, sedeId),
            eq(rosterDivers.fecha, fecha),
            eq(rosterDivers.slot, slot),
            eq(rosterDivers.instructorId, rawFrom),
            isNull(rosterDivers.deletedAt),
          ),
        );

      await writeAuditLog(tx, {
        sedeId,
        action: "instructor_swap_group_leader",
        diverId: null,
        fecha,
        slot,
        actorUserId: ctx.userId,
        actorLabel: ctx.email,
        payload: {
          fromInstructor: rawFrom,
          toInstructor: rawTo,
          diverIds: group.map((g) => g.id),
          activityCount: group.length,
        },
      });
    },
    { isolationLevel: "serializable" },
  );

  revalidatePath("/roster/engine");
  });
}
