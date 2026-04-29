# DPM Diving × Claude API Integration

Respond.io ↔ Claude API middleware for DPM Diving. Pilot: Gili Trawangan
(1 of 5 sedes). Architecture is config-driven for the other 4 sedes
(Koh Tao, Phi Phi, Gili Air, Nusa Penida).

See [DPM_Diving_Project_Guide.md](DPM_Diving_Project_Guide.md) for the full
project guide (timeline, milestones, NDA, escalation).

---

## Status

NDA signed. Escrow received. **Code complete** at the level the project
needs to start serving real WhatsApp traffic. Still required for live pilot:

- Anthropic Tier 2 upgrade ($100 charge → 24-72h approval)
- Real KB content uploaded to Supabase Storage by Miguel's team
- WhatsApp Meta-approved templates submitted (3-5 templates)
- Mystery Shopping execution (Fase 0) → produces system prompt v1 and
  the first 5-8 inline few-shots
- 40 curated few-shot conversations from Miguel's team
- Respond.io webhook URL pointed at the Railway-deployed server

---

## Repo layout

```
apps/
  server/              # Fastify webhook server (Railway)
  panel/               # Next.js 15 monitoring + prompt editor (Vercel/Railway)
packages/
  shared/              # Constants + zod types
  db/                  # Drizzle schema + migrations + seeds
  regression/          # 3-layer regression suite + CLI
fixtures/
  regression/cases/    # Curated conversation cases (target: 100)
  regression/kb/       # Per-sede KB blobs for the test runner
fase-0/                # Mystery Shopping playbook + few-shot collection templates
runbooks/              # Incident response, prompt promotion, sede onboarding
.github/workflows/     # CI + on-demand regression
DPM_Diving_Project_Guide.md  # Full project guide
```

## Architecture in one diagram

```
WhatsApp → Respond.io → [HMAC-verified webhook]
                            │
                            ▼
                    ┌─────────────────────────┐
                    │  Fastify server         │
                    │  (apps/server, Railway) │
                    │                         │
                    │  ┌─ process-message ─┐  │
                    │  │ 1. sede ID        │  │
                    │  │ 2. history load   │  │
                    │  │ 3. prompt+KB load │  │
                    │  │ 4. 4-block prompt │  │
                    │  │ 5. roster fetch   │  │     parallel
                    │  │ 6. Claude call    │──┼──→  Anthropic
                    │  │    + tool_use     │  │
                    │  │ 7. send back      │──┼──→  Respond.io
                    │  └───────────────────┘  │
                    │                         │
                    │  + follow-up scanner    │
                    │  + PII retention cron   │
                    └────────────┬────────────┘
                                 │
                                 ▼
                            Supabase
                  (PostgreSQL + Storage + Auth)
                                 ▲
                                 │ RLS-gated reads
                    ┌────────────┴────────────┐
                    │ Next.js panel           │
                    │ (apps/panel)            │
                    │ • Dashboard             │
                    │ • Conversations         │
                    │ • Prompts editor        │
                    │ • Follow-ups            │
                    │ • Regression results    │
                    └─────────────────────────┘
```

## Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 20 + TypeScript |
| Web server | Fastify 5 |
| AI | `@anthropic-ai/sdk` (Sonnet 4.6 default, Haiku 4.5 for cheap tasks) |
| DB | Supabase Postgres + Drizzle ORM |
| Hosting (server) | Railway |
| Panel | Next.js 15 + Tailwind + Supabase Auth |
| Tests | Vitest |
| Logs | pino → Axiom/Logtail (production) |

## Setup

```bash
# 1. Install
pnpm install

# 2. Copy env template + fill in your guest credentials
cp .env.example .env

# 3. Apply migrations + seed pilot brand/sedes/system-prompt-v1
pnpm db:migrate

# 4. Boot server (terminal 1)
pnpm server:dev

# 5. Boot panel (terminal 2)
pnpm panel:dev   # http://localhost:3001

# 6. Run tests
pnpm test
```

