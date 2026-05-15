# 2026-05-12 — Miguel feature request: Simulator + Replay

## Context

Pieza 1 GT pilot has not yet opened to external customers — Miguel and his
team have been testing by impersonating customers via WhatsApp. Before
going live with real customers, Miguel wants tooling to iterate on the
prompt **safely**, i.e. without consuming a real WhatsApp number,
polluting metrics, or triggering Respond.io workflows.

Two requests, both targeting the Command Center panel:

## Miguel's message (verbatim, Spanish)

```
Hola Steve! Cuando termines lo del lifecycle IN PROCESS, tengo 2 cosas
para sumar al panel cuando puedas. Ninguna urgente — priorizalas como
te quede mejor.

Contexto: todavía no estoy en producción real con clientes externos.
Solo hicimos tests con socios haciéndose pasar por clientes. Antes de
abrir a clientes reales quiero tener un par de cosas más afiladas para
poder iterar el prompt con seguridad.


---

1) SIMULADOR DE CONVERSACIONES

Quiero dejar claro que esto era lo que yo tenía en mente desde el
principio cuando te pedí el "espía". El panel hoy me deja VER
conversaciones reales (que está perfecto), pero no me deja PROBAR a
John por mi cuenta. Esa parte interactiva era la idea original —
poder conversar yo mismo con John desde el panel para ajustar el
prompt antes de que el cliente real lo viva.

Concretamente, lo que necesito es una página nueva en el Command
Center donde yo pueda chatear con John como un cliente falso, ver
sus respuestas reales (texto + fuentes + tools invocadas), SIN usar
un número de WhatsApp real y SIN contaminar las métricas del
dashboard.

Requisitos:
- Página /simulator con input de texto
- Selector de versión de prompt (v8 actual, o cualquier v9, v10 que
  vaya creando)
- Botón "Reset" para limpiar contexto y arrancar conversación nueva
- Las conversaciones del simulador NO cuentan en métricas del dashboard
- NO disparan workflows en Respond.io
- Idealmente las puedo guardar con un nombre para volver a usarlas


---

2) REPLAY DE CONVERSACIONES REALES (esto sería ORO)

Que el panel pueda tomar una conversación real ya guardada (ej. la de
Ravish, Miguel, Yuri) y "rejugarla" contra una versión nueva del prompt.

Cómo funcionaría:
- Voy a Conversaciones, elijo una real
- Click en "Replay con otra versión de prompt"
- Selecciono v9 (la nueva versión que quiero probar)
- El sistema manda los mismos mensajes del cliente original, pero ahora
  contra v9, y graba qué contestaría John con la versión nueva
- Me muestra side-by-side: qué dijo John v8 vs qué diría John v9

Por qué importa: me permite probar prompts nuevos contra escenarios
REALES de clientes nuestros, no solo contra los 8 casos genéricos de
la suite Regression actual.

Esto es lo que más me sirve para iterar el prompt sin pasar por
producción.


---

Orden sugerido:

1ro: IN PROCESS lifecycle (ya en curso)
2do: Simulador básico
3ro: Replay de conversaciones reales

Pero ordenalos como te parezca mejor según el esfuerzo. Estoy en
testing todavía así que tengo margen para esperar.

Gracias!
```

## Steve's analysis

### Functional requirements (parsed)

#### Feature 1 — Simulator (`/simulator`)

| # | Requirement | Notes |
|---|---|---|
| 1 | New panel page `/simulator` with text input | UI |
| 2 | Prompt-version selector (v8, v9, v10…) | Reads from prompts table |
| 3 | "Reset" button to clear context and start fresh | Server endpoint + UI |
| 4 | Bot replies with full payload — text + sources + tools invoked | Reuse our existing inference pipeline, expose tool-call trace |
| 5 | Simulator conversations excluded from dashboard metrics | DB flag or separate table |
| 6 | Simulator does NOT fire Respond.io workflows | Skip outbound side-effects |
| 7 | Optional — save a simulator session under a name to replay later | Lightweight saved-session table |

#### Feature 2 — Replay against new prompt version

