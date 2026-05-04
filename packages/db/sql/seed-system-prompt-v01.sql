-- ============================================================================
-- DEPRECATED — seeding moved to packages/db/src/seed-content.ts
--
-- The system prompt and the KB bundle now ship as Markdown files in
-- /information/ at the repo root, and `tsx src/migrate.ts` (or
-- `tsx src/seed-content.ts`) reads + upserts them into prompts_versiones and
-- kb_documents respectively. The TypeScript path is what production runs.
--
-- This SQL file is kept (intentionally empty / no-op) so any external
-- tooling that still expects the path to exist does not break. Safe to
-- delete in the future.
-- ============================================================================

SELECT 1;
