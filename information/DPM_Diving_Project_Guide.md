# DPM Diving × Claude API Integration — Project Guide

> **Project:** Respond.io ↔ Claude API integration (DPM Diving, 5 dive centers)
> **Client:** Miguel Villar (DPM Diving / PT Dalam Propesional Menyelam)
> **Developer:** Steve (Singapore, GMT+8)
> **Contract amount:** USD 4,800
> **Duration:** 7 weeks (Phase 0 + 6 weeks development / pilot)
> **Start date:** Monday 2026-04-28 (planned)
> **Milestone 3 target:** 2026-06-15
> **Version:** 1.0 (snapshot at contract sign)

---

## 📋 Table of Contents

1. [Project Overview](#1-project-overview)
2. [Client Information](#2-client-information)
3. [Budget & Payment Structure](#3-budget--payment-structure)
4. [Timeline (weekly deliverables)](#4-timeline-weekly-deliverables)
5. [Tech Stack](#5-tech-stack)
6. [System Architecture](#6-system-architecture)
7. [4-Block Prompt Caching Structure](#7-4-block-prompt-caching-structure)
8. [Database Schema (Supabase)](#8-database-schema-supabase)
9. [Multi-sede Configuration](#9-multi-sede-configuration)
10. [Roster + Time Handling Logic](#10-roster--time-handling-logic)
11. [Follow-up Automation Module](#11-follow-up-automation-module)
12. [Mystery Shopping (Phase 0)](#12-mystery-shopping-phase-0)
13. [Few-shot Conversation Data](#13-few-shot-conversation-data)
14. [Regression Test Suite (3-Layer)](#14-regression-test-suite-3-layer)
15. [Monitoring Panel](#15-monitoring-panel)
16. [10 Yellow-Flag Risks & Mitigations](#16-10-yellow-flag-risks--mitigations)
17. [Cost Forecast](#17-cost-forecast)
18. [Access & Security](#18-access--security)
19. [NDA Summary](#19-nda-summary)
20. [Emergency Protocol](#20-emergency-protocol)
21. [Pre-flight Checklist](#21-pre-flight-checklist)
22. [Key Decisions Log](#22-key-decisions-log)

---

## 1. Project Overview

### Business Context
- DPM Diving operates **5 dive centers across Thailand and Indonesia**.
- All sales happen via **WhatsApp**.
- Currently runs on **Respond.io**, but Respond.io's built-in AI engine has a **10,000-character prompt limit** that blocks the catalog + sales playbook Miguel needs.
- The human sales team (Patrick, Giovanni, Grecia, etc.) is **losing 70–80% of potential sales to absent follow-up**.
- Miguel previously tried to build the system in-house → **failed** (every conversation today is handled by humans).

### Project Goals
1. Move the AI logic out of Respond.io's engine and onto the **Claude API**.
2. Keep response latency **under 3 seconds**.
3. Support the full KB (15–40k tokens per center) + unlimited prompt size.
4. **Multi-sede architecture from day 1** — 5 centers supported, scalable to ~10.
5. **Follow-up automation** to recover lost revenue.
6. Match the human team's quality of **trip-itinerary-aware proposals**.

### The 5 Dive Centers
- **Koh Tao** (Thailand, GMT+7, THB)
- **Phi Phi** (Thailand, GMT+7, THB)
- **Gili Trawangan** (Indonesia, GMT+8, IDR) ← **pilot center**
- **Gili Air** (Indonesia, GMT+8, IDR)
- **Nusa Penida** (Indonesia, GMT+8, IDR)

### Future Expansion (2–3 year horizon)
- Maldives, Mexico, New Zealand, Egypt.
- Multi-currency: THB, IDR, USD, MXN, NZD, EGP, EUR.
- Multi-language: Spanish, English, Italian, French, German, Portuguese, Dutch, Russian.

---

## 2. Client Information

### Legal entity (for NDA & contract)
- **Legal name:** PT Dalam Propesional Menyelam
- **NIB:** 9120001390428
- **Status:** PMA (Penanaman Modal Asing — foreign-investment Indonesian entity)
- **Address:** Dusun Gili Trawangan, Desa/Kelurahan Gili Indah, Kecamatan Pemenang, Kabupaten Lombok Utara, Provinsi Nusa Tenggara Barat 83352, Indonesia
- **Director:** Miguel Villar

### Communication ground rules (non-negotiable)
- ✅ **Workana chat only**.
- ❌ No video calls (Miguel is non-technical, real-time terminology is hard for him to follow).
- ✅ Every decision recorded in writing (trazabilidad).
- ✅ Weekly **Friday written report** delivered via Workana.

### Time zones
- Steve: Singapore (GMT+8).
- Miguel: Indonesia, Gili Trawangan (GMT+8).
- **Effectively the same zone** → scheduling supervised sessions is easy.

---

## 3. Budget & Payment Structure

### Total: **USD 4,800**
- Core work: USD 4,000.
- Follow-up module: USD 800.
- Mystery Shopping (Phase 0): absorbed into core (no separate billing).

### Payment Schedule 30 / 40 / 30 (Workana Escrow required)

| Milestone | Amount | Trigger | Target |
|---|---|---|---|
| **Milestone 1** (kickoff) | USD 1,440 | NDA signed + Escrow funded | 2026-04-25 ~ 27 |
| **Milestone 2** (mid) | USD 1,920 | First end-to-end message working (end of Week 3) | 2026-05-22 |
| **Milestone 3** (delivery) | USD 1,440 | Pilot completed with 10 real customers | 2026-06-15 |

### Out of scope (Miguel-funded)
- Anthropic Claude API usage ($400–$2,400 / month).
- Supabase Pro tier ($25 / month).
- Railway hosting ($20–$40 / month).
- Domain, SIM cards (if needed).
- Onboarding for the 4 remaining centers post-pilot (separate quote, $400–$600 per center).

### Kill Switch (Miguel-side protection)
- **End of Week 1:** if the webhook isn't working → pro-rated refund (Steve keeps 30–50 %, Workana arbitrates).
- **End of Week 2:** if Claude responses aren't working → same terms.

---

## 4. Timeline (Weekly Deliverables)

### Week 0 — Phase 0 (Discovery)
**Dates:** 2026-04-28 ~ 05-02
**Activities:**
- NDA signed + guest access provisioned to every service.
- Receive Miguel's source material (sales guide, price list, quick replies, 5–10 sample conversations).
- **Run Mystery Shopping:** 4 profiles × 3 numbers × 5 centers, 48–72 h of conversation each.
- File Anthropic Tier 1 → Tier 2 upgrade.
- Draft 3–5 WhatsApp follow-up templates and submit for Meta approval.

**Deliverables:**
- Mystery Shopping Report (10–20 pages).
- 8–15 few-shot example candidates.
- Draft system prompt (Block 1 v0.1).
- CSV / JSON templates handed to Miguel's team for data collection.

---

### Week 1 — Tech Infrastructure
**Dates:** 2026-05-05 ~ 05-09
**Activities:**
- Repository + module structure + base CI.
- Full Supabase schema with RLS enabled.
- Initial Railway deploy, health check, structured logging.
- Fastify server + Respond.io webhook (HMAC-verified).
- Anthropic usage alerts (50 / 75 / 100 %) + hard spending limit.
- First dummy Claude API call (connection sanity).

**Deliverables:**
- Webhook in/out working with dummy responses.
- **🔍 Mini-checkpoint:** if webhook isn't working, Kill Switch can trigger.

---

### Week 2 — Core Flow + Panel Early Launch
**Dates:** 2026-05-12 ~ 05-16
**Activities:**
- Sede identification (tag-based).
- Conversation history retrieval (sliding window).
- KB load + 4-block prompt with `cache_control`.
- Dynamic Block 4 injection (current time + 7-day roster + message).
- Automatic language detection.
- First real Claude call (KB loaded, caching active).
- **Panel early launch:** latency P50/P95/P99, volume, error log — 3 views.

**Deliverables:**
- Real customer message → real Claude reply (sede-specific KB applied).
- Cache hit rate observable.
- **🔍 Mini-checkpoint:** if Claude responses aren't working, Kill Switch can trigger.

---

### Week 3 — End-to-End Complete + Milestone 2
**Dates:** 2026-05-19 ~ 05-22 (Milestone 2: Fri 5/22)
**Activities:**
- Google Apps Script integration (conditional roster lookup).
- `tool_use` for `consultar_disponibilidad(sede, course, date)`.
- Trip-itinerary builder (Patrick / Giovanni style).
- Latency optimization: connection pooling, HTTP/2 keep-alive, aggressive timeouts.
- Concurrency test (100 simultaneous requests, sede isolation verified).
- Verify P95 latency < 3 s.
- Cache hit rate + token cost metrics in the panel.

**Deliverables:**
- ✅ **Milestone 2:** real end-to-end conversation with the Koh Tao center's KB.
- Concurrency test report.
- → **second payment USD 1,920 (Workana Escrow)**.

---

### Week 4 — Follow-up Automation Module
**Dates:** 2026-05-26 ~ 05-30
**Activities:**
- 15-minute scanner.
- 5-level state machine (4 h, 24 h, 48 h, 7 d, 30 d).
- Priority queue (BullMQ + Redis or in-memory p-queue).
- Claude-generated contextual follow-up messages.
- Negative-intent semantic detection: "no me interesa", "ya reservé", multi-language.
- Recovered-revenue attribution metric.
- Follow-up view in the panel.

**Deliverables:**
- 5-level follow-up firing correctly.
- Auto-disable logic (NLP-based).
- Metrics dashboard.

---

### Week 5 — Regression Suite + Panel Complete
**Dates:** 2026-06-02 ~ 06-06
**Activities:**
- Curate 100 conversations (Miguel collaborates, stratified sampling).
- Design + calibrate the LLM-as-judge rubric.
- 3-layer regression runner.
- Auto-trigger on every prompt change.
- Before/after diff report.
- Next.js panel: prompt versioning editor, alerts, rollback.
- User authentication + access control.

**Deliverables:**
- Regression suite runs on demand and on every prompt change.
- Full monitoring panel.

---

### Week 6 — Pilot Start (real traffic)
**Dates:** 2026-06-09 ~ 06-13
**Activities:**
- Production deploy, DNS / domain config.
- Real traffic enabled at Gili Trawangan.
- Monitor the first 5–7 customers closely.
- Fine-tune prompts based on real-world signal.
- Triage performance issues immediately if any.

**Deliverables:**
- 5–7 real customers handled end-to-end.
- Real data captured for analysis.

---

### Week 7 — Milestone 3 (10 customers + handover)
**Dates:** 2026-06-16 ~ 06-15 (or until target hit)
**Activities:**
- 10 real customers handled.
- Technical documentation (architecture, runbooks, troubleshooting).
- Operator guide (prompt editing, regression runs, metric interpretation).
- Onboarding plan for the 4 remaining centers.
- Async Q&A handover session.

**Deliverables:**
- ✅ **Milestone 3:** pilot complete.
- Tech docs + operator guide.
- → **third payment USD 1,440 (Workana Escrow)**.

> **⚠️ Milestone 3 is outcome-driven, not calendar-driven.** The trigger is "10 real customers handled end-to-end," not a date. Slipping into Week 8 is acceptable.

---

## 5. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| **Language** | TypeScript (Node.js 20+) | Better than Python on I/O-bound work; first-class Anthropic SDK. |
| **Web framework** | **Fastify** | 2–3× faster than Express; necessary for the 3-second latency target. |
| **Hosting** | **Railway** | Avoids Vercel cold-start; always-on container; keep-alive friendly. |
| **DB** | **Supabase** (PostgreSQL) | Client requirement; RLS prepares us for multi-sede / multi-tenant. |
| **ORM** | **Drizzle ORM** | Lighter and faster than Prisma; close to raw SQL when needed. |
| **AI SDK** | **@anthropic-ai/sdk** | Official; supports `cache_control` directly. |
| **Panel** | **Next.js 15 + shadcn/ui** | Fast dashboard; React Server Components hit Supabase directly. |
| **Tests** | **Vitest** + custom regression runner | TypeScript-native; faster than Jest. |
| **Error monitoring** | **Sentry** | Industry standard; free tier sufficient. |
| **Logs** | **Axiom** or **Logtail** | Structured logging; free tier sufficient. |
| **Queue** | **BullMQ + Redis** or **p-queue** | Follow-up scanner; choose based on volume. |
| **Language detection** | **franc** or **cld3** | <10 ms overhead. |
| **Apps Script calls** | `fetch` + `AbortController` | 2-second hard timeout + fallback path. |

### Model strategy
- **Default:** Claude Sonnet 4.6 (`claude-sonnet-4-6`).
- **Optional:** Haiku 4.5 (`claude-haiku-4-5-20251001`) for simple-query routing → ~30 % cost reduction.
- **LLM-as-judge:** Sonnet 4.6 (the judge needs to be accurate).

---

## 6. System Architecture

```
┌─────────────────┐
│   WhatsApp      │
│   (customer)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Respond.io    │  ← single WhatsApp number for all 5 sedes
│   (CRM)         │     sede identified by contact tag
└────────┬────────┘
         │ webhook (HMAC verified)
         ▼
┌─────────────────────────────────────────────┐
│   Middle Server (Railway, Fastify)          │
│  ┌─────────────────────────────────────┐    │
│  │ 1. Receive webhook + HMAC verify     │    │
│  │ 2. Identify sede (tag → DB lookup)   │    │
│  │ 3. Load history (sliding window)     │    │
│  │ 4. Load KB + prompt from Supabase    │    │
│  │ 5. Build 4-block prompt + cache_control │ │
│  │ 6. Dynamic block: time + roster + msg │   │
│  │ 7. Apps Script lookup (conditional)  │    │
│  │ 8. Claude API call (tool_use)        │    │
│  │ 9. Response processing + logging     │    │
│  │ 10. Send reply via Respond.io API    │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────┐  ┌──────────────────┐ │
│  │ Follow-up       │  │ Regression       │ │
│  │ Scanner (15min) │  │ Test Runner      │ │
│  └─────────────────┘  └──────────────────┘ │
└──────┬──────────┬──────────┬────────────────┘
       │          │          │
       ▼          ▼          ▼
  ┌────────┐ ┌─────────┐ ┌──────────┐
  │Supabase│ │Anthropic│ │  Apps    │
  │ (PG)   │ │  Claude │ │  Script  │
  └────────┘ └─────────┘ └──────────┘

┌─────────────────────────────────────┐
│  Monitoring Panel (Next.js)         │
│  - Latency P50/P95/P99              │
│  - Cache hit rate                   │
│  - Token usage + cost               │
│  - Error logs                       │
│  - Prompt editor (versioning)       │
│  - Follow-up state                  │
│  - Regression suite trigger         │
└─────────────────────────────────────┘
```

### Core principles
- **Stateless:** every request is independent; no shared mutable state.
- **Config-driven:** adding a new sede = a DB row, not a code change.
- **Auditable:** every API call, cost, and error is logged.
- **Resilient:** Apps Script timeouts, Anthropic rate limits, Respond.io 429s all handled gracefully.

---

## 7. 4-Block Prompt Caching Structure

### Core idea
The Anthropic API accepts up to **4 `cache_control` markers per request**. Everything **before** the last marker is cached.

### Structure

```typescript
const messages = [
  // ━━━ Block 1: System (cache 1h TTL) ━━━
  {
    role: "system",
    content: [
      {
        type: "text",
        text: SYSTEM_PROMPT_BASE + SALES_PLAYBOOK + FEW_SHOT_EXAMPLES,
        cache_control: { type: "ephemeral" }
      }
    ]
  },
  // ━━━ Block 2: Sede KB (cache 1h TTL) ━━━
  {
    role: "user",
    content: [
      {
        type: "text",
        text: KB_DE_LA_SEDE + REGULACIONES_LOCALES,
        cache_control: { type: "ephemeral" }
      }
    ]
  },
  // ━━━ Block 3: Conversation History (cache 5min TTL) ━━━
  {
    role: "user",
    content: [
      {
        type: "text",
        text: HISTORIAL_RECIENTE,  // sliding window: last N messages
        cache_control: { type: "ephemeral" }
      }
    ]
  },
  // ━━━ Block 4: Dynamic (NOT cached) ━━━
  {
    role: "user",
    content: [
      {
        type: "text",
        text: `
HORA ACTUAL: ${new Date().toLocaleString('en-US', { timeZone: sede.timezone })}
ZONA: ${sede.timezone}

ROSTER PRÓXIMOS 7 DÍAS:
${rosterFormateado}

MENSAJE DEL CLIENTE:
${incomingMessage}
        `.trim()
      }
    ]
  }
];
```

### Token distribution (estimate)
- Block 1: ~2,000 tokens (cached)
- Block 2: ~20,000 tokens (cached) — varies by sede (15k–40k)
- Block 3: ~3,000 tokens (cached)
- Block 4: ~1,500 tokens (NOT cached)
- **Total: ~26,500 tokens, cached ratio: ~94 %.**

### Cost impact
- Cache write (first call): $3.75 / M tokens.
- Cache read (subsequent calls): $0.30 / M tokens (90 % discount).
- Reused within 1 hour → ~85–90 % cost saving.

### Cache invalidation triggers
- KB update (~weekly) → auto re-cache.
- System prompt change → cache invalidated on new version activation.
- Natural TTL expiry (1 h).

---

## 8. Database Schema (Supabase)

### Tables

#### `sedes` (centers master)
```sql
CREATE TABLE sedes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  pais TEXT NOT NULL,
  timezone TEXT NOT NULL,           -- IANA: "Asia/Bangkok", "Asia/Makassar"
  currency_code TEXT NOT NULL,      -- "THB", "IDR"
  currency_symbol TEXT NOT NULL,    -- "฿", "Rp"
  languages_supported TEXT[] NOT NULL DEFAULT ARRAY['en'],
  min_age_certification INTEGER NOT NULL DEFAULT 10,
  roster_source TEXT NOT NULL,      -- "apps_script_url", "supabase_table", "api_externa"
  roster_config JSONB,               -- per-source config
  kb_document_id UUID REFERENCES kb_documents(id),
  prompt_override_id UUID REFERENCES prompts_versiones(id),
  respond_io_tag TEXT NOT NULL UNIQUE,
  brand_id UUID REFERENCES brands(id),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed (5 centers)
INSERT INTO sedes (nombre, pais, timezone, currency_code, ...) VALUES
  ('Koh Tao', 'Thailand', 'Asia/Bangkok', 'THB', ...),
  ('Phi Phi', 'Thailand', 'Asia/Bangkok', 'THB', ...),
  ('Gili Trawangan', 'Indonesia', 'Asia/Makassar', 'IDR', ...),
  ('Gili Air', 'Indonesia', 'Asia/Makassar', 'IDR', ...),
  ('Nusa Penida', 'Indonesia', 'Asia/Makassar', 'IDR', ...);
```

#### `brands` (multi-tenancy ready)
```sql
CREATE TABLE brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  whatsapp_number_id TEXT,
  config JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `conversaciones`
```sql
CREATE TABLE conversaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  respond_io_conversation_id TEXT NOT NULL UNIQUE,
  sede_id UUID NOT NULL REFERENCES sedes(id),
  client_phone TEXT NOT NULL,
  client_name TEXT,
  client_language TEXT,             -- auto-detected
  status TEXT DEFAULT 'active',     -- active, closed, follow_up_disabled
  follow_up_state JSONB,            -- {level: 0, last_sent_at: ..., disabled_reason: ...}
  closed_at TIMESTAMPTZ,
  pii_retention_until TIMESTAMPTZ,  -- 12-month retention policy
  pii_deletion_requested BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversaciones_sede ON conversaciones(sede_id);
CREATE INDEX idx_conversaciones_status ON conversaciones(status);
CREATE INDEX idx_conversaciones_phone ON conversaciones(client_phone);
```

#### `mensajes`
```sql
CREATE TABLE mensajes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id UUID NOT NULL REFERENCES conversaciones(id),
  sender TEXT NOT NULL,             -- "cliente", "ai", "agente_humano"
  agente_name TEXT,                 -- NULL when AI; agent name when human
  content TEXT NOT NULL,
  metadata JSONB,                   -- tag, quick_reply code, multimedia ref, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mensajes_conversacion ON mensajes(conversacion_id, created_at);
```

#### `prompts_versiones`
```sql
CREATE TABLE prompts_versiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_number INTEGER NOT NULL,
  type TEXT NOT NULL,               -- "system", "kb", "follow_up", "judge"
  sede_id UUID REFERENCES sedes(id),  -- NULL = global
  content TEXT NOT NULL,
  active BOOLEAN DEFAULT FALSE,
  created_by TEXT,
  regression_suite_passed BOOLEAN DEFAULT FALSE,
  regression_report_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `llamadas_api` (every Claude call logged)
```sql
CREATE TABLE llamadas_api (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id UUID REFERENCES conversaciones(id),
  sede_id UUID REFERENCES sedes(id),
  model TEXT NOT NULL,              -- "claude-sonnet-4-6", "claude-haiku-4-5"
  prompt_version_id UUID REFERENCES prompts_versiones(id),
  input_tokens INTEGER,
  cache_read_tokens INTEGER,
  cache_write_tokens INTEGER,
  output_tokens INTEGER,
  total_cost_usd DECIMAL(10,6),
  latency_ms INTEGER,
  cache_hit BOOLEAN,
  tool_use_called TEXT[],           -- names of tools invoked
  status TEXT,                      -- "success", "error", "timeout"
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_llamadas_sede_date ON llamadas_api(sede_id, created_at);
```

#### `errores`
```sql
CREATE TABLE errores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,             -- "anthropic", "supabase", "respond_io", "apps_script"
  conversacion_id UUID REFERENCES conversaciones(id),
  error_type TEXT,
  error_message TEXT,
  stack_trace TEXT,
  context JSONB,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `follow_ups`
```sql
CREATE TABLE follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id UUID NOT NULL REFERENCES conversaciones(id),
  level INTEGER NOT NULL,           -- 1=4h, 2=24h, 3=48h, 4=7d, 5=30d
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,         -- "client_responded", "negative_intent_detected", "manual"
  message_sent TEXT,
  client_responded BOOLEAN DEFAULT FALSE,
  resulted_in_sale BOOLEAN,         -- attribution
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_follow_ups_scheduled ON follow_ups(scheduled_at) WHERE sent_at IS NULL AND cancelled_at IS NULL;
```

#### `kb_documents` (Supabase Storage references)
```sql
CREATE TABLE kb_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sede_id UUID NOT NULL REFERENCES sedes(id),
  storage_path TEXT NOT NULL,
  version INTEGER NOT NULL,
  active BOOLEAN DEFAULT FALSE,
  uploaded_by TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `pii_retention_policy`
```sql
CREATE TABLE pii_retention_policy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retention_days INTEGER NOT NULL DEFAULT 365,  -- 12 months
  auto_delete_enabled BOOLEAN DEFAULT TRUE,
  applies_to TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Row Level Security (RLS)
**Enabled from day 1** — prepares for multi-sede + multi-brand:

```sql
ALTER TABLE sedes ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversaciones ENABLE ROW LEVEL SECURITY;
-- ... (every table)

-- Example policy: operators can only see their brand's conversations.
CREATE POLICY tenant_isolation ON conversaciones
  FOR ALL
  USING (sede_id IN (SELECT id FROM sedes WHERE brand_id = current_setting('app.current_brand_id')::uuid));
```

---

## 9. Multi-sede Configuration

### Core decision: **one AI + five sedes, config-driven**
- ❌ Five separate AI instances (5× code, 5× maintenance).
- ✅ **One unified AI**, per-sede KB + prompt + config.
- Reason: same brand, same sales style, same quick replies — only the data differs.

### Adding a new sede (post-pilot)
1. Insert a row in `sedes` (UI or SQL).
2. Upload the KB to Supabase Storage.
3. Fine-tune the prompt with 20–30 sample conversations from that sede.
4. Set the sede tag in Respond.io.
5. Run the regression suite to validate.
6. Activate.

**Estimated cost / time:** $400–$600, 3–5 days.

### Future expansion options

#### Option A: shared infra, multiple WhatsApp numbers
```sql
-- brand_id column supports multiple brands
SELECT * FROM sedes WHERE brand_id = 'dpm-thailand';  -- Thailand brand
SELECT * FROM sedes WHERE brand_id = 'dpm-indonesia'; -- Indonesia brand
```
- 1–2 days to go from 1 number → 2.
- Shared infra (panel, regression suite, monitoring).

#### Option B: fully separate instance
- Separate Railway workspace + Supabase + Anthropic key.
- One weekend of work.
- Fully independent (separate SLA, separate billing).

---

## 10. Roster + Time Handling Logic

### Core principles
- 70–80 % of conversations include "when is it available?"
- Server clock + sede timezone = **always accurate**.
- AI must never hallucinate time or availability → **mandatory `tool_use`**.

### Dynamic context injection (Block 4)
```typescript
const sedeNow = new Date().toLocaleString('en-US', {
  timeZone: sede.timezone,  // "Asia/Makassar"
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});

const roster7Days = await getRoster(sede.id, { days: 7 });
const rosterFormatted = formatRosterForPrompt(roster7Days);
```

### Tool: `consultar_disponibilidad`
```typescript
const tools = [
  {
    name: "consultar_disponibilidad",
    description: "Consulta la disponibilidad real de plazas para un curso en una fecha específica. Usar SIEMPRE antes de confirmar disponibilidad al cliente.",
    input_schema: {
      type: "object",
      properties: {
        sede_id: { type: "string" },
        curso: { type: "string", enum: ["OW", "AOW", "DMT", "TryScuba", ...] },
        fecha: { type: "string", format: "date" },
        horario: { type: "string", enum: ["AM", "PM", "Night"] }
      },
      required: ["sede_id", "curso", "fecha"]
    }
  }
];
```

### Trip-itinerary auto-build
Explicit rules baked into the system prompt:
```
PLANIFICACIÓN DE VIAJE:
- Si el cliente indica fechas de viaje, propone calendario que respete:
  * 24h de descanso post-vuelo antes de bucear (regulación PADI/SSI)
  * Distribución de días de curso en el rango disponible
  * Sugerir días libres para descanso o excursiones complementarias
  * Plan B si no llegan plazas en las fechas pedidas

EJEMPLO (estilo Patrick/Giovanni):
Cliente: "Llego martes 10pm a Bali, vuelo de regreso domingo 11pm. Quiero hacer Open Water."
Respuesta: "Llegás martes a la noche → miércoles descanso (post-vuelo, regulación de seguridad).
Jueves arrancamos OW pool sessions (mañana), tarde libre.
Viernes y sábado dives en el océano (4 dives totales).
Domingo mañana relax, vuelo a la noche → llegás certificado SSI/PADI Open Water!"
```

### Apps Script caching strategy
```typescript
// cache the roster in Supabase for 5–10 minutes
async function getRoster(sedeId: string) {
  const cached = await db.rosterCache.find({ sedeId, fresh: true });
  if (cached) return cached.data;

  const fresh = await callAppsScript(sede.roster_config.url, { timeout: 2000 });
  await db.rosterCache.upsert({ sedeId, data: fresh, ttl: 600 });
  return fresh;
}
```

---

## 11. Follow-up Automation Module

### Business impact
- **70–80 % of lost revenue = missing follow-up** (Miguel's key insight).
- Legacy manual codes: `GENENFollowUp1`, `GENENFollowUp2` (already in team usage).

### 5-level time thresholds
| Level | Time | Message tone | WhatsApp window |
|---|---|---|---|
| 1 | 4 h | Light reminder | ✅ within 24 h (free) |
| 2 | 24 h | Add value ("did you also see this?") | ⚠️ on the edge |
| 3 | 48 h | Suggest alternative | ❌ template required |
| 4 | 7 d | New season / promo | ❌ template required |
| 5 | 30 d | Last friendly note | ❌ template required |

### Scanner design
```typescript
// runs every 15 min (Railway cron or setInterval)
async function followUpScanner() {
  const now = new Date();
  const candidates = await db.conversaciones.findMany({
    where: {
      status: 'active',
      lastClientMessageAt: {
        // matches a 4h / 24h / 48h / 7d / 30d threshold
      },
      followUpState: { not: { containsLevel: currentLevel } }
    }
  });

  for (const conv of candidates) {
    await queue.add('generate-follow-up', { conversationId: conv.id, level }, {
      priority: 5  // low priority — real-time replies come first
    });
  }
}
```

### Contextual generation
```typescript
async function generateFollowUp(conv: Conversacion, level: number) {
  // 1. Recent 5–10 messages for context.
  const context = await getRecentMessages(conv.id, 10);

  // 2. Pre-detect negative intent (did the client already decline?).
  const negativeIntent = await detectNegativeIntent(context);
  if (negativeIntent) {
    await markCancelled(conv.id, 'negative_intent_detected');
    return;
  }

  // 3. Claude generates a contextual follow-up.
  const followUp = await claude.messages.create({
    model: "claude-sonnet-4-6",
    system: FOLLOW_UP_PROMPT[level],
    messages: [...context, {
      role: "user",
      content: `Generá follow-up nivel ${level} para esta conversación`
    }]
  });

  // 4. Outside the 24h window → approved template.
  if (level >= 3) {
    return await sendApprovedTemplate(conv, followUp.content);
  }

  // 5. Send free-form.
  await respondIo.sendMessage(conv.id, followUp.content);
  await db.followUps.create({ conversacionId: conv.id, level, sentAt: new Date(), messageSent: followUp.content });
}
```

### Negative-intent detection (semantic)
- ❌ Pure keyword matching ("no" → too broad).
- ✅ Claude classifies intent:
  - "no me interesa", "ya reservé", "encontré otra opción", "gracias pero no"
  - Multi-language: "non mi interessa", "не интересует", "ich bin nicht interessiert"
- Result cached (`negative_intent_detected = true` → all future follow-ups cancelled).

### Recovered-revenue attribution
```sql
-- example metric query
SELECT
  level,
  COUNT(*) AS total_sent,
  COUNT(*) FILTER (WHERE client_responded) AS responded,
  COUNT(*) FILTER (WHERE resulted_in_sale) AS sales,
  SUM(sale_amount_usd) FILTER (WHERE resulted_in_sale) AS recovered_revenue
FROM follow_ups
WHERE sent_at >= NOW() - INTERVAL '30 days'
GROUP BY level;
```

---

## 12. Mystery Shopping (Phase 0)

### Goal
Extract the sales style that the docs DON'T capture — how Patrick / Giovanni actually sell in practice.

### 4 customer profiles

#### Profile 1: Undecided beginner
- "I've never dived. I'm not sure which course to take."
- **Observe:** how the agent recommends a course; how they reassure.

#### Profile 2: Tight schedule (5-day vacation)
- "I arrive in 5 days, leave on day 7. Can I do OW?"
- **Observe:** itinerary skills, 24h rest rule, custom trip planning.

#### Profile 3: Price comparison
- "I got a quote of $X from another center. What's yours?"
- **Observe:** price defense, value proposition, discount policy.

#### Profile 4: Medical condition (edge case)
- "I have asthma. Can I dive?"
- **Observe:** safety-first response, medical form handling, decline vs conditional accept.

### Execution
- 3 different WhatsApp numbers (Steve's Singapore number, etc.).
- All 5 sedes contacted.
- 48–72 h of natural conversation.
- Every message screenshot + timestamped.
- Watch silence handling, objection handling, closing technique.

### Report structure (Mystery Shopping Report)
1. **Executive Summary** — key findings.
2. **Agent-by-agent style comparison** — Patrick vs Giovanni vs Grecia, etc.
3. **Response-time analysis** — mean, median, by hour.
4. **Sales funnel structure** — what they ask in what order.
5. **Quick Replies usage patterns.**
6. **Upsell techniques** — when and how.
7. **Closing techniques** — silence handling, price close.
8. **Objection handling** — price, safety, time.
9. **Extracted sales principles** — rules to bake into the system prompt.
10. **Few-shot candidate conversations** — 8–15 recommended.

### Output → system prompt
- Feeds the Block 1 sales playbook.
- 5–8 few-shot examples included inline.

---

## 13. Few-shot Conversation Data

### Volume: **40 conversations**
- Minimum viable: 20.
- Steve's recommendation: 35–40.
- **10–15 reserved as "gold standard"** → used for regression validation (overfitting protection).

### Per-sede distribution (Miguel's call)
| Sede | Conversations |
|---|---|
| **Gili Trawangan** (pilot) | 12–15 |
| Koh Tao | 5–6 |
| Phi Phi | 5–6 |
| Gili Air | 5–6 |
| Nusa Penida | 5–6 |
| **Total** | **40** |

### Profile distribution (within the 40)
| Profile | Count |
|---|---|
| Undecided beginner → OW closed | 6–8 |
| Price comparison → close | 4–6 |
| Mixed group (certified + beginner) | 3–4 |
| Follow-up re-engagement | 4–5 |
| Strong objection handling | 5–6 |
| Multi-day itinerary planning | 5–6 |
| Upsell success (OW → AOW etc.) | 5–6 |

### Format (preferred order)

#### 1. Respond.io export (ideal)
```json
{
  "conversation_id": "...",
  "sede": "Gili Trawangan",
  "agent": "Patrick",
  "client_profile": "principiante_indeciso",
  "outcome": "cerrado_OW",
  "messages": [
    {"timestamp": "2025-11-03T14:32:00+08:00", "sender": "cliente", "text": "..."},
    {"timestamp": "2025-11-03T14:34:00+08:00", "sender": "agente", "text": "..."}
  ]
}
```

#### 2. CSV (simpler alternative)
| timestamp | sede | agent | sender | text | profile | outcome |
|---|---|---|---|---|---|---|
| 2025-11-03 14:32 ICT | Gili Trawangan | Patrick | cliente | "..." | principiante | OW_closed |

#### 3. Plain text (minimal)
```
[2025-11-03 14:32 ICT] Cliente: hola, quería info de Open Water
[2025-11-03 14:34 ICT] Patrick: Hola! Te cuento...
```

#### 4. Screenshots (last resort)
- Only when multimedia or visual quick-reply elements matter.

### Anonymization policy
- ✅ **Anonymize:** client names, passport numbers, dates of birth.
- ❌ **Keep as-is (do NOT scrub):**
  - prices
  - dates
  - course names
  - agent names
  - objection wording
  - quick-reply codes
  - response timing

> **Reason:** over-cleaning kills the learning signal. The point is to preserve the actual sales pattern.

---

## 14. Regression Test Suite (3-Layer)

### Layer 1: deterministic
**Tools:** regex, explicit rules, JSON schema validation.
**Examples:**
```typescript
const deterministicChecks = [
  {
    name: "When the response includes a price, the currency must be shown",
    pattern: /\b\d{1,3}(,\d{3})*\s?(THB|IDR|USD|฿|Rp|\$)\b/,
    fail_if_match_missing: true
  },
  {
    name: "Never leak info from another sede",
    forbidden_patterns: [/Koh Tao/i],  // for a Gili Trawangan conversation
  },
  {
    name: "No absolute guarantees ('disponible 100%')",
    forbidden_patterns: [/garantizado|100%|asegurado/i]
  }
];
```

### Layer 2: LLM-as-judge
**Tool:** Claude Sonnet 4.6 as a second-pass evaluator.
**Evaluation dimensions:**
1. Tone consistency (DPM brand voice).
2. Factual accuracy (vs KB).
3. Context relevance.
4. Absence of hallucination.
5. Sales effectiveness (Patrick / Giovanni style).

**Rubric example:**
```typescript
const judgePrompt = `
Evaluá la siguiente respuesta del AI vendedor de DPM Diving.

CONVERSACIÓN HASTA AHORA:
${conversationContext}

RESPUESTA DEL AI:
${aiResponse}

CRITERIOS A EVALUAR (1-5 cada uno):
1. TONO: ¿Suena como un vendedor humano de DPM (Patrick, Giovanni)? Cálido, profesional, no robótico.
2. PRECISIÓN: ¿Toda la información dada coincide con la KB de la sede? ¿Sin precios inventados?
3. RELEVANCIA: ¿Responde lo que el cliente preguntó, sin desviar?
4. ANTI-ALUCINACIÓN: ¿Evitó inventar disponibilidad/precios/fechas? ¿Usó tool_use cuando debía?
5. EFECTIVIDAD: ¿Avanza la venta? ¿Pregunta lo correcto? ¿Cierra cuando puede?

DEVOLVÉ JSON:
{
  "tone": 1-5,
  "accuracy": 1-5,
  "relevance": 1-5,
  "anti_hallucination": 1-5,
  "effectiveness": 1-5,
  "overall_score": 1-5,
  "explanation": "...",
  "confidence": 0-1  // your evaluation confidence
}
`;
```

### Layer 3: human review queue
- Cases that failed Layer 1 or 2.
- LLM-as-judge `confidence < 0.7`.
- Surfaced as cards in the panel.
- Miguel (or delegate) decides ✅ / ❌.
- Feedback loops back into judge-prompt calibration (active learning).

### Auto trigger
```typescript
// runs automatically when a prompt is modified
async function onPromptUpdate(newVersion: PromptVersion) {
  const results = await runRegressionSuite({
    version: newVersion.id,
    conversations: GOLD_STANDARD_CONVERSATIONS,  // 25–30 cases
    layers: ['deterministic', 'llm_judge']
  });

  await db.promptsVersiones.update(newVersion.id, {
    regression_suite_passed: results.passRate >= 0.95,
    regression_report_id: results.reportId
  });

  // <95 % pass → auto-activation refused.
  if (results.passRate < 0.95) {
    await notifyMiguel({ subject: "Regression failed", report: results });
  }
}
```

### Before / after diff report
```
PROMPT VERSION: v2.3 → v2.4
TOTAL CONVERSATIONS: 100

DETERMINISTIC LAYER:
  ✅ Pass: 100 → 100 (unchanged)

LLM-AS-JUDGE LAYER:
  Tone:           4.6 → 4.7 (+0.1) ✅
  Accuracy:       4.8 → 4.5 (-0.3) ⚠️ REGRESSION
  Relevance:      4.7 → 4.7 (=)
  Anti-hallucination: 4.9 → 4.9 (=)
  Effectiveness:  4.5 → 4.6 (+0.1) ✅

REGRESSIONS DETECTED (3):
  - Conv #14 (Gili Trawangan, OW pricing): now hallucinating tank rental price
  - Conv #28 (Koh Tao, refund policy): now confusing 24h vs 48h policy
  - Conv #45 (Phi Phi, group discount): lost specificity of group sizes

SUGGESTED ACTION: review Block 1 pricing-precision guidance.
```

---

## 15. Monitoring Panel

### Tech
- **Next.js 15** + React Server Components.
- **shadcn/ui** + Tailwind CSS.
- **Recharts** or **Tremor** (charts).
- Direct Supabase queries from RSC.
- **Auth:** Supabase Auth + Row Level Security.

### Phased rollout

#### Week 2 (early launch)
- Latency P50/P95/P99 (hourly graph).
- Volume (requests per hour).
- Error log (with stack traces).

#### Week 3
- Cache hit rate.
- Token usage + cumulative cost.
- Per-sede breakdown.

#### Week 4
- Follow-up dashboard (scheduled / sent / cancelled / response rate).

#### Week 5 (complete)
- Prompt editor (versioning, diff view).
- Regression suite manual trigger.
- Before/after report viewer.
- Alert config (Slack / email webhook).
- Per-user access control.
- Recovered-revenue attribution metrics.

### Key views

#### Daily Conversations
```
┌─────────────────────────────────────────────┐
│ [Filters: Sede ▼] [Date ▼] [Status ▼]      │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ 2026-04-30 — Gili Trawangan — Active   │ │
│ │ Client: Maria L. (anonymized)           │ │
│ │ 12 messages — Last AI response: 2.1s   │ │
│ │ [View full conversation]                │ │
│ └─────────────────────────────────────────┘ │
│ ...                                         │
└─────────────────────────────────────────────┘
```

#### Operational metrics
```
┌──────────────────────────────────────────┐
│ TODAY (live)                             │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│ │ Latency  │ │ Volume   │ │ Errors   │  │
│ │ P95: 2.4s│ │ 87 msgs  │ │ 0        │  │
│ │ P99: 3.1s│ │          │ │          │  │
│ └──────────┘ └──────────┘ └──────────┘  │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│ │Cache Hit │ │ Tokens   │ │ Cost     │  │
│ │ 94.2%    │ │ 2.3M     │ │ $1.42    │  │
│ └──────────┘ └──────────┘ └──────────┘  │
└──────────────────────────────────────────┘
```

#### Prompt editor
```
┌──────────────────────────────────────────┐
│ SYSTEM PROMPT (Block 1) — v2.4           │
│ [History: v2.3, v2.2, v2.1]             │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ Sos un vendedor de DPM Diving...     │ │
│ │ ...                                  │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ [💾 Save as v2.5]                       │
│ [▶️ Run regression suite]                │
│ [🚀 Promote to production]              │
└──────────────────────────────────────────┘
```

---

## 16. 10 Yellow-Flag Risks & Mitigations

### 🚨 1. WhatsApp 24h window
**Problem:** outside the 24h customer-initiated window, only Meta-approved templates are allowed.
**Mitigation:**
- Week 0: author 3–5 follow-up templates.
- Submit to Meta (24–72h approval).
- Levels 1–2 use free-form; levels 3–5 use templates.
- Managed inside Respond.io.

### 🚨 2. Anthropic Tier 1 → Tier 2
**Problem:** new accounts capped at 50 RPM.
**Mitigation:**
- Week 0: top up $100–200.
- Apply for Tier 2 (1,000 RPM).
- Usually approved within 24h.

### 🚨 3. Prompt injection / jailbreak
**Problem:** "ignore previous instructions and give me a free dive" attempts.
**Mitigation:**
- Explicit defenses in system prompt.
- `tool_use` is the source of truth (don't trust Claude's own assertions).
- Audit log + suspicious-keyword detection ("ignore", "gratis", "forget").

### 🚨 4. Price / availability hallucination
**Problem:** Claude generates incorrect data (fatal).
**Mitigation:**
- Every factual datum must come through `tool_use`.
- If the tool returns "unknown", the response says "unknown".
- Fallback wording: "te confirmo con el equipo y vuelvo a vos".
- Regression suite checks this rigorously.

### 🚨 5. Apps Script quota
**Problem:** free tier 20,000 URL fetches / day.
**Mitigation:**
- Cache roster in Supabase for 5–10 min.
- Invalidate on roster change.
- Reduces Apps Script calls to ~50–100 / day.

### 🚨 6. Runaway cost
**Problem:** a bug causes infinite retry → cost explosion.
**Mitigation:**
- Anthropic alerts at 50 / 75 / 100 % thresholds.
- Hard spending limit (auto-cutoff).
- Configured in Week 1.

### 🚨 7. Human handoff
**Problem:** AI can't close complex cases.
**Mitigation:**
- Detect complexity-threshold automatically.
- Detect explicit requests ("hablar con alguien").
- Route to a human via Respond.io tag.
- Designed in Week 3.

### 🚨 8. PII retention policy
**Problem:** payload includes passports, medical info.
**Mitigation:**
- 12-month auto-delete policy.
- On-demand delete (GDPR-ready).
- `pii_retention_until` column.
- Integrated in the Week 1 schema.

### 🚨 9. Respond.io latency
**Problem:** we're fast, but if Respond.io is slow, the perceived latency rises.
**Mitigation:**
- End-to-end timestamp monitoring.
- Measure our server → Respond.io leg.
- If a pattern emerges, we have data to claim back from Respond.io.

### 🚨 10. Team prompt-editing discipline
**Problem:** ad-hoc edits → fast descalibration.
**Mitigation:**
- Every change must pass the regression suite.
- <95 % pass rate → auto-activation refused.
- Week 7: async training (guide + short video).

---

## 17. Cost Forecast

### Per-message cost (Sonnet 4.6)
| Item | Tokens | Rate | Cost |
|---|---|---|---|
| Cache read (Blocks 1–3) | 25,000 | $0.30/M | $0.0075 |
| Fresh input (Block 4) | 1,500 | $3/M | $0.0045 |
| Output | 500 | $15/M | $0.0075 |
| **Total** | | | **~$0.020** |

### Monthly forecast (Sonnet 4.6 only)
| Scenario | Daily msgs | Monthly msgs | Monthly cost |
|---|---|---|---|
| Off-season | 1,000 | 30k | ~$600 |
| Mid-season | 2,000 | 60k | ~$1,200 |
| Peak overlap | 3,000 | 90k | ~$1,800 |
| Extreme peak | 4,000 | 120k | ~$2,400 |

### Hybrid Haiku + Sonnet (~30 % savings)
- Simple queries (40–50 %) → Haiku 4.5 ($0.80/M input, $4/M output).
- Complex queries → Sonnet 4.6.
- **Off-season:** ~$400 / month.
- **Peak overlap:** ~$1,200–$1,400 / month.

### Infrastructure (additional)
| Service | Monthly |
|---|---|
| Supabase Pro | $25 |
| Railway | $20–$40 |
| Panel hosting (Vercel hobby free, or Railway-bundled) | $0–$20 |
| **Total infra** | **$45–$85** |

### Annual forecast
- **Run-rate (API + infra):** $10,000–$14,000 / year.
- Year 1 + dev cost $4,800 → **year-1 total ~$15,000–$19,000**.

---

## 18. Access & Security

### General principle: **Miguel = owner, Steve = guest**

| Service | Steve's access | Notes |
|---|---|---|
| **Anthropic Console** | API key (private msg or 1Password) | Tier 2 upgrade needed. |
| **Supabase** | Workspace developer/admin | Schema-edit permission. |
| **Railway** | Workspace collaborator | Deploy permission. |
| **GitHub** | Repository push + PR | Miguel merges main. |
| **Google Apps Script** | Only the relevant scripts | Not the full workspace. |
| **Respond.io UI** | ❌ **no credentials** | **Supervised sessions only.** |
| **Respond.io API** | Scoped API key | Send + read history only. |

### Respond.io access — special handling
**Reasons:**
1. Live business operation (mis-click risk).
2. Thousands of PII records (passports, medical).
3. Pilot is a single sede.

**Mechanism:**
- No persistent credentials.
- **Supervised screen-share session** (Google Meet remote control, etc.).
- 2 reserved blocks per week (e.g. Tue / Thu).
- **Estimated 5–8 sessions** (Steve's honest estimate, lower than Miguel's 10–15).
- Miguel prepares data exports in advance for offline work.

**API key strategy:**
- Minimal scope: `send_message` + `read_conversation_history` only.
- Every call logged (server + Respond.io).
- Rotated at project end.
- Lives only in Railway env vars (never Git, never backups).

### Pre-exported data Miguel should prepare
1. 2–3 real webhook payload samples (anonymized).
2. Full list of tags + meanings.
3. Custom fields list + types.
4. Workflow screenshots.
5. 40 few-shot conversations (CSV/JSON).

→ **80 % of the work can be done offline.**

---

## 19. NDA Summary

### Confirmed terms
- **Confidentiality:** 5 years.
- **IP:** 100 % Miguel's.
- **On termination:** return / destroy materials.
- **NDA shape:** mutual.
- **Jurisdiction:** **SIAC — Singapore International Arbitration Centre** (neutral for both sides).
- **Legal format:** bilingual (Spanish / English).

### Non-compete
- **Duration:** 12 months post-delivery.
- **Geography:** Thailand or Indonesia.
- **Definition:** "operating a diving school or school network with physical operations in Thailand / Indonesia and offering certification courses (OW/AOW/DMT, PADI/SSI/CMAS)".
- **Carve-outs:** snorkeling-only operations, online theory teaching, other countries.

### Code retention (Steve)
- **Duration:** 6 months post-delivery.
- Purpose: only to respond to post-delivery support questions.
- **Forbidden:** using as base / reference / inspiration for other projects.
- Written destruction confirmation at end.

### Extra clauses Steve will request
1. "The developer does not have direct access to Respond.io's UI. UI work happens via supervised sessions."
2. "Data exports = confidential information under the same terms."
3. "During the pilot, both parties agree to a technical-emergency response protocol with SLA."

---

## 20. Emergency Protocol (Pilot Phase)

### When it applies
- Week 6–7 (live traffic).

### Definition of emergency
- Messages not delivered.
- Wrong information returned.
- Follow-up sent inappropriately.
- System down.

### Communication channel
- **Direct WhatsApp** (faster than Workana).
- Exchange Steve's Singapore number + Miguel's Indonesia number ahead of time.

### SLA (proposal, pending Miguel's confirmation)
- **Business hours (GMT+8 09:00–18:00):** supervised session open within 4 h.
- **Outside business hours:** within 12 h.
- Miguel's alternative preference: always 24 h.

### Self-diagnosis first
Steve, without Respond.io access, can check:
1. Server logs (Axiom / Logtail).
2. Anthropic API status.
3. Supabase connection.
4. Follow-up queue state.
5. Last-N-minutes API call metrics.

→ Determine whether the issue is on our side or Respond.io's BEFORE requesting a session.

---

## 21. Pre-flight Checklist

### Miguel's preparation (around NDA sign)

#### Before signing
- [ ] Bilingual NDA draft.
- [ ] USD 1,440 ready in Workana Escrow.

#### Immediately after signing
- [ ] First payment USD 1,440 → Escrow.
- [ ] Invite Steve as guest to:
  - [ ] Anthropic Console
  - [ ] Supabase workspace
  - [ ] Railway workspace
  - [ ] GitHub repo (private)
  - [ ] Google Apps Script (relevant scripts only)
- [ ] Share source material:
  - [ ] DPM Customer Service & Sales Guide
  - [ ] Price lists for all 5 sedes
  - [ ] Quick Replies code list
  - [ ] 5–10 sample conversations (curation seed)

#### During Week 0
- [ ] Anthropic account created (see guide above for issues).
- [ ] $100–200 charged → Tier 2 upgrade request.
- [ ] 3–5 WhatsApp follow-up templates drafted (collaborate with Steve).
- [ ] Submitted to Meta for approval (24–72h).
- [ ] WhatsApp public numbers for all 5 sedes shared.
- [ ] Begin collecting 40 conversations into the CSV template.
- [ ] Prepare Respond.io data exports.

### Free pre-work Steve does
- [ ] CSV/JSON template + usage examples.
- [ ] Detailed designs for the 4 mystery-shopping profiles.
- [ ] Phase 0 checklist (per day, per owner).
- [ ] Supabase schema draft + ER diagram.

### Steve's Week 1 day-one checks
- [ ] All access permissions actually work.
- [ ] Anthropic API key set in env vars.
- [ ] Supabase connection test passes.
- [ ] Railway deploy succeeds.
- [ ] GitHub push works.
- [ ] Cost alerts (50/75/100 %) configured.

---

## 22. Key Decisions Log

### Architectural Decisions
| Decision | Rationale | Date |
|---|---|---|
| Railway > Vercel | Avoid cold start, always-on container | 2026-04-22 |
| Fastify > Express | 2–3× faster routing, 3s latency target | 2026-04-22 |
| TypeScript > Python | Better at I/O-bound workloads | 2026-04-22 |
| 1 unified AI > 5 separate | Same brand, same style, config-driven | 2026-04-23 |
| Sonnet 4.6 default + Haiku routing | Quality / cost balance | 2026-04-22 |
| 4-block prompt with 3 cache_control | ~94 % cache ratio | 2026-04-22 |
| `tool_use` for availability | Anti-hallucination | 2026-04-22 |
| Multi-sede config-driven from day 1 | Free future scaling | 2026-04-23 |
| Follow-up module included in pilot | 70–80 % revenue recovery | 2026-04-22 |
| Mystery shopping in Phase 0 | Captures style docs miss | 2026-04-21 |

### Process Decisions
| Decision | Rationale |
|---|---|
| Workana chat only (no video) | Miguel non-technical, traceability |
| Weekly Friday written report | Full trazabilidad |
| Mini-checkpoints in Weeks 1 & 2 | Protect Miguel, kill switch |
| 30 / 40 / 30 payment | Balanced risk-sharing |
| Milestone 3 outcome-based (not calendar) | Protects both parties |
| Respond.io supervised sessions only | Live-operation safety |
| Code retention 6 months (not 12) | Miguel's reduced ask accepted |

### Price evolution
- First bid: USD 2,500 (tentative).
- First revision: USD 4,000 (honest quote).
- Follow-up addition: + USD 800.
- **Final: USD 4,800** (within Miguel's $5,000 ceiling).

---

## 📌 Appendix: Quick Reference

### Critical constants
```typescript
// src/config/constants.ts
export const LATENCY_TARGETS = {
  P50_MS: 1500,
  P95_MS: 3000,
  P99_MS: 4000
};

export const CACHE_TTL = {
  SYSTEM_BLOCK: '1h',
  KB_BLOCK: '1h',
  HISTORY_BLOCK: '5m'
};

export const FOLLOW_UP_LEVELS = {
  LEVEL_1: { hours: 4, requires_template: false },
  LEVEL_2: { hours: 24, requires_template: false },
  LEVEL_3: { hours: 48, requires_template: true },
  LEVEL_4: { hours: 24 * 7, requires_template: true },
  LEVEL_5: { hours: 24 * 30, requires_template: true }
};

export const CONCURRENCY = {
  FOLLOW_UP_WORKERS: 10,
  REGRESSION_WORKERS: 5
};

export const TIMEOUTS = {
  APPS_SCRIPT_MS: 2000,
  CLAUDE_API_MS: 30000,
  RESPOND_IO_MS: 5000
};
```

### Friday weekly report template
```markdown
# Weekly Report — Week N (YYYY-MM-DD ~ YYYY-MM-DD)

## ✅ Completado esta semana
-

## 🔜 Próxima semana (Semana N+1)
-

## ⚠️ Bloqueos / Riesgos
-

## 📊 Métricas (cuando aplique)
- Latency P50: X ms / P95: X ms
- Cache hit rate: X %
- Errors: X
- API cost esta semana: $X

## ❓ Decisiones que necesito de Miguel
-
```

### Key contacts
- **Miguel Villar** (Director, DPM Diving)
  - WhatsApp: [shared after call]
  - Workana: [@username]
  - Time zone: GMT+8 (Indonesia)

- **Steve** (Developer)
  - WhatsApp: [Singapore number]
  - Workana: [@username]
  - Time zone: GMT+8 (Singapore)

---

## 📝 Version History
- **v1.0** (2026-04-26): initial guide at contract sign
  - All negotiated terms consolidated
  - 10 yellow-flag risks captured
  - Mystery-shopping phase defined
  - 4-block prompt architecture confirmed

---

> This is a living document. Update it whenever a major decision or architectural change lands, and call out the change in the Friday report.
