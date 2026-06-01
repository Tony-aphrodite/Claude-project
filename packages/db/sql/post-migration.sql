-- ============================================================================
-- Hand-written post-migration SQL applied after drizzle-kit migrations.
-- Contains things Drizzle ORM does not model: Row Level Security policies,
-- partial indexes, generated columns, and seed data.
-- All statements MUST be idempotent — this file runs on every deploy.
-- ============================================================================

-- ── Structural safety net for the chat_contacts refactor ────────────────────
-- The owner runs a separate operational system (payments registry) that joins
-- on Respond.io's contact_id. Identity for clients lives in chat_contacts;
-- conversaciones is just thread state. These guards make the migration
-- forward-only safe even if drizzle-generated SQL ran on an older DB.
CREATE TABLE IF NOT EXISTS chat_contacts (
  respond_io_contact_id text PRIMARY KEY,
  phone text,
  name text,
  language text,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  sede_id uuid REFERENCES sedes(id),
  external_customer_id text,
  metadata jsonb,
  pii_deletion_requested boolean NOT NULL DEFAULT FALSE,
  pii_retention_until timestamptz,
  last_synced_at timestamptz NOT NULL DEFAULT NOW(),
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chat_contacts_sede_idx ON chat_contacts (sede_id);
CREATE INDEX IF NOT EXISTS chat_contacts_phone_idx ON chat_contacts (phone);
CREATE INDEX IF NOT EXISTS chat_contacts_external_idx ON chat_contacts (external_customer_id);

-- Backfill chat_contacts from any pre-refactor rows of conversaciones that
-- still hold the legacy client_* columns. Skip silently when the columns are
-- already gone.
DO $$
DECLARE
  has_legacy boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversaciones' AND column_name = 'client_phone'
  ) INTO has_legacy;

  IF has_legacy THEN
    INSERT INTO chat_contacts (
      respond_io_contact_id, phone, name, language, sede_id,
      pii_deletion_requested, pii_retention_until, last_synced_at, created_at
    )
    SELECT DISTINCT ON (COALESCE(respond_io_contact_id, client_phone))
           COALESCE(respond_io_contact_id, client_phone),
           client_phone,
           client_name,
           client_language,
           sede_id,
           COALESCE(pii_deletion_requested, FALSE),
           pii_retention_until,
           NOW(),
           created_at
      FROM conversaciones
     WHERE COALESCE(respond_io_contact_id, client_phone) IS NOT NULL
    ON CONFLICT (respond_io_contact_id) DO NOTHING;
  END IF;
END $$;

-- Add the contact FK column to conversaciones, then point conversations at
-- the freshly populated chat_contacts row before dropping the legacy fields.
ALTER TABLE conversaciones
  ADD COLUMN IF NOT EXISTS respond_io_contact_id text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversaciones' AND column_name = 'client_phone'
  ) THEN
    UPDATE conversaciones
       SET respond_io_contact_id = COALESCE(respond_io_contact_id, client_phone)
     WHERE respond_io_contact_id IS NULL;
  END IF;
END $$;

ALTER TABLE conversaciones
  DROP COLUMN IF EXISTS client_phone,
  DROP COLUMN IF EXISTS client_name,
  DROP COLUMN IF EXISTS client_language,
  DROP COLUMN IF EXISTS pii_retention_until,
  DROP COLUMN IF EXISTS pii_deletion_requested;

DROP INDEX IF EXISTS conversaciones_phone_idx;

