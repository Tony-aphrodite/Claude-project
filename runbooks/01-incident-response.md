# Incident response runbook

Activated whenever:
- AI is sending wrong information to clients (priority 0)
- AI is silent (no replies for > 10 min on active conversations) — priority 0
- Latency P95 > 5s sustained for 15 min — priority 1
- Anthropic spend hit daily cap — priority 1
- Follow-up sending to clients who already said "no" — priority 0

## Communication

WhatsApp direct (Steve ↔ Miguel). NOT Workana. SLA: 4h business hours, 12h
otherwise. Escalation to Workana written log within 24h regardless.

## Self-diagnosis (do this BEFORE asking for Respond.io session)

```bash
# 1. Are we even up?
curl https://<railway-url>/health
curl https://<railway-url>/ready

# 2. Recent error rate
psql $DATABASE_URL -c "
  SELECT source, error_type, COUNT(*)
    FROM errores
   WHERE created_at >= NOW() - INTERVAL '15 minutes'
   GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 10;
"

# 3. Latency in the last hour
psql $DATABASE_URL -c "
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50,
         percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95,
         COUNT(*) AS calls
    FROM llamadas_api
   WHERE created_at >= NOW() - INTERVAL '1 hour';
"

# 4. Anthropic API status
open https://status.anthropic.com

# 5. Supabase project status
open https://status.supabase.com
```

## Kill switch (stop AI replies immediately)

If we're sending wrong info to multiple clients:

1. In the panel: Prompts → active version → mark inactive (no replacement).
2. Server will fall back to placeholder text that says "te contactará un
   instructor humano". This is intentional — better silent than wrong.
3. Notify Miguel: he routes those conversations to human agents inside
   Respond.io.

Restoration: only after the bug is fixed AND a regression run passes.

## Cost runaway (Anthropic spend > daily cap)

The server's `assertWithinDailyBudget` already refuses calls above the cap.
If the cap is triggered:

1. Check the panel "Costo (24h)" tile to see if traffic spiked organically.
2. Check `llamadas_api` for retry storms — same `conversacion_id` with many
   calls in seconds.
3. If runaway, stop the server (Railway → suspend), fix, redeploy.
4. Increase the cap via env var only after Miguel approves.

## Respond.io send_message failures

Symptom: AI generates a response, logs it, but client never receives.

1. Check `errores WHERE source = 'respond_io'`.
2. Verify Respond.io API key hasn't been rotated.
3. If 401/403 — key issue. Rotate via Miguel's panel.
4. If 429 — we're being rate-limited. Add retries with backoff (file an
   issue, this is a code change not a runbook fix).
5. If the conversation is outside the 24h window, the error will say so —
   we should have used a template. Check `whatsapp-templates.ts` for an
   approved template at the right level.
