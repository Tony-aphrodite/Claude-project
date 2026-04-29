# Adding a new sede

Estimated effort: $400-$600, 3-5 days. Most of it is content (KB), not code.

## Pre-requisites

- A new Respond.io tag exists (e.g. `sede:maldives`).
- 20-30 sample sales conversations from that sede, anonymized per
  `fixtures/regression/cases/README.md`.

## Steps

1. **Insert the sede row.**
   ```sql
   INSERT INTO sedes (
     nombre, pais, timezone, currency_code, currency_symbol,
     languages_supported, roster_source, respond_io_tag, brand_id
   ) VALUES (
     'Maldives', 'Maldives', 'Indian/Maldives', 'USD', '$',
     ARRAY['en','es'], 'apps_script_url', 'sede:maldives',
     '00000000-0000-0000-0000-000000000001'
   );
   ```

2. **Upload the KB** to Supabase Storage (bucket `kb-documents`,
   filename `maldives_v1.md`). Then:
   ```sql
   INSERT INTO kb_documents (sede_id, storage_path, version, active)
   VALUES (
     (SELECT id FROM sedes WHERE nombre = 'Maldives'),
     'kb-documents/maldives_v1.md',
     1, TRUE
   );
   ```

3. **Roster source** — if Apps Script:
   ```sql
   UPDATE sedes
      SET roster_config = '{"url": "https://script.google.com/.../exec"}'::jsonb
    WHERE nombre = 'Maldives';
   ```

4. **(Optional) Sede-specific prompt override.** Most sedes don't need this,
   the global system prompt handles tone uniformly. Add only if a sede has
   regional rules (e.g. religious sensitivity in some Islamic destinations).

5. **Add 5-10 regression cases** for that sede:
   ```bash
   cp fixtures/regression/cases/001-... fixtures/regression/cases/0NN-maldives-...json
   # edit sedeId, sedeName, content
   ```

6. **Add the KB** to fixtures: `fixtures/regression/kb/maldives.md`.

7. **Run regression** against the active prompt + new sede:
   ```bash
   pnpm regression -- run --version=active \
     --cases=fixtures/regression/cases \
     --kb-dir=fixtures/regression/kb
   ```
   Pass rate must stay ≥ 95%.

8. **Add WhatsApp templates** for the new sede if its language differs.
   Edit `whatsapp-templates.ts` and submit to Meta for approval.

9. **Live smoke test** — Miguel sends 1 real WhatsApp from a personal
   number with the `sede:maldives` tag set. Check `/conversations` for the
   thread.

## Rollback

If something breaks: `UPDATE sedes SET active = FALSE WHERE nombre = 'Maldives'`.
The sede service won't match it on tag lookup; we fall back to pilot
(Gili Trawangan) so the AI still answers but for the wrong sede — Miguel
should pause incoming messages with that tag in Respond.io until the
sede is fixed and reactivated.