| # | Requirement | Notes |
|---|---|---|
| 1 | From Conversaciones, pick a real conversation | UI |
| 2 | "Replay con otra versión de prompt" button | UI action |
| 3 | Choose target prompt version | Selector |
| 4 | System re-feeds the original customer messages through the new prompt | Server batch worker |
| 5 | Records what John v_new would have replied | Writes to a "replays" table, NOT mensajes |
| 6 | Side-by-side view: John v_orig vs John v_new for each message | UI |
| 7 | MUST NOT pollute mensajes, MUST NOT fire workflows, MUST NOT send to customer | Isolation guarantees |

### Architectural touchpoints

- **Prompt versioning**: lives in Supabase `prompts` table (active version
  served via `pnpm db:migrate` hash). Selector needs `GET /admin/prompts`
  endpoint to list versions.
- **Inference pipeline**: `processIncomingMessage` does too much
  (writes mensajes, fires workflows, posts to Respond.io). For the
  simulator we need a "headless" mode that takes a message + history +
  promptVersion, returns the model output (text + tool calls + sources),
  and writes to NOTHING that affects production.
- **Isolation flag**: add `is_simulator` boolean (or `origin` enum:
  `production` / `simulator` / `replay`) on both `conversaciones` and
  `mensajes`. Dashboard queries filter on `origin = 'production'` only.
- **Replays table**: separate `replay_runs` + `replay_messages` tables
  so we can store many alternate-history runs without conflicting with
  the real mensajes timeline.
- **Workflow isolation**: in headless mode, skip
  `triggerLifecycleWebhook`, skip Respond.io PUT calls, skip outbound
  WhatsApp message send.

### Suggested implementation phases

Miguel's stated order is reasonable. Phase 1 (Simulator) shares the
same headless-inference + isolation infrastructure that Phase 2
(Replay) needs, so building Phase 1 cleanly drops most of Phase 2 into
place.

| Phase | Scope | Estimated effort |
|---|---|---|
| **0** | Finish IN PROCESS lifecycle debug (current work) | already in flight |
| **1** | Headless inference path + `origin` flag + `/admin/simulator/*` endpoints + minimal `/simulator` panel page | 1–2 days |
| **1.5** | Save/name/load simulator session | half-day add-on |
| **2** | `/admin/replay/*` endpoints + replay_runs table + side-by-side panel view | 1–2 days |

### Risks / open questions

1. **Where is the panel codebase?** The repo has `apps/server` and shared
   packages. The panel itself may be in `apps/web` / `apps/panel` /
   `apps/command-center` or a separate repo. Confirm before scoping UI.
2. **Tool execution in headless mode**: do we want the simulator to
   actually invoke tools (e.g. `enviar_catalogo` against Respond.io's
   catalog API), or stub them? Probably stub — Miguel doesn't want
   workflow side-effects. Stubbed tool calls should return realistic
   fake responses so the simulator surface mirrors production.
3. **History bootstrapping for replay**: when replaying message N, the
   conversation history seen by the model must be the v_new replies for
   1..N-1, not the production v_orig replies. Otherwise the replay just
   measures how the new prompt reacts to old assistant context, which
   defeats the purpose.
4. **Storage costs**: each replay run multiplies token cost by 1 per
   message. A 50-message Ravish replay = ~50 model calls. Acceptable
   during pilot; revisit if pricing becomes an issue.

## Next actions

1. **Tony**: continue lifecycle IN PROCESS debug (current work — auth
   diag + urlKey logging being pushed in parallel commit).
2. **Steve**: explore panel codebase to confirm Phase 1 file layout
   before coding.
3. **Steve**: draft Phase 1 spec + share with Tony for go-ahead before
   implementing.

---

## 2026-05-13 reaffirmation — Miguel asks for a fixed quote

After Phase A + Phase B (auto-confirm dashboard) shipped end-to-end,
Miguel resent the same Simulator + Replay spec verbatim and clarified
billing scope:

> "A lo mejor no quedo claro cuando te pedi el espia pero esta bien
> comprendo. Está perfecto que las cobres aparte. ¿Podés mandarme
> presupuesto FIJO (no por hora) de cada una por separado?
> 1) Simulador de conversaciones — $???
> 2) Replay de conversaciones reales — $???"

Followed by a re-statement of the same 7-bullet Simulator spec and
6-bullet Replay spec from the 2026-05-12 message above. No scope
change. Suggested order: Simulator first, then Replay.

