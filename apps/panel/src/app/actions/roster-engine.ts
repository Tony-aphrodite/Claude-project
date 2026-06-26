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
  getDb,
  instructorAvailability,
  instructors as instructorsTable,
  rosterDivers,
} from "@dpm/db";

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

const ALL_SLOTS = ["AM", "PM", "POOL", "NIGHT"] as const;

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
  const codigoBuceador =
    String(formData.get("codigo_buceador") ?? "").trim() ||
    `MANUAL-${Date.now().toString(36).toUpperCase()}`;
  const acceptsCap = String(formData.get("accepts_cap") ?? "") === "true";
  const notes = String(formData.get("notes") ?? "").trim() || null;

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

  const db = getDb();
  await db.insert(rosterDivers).values({
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
    notes,
  });

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
