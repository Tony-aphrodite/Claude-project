-- Roster Engine v2.2 Addendum (Miguel 2026-06-27) — schema changes for
-- §1, §3 and §6 of the addendum doc
-- (reference/2026-06-27-miguel-roster-engine-spec-v2.2-addendum.md).
--
-- §1: Distinguish Divemaster (DM) from Instructor in `instructors.role`.
--     A DM can only guide fun dives; an instructor can guide everything.
-- §3: Soft-delete + audit log for walk-in CRUD — no diver disappears
--     from history without a record (auditability + capacity recomputes
--     stay consistent).
-- §6: Audit log doubles as the substrate for "every mutation re-runs
--     the motor" — every action that touches a diver leaves a row.

-- ───────────────────────────────────────────────────────────────────────────
-- §1: instructors.role
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE "instructors"
  ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'instructor';
--> statement-breakpoint
-- Document the valid values; we don't add a CHECK constraint so the app
-- layer can evolve the list without an ALTER (matches the rest of the
-- roster schema — see `turno` / `activity` / `nivel_certificacion`).
COMMENT ON COLUMN "instructors"."role" IS
  'instructor | divemaster (Miguel v2.2 addendum §1). DMs can guide only fun dives; instructors can guide courses + fun dives.';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "instructors_sede_role_idx" ON "instructors" ("sede_id", "role");
--> statement-breakpoint

-- ───────────────────────────────────────────────────────────────────────────
-- §3: roster_divers soft-delete
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE "roster_divers"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
--> statement-breakpoint
-- Partial index — only "live" divers. All availability / engine queries
-- filter `WHERE deleted_at IS NULL`; the existing sede_fecha_slot index
-- still helps but this one keeps the live-set scan tight even as the
-- soft-deleted set grows over months.
CREATE INDEX IF NOT EXISTS "roster_divers_live_sede_fecha_slot_idx"
  ON "roster_divers" ("sede_id", "fecha", "slot")
  WHERE "deleted_at" IS NULL;
--> statement-breakpoint

-- ───────────────────────────────────────────────────────────────────────────
-- §3 + §6: roster_audit_log
-- ───────────────────────────────────────────────────────────────────────────
-- Every panel mutation (create / update / delete walk-in, plus instructor
-- reassign, plus future motor re-runs) writes one row here. Append-only;
-- no UPDATE / DELETE paths exposed.
CREATE TABLE IF NOT EXISTS "roster_audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sede_id" uuid NOT NULL,
  -- "create_walk_in" | "update_walk_in" | "delete_walk_in" |
  -- "reassign_instructor_this_day" | "reassign_instructor_all_program" |
  -- "instructor_swap_group_leader" | "revalidate_motor"
  "action" text NOT NULL,
  -- Subject is the diver in walk-in actions; nullable for actions that
  -- don't target a single diver (e.g. an instructor-swap on a whole
  -- group might list multiple diver ids inside the payload).
  "diver_id" uuid,
  "fecha" text,
  "slot" text,
  "actor_user_id" uuid,
  "actor_label" text,
  -- Free-form snapshot. For updates: {"before": {...}, "after": {...}}.
  -- For deletes: full row before the soft-delete. For reassigns: from
  -- + to instructor + day count.
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "roster_audit_log"
   ADD CONSTRAINT "roster_audit_log_sede_id_sedes_id_fk"
   FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id")
   ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "roster_audit_log"
   ADD CONSTRAINT "roster_audit_log_diver_id_roster_divers_id_fk"
   FOREIGN KEY ("diver_id") REFERENCES "public"."roster_divers"("id")
   ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roster_audit_log_sede_created_idx"
  ON "roster_audit_log" ("sede_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roster_audit_log_diver_idx"
  ON "roster_audit_log" ("diver_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roster_audit_log_sede_fecha_idx"
  ON "roster_audit_log" ("sede_id", "fecha");