### Scope confirmed as SEPARATE from current contract

Current $4,800 / 7-week Pieza 1 contract covers:
- Bidirectional sync (✅ delivered)
- HMAC multi-secret (✅ delivered)
- Panel Confirmar flow (✅ delivered)
- Phase A OCR retune (✅ delivered)
- Phase B safety-net dashboard (✅ delivered, today)
- Daily summary endpoint + cron (✅ delivered, today)
- Prompt calibration (Miguel-driven, ongoing)

Simulator + Replay are NEW features that:
- Miguel acknowledges as separately billable
- Build on but do not duplicate any current-contract functionality
- Require ~3-5 days of new work each
- Need their own quote

### What needs to be implemented (Steve's analysis, 2026-05-13)

#### Simulator (Phase 1 — basic + Phase 1.5 named sessions)

**New panel page** at `/simulator`:
- Chat surface (input + history)
- Prompt version selector (dropdown of `prompts_versiones` rows)
- "Reset" button
- "Save session" button + named session loader
- Display: AI text + sources + tool calls + cost per turn

**New server work**:
- DB migration: add `origin` column (or enum) to `mensajes` and
  `conversaciones` — values `production` | `simulator` | `replay`.
  Dashboard metrics filter on `origin='production'` so simulator
  traffic doesn't pollute.
- Refactor `processIncomingMessage` to split: an inner
  `runInference(message, history, promptVersion)` that returns
  `{text, sources, toolCalls, cost}` without side effects, plus
  the existing outer flow that does mensajes-write + Respond.io
  send + lifecycle fire.
- New routes:
  - `GET  /admin/simulator/prompts` — list versions
  - `POST /admin/simulator/message` — inference + persist
  - `POST /admin/simulator/reset` — clear session
  - `GET  /admin/simulator/sessions` — list saved
  - `POST /admin/simulator/sessions` — save current as named
  - `GET  /admin/simulator/sessions/:id` — load
- Tool stub: simulator should NOT actually call Respond.io
  catalog API or Apps Script in `enviar_catalogo` /
  `consultar_disponibilidad`. Return canned realistic responses
  so the surface mirrors production without side effects.

#### Replay (Phase 2)

**Conversaciones page enhancement**:
- "Replay con otra versión de prompt" button
- Version selector modal
- Side-by-side view: original vs replayed

**New server work**:
- DB schema: `replay_runs` (id, original_conversacion_id,
  prompt_version_id, created_by, status, cost_total) +
  `replay_messages` (replay_run_id, idx, role, content, sources,
  tool_calls)
- Worker: iterates real customer messages in order, re-runs
  inference against the chosen prompt version, accumulating
  history of the NEW assistant replies (NOT the production ones,
  otherwise the replay measures "how does new prompt react to old
  context" — defeats the purpose).
- Routes:
  - `POST /admin/replay/start` — kicks off replay
  - `GET  /admin/replay/:id` — poll status + results
  - `GET  /admin/replay/list?conversacionId=:id` — past replays

### Effort estimate (Steve, 2026-05-13)

| Item | Days | Notes |
|---|---|---|
| Simulator Phase 1 (page + headless inference + reset) | 1.5–2 | Refactor of processIncomingMessage is the trickiest part. |
| Simulator Phase 1.5 (save/name/load sessions) | 0.5 | Single new table + 3 endpoints. |
| Replay Phase 2 (table + worker + side-by-side UI) | 1.5–2 | Worker + history bootstrapping is non-trivial. |
| Manual QA + edge cases each | + 0.5 (each) | Tool stubbing, cost accounting, mismatch UI. |
| **Total bundle** | **4–5 days** | Replay reuses Simulator infra → bundle discount makes sense. |

### Recommended next steps

1. **Tony decides USD pricing per package** (Simulator standalone /
   Replay standalone / Bundle with discount).
2. Send Miguel the quote.
3. Once Miguel approves which package(s) and timing:
   - Build Simulator first (Replay reuses its infrastructure).
   - Phase 1 (basic) ships in one commit. Phase 1.5 (save/load) in
     a follow-up.
   - Tests + manual smoke before declaring done.
