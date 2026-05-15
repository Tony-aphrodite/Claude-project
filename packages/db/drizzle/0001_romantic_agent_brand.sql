CREATE TABLE IF NOT EXISTS "replay_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"replay_run_id" uuid NOT NULL,
	"idx" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"fuentes" jsonb,
	"tool_calls" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "replay_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_conversacion_id" uuid NOT NULL,
	"prompt_version_id" uuid NOT NULL,
	"prompt_version_label" text,
	"created_by" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"cost_usd_total" text,
	"message_count" text,
	"error_message" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "simulator_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"conversacion_id" uuid NOT NULL,
	"prompt_version_id" uuid,
	"created_by" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversaciones" ADD COLUMN "origin" text DEFAULT 'production' NOT NULL;--> statement-breakpoint
ALTER TABLE "mensajes" ADD COLUMN "origin" text DEFAULT 'production' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "replay_messages" ADD CONSTRAINT "replay_messages_replay_run_id_replay_runs_id_fk" FOREIGN KEY ("replay_run_id") REFERENCES "public"."replay_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "replay_runs" ADD CONSTRAINT "replay_runs_source_conversacion_id_conversaciones_id_fk" FOREIGN KEY ("source_conversacion_id") REFERENCES "public"."conversaciones"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "simulator_sessions" ADD CONSTRAINT "simulator_sessions_conversacion_id_conversaciones_id_fk" FOREIGN KEY ("conversacion_id") REFERENCES "public"."conversaciones"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "replay_messages_run_idx" ON "replay_messages" USING btree ("replay_run_id","idx");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "replay_runs_source_idx" ON "replay_runs" USING btree ("source_conversacion_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "replay_runs_status_idx" ON "replay_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "simulator_sessions_name_idx" ON "simulator_sessions" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "simulator_sessions_created_at_idx" ON "simulator_sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversaciones_origin_idx" ON "conversaciones" USING btree ("origin");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mensajes_origin_idx" ON "mensajes" USING btree ("origin");