-- Once data is consistent, enforce NOT NULL + FK on the new contact column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversaciones'
      AND column_name = 'respond_io_contact_id'
      AND is_nullable = 'YES'
  )
  AND NOT EXISTS (
    SELECT 1 FROM conversaciones WHERE respond_io_contact_id IS NULL
  ) THEN
    ALTER TABLE conversaciones
      ALTER COLUMN respond_io_contact_id SET NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'conversaciones'
      AND constraint_name = 'conversaciones_respond_io_contact_id_fk'
  ) THEN
    ALTER TABLE conversaciones
      ADD CONSTRAINT conversaciones_respond_io_contact_id_fk
      FOREIGN KEY (respond_io_contact_id)
      REFERENCES chat_contacts(respond_io_contact_id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS conversaciones_contact_idx
  ON conversaciones (respond_io_contact_id);

-- mensajes.fuentes — stores citation refs (e.g. "kb:ow-course") for AI rows.
ALTER TABLE mensajes
  ADD COLUMN IF NOT EXISTS fuentes jsonb;

-- ── conversaciones lead pipeline (espía-monitoreo) ──────────────────────────
-- The AI advances lead_stage automatically on specific events (deposit tool,
-- negative intent); humans correct it from the panel kanban.
ALTER TABLE conversaciones
  ADD COLUMN IF NOT EXISTS lead_stage text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS lead_stage_changed_at timestamptz NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS lead_metadata jsonb,
  ADD COLUMN IF NOT EXISTS assigned_agent text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE table_name = 'conversaciones'
       AND constraint_name = 'conversaciones_lead_stage_check'
  ) THEN
    ALTER TABLE conversaciones
      ADD CONSTRAINT conversaciones_lead_stage_check
      CHECK (lead_stage IN (
        'new','qualified','proposed','deposit_pending',
        'deposit_paid','handed_off','closed','lost'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS conversaciones_lead_stage_idx
  ON conversaciones (lead_stage, lead_stage_changed_at);

-- ── Partial index for the follow-up scanner hot path ─────────────────────────
-- The 15-min scanner needs O(log n) access to "due, not sent, not cancelled"
-- rows. A partial index keeps it tiny even at 100k+ historical rows.
CREATE INDEX IF NOT EXISTS follow_ups_due_partial_idx
  ON follow_ups (scheduled_at)
  WHERE sent_at IS NULL AND cancelled_at IS NULL;

-- ── Row Level Security ───────────────────────────────────────────────────────
-- Enable RLS on every multi-tenant table. The panel uses Supabase Auth and
-- sets request.jwt.claim.brand_id; the server uses the service-role key which
-- bypasses RLS, so this gates the panel only.
ALTER TABLE brands              ENABLE ROW LEVEL SECURITY;
ALTER TABLE sedes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_contacts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_documents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompts_versiones   ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversaciones      ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensajes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE llamadas_api        ENABLE ROW LEVEL SECURITY;
ALTER TABLE errores             ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_ups          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pii_retention_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE roster_cache        ENABLE ROW LEVEL SECURITY;

-- Helper: extract brand_id from the current JWT, NULL if not authenticated.
CREATE OR REPLACE FUNCTION current_brand_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.brand_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

-- Drop-and-recreate pattern is idempotent and easy to reason about for policies.
DROP POLICY IF EXISTS tenant_isolation_brands ON brands;
CREATE POLICY tenant_isolation_brands ON brands
  FOR ALL
  USING (id = current_brand_id())
  WITH CHECK (id = current_brand_id());

DROP POLICY IF EXISTS tenant_isolation_sedes ON sedes;
CREATE POLICY tenant_isolation_sedes ON sedes
  FOR ALL
  USING (brand_id IS NULL OR brand_id = current_brand_id());

DROP POLICY IF EXISTS tenant_isolation_chat_contacts ON chat_contacts;
CREATE POLICY tenant_isolation_chat_contacts ON chat_contacts
  FOR ALL
  USING (sede_id IS NULL OR sede_id IN (SELECT id FROM sedes WHERE brand_id = current_brand_id()));

DROP POLICY IF EXISTS tenant_isolation_kb ON kb_documents;
CREATE POLICY tenant_isolation_kb ON kb_documents
  FOR ALL
  USING (sede_id IN (SELECT id FROM sedes WHERE brand_id = current_brand_id()));

DROP POLICY IF EXISTS tenant_isolation_prompts ON prompts_versiones;
CREATE POLICY tenant_isolation_prompts ON prompts_versiones
  FOR ALL
  USING (sede_id IS NULL OR sede_id IN (SELECT id FROM sedes WHERE brand_id = current_brand_id()));

DROP POLICY IF EXISTS tenant_isolation_conv ON conversaciones;
CREATE POLICY tenant_isolation_conv ON conversaciones
  FOR ALL
  USING (sede_id IN (SELECT id FROM sedes WHERE brand_id = current_brand_id()));

DROP POLICY IF EXISTS tenant_isolation_msg ON mensajes;
CREATE POLICY tenant_isolation_msg ON mensajes
  FOR ALL
  USING (
    conversacion_id IN (
      SELECT c.id FROM conversaciones c
      JOIN sedes s ON s.id = c.sede_id
      WHERE s.brand_id = current_brand_id()
    )
  );

DROP POLICY IF EXISTS tenant_isolation_llamadas ON llamadas_api;
CREATE POLICY tenant_isolation_llamadas ON llamadas_api
  FOR ALL
  USING (sede_id IS NULL OR sede_id IN (SELECT id FROM sedes WHERE brand_id = current_brand_id()));

DROP POLICY IF EXISTS tenant_isolation_errores ON errores;
CREATE POLICY tenant_isolation_errores ON errores
  FOR ALL
  USING (
    conversacion_id IS NULL
    OR conversacion_id IN (
      SELECT c.id FROM conversaciones c
      JOIN sedes s ON s.id = c.sede_id
      WHERE s.brand_id = current_brand_id()
    )
  );

DROP POLICY IF EXISTS tenant_isolation_followups ON follow_ups;
CREATE POLICY tenant_isolation_followups ON follow_ups
  FOR ALL
  USING (
    conversacion_id IN (
      SELECT c.id FROM conversaciones c
      JOIN sedes s ON s.id = c.sede_id
      WHERE s.brand_id = current_brand_id()
    )
  );

-- pii_retention_policy is global config; only authenticated users may read.
DROP POLICY IF EXISTS read_pii_policy ON pii_retention_policy;
CREATE POLICY read_pii_policy ON pii_retention_policy
  FOR SELECT
  USING (current_brand_id() IS NOT NULL);

DROP POLICY IF EXISTS tenant_isolation_roster ON roster_cache;
CREATE POLICY tenant_isolation_roster ON roster_cache
  FOR ALL
  USING (sede_id IN (SELECT id FROM sedes WHERE brand_id = current_brand_id()));

-- ── updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'sedes_set_updated_at'
  ) THEN
    CREATE TRIGGER sedes_set_updated_at
      BEFORE UPDATE ON sedes
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'conversaciones_set_updated_at'
  ) THEN
    CREATE TRIGGER conversaciones_set_updated_at
      BEFORE UPDATE ON conversaciones
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ── Seed: PII retention default ──────────────────────────────────────────────
-- chat_contacts is now the canonical PII home; mensajes still has free-text
-- bodies that need scrubbing on retention.
INSERT INTO pii_retention_policy (retention_days, auto_delete_enabled, applies_to)
SELECT 365, true, ARRAY['chat_contacts', 'mensajes']
WHERE NOT EXISTS (SELECT 1 FROM pii_retention_policy);

