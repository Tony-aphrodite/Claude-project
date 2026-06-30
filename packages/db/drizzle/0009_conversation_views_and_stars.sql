-- Messenger-style sidebar (Steve 2026-06-30): per-(user, conversation)
-- tracking for the Unread + Starred tabs of the redesigned /conversations.
--
-- Both tables use composite PKs so a user can hold at most one view-stamp
-- and one star per conversation. Cascade on conversation delete; users
-- live in Supabase auth schema so no FK there.

CREATE TABLE IF NOT EXISTS "conversation_views" (
  "user_id" uuid NOT NULL,
  "conversacion_id" uuid NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "conversation_views_pk" PRIMARY KEY ("user_id", "conversacion_id")
);

DO $$ BEGIN
  ALTER TABLE "conversation_views"
    ADD CONSTRAINT "conversation_views_conversacion_id_fk"
    FOREIGN KEY ("conversacion_id") REFERENCES "conversaciones"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "conversation_views_user_seen_idx"
  ON "conversation_views" ("user_id", "last_seen_at");

CREATE TABLE IF NOT EXISTS "conversation_stars" (
  "user_id" uuid NOT NULL,
  "conversacion_id" uuid NOT NULL,
  "starred_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "conversation_stars_pk" PRIMARY KEY ("user_id", "conversacion_id")
);

DO $$ BEGIN
  ALTER TABLE "conversation_stars"
    ADD CONSTRAINT "conversation_stars_conversacion_id_fk"
    FOREIGN KEY ("conversacion_id") REFERENCES "conversaciones"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
