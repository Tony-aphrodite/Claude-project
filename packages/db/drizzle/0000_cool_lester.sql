CREATE TABLE IF NOT EXISTS "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"whatsapp_number_id" text,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_contacts" (
	"respond_io_contact_id" text PRIMARY KEY NOT NULL,
	"phone" text,
	"name" text,
	"language" text,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"sede_id" uuid,
	"external_customer_id" text,
	"metadata" jsonb,
	"pii_deletion_requested" boolean DEFAULT false NOT NULL,
	"pii_retention_until" timestamp with time zone,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"respond_io_conversation_id" text NOT NULL,
	"respond_io_contact_id" text NOT NULL,
	"sede_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"lead_stage" text DEFAULT 'new' NOT NULL,
	"lead_stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lead_metadata" jsonb,
	"assigned_agent" text,
	"follow_up_state" jsonb,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "errores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"conversacion_id" uuid,
	"error_type" text,
	"error_message" text,
	"stack_trace" text,
	"context" jsonb,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversacion_id" uuid NOT NULL,
	"level" integer NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"message_sent" text,
	"client_responded" boolean DEFAULT false NOT NULL,
	"resulted_in_sale" boolean,
	"sale_amount_usd" numeric(10, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kb_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sede_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"version" integer NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"uploaded_by" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "llamadas_api" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversacion_id" uuid,
	"sede_id" uuid,
	"model" text NOT NULL,
	"prompt_version_id" uuid,
	"input_tokens" integer,
	"cache_read_tokens" integer,
	"cache_write_tokens" integer,
	"output_tokens" integer,
	"total_cost_usd" numeric(10, 6),
	"latency_ms" integer,
	"cache_hit" boolean,
	"tool_use_called" text[],
	"status" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mensajes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversacion_id" uuid NOT NULL,
	"sender" text NOT NULL,
	"agente_name" text,
	"content" text NOT NULL,
	"fuentes" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pii_retention_policy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"retention_days" integer DEFAULT 365 NOT NULL,
	"auto_delete_enabled" boolean DEFAULT true NOT NULL,
	"applies_to" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prompts_versiones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_number" integer NOT NULL,
	"type" text NOT NULL,
	"sede_id" uuid,
	"content" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"regression_suite_passed" boolean DEFAULT false NOT NULL,
	"regression_report_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "roster_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sede_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sedes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"pais" text NOT NULL,
	"timezone" text NOT NULL,
	"currency_code" text NOT NULL,
	"currency_symbol" text NOT NULL,
	"languages_supported" text[] DEFAULT ARRAY['en']::text[] NOT NULL,
	"min_age_certification" integer DEFAULT 10 NOT NULL,
	"roster_source" text NOT NULL,
	"roster_config" jsonb,
	"kb_document_id" uuid,
	"prompt_override_id" uuid,
	"respond_io_tag" text NOT NULL,
	"brand_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_contacts" ADD CONSTRAINT "chat_contacts_sede_id_sedes_id_fk" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_respond_io_contact_id_chat_contacts_respond_io_contact_id_fk" FOREIGN KEY ("respond_io_contact_id") REFERENCES "public"."chat_contacts"("respond_io_contact_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_sede_id_sedes_id_fk" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "errores" ADD CONSTRAINT "errores_conversacion_id_conversaciones_id_fk" FOREIGN KEY ("conversacion_id") REFERENCES "public"."conversaciones"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_conversacion_id_conversaciones_id_fk" FOREIGN KEY ("conversacion_id") REFERENCES "public"."conversaciones"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kb_documents" ADD CONSTRAINT "kb_documents_sede_id_sedes_id_fk" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "llamadas_api" ADD CONSTRAINT "llamadas_api_conversacion_id_conversaciones_id_fk" FOREIGN KEY ("conversacion_id") REFERENCES "public"."conversaciones"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "llamadas_api" ADD CONSTRAINT "llamadas_api_sede_id_sedes_id_fk" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "llamadas_api" ADD CONSTRAINT "llamadas_api_prompt_version_id_prompts_versiones_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "public"."prompts_versiones"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_conversacion_id_conversaciones_id_fk" FOREIGN KEY ("conversacion_id") REFERENCES "public"."conversaciones"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prompts_versiones" ADD CONSTRAINT "prompts_versiones_sede_id_sedes_id_fk" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "roster_cache" ADD CONSTRAINT "roster_cache_sede_id_sedes_id_fk" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sedes" ADD CONSTRAINT "sedes_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_contacts_sede_idx" ON "chat_contacts" USING btree ("sede_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_contacts_phone_idx" ON "chat_contacts" USING btree ("phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_contacts_external_idx" ON "chat_contacts" USING btree ("external_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversaciones_rio_id_unique" ON "conversaciones" USING btree ("respond_io_conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversaciones_sede_idx" ON "conversaciones" USING btree ("sede_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversaciones_status_idx" ON "conversaciones" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversaciones_contact_idx" ON "conversaciones" USING btree ("respond_io_contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversaciones_lead_stage_idx" ON "conversaciones" USING btree ("lead_stage","lead_stage_changed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "errores_source_idx" ON "errores" USING btree ("source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "errores_resolved_idx" ON "errores" USING btree ("resolved");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "follow_ups_conv_idx" ON "follow_ups" USING btree ("conversacion_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "follow_ups_scheduled_idx" ON "follow_ups" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kb_documents_sede_idx" ON "kb_documents" USING btree ("sede_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llamadas_sede_date_idx" ON "llamadas_api" USING btree ("sede_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llamadas_status_idx" ON "llamadas_api" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mensajes_conversacion_created_idx" ON "mensajes" USING btree ("conversacion_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompts_versiones_type_sede_idx" ON "prompts_versiones" USING btree ("type","sede_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompts_versiones_active_idx" ON "prompts_versiones" USING btree ("active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roster_cache_sede_expires_idx" ON "roster_cache" USING btree ("sede_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sedes_respond_io_tag_unique" ON "sedes" USING btree ("respond_io_tag");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sedes_brand_idx" ON "sedes" USING btree ("brand_id");