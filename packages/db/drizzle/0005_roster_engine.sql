-- Intelligent Roster Engine (Miguel 2026-06-24 spec v2.1)
-- See docs/roster-engine-architecture.md + reference/roster-engine-spec-2026-06-24.md
--
-- Adds 4 new tables:
--   instructors             — master list per sede
--   instructor_availability — per-day staffing per sede
--   roster_divers           — one row per diver per dive-day
--   roster_groups           — engine output, one row per group
--
-- Coexists with the existing `roster_bookings` + `roster_bookings_sandbox`
-- tables during the shadow-mode rollout (spec §9). Once the engine drives
-- sales, per-pax detail moves here and `roster_bookings` becomes audit-only.

-- ───────────────────────────────────────────────────────────────────────────
-- instructors
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "instructors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sede_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"nombre_legal" text,
	"languages" text[],
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "instructors" ADD CONSTRAINT "instructors_sede_id_sedes_id_fk" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "instructors_sede_nombre_unique" ON "instructors" ("sede_id","nombre");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "instructors_sede_active_idx" ON "instructors" ("sede_id","active");
--> statement-breakpoint

-- ───────────────────────────────────────────────────────────────────────────
-- instructor_availability
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "instructor_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sede_id" uuid NOT NULL,
	"fecha" text NOT NULL,
	"instructor_id" uuid NOT NULL,
	"slots" text[] NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "instructor_availability" ADD CONSTRAINT "instructor_availability_sede_id_sedes_id_fk" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "instructor_availability" ADD CONSTRAINT "instructor_availability_instructor_id_instructors_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "instructor_availability_sfi_unique" ON "instructor_availability" ("sede_id","fecha","instructor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "instructor_availability_sede_fecha_idx" ON "instructor_availability" ("sede_id","fecha");
--> statement-breakpoint

-- ───────────────────────────────────────────────────────────────────────────
-- roster_divers
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "roster_divers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sede_id" uuid NOT NULL,
	"fecha" text NOT NULL,
	"slot" text NOT NULL,
	"codigo_buceador" text NOT NULL,
	"nombre" text NOT NULL,
	"nivel_certificacion" text NOT NULL,
	"activity" text NOT NULL,
	"activity_detail" text,
	"perfil_profundidad" integer NOT NULL,
	"accepts_cap" boolean DEFAULT false NOT NULL,
	"origen" text NOT NULL,
	"estado_pago" text DEFAULT 'pending' NOT NULL,
	"conversacion_id" uuid,
	"instructor_id" uuid,
	"group_id" uuid,
	"group_order" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "roster_divers" ADD CONSTRAINT "roster_divers_sede_id_sedes_id_fk" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "roster_divers" ADD CONSTRAINT "roster_divers_conversacion_id_conversaciones_id_fk" FOREIGN KEY ("conversacion_id") REFERENCES "public"."conversaciones"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "roster_divers" ADD CONSTRAINT "roster_divers_instructor_id_instructors_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roster_divers_sede_fecha_slot_idx" ON "roster_divers" ("sede_id","fecha","slot");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roster_divers_conv_idx" ON "roster_divers" ("conversacion_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roster_divers_codigo_idx" ON "roster_divers" ("codigo_buceador");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roster_divers_instructor_fecha_idx" ON "roster_divers" ("instructor_id","fecha");
--> statement-breakpoint

-- ───────────────────────────────────────────────────────────────────────────
-- roster_groups
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "roster_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sede_id" uuid NOT NULL,
	"fecha" text NOT NULL,
	"slot" text NOT NULL,
	"instructor_id" uuid,
	"grupo_actividad" text NOT NULL,
	"perfil_profundidad" integer NOT NULL,
	"ratio_max" integer NOT NULL,
	"site_1" text,
	"site_2" text,
	"divers_count" integer DEFAULT 0 NOT NULL,
	"engine_run_id" uuid,
	"source" text DEFAULT 'shadow' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "roster_groups" ADD CONSTRAINT "roster_groups_sede_id_sedes_id_fk" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "roster_groups" ADD CONSTRAINT "roster_groups_instructor_id_instructors_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roster_groups_sede_fecha_slot_idx" ON "roster_groups" ("sede_id","fecha","slot");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roster_groups_engine_run_idx" ON "roster_groups" ("engine_run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roster_groups_source_idx" ON "roster_groups" ("source");
