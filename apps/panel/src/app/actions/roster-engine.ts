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

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  computeReservedCapacityBySlot,
  getDb,
  instructorAvailability,
  instructors as instructorsTable,
  rosterDivers,
  sedes,
} from "@dpm/db";
import { generateRefCode, isValidRefCode } from "@dpm/shared";

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

import { requireSedeWriteAccess } from "~/lib/auth-context";

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

export async function createInstructor(formData: FormData): Promise<void> {
  const sedeId = String(formData.get("sede_id") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const nombreLegal = String(formData.get("nombre_legal") ?? "").trim() || null;
  const languagesRaw = String(formData.get("languages") ?? "").trim();
  const languages = languagesRaw
    ? languagesRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
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
    active: true,
  });

  revalidatePath("/roster/instructors");
}

export async function setInstructorActive(formData: FormData): Promise<void> {
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
}

export async function renameInstructor(formData: FormData): Promise<void> {
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
}

// ─── Availability ──────────────────────────────────────────────────

// Miguel 2026-06-26: POOL split into POOL_AM and POOL_PM so the office
// can schedule morning vs afternoon pool sessions as separate operational
// blocks (the legacy /roster page already separates ConfinadasAM /
// ConfinadasPM; the engine is now aligned with that reality).
const ALL_SLOTS = ["AM", "PM", "POOL_AM", "POOL_PM", "NIGHT"] as const;

export async function setAvailability(formData: FormData): Promise<void> {
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
export async function setAvailabilityBulk(formData: FormData): Promise<void> {
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

export async function createWalkInDiver(formData: FormData): Promise<void> {
  const sedeId = String(formData.get("sede_id") ?? "");
  await requireSedeWriteAccess(sedeId);
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
  // to this sede. Foreign-key would catch it but the error would be
  // opaque; this gives a useful message.
  if (instructorId !== null) {
    const [inst] = await db
      .select({ sedeId: instructorsTable.sedeId })
      .from(instructorsTable)
      .where(eq(instructorsTable.id, instructorId))
      .limit(1);
    if (!inst) throw new Error("instructor not found");
    if (inst.sedeId !== sedeId) {
      throw new Error("instructor belongs to a different sede");
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
      await tx.insert(rosterDivers).values({
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
      });
    },
    { isolationLevel: "serializable" },
  );

  revalidatePath("/roster/engine");
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
export async function updateWalkInDiver(formData: FormData): Promise<void> {
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
    })
    .from(rosterDivers)
    .where(eq(rosterDivers.id, id))
    .limit(1);
  if (!row) throw new Error("diver not found");
  if (row.origen !== "Manual") {
    throw new Error("only Manual (walk-in) rows can be edited from the panel");
  }
  await requireSedeWriteAccess(row.sedeId);

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

  const rawInstructorId = String(formData.get("instructor_id") ?? "").trim();
  if (formData.has("instructor_id")) {
    // Empty string is meaningful here: "unassign". UUID = assign.
    if (rawInstructorId === "") {
      patch.instructorId = null;
    } else {
      const [inst] = await db
        .select({ sedeId: instructorsTable.sedeId })
        .from(instructorsTable)
        .where(eq(instructorsTable.id, rawInstructorId))
        .limit(1);
      if (!inst) throw new Error("instructor not found");
      if (inst.sedeId !== row.sedeId) {
        throw new Error("instructor belongs to a different sede");
      }
      patch.instructorId = rawInstructorId;
    }
  }

  const rawActivity = String(formData.get("activity") ?? "").trim();
  if (rawActivity !== "" && rawActivity !== row.currentActivity) {
    if (!(ALL_ACTIVITIES as readonly string[]).includes(rawActivity)) {
      throw new Error(`invalid activity: ${rawActivity}`);
    }
    patch.activity = rawActivity;
    // Recompute depth profile to match the new activity. We don't have
    // a "use old depth" override on edits — the depth is derived from
    // (activity, nivel) and should stay coherent with whatever activity
    // the diver ends up on.
    patch.perfilProfundidad = defaultDepthForActivity(rawActivity, row.currentNivel);
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
          .where(and(eq(rosterDivers.id, id), eq(rosterDivers.origen, "Manual")));
      },
      { isolationLevel: "serializable" },
    );
  } else {
    await db
      .update(rosterDivers)
      .set(patch)
      .where(and(eq(rosterDivers.id, id), eq(rosterDivers.origen, "Manual")));
  }

  revalidatePath("/roster/engine");
}

export async function deleteWalkInDiver(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("id required");

  const db = getDb();
  // Resolve the diver row's sedeId so we can authorize against it.
  const [row] = await db
    .select({ sedeId: rosterDivers.sedeId })
    .from(rosterDivers)
    .where(eq(rosterDivers.id, id))
    .limit(1);
  await requireSedeWriteAccess(row?.sedeId ?? null);

  await db
    .delete(rosterDivers)
    .where(
      and(eq(rosterDivers.id, id), eq(rosterDivers.origen, "Manual")),
    );

  revalidatePath("/roster/engine");
}
