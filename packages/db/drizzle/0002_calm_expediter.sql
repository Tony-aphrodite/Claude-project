CREATE TABLE IF NOT EXISTS "roster_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sede_id" uuid NOT NULL,
	"fecha" text NOT NULL,
	"turno" text NOT NULL,
	"programa" text NOT NULL,
	"pax" integer DEFAULT 1 NOT NULL,
	"conversacion_id" uuid,
	"contact_id" text,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	"cancel_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "roster_capacity_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sede_id" uuid NOT NULL,
	"fecha" text NOT NULL,
	"turno" text NOT NULL,
	"capacity" integer NOT NULL,
	"reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_debug_log" (
	"id" integer PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_field" text,
	"event_type" text,
	"contact_id" text,
	"text_len" integer,
	"has_attachment" boolean,
	"direction" text,
	"sender_type" text,
	"classified_as" text,
	"body" jsonb
);
--> statement-breakpoint
ALTER TABLE "sedes" ADD COLUMN "behavior_config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "roster_bookings" ADD CONSTRAINT "roster_bookings_sede_id_sedes_id_fk" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "roster_bookings" ADD CONSTRAINT "roster_bookings_conversacion_id_conversaciones_id_fk" FOREIGN KEY ("conversacion_id") REFERENCES "public"."conversaciones"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "roster_capacity_overrides" ADD CONSTRAINT "roster_capacity_overrides_sede_id_sedes_id_fk" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roster_bookings_sede_fecha_turno_idx" ON "roster_bookings" USING btree ("sede_id","fecha","turno");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roster_bookings_status_idx" ON "roster_bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roster_bookings_conv_idx" ON "roster_bookings" USING btree ("conversacion_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "roster_cap_overrides_sede_fecha_turno_idx" ON "roster_capacity_overrides" USING btree ("sede_id","fecha","turno");