UPDATE pii_retention_policy
   SET applies_to = ARRAY['chat_contacts', 'mensajes']
 WHERE applies_to IS DISTINCT FROM ARRAY['chat_contacts', 'mensajes'];

-- ── Regression suite tables ──────────────────────────────────────────────────
-- Telemetry for the @dpm/regression package. Kept out of Drizzle because they
-- are operational, not user-facing.
CREATE TABLE IF NOT EXISTS regression_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_version_id uuid REFERENCES prompts_versiones(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  total_cases integer NOT NULL,
  pass_rate numeric(5, 4) NOT NULL,
  avg_tone numeric(4, 2) NOT NULL,
  avg_accuracy numeric(4, 2) NOT NULL,
  avg_relevance numeric(4, 2) NOT NULL,
  avg_anti_hallucination numeric(4, 2) NOT NULL,
  avg_effectiveness numeric(4, 2) NOT NULL,
  avg_overall numeric(4, 2) NOT NULL,
  total_cost_usd numeric(10, 6) NOT NULL,
  avg_latency_ms integer NOT NULL,
  review_queue_size integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS regression_runs_prompt_version_idx
  ON regression_runs (prompt_version_id, created_at DESC);

CREATE TABLE IF NOT EXISTS regression_case_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES regression_runs(id) ON DELETE CASCADE,
  case_id text NOT NULL,
  generated_response text NOT NULL,
  latency_ms integer NOT NULL,
  cost_usd numeric(10, 6) NOT NULL,
  cache_hit_rate numeric(4, 3) NOT NULL,
  deterministic_passed boolean NOT NULL,
  deterministic_failures jsonb NOT NULL,
  judge_scores jsonb,
  needs_human_review boolean NOT NULL DEFAULT FALSE,
  review_reason text,
  human_verdict text, -- approve | reject | escalate (filled in by panel)
  human_notes text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS regression_cases_run_idx
  ON regression_case_results (run_id);
CREATE INDEX IF NOT EXISTS regression_cases_review_idx
  ON regression_case_results (needs_human_review)
  WHERE needs_human_review = TRUE AND human_verdict IS NULL;

ALTER TABLE regression_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE regression_case_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS regression_runs_read ON regression_runs;
CREATE POLICY regression_runs_read ON regression_runs
  FOR ALL USING (current_brand_id() IS NOT NULL);

DROP POLICY IF EXISTS regression_cases_read ON regression_case_results;
CREATE POLICY regression_cases_read ON regression_case_results
  FOR ALL USING (current_brand_id() IS NOT NULL);

-- ── Seed: pilot brand + 5 sedes (idempotent on respond_io_tag) ───────────────
INSERT INTO brands (id, name)
SELECT '00000000-0000-0000-0000-000000000001'::uuid, 'DPM Diving'
WHERE NOT EXISTS (SELECT 1 FROM brands WHERE id = '00000000-0000-0000-0000-000000000001'::uuid);

INSERT INTO sedes (nombre, pais, timezone, currency_code, currency_symbol, languages_supported, roster_source, respond_io_tag, brand_id)
VALUES
  ('Koh Tao',         'Thailand',  'Asia/Bangkok',   'THB', '฿',  ARRAY['en','es'], 'apps_script_url', 'sede:koh_tao',         '00000000-0000-0000-0000-000000000001'),
  ('Koh Phi Phi',     'Thailand',  'Asia/Bangkok',   'THB', '฿',  ARRAY['en','es'], 'apps_script_url', 'sede:phi_phi',         '00000000-0000-0000-0000-000000000001'),
  ('Gili Trawangan',  'Indonesia', 'Asia/Makassar',  'IDR', 'Rp', ARRAY['en','es'], 'apps_script_url', 'sede:gili_trawangan',  '00000000-0000-0000-0000-000000000001'),
  ('Gili Air',        'Indonesia', 'Asia/Makassar',  'IDR', 'Rp', ARRAY['en','es'], 'apps_script_url', 'sede:gili_air',        '00000000-0000-0000-0000-000000000001'),
  ('Nusa Penida',     'Indonesia', 'Asia/Makassar',  'IDR', 'Rp', ARRAY['en','es'], 'apps_script_url', 'sede:nusa_penida',     '00000000-0000-0000-0000-000000000001')
ON CONFLICT (respond_io_tag) DO NOTHING;

-- Backfill: existing pilot DBs were seeded with nombre='Phi Phi' but the
-- Respond.io Branch custom field uses the verbatim "Koh Phi Phi" string
-- (Miguel 2026-05-04 owner-confirmed). Align the DB row so SedeService
-- can match the Branch value directly without a renaming map. Idempotent.
UPDATE sedes SET nombre = 'Koh Phi Phi'
 WHERE respond_io_tag = 'sede:phi_phi' AND nombre = 'Phi Phi';

-- ── sedes.behavior_config ──────────────────────────────────────────────────
-- Per-sede behavior overrides (follow-up cadence, post-purchase grace window).
-- Shape:
--   {
--     "follow_up_hours": [6, 12]         -- optional; overrides global cadence
--     "post_purchase_grace_minutes": 120 -- optional; default 0 (no grace)
--   }
-- Added 2026-05-26 to honor Miguel's Phi Phi-specific request before flip:
-- two follow-ups at 6h and +6h, then stop; 2-hour post-purchase window where
-- Francisco still handles logistics before silencing for the human team.
ALTER TABLE sedes
  ADD COLUMN IF NOT EXISTS behavior_config jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Seed Phi Phi's per-sede config. Idempotent — runs on every deploy and
-- overwrites the previous value with the canonical one (so if anyone tweaks
-- this in the DB by hand to debug, the next deploy snaps it back to spec).
UPDATE sedes
   SET behavior_config = '{
     "follow_up_hours": [6, 12],
     "post_purchase_grace_minutes": 120
   }'::jsonb
 WHERE respond_io_tag = 'sede:phi_phi';
