CREATE TABLE IF NOT EXISTS "roster_bookings_sandbox" (
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
DO $$ BEGIN
 ALTER TABLE "roster_bookings_sandbox" ADD CONSTRAINT "roster_bookings_sandbox_sede_id_sedes_id_fk" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "roster_bookings_sandbox" ADD CONSTRAINT "roster_bookings_sandbox_conversacion_id_conversaciones_id_fk" FOREIGN KEY ("conversacion_id") REFERENCES "public"."conversaciones"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roster_bookings_sandbox_sede_fecha_turno_idx" ON "roster_bookings_sandbox" USING btree ("sede_id","fecha","turno");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roster_bookings_sandbox_status_idx" ON "roster_bookings_sandbox" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roster_bookings_sandbox_conv_idx" ON "roster_bookings_sandbox" USING btree ("conversacion_id");