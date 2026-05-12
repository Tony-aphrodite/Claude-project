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