## Smoke test the webhook locally

```bash
BODY='{"event":"message.created","contact":{"id":"42","tags":["sede:gili_trawangan"]},"message":{"text":"hola, info OW por favor","type":"text"},"conversation":{"id":"c-1"}}'
SIG=$(node -e "console.log('sha256='+require('crypto').createHmac('sha256',process.env.RESPOND_IO_WEBHOOK_SECRET).update(process.argv[1]).digest('hex'))" "$BODY")

curl -X POST http://localhost:3000/webhook/respond-io \
  -H "content-type: application/json" \
  -H "x-respond-signature: $SIG" \
  -d "$BODY"
```

You should see one row each in `conversaciones`, `mensajes` (×2: client + AI),
`llamadas_api`. The follow-up scanner schedules level-1 follow-up after
4h of silence; you can see it in `/follow-ups` of the panel.

## Regression suite

```bash
# Run against the active prompt
pnpm regression -- run \
  --version=active \
  --cases=fixtures/regression/cases \
  --kb-dir=fixtures/regression/kb

# Skip the LLM judge (cheap deterministic-only run)
pnpm regression -- run --version=active --cases=... --kb-dir=... --skip-judge

# Trigger from CI: GitHub Actions → "Regression suite" workflow → Run
```

Pass rate ≥ 95% auto-marks `prompts_versiones.regression_suite_passed = true`.
Promotion in the panel is gated on that flag (see
[runbooks/02-prompt-promotion.md](runbooks/02-prompt-promotion.md)).

## Deployment

### Server (Railway)

1. Create a Railway project, link GitHub repo.
2. Add all `.env.example` vars to Railway environment.
3. Railway uses `apps/server/Dockerfile` automatically (see `railway.toml`).
4. Pre-deploy step: `pnpm --filter @dpm/db run migrate`.
5. Health check: `/ready` returns 503 until DB pool is alive.

### Panel (Vercel or Railway)

```bash
# Vercel
vercel link  # in apps/panel
vercel env add NEXT_PUBLIC_SUPABASE_URL ...
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY ...
vercel env add DATABASE_URL ...
vercel env add NEXT_PUBLIC_PANEL_URL ...
vercel deploy --prod
```

Or Railway as a second service in the same project.

## What each module does

| Module | Purpose |
|---|---|
| `services/sede.ts` | Resolves Respond.io tag → sede row (with pilot fallback) |
| `services/conversation.ts` | Upsert conversation + sliding-window history |
| `services/prompts.ts` | Loads active system prompt + KB from Supabase |
| `services/prompt-builder.ts` | 4-block prompt with cache_control (guide §7) |
| `services/anthropic.ts` | Claude API call + tool_use loop + cost tracking |
| `services/apps-script.ts` | Google Apps Script roster fetch with 2s timeout + cache |
| `services/respond-io.ts` | Outbound API client (text + template) |
| `services/follow-up.ts` | 5-level scanner + processor + Claude generator |
| `services/negative-intent.ts` | Semantic detection of "no me interesa" multi-language |
| `services/whatsapp-templates.ts` | Meta-approved template registry + 24h window guard |
| `services/pii-retention.ts` | Hourly cron: redact PII past 12-month policy |
| `tools/consultar-disponibilidad.ts` | Anthropic tool for roster lookups |
| `handlers/process-message.ts` | Wires steps 1-10 from guide §6 |

## Testing

- Unit tests: `pnpm test` (HMAC, prompt builder, deterministic regression
  layer, WhatsApp template selection)
- Integration: locally via the curl smoke test above
- End-to-end: Mystery Shopping (Fase 0) + 5-7 real customers in Semana 6

## Confidentiality

NDA in [DPM_Diving_Project_Guide.md §19](DPM_Diving_Project_Guide.md). Code
held under 6-month post-delivery clause. Do not share screenshots or
database dumps externally without Miguel's written approval.

`chatting.txt` is .gitignored for new clones. If you need it removed from
git history: `git rm --cached chatting.txt && git commit`.
