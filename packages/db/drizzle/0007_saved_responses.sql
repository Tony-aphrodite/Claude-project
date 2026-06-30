-- Resilience layer #7 (Miguel 2026-06-12, deployed 2026-06-30):
-- "Botón Guardar respuesta" — operator-curated library of good AI
-- replies, reused by the future quick-reply panel (#6).

CREATE TABLE IF NOT EXISTS "saved_responses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sede_id" uuid,
  "name" text NOT NULL,
  "response_text" text NOT NULL,
  "prompt_text" text,
  "tags" text[] NOT NULL DEFAULT ARRAY[]::text[],
  "language" text NOT NULL DEFAULT 'es',
  "created_by_user_id" uuid,
  "created_by_label" text,
  "source_conversacion_id" uuid,
  "source_mensaje_id" uuid,
  "times_used" integer NOT NULL DEFAULT 0,
  "last_used_at" timestamp with time zone,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Foreign keys (idempotent — re-runs are safe).
DO $$ BEGIN
 ALTER TABLE "saved_responses"
   ADD CONSTRAINT "saved_responses_sede_id_sedes_id_fk"
   FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id")
   ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saved_responses"
   ADD CONSTRAINT "saved_responses_source_conversacion_id_conversaciones_id_fk"
   FOREIGN KEY ("source_conversacion_id") REFERENCES "public"."conversaciones"("id")
   ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saved_responses"
   ADD CONSTRAINT "saved_responses_source_mensaje_id_mensajes_id_fk"
   FOREIGN KEY ("source_mensaje_id") REFERENCES "public"."mensajes"("id")
   ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Indexes for the read paths the panel actually uses.
CREATE INDEX IF NOT EXISTS "saved_responses_sede_archived_idx"
  ON "saved_responses" ("sede_id", "archived_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saved_responses_language_idx"
  ON "saved_responses" ("language");
--> statement-breakpoint
-- GIN index on tags so the quick-reply panel's "filter by tag" stays
-- fast as the library grows. Drizzle doesn't model GIN indexes
-- directly, so it lives in the SQL.
CREATE INDEX IF NOT EXISTS "saved_responses_tags_gin_idx"
  ON "saved_responses" USING GIN ("tags");
