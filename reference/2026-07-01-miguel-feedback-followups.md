# Miguel feedback 2026-07-01 — follow-up items pending implementation

**Source:** Miguel WhatsApp + screenshots throughout 2026-07-01 testing of
`pdm-diving.vercel.app` (new URL, post-URL-rename).

**Rule (Steve 2026-07-01):** no code changes from this doc until Steve
explicitly says "fix it". Document each issue with quote + repro + root
cause + fix shape; do not touch code.

---

## Index of issues

| #  | Issue | Scope | Time | Status |
|----|---|---|---|---|
| 1  | "AI caída" pill looks like a button but does nothing when clicked | UX affordance | 15 min | 🟡 confirmed UX gap |
| 2  | Walk-in "Asignar" stays in "asignando..." — Miguel says no asigna al instructor (regression from 2026-06-30 fix) | Server-action bug | 1-2h | 🔴 requires DB + Vercel-log diagnosis |
| 3  | Health metric shows "AI caída" intermittently while `errores 1h = 0` — handed_off traffic miscounted | Metric accuracy | 1h | 🔴 **confirmed recurring** — Miguel: "caidas intermitentes todo el tiempo" |
| 4  | Operator inbox send returns "Respond.io devolvió 404: Not Found" on conversation Jose Mora (KT) — stale conversation id | Provider fallback | 30 min | 🔴 confirmed provider bug |
| 5  | LATENCY P95 = 18–19 s (6× the 3s target) — AI responding but extremely slow, likely a contributing cause of #3's "esperando" backlog | Performance | 2-4h investigation | 🔴 diagnosis needed |
| 6  | Deposit message omits unique ref codes for a 2-pax booking; AI says "poner vuestros nombres como referencia"; even after operator explicitly asks via @COLOMBA AI, AI just repeats without codes (Enrique Ortiz, GA) | Deposit tool / prompt regression | 2-3h | 🚨 **CRITICAL** — breaks payment reconciliation + violates Miguel's per-pax rule |
| 7  | Need a third role: "oficina · todas las sedes" for the remote 24/7 human team (office capabilities across every sede, without admin privileges) | Auth / permissions | 1-2h | 🟠 feature request, blocks remote team onboarding |
| 8  | Diver ref-code needs a "copy" button in the roster engine card so the operator can reuse it when creating walk-ins for subsequent days of the same program | UX / clipboard | 30 min | 🟡 small UX improvement |
| 9  | Roster engine needs "next day" (and "previous day") shortcut buttons next to the date field, so the operator can navigate multi-day programs without opening the picker | UX / date nav | 20 min | 🟡 small UX improvement |
| 10 | Walk-in form's Actividad dropdown missing upgrade activity codes (BD→OW, OW→AOW, etc.) — Miguel needs them to load customers doing course upgrades | Content / activity taxonomy | 30 min UI + Miguel input | 🟠 needs Miguel to specify the exact upgrade codes + day-by-day footprint |

---

## #1 — "AI caída" pill has button-like affordance but is inert

**Miguel's words (screenshot, 2026-07-01 05:13 AM Bali time):**
> "es un boton que dia ai desconectarda"

(Interpreted: *"es un botón que dice AI desconectada"* — a button that says
"AI disconnected". Blue arrow drawn on the screenshot points at the
red "● AI caída" pill in the top-left status banner.)

**Screenshot context:**
- URL: `pdm-diving.vercel.app` (Dashboard)
- Top status banner shows: `● AI caída — Hace 42 min que la AI no
  responde y 2 clientes están esperando. Cubrí a mano desde
  /conversations.`
- Right-side metrics: ÚLTIMA RESPUESTA AI hace 42 min · CLIENTES
  ESPERANDO 2 · ERRORES 1H 0 · HANDED-OFF 71
- The red pill visually reads as a clickable button (rounded, ring,
  distinct color) but has no `onClick` / href — clicking does nothing.

**Repro:**
1. Open Dashboard when health level is `bad` (AI down 15+ min OR errors ≥ 10).
2. See the red `● AI caída` pill.
3. Click it → nothing happens (no navigation, no menu, no tooltip beyond
   the passive title attribute).

**Root cause:**

[health-indicator.tsx:61-70](apps/panel/src/app/_components/health-indicator.tsx#L61-L70):

```tsx
<div
  className={`inline-flex items-center gap-2 rounded-full px-3 py-1 ring-1 ring-inset ${styles.chip}`}
  title={snap.description}
>
  <span aria-hidden="true" className={`h-2 w-2 rounded-full ${styles.dot}`} />
  <span className="text-sm font-semibold">{snap.label}</span>
</div>
```

Pure `<div>`. No interaction. But visually — rounded pill + colored ring
+ bold label — reads as a button. Miguel's mental model: "red badge = I
click to fix / see details".

The banner's description text already tells the user to go to
`/conversations` ("Cubrí a mano desde /conversations"), but the CTA is
buried in prose. The pill itself is the visually obvious affordance.

**Fix shape:**

**Option A (recommended):** wrap the pill (or the whole `<section>`) in
a Next.js `<Link href="/conversations">` when `level ≠ ok`. Clicking the
red/amber alert takes the operator directly to the queue where they can
respond by hand.

```tsx
const target = snap.level === "ok" ? null : "/conversations";
const Pill = target ? Link : "div";
return (
  <section className="card flex flex-wrap items-center justify-between gap-4"
    aria-label="Estado de la AI">
    <div className="flex items-center gap-3">
      <Pill
        {...(target ? { href: target } : {})}
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 ring-1 ring-inset transition ${
          target ? "hover:brightness-110 cursor-pointer" : ""
        } ${styles.chip}`}
        title={snap.description}
      >
        <span aria-hidden="true" className={`h-2 w-2 rounded-full ${styles.dot}`} />
        <span className="text-sm font-semibold">{snap.label}</span>
      </Pill>
      ...
```

Add a subtle `→` arrow inside the pill on non-ok levels to reinforce
"this is clickable".

**Option B:** make the entire banner clickable when level ≠ ok
(bigger click target, whole card highlights on hover).

**Option C (weakest):** strip the button-like styling (drop the ring,
drop the bold, make it flat text) so users don't try to click. Loses
visual salience — the alert is *supposed* to be eye-catching.

**Recommended:** Option A + arrow icon. Small change, unambiguous.

**Files affected:**
- `apps/panel/src/app/_components/health-indicator.tsx` — pill markup.
- No new deps, no server changes.

**Priority:** 🟡 UX polish. Operator can still figure it out (description
mentions /conversations), but a wasted click every time the AI dips is
friction Miguel wants gone.

**Time estimate:** 15 min.

**Follow-up screenshot 2026-07-01 05:18 AM (2 minutes after original
report):** Miguel hovered the pill and captured the tooltip — the
banner has now been showing `hace 46 min` for at least 2 minutes with
no way to act on it. Reinforces the priority: an operator watching a
real outage cannot do anything from this surface. `Cubrí a mano desde
/conversations` in prose is not enough — the pill has to BE the CTA.

---

## #2 — Walk-in "Asignar" button stuck in "asignando…" · Miguel: "no asigna al instructor"

**Miguel's words (2026-07-01 05:15 AM Bali):**
> "no asigna al imnstructor."

**Screenshot context:**
- URL: `pdm-diving.vercel.app/roster/engine` (Gili Air sede, based on ref
  code prefix)
- TURNO AM → `SIN ASIGNAR A INSTRUCTOR — 1 BUCEADOR`
- Diver: **pipo (BD_CONFINADA / BEG) · walk-in** · code
  `DPM-GA-0701-CD7846`
- Assign form open: `Asignar a` dropdown = `Billy [INST]` · button
  frozen on **`asignando…`** with spinner · `cancelar` link visible
- Top banner: `1 buceador hoy · AM 1 · ⚠ 1 buceador sin asignar`
- Left sidebar shows `admin · todas las sedes` (miguel@dpmdiving.com)

**Repro (as Miguel executes it):**
1. Create walk-in — pipo, BD_CONFINADA, BEG, no instructor pre-selected,
   sede GA, fecha 2026-07-01.
2. Walk-in lands in `SIN ASIGNAR A INSTRUCTOR — 1 BUCEADOR`.
3. Click `asignar` on pipo row → form expands, selects Billy [INST].
4. Click `aplicar` (SubmitButton) → button flips to `asignando…` with
   spinner.
5. **Symptom Miguel reports:** the button stays on `asignando…`; pipo
   never moves out of `SIN ASIGNAR`.

**Regression note — history of this exact bug:**

- 2026-06-30: original Miguel complaint "el boton de asignar queda
  cargando pero no asigna" (see
  `reference/2026-06-30-miguel-feedback-followups.md` §1).
- 2026-06-30 commit `00e47ab`: fix shipped — grouping cascade added
  `manual-<instructorId>` bucket rendered between engine groups and
  Sin asignar. Verified in code review same day (this session).
- Reference code path still present in current tree (confirmed by
  reading `apps/panel/src/app/(app)/roster/engine/page.tsx:99-115` and
  render at :777-960).
- The server action (`reassignDiverThisDay` in
  `apps/panel/src/app/actions/roster-engine.ts:1065-1139`) writes
  `instructorId` in a serializable transaction + calls
  `revalidatePath('/roster/engine')`. Code path is correct.

**So why is Miguel seeing this AGAIN?** Three hypotheses, most-likely
first:

### Hypothesis A — Screenshot is mid-action, action succeeds moments later
The button's `asignando…` state is the SubmitButton loading label. If
the operator screenshots 200–800 ms after clicking, they see this state
even in the happy path. On slow networks (Bali → Vercel EU/US → Supabase
EU) the round-trip can exceed 2 s.

**How to rule in/out:** Miguel waits 5+ seconds after clicking, then
screenshots. If pipo has moved to a warn-500 amber "Billy (manual)"
card, hypothesis A is confirmed and there is NO bug — only impatience
or an unclear loading indication.

### Hypothesis B — Action fails silently (throws before finish, error banner missed)
`reassignDiverThisDay` throws on:
- diver not found
- diver soft-deleted
- destination instructor sede mismatch
- **`validateActivityRol`** rejects the pairing

For BD_CONFINADA + INST role this should pass (see
`apps/panel/src/lib/roster-activity-rol.ts` — INST can lead any COURSE
activity). But if the row's `activity` was stored oddly (e.g. spelling
mismatch, cast issue), the check could reject.

`runAction` catches errors and returns `{ ok: false, error }`. The
form's `ActionForm` wrapper renders that error as a red banner ABOVE
the form. If the banner appears and immediately scrolls off-screen (or
Miguel misses it), the symptom looks identical to "action stuck".

**How to rule in/out:**
- Vercel logs (`vercel logs --follow pdm-diving`) for the request that
  handles the POST at `/roster/engine`. Look for a thrown error in
  `reassignDiverThisDay`.
- Or Supabase logs for the reassign transaction — did it commit?

### Hypothesis C — DB commit succeeded but revalidatePath / UI didn't refresh
`revalidatePath('/roster/engine')` is fire-and-forget. In rare edge
cases (Vercel edge cache miss, CDN staleness) the client sees the old
page state. A hard reload (Shift+F5) would then show pipo in the
manual bucket, confirming hypothesis C.

**How to rule in/out:**
- After clicking `aplicar`, hard-reload the page. If pipo appears
  under Billy's amber "manual" card, DB is correct + revalidation is
  the flake. If pipo is still in Sin asignar, DB never updated.

**Decisive DB query (rules in/out A vs B/C in one shot):**

```sql
SELECT id, nombre, codigo_buceador, slot, activity,
       instructor_id, group_id, origen, updated_at
  FROM roster_divers
 WHERE codigo_buceador = 'DPM-GA-0701-CD7846'
 ORDER BY updated_at DESC
 LIMIT 1;
```

Interpretation:
- `instructor_id = <Billy's uuid>` and `updated_at` recent → action
  succeeded; symptom is A (still loading UI-side) or C (revalidation
  flake). Fix scope = UI/UX, not server.
- `instructor_id = NULL` → action never committed. Fix scope = server
  action. Dig into Vercel logs for the thrown error.

**Fix shape — pending diagnosis:**

We CANNOT fix blindly. The right patch depends on which hypothesis
matches. Steve needs to feed back one of:

1. Result of the DB query above.
2. Vercel log excerpt from the failing request.
3. Screenshot taken 10 seconds after clicking `aplicar` (to eliminate A).

Once we know: fix is likely ≤ 30 min (server action bug fix, or
UI-side "action succeeded, page didn't refresh" mitigation).

**Files affected (best guess for each hypothesis):**
- Hypothesis A (impatience): none — improve UX by adding a "…este puede
  tomar unos segundos" hint under the loading button.
- Hypothesis B (action throws): `apps/panel/src/app/actions/roster-engine.ts`
  in `reassignDiverThisDay` — audit the throw paths + add richer
  error surfacing.
- Hypothesis C (revalidation flake): swap
  `revalidatePath('/roster/engine')` for `revalidatePath('/roster/engine', 'page')`
  or add an explicit `router.refresh()` on the client side after the
  action returns `{ ok: true }`.

**Priority:** 🔴 Highest — this was already reported once and marked
fixed on 2026-06-30. A regression on a fixed bug erodes Miguel's trust
in the deployment. Diagnose first, then patch.

**Time estimate:** diagnosis 30 min · fix 30-60 min depending on
hypothesis.

---

## #3 — Health metric "AI caída" counts handed_off traffic as "AI no responde"

**Miguel's words (2026-07-01 05:18 AM Bali, one-line follow-up):**
> "hace 46 minutos."

**Screenshot context:**
- Dashboard on `pdm-diving.vercel.app`
- Banner: `● AI caída — Hace 46 min que la AI no responde y 2 clientes
  están esperando`
- Right-side metrics: `ÚLTIMA RESPUESTA AI hace 46 min · CLIENTES
  ESPERANDO 2 · ERRORES 1H 0 · HANDED-OFF 71`
- Miguel hovered on the banner; tooltip repeats the same text.

**The suspicious combination:**

`ERRORES 1H = 0` AND `HANDED-OFF = 71`.

If the AI had genuinely crashed, we would see error rows piling up in
`errores` (which the process-message handler writes on every failure).
Zero errors + a huge handoff backlog + "no AI response in 46 min"
strongly suggests the AI is working normally and simply doesn't answer
the 71 handed_off conversations — and 2 of those handed_off customers
sent NEW cliente messages in the last 46 min, which the health metric
counts as "waiting on the AI".

That is a metric-accuracy bug, not an AI outage.

**Root cause (verified by reading source):**

[health-stats.ts:166-195](apps/panel/src/lib/health-stats.ts#L166-L195)
computes `lastAiMessageAt` and `inboundSinceLastAi` GLOBALLY across ALL
conversations:

```typescript
// Inbound waiting on AI: cliente messages newer than the latest AI reply.
db
  .select({ n: sql<number>`COUNT(*)::int` })
  .from(mensajes)
  .where(
    and(
      eq(mensajes.sender, "cliente"),
      sql`${mensajes.createdAt} > COALESCE(
        (SELECT MAX(${mensajes.createdAt}) FROM ${mensajes} WHERE ${mensajes.sender} = 'ai'),
        '1970-01-01'::timestamptz
      )`,
    ),
  ),
```

Neither query filters by conversation state. So the count of "clients
waiting on AI" includes:

- `handed_off` conversations — AI is intentionally silent, human took over.
- `closed` / `lost` conversations — terminal, AI must not respond.
- `human_took_over = true` on `leadMetadata` — same intent as handed_off.
- Simulator / replay traffic (already filtered by our other metrics via
  `is_simulated`, but NOT here).
- Bot-outbound echoes (rare, but possible if a webhook re-classifies).

With 71 handed_off convs in the system, even one or two new inbound
messages on ANY of those flips the semaphore to `bad` / "AI caída".

**Repro:**
1. Have any conversation in `handed_off` state.
2. Customer sends a new message on that conversation → row in mensajes
   with `sender='cliente'`.
3. AI stays silent by design (correct — human is handling).
4. But `getHealthSnapshot()` counts that cliente message as "waiting on
   AI" and if no OTHER conversation has had an AI reply in 15+ min, the
   banner flips to red.

**Fix shape:**

Filter both the "last AI reply" query AND the "inbound waiting" query
to exclude conversations where the AI is not supposed to respond. The
cheapest join keys are on `conversaciones`:

```typescript
// Only count clientes on conversations where the AI is still expected
// to respond. Human-attended and closed convs don't count.
db
  .select({ n: sql<number>`COUNT(*)::int` })
  .from(mensajes)
  .innerJoin(conversaciones, eq(conversaciones.id, mensajes.conversacionId))
  .where(
    and(
      eq(mensajes.sender, "cliente"),
      // exclude handed_off + closed + lost + human_took_over
      notInArray(conversaciones.leadStage, ["handed_off", "closed", "lost"]),
      sql`COALESCE((${conversaciones.leadMetadata}->>'human_took_over')::boolean, false) = false`,
      sql`${mensajes.createdAt} > COALESCE(
        (SELECT MAX(m2.created_at) FROM ${mensajes} m2
           INNER JOIN ${conversaciones} c2 ON c2.id = m2.conversacion_id
           WHERE m2.sender = 'ai'
             AND c2.lead_stage NOT IN ('handed_off','closed','lost')
             AND COALESCE((c2.lead_metadata->>'human_took_over')::boolean, false) = false
        ),
        '1970-01-01'::timestamptz
      )`,
    ),
  ),
```

Apply the same filter to the `lastAiRow` query.

Also consider excluding `is_simulated = true` (test / regression suite
traffic) so that a replay run doesn't skew the semaphore.

**Verification query — Steve/Miguel can confirm the bug is real:**

```sql
-- How many of the "clientes esperando" are actually in handed_off?
SELECT
  c.lead_stage,
  COALESCE((c.lead_metadata->>'human_took_over')::boolean, false) AS human_took_over,
  COUNT(*) AS msgs_since_last_ai
FROM mensajes m
JOIN conversaciones c ON c.id = m.conversacion_id
WHERE m.sender = 'cliente'
  AND m.created_at > COALESCE(
    (SELECT MAX(created_at) FROM mensajes WHERE sender = 'ai'),
    '1970-01-01'::timestamptz
  )
GROUP BY c.lead_stage, human_took_over
ORDER BY msgs_since_last_ai DESC;
```

Expected: rows for `handed_off` and/or `human_took_over = true` account
for most/all of the 2 "esperando" — that confirms the metric miscounts.

**Files affected:**
- `apps/panel/src/lib/health-stats.ts` — both queries in
  `getHealthSnapshot()`.
- No schema change; only SQL.

**Priority:** 🔴 High — escalated. See "Follow-up 2026-07-01 morning"
below; the metric is repeatedly flipping to red and Miguel has now
explicitly said it's happening `todo el tiempo`. Every false red costs
his attention until he stops trusting the semaphore entirely.

**Time estimate:** 45 min (rewrite query + verify + test with a fixture
conversation in handed_off).

**Follow-up screenshots 2026-07-01 morning (Miguel):**

Two dashboards captured back-to-back:

| Field | shot A | shot B |
|---|---|---|
| AI status | `● AI caída — hace 16 min` | `● AI caída — hace 17 min` |
| Clientes esperando | 6 | 3 |
| Errores 1h | 0 | 0 |
| Handed-off | 73 | 75 |
| P95 latency | 18886 ms | 18338 ms |
| Volumen 24h | 420 | 412 |

Miguel's message: *"esta caida nuevamente. tiene caidas intermitentes
todo el tiempo no se que es lo que sucede pero asi estamos."*

Between shot A and shot B, `esperando` dropped from 6 to 3 (three
clients DID get an AI reply) and `handed-off` went from 73 → 75 (two
more convs picked up by humans). So the AI is not "down" in any real
sense — it processed 3 replies in the minute between screenshots. But
the metric still flags `caída` because 3 lingering `esperando` remain,
almost certainly the same handed_off / stale conversations the metric
can't distinguish.

The intermittent pattern rules out a one-off Anthropic outage — it's a
persistent measurement bug. See #5 for the parallel performance angle
(P95 = 18 s means the AI IS slow when it does answer, which amplifies
the false-red because the metric threshold is 5 s = warn, 15 s = bad).

---

## #4 — Operator inbox send fails with "Respond.io devolvió 404: Not Found"

**Miguel's screenshot (2026-07-01):**
- Conversation open: **Jose Mora** · contact `248200040` · +85517781741 ·
  Koh Tao · stage `Propuesto`.
- Recent AI reply visible with `kb:KB-04`, `kb:KB-01`, `tool:enviar_catalogo`,
  `history:*` chips (so this contact HAS an active DPM AI thread).
- Composer bottom: `Jose te poemos ayudar en algo mas`.
- Red banner between messages and composer:
  **`⚠ Respond.io devolvió 404: Not Found`**
- 34 / 4096 chars counter, `AI activa · enviar tomará la conversación` hint.

**What's happening under the hood:**

`sendOperatorMessage` action → `sendCustomerMessage(...)` →
`RespondIoProvider.send(...)` calls Respond.io API. The code at
[customer-messaging.ts:110-117](apps/panel/src/lib/customer-messaging.ts#L110-L117)
picks the endpoint:

```typescript
const useContactFallback =
  !input.respondIoConversationId ||
  input.respondIoConversationId.startsWith("{{") ||
  input.respondIoConversationId === "unresolved";

const url = useContactFallback
  ? `${baseUrl}/contact/id:${...}/message`
  : `${baseUrl}/conversation/${respondIoConversationId}/message`;
```

Fallback triggers ONLY when the conversation id is empty / placeholder /
literal `"unresolved"`. In Miguel's case, `conversaciones.respond_io_conversation_id`
for Jose Mora is a real numeric id — but Respond.io no longer has that
conversation open (Respond.io rolls conversation ids periodically; the
one stored in our DB is stale). So we happily POST to
`/conversation/<stale-id>/message` and Respond.io answers 404.

The existing comment at [customer-messaging.ts:104-109](apps/panel/src/lib/customer-messaging.ts#L104-L109)
already ACKNOWLEDGES this failure mode:

> Respond.io behaviour (verified 2026-05-10): the conversation
> endpoint sometimes returns 404 if Respond.io has rolled the
> conversation id over to a new one. The /contact endpoint always
> resolves to the customer's current open conversation, so we use
> it as the canonical path when the conversation id looks unresolved

…but only handles the "looks unresolved" case, not "was resolved once
but Respond.io has since rolled it".

**Repro:**
1. Any conversation whose `respondIoConversationId` was set at some
   point but Respond.io has since closed/rolled it.
2. Operator opens the conversation, types a message, clicks
   `Enviar a WhatsApp`.
3. Panel POSTs to `/conversation/<stale-id>/message` → 404.
4. Red banner surfaces the raw Respond.io error to the operator.

**Fix shape (recommended — 30 min):**

Switch the default endpoint to `/contact/id:{contactId}/message` and
drop the conversation-id path entirely. The /contact endpoint always
resolves to the customer's current open conversation, so it's strictly
more resilient. The conversation endpoint offered no measurable
benefit — it was an early guess about what the API expected.

```typescript
// New (drop the branching entirely; contact endpoint always works):
const url = `${baseUrl}/contact/id:${encodeURIComponent(input.respondIoContactId)}/message`;
```

Optionally keep the conversation endpoint as a "try first, on 404
fallback to contact" retry — but that adds latency for no upside on
happy path and doesn't help the frequent 404 case that Miguel is hitting.

**Alternative (fallback-on-404) — 40 min:**

```typescript
async function callRespondIo(url: string, ...): Promise<Response> { ... }
let res = await callRespondIo(convUrl, ...);
if (res.status === 404) {
  res = await callRespondIo(contactUrl, ...);
}
```

Downsides: two network calls in the failure case; the failure case is
common (already reported in code comment); operator waits longer on
every failure. Not recommended.

**Verification the fix works:**

After deploying, retry Miguel's exact conversation (Jose Mora
`248200040`). The message should send successfully, land in Respond.io,
and appear in the operator's chat history as `sender='agente'`.

**Files affected:**
- `apps/panel/src/lib/customer-messaging.ts` — simplify the
  `RespondIoProvider.send()` URL selection to always use contact.
- `apps/panel/src/lib/respond-io.ts` — `sendRespondIoMessage` (currently
  unused by the operator inbox path, but used elsewhere? check callers
  before touching) same fix if applicable.

**Priority:** 🔴 High. This is the FIRST time an operator is trying to
use the new inbox feature Miguel asked for (resilience #2). A 404 on
first attempt kills confidence in the feature.

**Time estimate:** 30 min (change one line + test in prod on Miguel's
own contact).

---

## #5 — LATENCY P95 sitting at 18–19 s (target 3 s) · concurrent with #3's false-red

**Miguel's words (same message that flagged #3):**
> "esta caida nuevamente. tiene caidas intermitentes todo el tiempo no
> se que es lo que sucede pero asi estamos."

The banner + the metric strip together tell a compound story:

- `LATENCY P95` reads **18886 ms** and **18338 ms** — the "Slow" chip is
  lit in both shots. The dashboard's own hint says `target 3000 ms · P50
  6704 ms`, meaning **half** of AI replies take > 6.7 s and the slowest
  5% take > 18 s. That is *not* the "sub-3-second answer" we designed
  the semaphore around.
- `ERRORES 1H = 0` — the AI is NOT crashing. It's completing the calls,
  just extremely slowly.

Two coupled failure modes:

### (a) Real latency regression
Something changed in the request path so that p95 crept from a healthy
sub-3s baseline up to ~19s. Candidates:

1. **Anthropic API slowness** — a Tier-2 rate-limit brownout or transient
   Anthropic edge issue. Verify with the same window's `latency_ms` on
   `errores` + `llamadas_api` tables.
2. **Prompt / KB bloat** — if a recent prompt or KB edit grew the input
   tokens materially, per-request latency scales with input length.
   Check `promptsVersiones` and `kbDocuments` for anything committed
   after 2026-06-27.
3. **Batch coalesce serialization** — the debounce-and-coalesce path
   (`enqueueOrBatch` in `apps/server/src/handlers/webhook.ts`) waits
   ~2s for text bursts. If multiple burst inbounds keep re-arming the
   debounce, effective per-message latency stretches.
4. **Cold starts on Railway** — a scale-to-zero policy adds seconds on
   first request after idle. Miguel's overnight period may cover this.

### (b) Amplifies #3's false-red
The metric fires `bad` when *any* cliente is `esperando` and 15+ min
have passed since last AI reply. With p95 = 18 s, the AI takes so long
per reply that a burst of 6 incoming clientes can create a rolling
"esperando" backlog that never fully drains before the next burst,
keeping the metric painted red even as replies stream out. Fixing #3
alone (excluding handed_off / closed) may not be enough if the real
throughput can't clear the active queue fast enough.

**Diagnostic SQL to run right now:**

```sql
-- p50 / p95 / p99 of Claude call latency in the last hour
SELECT
  ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY latencia_ms))::int AS p50,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latencia_ms))::int AS p95,
  ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latencia_ms))::int AS p99,
  COUNT(*)          AS calls,
  MAX(latencia_ms)  AS max_ms,
  MIN(created_at)   AS window_start
FROM llamadas_api
WHERE created_at >= NOW() - INTERVAL '1 hour';

-- Top-10 slowest in the last hour
SELECT id, latencia_ms, prompt_tokens, output_tokens, created_at
  FROM llamadas_api
 WHERE created_at >= NOW() - INTERVAL '1 hour'
 ORDER BY latencia_ms DESC
 LIMIT 10;

-- Compare against the previous 24h baseline
SELECT
  DATE_TRUNC('hour', created_at) AS hr,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latencia_ms))::int AS p95_ms,
  COUNT(*) AS calls
FROM llamadas_api
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY hr
ORDER BY hr DESC;
```

If p95 was steady and jumped in the last few hours, it's Anthropic +
we wait it out (and put in an alert threshold). If it's been slowly
climbing over days, we bisect on the recent prompt / KB changes.

**Fix shape — depends on which sub-cause matches:**

- If Anthropic-side: add a Grafana / dashboard chart of p50/p95 by hour
  so future dips are visible instantly.
- If prompt bloat: trim the largest offending prompt block or move KB
  content into `enable_search=true` retrieval instead of injecting.
- If batch coalesce: shorten the debounce window from 2 s → 800 ms or
  add a hard ceiling on how long a burst can defer.

**Files affected (per hypothesis):**
- Prompt trim: `packages/shared/src/prompts/*` + `apps/server/src/services/prompts-service.ts`.
- KB retrieval mode: `apps/server/src/services/knowledge-base.ts`.
- Batch tuning: `apps/server/src/handlers/webhook.ts` (`enqueueOrBatch`).
- Anthropic-side monitoring: `apps/panel/src/lib/health-stats.ts` +
  new `latency_p95` field on the snapshot; render a chart on Dashboard.

**Priority:** 🔴 High. Latency this high (a) frustrates real customers
waiting for the AI, (b) drives Miguel's false-red pattern in #3, (c)
makes every panel-side loading state feel broken (see #6-#8's SubmitButton
"asignando..." impatience — 3s becomes 20s in this environment).

**Time estimate:** 2–4 h — mostly diagnosis, then a targeted fix.

---

## #6 — Deposit message ships without per-pax ref codes; AI substitutes "vuestros nombres"

**Miguel's words (2026-07-01 05:19 PM Bali):**
> "por algun motivo no genero los codigos unicos y en su defecto les dijo
> que pongan sus nombres como referencia, cuando envio la foto paso algo,
> y despues hice recall le envio la cuenta nuevamente sin los codigos y
> cuando se los pedi por privado solo repitio mensaje sin codigos unicos."

Free translation: for some reason the AI didn't generate the unique
codes; instead it told the clients to use their own names as reference.
When the AI sent the catalog image something happened. Then I did a
`recall` and it sent the account details again — still without codes.
And when I asked via operator note (`@COLOMBA AI generales dos codigos
unicos para ellos`), the AI just repeated the same message without codes.

**Conversation:**
- Customer: Enrique Ortiz · Respond.io ID `479577935` · Spain · +34 699 79 94 26.
- Sede: **Gili Air** · Branch=Gili Air · Idioma=Spanish · Etiqueta=Gili Air.
- Assignee: `COLOMBA AI` (the GA AI persona).
- Pax: **2** (Enrique + partner) · Program: OW / BD (from catalog image
  "Bautizo de Buceo 1,750,000 IDR"). Amount in EUR: **40 EUR × 2 = 80 EUR**.
- Fecha reserva: 2026-07-09 (llega el 8, "hacemos noche del 8 al 9").

**Timeline (from the 4 screenshots):**

1. AI catalog card sent. `Disponibilidad confirmada. Ahora invoco
   \`solicitar_deposito\`:` (this text is the AI's *narration* — the
   actual tool result never follows in the visible bubbles).
2. Customer sends two lines: "Si creen que con estos horarios vamos bien
   de tiempo lo podemos reservar. Es fiable esta web?" / "Pero llegarian
   a que hora en la mañana?"
3. Operator (Rosanne?) replies manually: "Pero llegarian a que hora en
   la mañana?" (a manual repeat / question passed to customer).
4. Customer: "Llegamos el día antes" · "Hacemos noche del 8 al 9".
5. Operator (manual): "Ok perfecto!" · "No hay problema. Hacemos noche
   del 8 al 9."
6. AI (5:11:31 PM, delivered 5:11:34, read 5:11:40) sends the "day-8
   arrive + register + Voy a prepararte los datos para el depósito en
   EUR — un momento" pre-message.
7. AI (a second message, near-identical) repeats the same pre-message
   with wording variations. **Two consecutive AI messages saying almost
   the same thing** — a batch-coalesce echo or a retry that didn't
   dedupe.
8. Operator: `dont take it` (some silent note, then) `@COLOMBA AI mandale
   la cuenta para pagar en euros`.
9. AI 5:14:14 delivers deposit details:
   ```
   Titular: DPM Diving Gili Air LLC
   BIC: TRWIBEB1XXX
   IBAN: BE26 9050 6838 7229
   Banco: Wise, Rue du Trône 100, 3rd floor, Brussels, 1050, Belgium
   El importe son 80 EUR en total (40 EUR × 2 personas).
   Como referencia podéis poner vuestros nombres.       ← BUG
   ```
   NO ref code. "Vuestros nombres" as reference is unreconciliable with
   the sales logger.
10. Operator escalates: `@COLOMBA AI generales dos codigos unicos para
    ellos` (explicit ask to generate two unique codes).
11. AI replies AGAIN — now confirming Boat 12:30–4:00 PM, arrival
    instructions, and says:
    > "Los datos para el depósito en EUR son los que te pasé antes — 80
    > EUR en total (40 EUR × 2 personas). Una vez hecho, mandadme el
    > comprobante en PDF 🛥️ sin el pago no podemos bloquear el lugar."
    STILL no ref codes. The AI heard "generate two unique codes" and
    responded by *repeating* the previous message.

**Miguel's core rule (memory refs):**
- `ref_code_per_pax_confirmed.md` (2026-06-27): **one code per person**,
  not per reservation.
- `feedback_miguel_2026_06_09.md`: multi-pax bookings must produce N ref
  codes on `leadMetadata.ref_codes_by_pax` (inverts the earlier 06-06 rule).
- `architecture_refcode_format.md`: `DPM-<sede prefix>-MMDD-XXXXXX`
  format (`DPM-GA-0709-XXXXXX` for Gili Air 9 July).
- `architecture_close_sale_logger.md`: sales_logger writes ONE ROW PER
  (pax × program) — requires ref codes as canonical key.
- `feature_sandbox_roster_grid.md` + walk-in flow: SSI online registro
  (memory: `SSI Developer Portal`) will require these codes to auth
  individual divers.

Using "nombres" as reference breaks ALL downstream flows: OCR
reconciliation, sales_logger, roster_divers (per Miguel 2026-06-30 #5),
and the future SSI registro.

**Root cause hypotheses (most-likely first):**

### A — `solicitar_deposito` tool didn't actually run (only narrated)
The AI bubble that says `Ahora invoco \`solicitar_deposito\`:` is the
*chain-of-thought / prose* the model emitted, NOT proof the tool
executed. If for some reason the tool call was dropped (structured-output
parser rejected it, streaming truncation, race) the leadMetadata never
got its `ref_codes_by_pax` array. All downstream deposit messages then
free-associate a reference — hence "vuestros nombres".

**Rules in/out this hypothesis:** `SELECT lead_metadata->'ref_codes_by_pax'
FROM conversaciones WHERE respond_io_contact_id = '479577935'`. If null
or missing, tool never fired. If populated but the prompt didn't inject
them, that's hypothesis B.

### B — Tool ran, codes exist, but the prompt template didn't inject them into the deposit message
The deposit-message template may reference the codes by placeholder
(e.g. `{{ref_codes_by_pax}}`) but the current prompt version has a
regression that drops the substitution when N > 1. The AI then fills
the gap with a plausible-sounding "vuestros nombres" — a classic
hallucination pattern for missing template fields.

**Rules in/out:** compare `apps/server/src/tools/solicitar-deposito.ts`
output vs the current deposit prompt in `packages/shared/src/prompts/`
(or `prompts_versiones` for the GA sede). Check when this prompt was
last edited.

### C — Operator @COLOMBA AI note doesn't re-trigger the tool
When the operator writes `@COLOMBA AI generales dos codigos unicos`,
this reaches the AI as a message (via Respond.io agent-outbound
webhook). The AI reads it as *instruction*, not as a tool trigger. If
the ref codes DO exist on leadMetadata already (hypothesis B), the AI
should re-emit them; if they DON'T exist (hypothesis A), the AI needs
to actually invoke `solicitar_deposito` again. The current prompt
apparently does neither — it just repeats.

This is orthogonal to A/B: even if A/B is fixed, operator retries
should be able to force a re-issue. Prompt needs an escape rule:
"if the operator explicitly asks for codes, call solicitar_deposito
again with pax count N and inject the resulting array."

### D — Multi-message batch coalescing echoed the deposit message twice
Screenshot 2 shows two near-identical "Voy a prepararte los datos"
bubbles at 5:11:31 back-to-back. That's an outbound duplication —
either the AI generated two messages in the same turn (rare, would need
the model to double-tap) or the sender fired twice (batch coalesce
retry?). Worth noting because it might correlate with the tool-drop:
if the second turn ATE the tool call, no codes.

**Diagnostic to run FIRST (before any code change):**

```sql
-- 1. Do the ref codes exist in the DB for this booking?
SELECT
  c.id,
  c.lead_stage,
  c.lead_metadata->'ref_codes_by_pax'  AS codes_per_pax,
  c.lead_metadata->>'ref_code'         AS legacy_single_code,
  c.lead_metadata->>'pax'              AS pax,
  c.lead_metadata->>'deposit_amount'   AS amount,
  c.lead_metadata->>'deposit_currency' AS currency,
  c.updated_at
FROM conversaciones c
WHERE c.respond_io_contact_id = '479577935'
ORDER BY c.updated_at DESC
LIMIT 1;

-- 2. Did solicitar_deposito actually fire? Look at llamadas_api / errores.
SELECT id, created_at, latencia_ms, prompt_tokens, output_tokens,
       response_text
  FROM llamadas_api
 WHERE conversacion_id = (
   SELECT id FROM conversaciones WHERE respond_io_contact_id = '479577935'
     ORDER BY updated_at DESC LIMIT 1
 )
 ORDER BY created_at DESC
 LIMIT 10;

SELECT id, kind, created_at, LEFT(message, 200) AS msg
  FROM errores
 WHERE conversacion_id = (
   SELECT id FROM conversaciones WHERE respond_io_contact_id = '479577935'
     ORDER BY updated_at DESC LIMIT 1
 )
 ORDER BY created_at DESC
 LIMIT 10;

-- 3. Was anything logged about ref-code generation?
SELECT id, kind, created_at, LEFT(message, 300)
  FROM errores
 WHERE created_at >= NOW() - INTERVAL '2 hours'
   AND (message ILIKE '%ref_code%' OR message ILIKE '%deposit%' OR message ILIKE '%479577935%')
 ORDER BY created_at DESC
 LIMIT 20;
```

Interpretation:
- Codes present in DB but not in messages → **hypothesis B** (prompt
  template drops them). Fix = fix the prompt.
- Codes NULL in DB → **hypothesis A** (tool never fired). Fix =
  process-message tool-call reliability + retry.
- Errores rows around the deposit turn → follow the specific error.

**Fix shape (once diagnosis done):**

- If A: harden `solicitar_deposito` call site to retry once on parse
  failure + log a hard error to `errores` when the tool call fails.
- If B: audit the GA deposit prompt template; ensure `ref_codes_by_pax`
  is rendered as a numbered list keyed to pax N, and add an assertion
  in the emitter that refuses to send the deposit message if the array
  is missing / shorter than pax count.
- If C: add prompt rule "when operator asks for codes, invoke
  `solicitar_deposito` again with the current pax count; do not repeat
  the earlier message."
- If D: audit batch-coalesce for duplicate outbound emission (may
  correlate with #5's high latency — if the same turn is being
  processed twice, that's both slow AND wasteful).

**Files affected (best guesses per hypothesis):**
- `apps/server/src/tools/solicitar-deposito.ts` — tool signature + result.
- `apps/server/src/handlers/process-message.ts` — tool call path,
  batch coalesce, agent-outbound handling.
- `packages/shared/src/prompts/*` — deposit message template for GA
  (and any other sede that shares it).
- `apps/server/src/handlers/process-agent-message.ts` — operator note
  handling; may need a rule "re-invoke deposit tool if operator asks".

**Priority:** 🚨 CRITICAL. Payment reconciliation is the highest-stakes
path in the whole product. A booking that lands 80 EUR without a
matching ref code is a manual investigation for the office
(who paid? which reservation?) and — at Miguel's scale of tens of
bookings/week — a serious ops load. Also: this violates a Miguel rule
that was already fixed and confirmed (`ref_code_per_pax_confirmed`
2026-06-27), so a regression here erodes trust.

**Time estimate:** 30 min diagnosis · 1-2 h fix depending on hypothesis.

---

## #7 — New role required: "oficina · todas las sedes" for the remote 24/7 team

**Miguel's words (2026-07-01, on `/admin/users` screenshot):**
> "aca necesitamos una que pueda tener acceso como oficina a toddas las
> sedes ya que es para el equipo humano remotos 24/7hs."

Free translation: here we need one [account] that can access as
`oficina` to ALL sedes, since it's for the remote human 24/7 team.

**Screenshot context:**
- `/admin/users` page (Usuarios del panel)
- Miguel opened the ROL dropdown; only two options exist today:
  - `oficina (una sede)` — office user, ONE sede only.
  - `admin (todas las sedes)` — admin, all sedes + admin surfaces.
- Blue arrow drawn on the missing third option: office-level user but
  spanning every sede.
- User list shows the current shape: 5 office users (one per sede: GA,
  KT, PP, NP, plus admin) — no cross-sede operator role yet.

**Why Miguel needs it:**

The remote 24/7 team handles conversations for ALL five sedes (PP, KT,
GA, NP, GT) — they're not tied to a single center. Making them
`admin` gives them permissions they shouldn't have (user creation,
prompt editing, panel-wide configuration, `/admin/users` visibility).
Making them `oficina` locks them to one sede, useless for cross-sede
coverage.

**Existing model (memory ref `architecture_panel_admin_boundary`):**

- Supabase `user_metadata.role` = `'admin' | 'office'`.
- Supabase `user_metadata.sede` = sede *name* (resolved to `sedeId` in
  auth-context) OR null for admins.
- Auth-context helper `requireSedeWriteAccess(sedeId)` gates write
  actions: admin bypasses; office needs matching sedeId.
- List queries filter by user's sedeId when role is office.

**Design decision — two viable shapes:**

### Option A — introduce a third literal role (`office_all` or `office_multi`)

Pro: unambiguous. Every role check reads clearly.
Con: every existing `role === "office"` conditional across the codebase
needs updating. That's ~15 call sites (auth-context, listConversations,
listRoster, /admin/users guard, /conversations/[id] scope check, roster
engine + instructors pages, etc.). Ongoing risk that a future page
forgets to include the new role in its guards.

### Option B (recommended) — allow `role="office"` + `sedeId=null` to mean "office everywhere"

Pro: minimal code surface. Only:
  - `auth-context.getCurrentUserContext()` — allow office users with
    a null sedeId (drop the "if role=office && !sedeName → error"
    branch that today forces office to have a sede).
  - `requireSedeWriteAccess(sedeId)` — allow office user whose own
    `sedeId === null` to write to any sede. Same escape hatch admin
    already has.
  - Every "list X for this user" query — treat `role="office" &&
    sedeId=null` the same as admin's global view.
  - `/admin/users` form — add the `sede=null` case (dropdown shows a
    new "Todas las sedes" option only when role=office).
  - `scripts/create-panel-user.ts` — accept the combination.
- Admin-only surfaces (`/admin/users`, `/prompts`, `/kb/new`) still
  guarded by `role === "admin"` — the new user does NOT gain admin
  powers.

Con: two ways to "read everything" exist in the DB (admin and
office+null). Requires clean naming in UI so operators can tell them
apart. Solved by rendering the sede column as "todas · oficina" for
this cohort.

**Recommended: Option B.** Smaller diff, no risk of leaking role
checks. The semantic overload of `sedeId=null` is bounded and
documented.

**Fix shape (Option B):**

```typescript
// apps/panel/src/lib/auth-context.ts
// Old:
if (role === "office" && !sedeName) return null; // (or forces error)
// New:
if (role === "office" && !sedeName) {
  return {
    userId: data.user.id,
    email: data.user.email ?? "",
    role: "office",
    sedeId: null,        // ← office-across-sedes semantics
    sedeName: null,
  };
}

// apps/panel/src/lib/auth-context.ts
export async function requireSedeWriteAccess(sedeId) {
  const ctx = await requireUserContext();
  if (ctx.role === "admin") return ctx;
  if (ctx.role === "office" && ctx.sedeId === null) return ctx; // NEW
  if (ctx.sedeId !== sedeId) throw new Error("forbidden: ...");
  return ctx;
}
```

Every list query already has the shape `if (user.role === "office")
filter by user.sedeId` — with `sedeId=null` the filter becomes no-op,
which is exactly the desired behavior. Verify each call site handles
null cleanly (most will; a couple may pass `sedeId=null` and get an
error from Drizzle's `eq()`). Grep for `role === "office"` before
committing.

**UI changes:**

- `/admin/users` ROL dropdown: keep 2 rol options (`office`, `admin`).
  Add a THIRD SEDE option `Todas las sedes (cross-sede oficina)` — only
  selectable when rol=office. Server accepts the combination.
- User table SEDE column: render `todas · oficina` in the same style
  as `todas` for admins (currently italic grey), but with the "oficina"
  tag so admins can tell them apart.

**Files affected:**
- `apps/panel/src/lib/auth-context.ts` — accept role=office + sede=null.
- `apps/panel/src/app/(app)/admin/users/page.tsx` — UI form + list
  rendering.
- `apps/panel/src/app/actions/users.ts` — the create/update action
  (accept null sede for office).
- `scripts/create-panel-user.ts` — CLI equivalent.
- One-time grep across `apps/panel/src` for `role === "office"` to
  spot any guard that would fail on null sedeId.

**Priority:** 🟠 Feature request that unblocks the 24/7 remote team —
without it, Miguel can't give them access. Not code-breaking but
operationally blocking.

**Time estimate:** 1-2 h (Option B). Option A would be 3-4 h.

**Naming decision needed from Miguel:**

What should this new "cohort" be called visually in the UI?
- "Oficina · todas las sedes"
- "Operador remoto"
- "Support 24/7"
- Something else Miguel prefers

Ask Miguel before shipping so the label matches how he thinks about
this role.

**Follow-up screenshot 2026-07-01 (Miguel):**

Second screenshot on `/admin/users` — this time Miguel opened the
**SEDE** dropdown (with rol=oficina still selected). Shows the current
5 options: `—` / Gili Trawangan / Gili Air / Koh Tao / Koh Phi Phi /
Nusa Penida. Miguel drew two arrows:

- One from the empty `—` position UP to the SEDE dropdown header,
  suggesting "there should be a **todas** option here".
- One from `miguel@dpmdiving.com` (row shows `admin` · `todas` in
  italic grey) TO the same dropdown, saying "make it look like this
  row's SEDE column but with rol=oficina".

**Miguel's caption:**
> "vista como oficina a todas las sedes."

Confirmed UI spec:
- Keep the two ROL options unchanged (`oficina (una sede)` /
  `admin (todas las sedes)`).
- Extend the SEDE dropdown to include **`Todas las sedes`** as the
  first option (above the `—` placeholder or replacing it) — but only
  render / accept that value when rol=oficina.
- Rename the SEDE dropdown label from `SEDE (SOLO SI ROL=OFICINA)` to
  something like `SEDE (oficina: una sede o todas)` so the "todas"
  option isn't a surprise.
- In the users list below, render the resulting user as `oficina` in
  the ROL badge column and `todas · remoto` (or Miguel-approved copy)
  in the SEDE column, styled like the existing italic-grey `todas` used
  for admins but with a distinguishing suffix.

That fully answers "what should the UI look like" without needing
a naming call from Miguel — the ROL badge stays `oficina`, and the
SEDE column tells the operator this is a cross-sede account. The
"Operador remoto" / "Support 24/7" label question becomes optional
polish, not blocking.

---

## #8 — "Copy code" button on every diver row of the roster engine

**Miguel's words (2026-07-01, on `/roster/engine` screenshot):**
> "aca tiene que haber botos de copiar codigo unico para que sea
> sencillo para cargar los demas dias del programa de la misma persona."

Free translation: here there should be a button to copy the unique code
so it's easy to load the remaining days of the same person's program.

**Screenshot context:**
- `/roster/engine` on 2026-07-01, sede GA.
- Blue arrow drawn at **pipo** (`DPM-GA-0701-D5VKX6`) in the Esteban
  INST manual bucket / TURNO PM row.
- Same pipo also appears in TURNO POOL_AM under Esteban with the same
  ref code — so this diver is already booked for 2 activities on
  day 1 (morning pool + afternoon boat) of a multi-day BD program.

**Why Miguel needs it:**

Multi-day programs (OW = 3 days, AOW = 2 days, etc.) require the
walk-in operator to create separate `roster_divers` rows for each day.
Per Miguel rule (`ref_code_per_pax_confirmed` 2026-06-27), all rows
for the SAME person must share the ref code. Today the operator has to
either:

1. Mentally memorize the code (`DPM-GA-0701-D5VKX6` — 15 chars,
   error-prone).
2. Manually select the mono-font text with the cursor and Cmd/Ctrl-C.
   Fiddly at that font size.

Either way, entering the wrong code on day 2 desyncs the person's
history and breaks:
- `roster_divers` linkage across days (aggregation queries).
- Future SSI online registro auth (per code, per diver).
- Sales-logger idempotency (dedupes by `(codigo × programa)`).

**Fix shape (30 min):**

Add a small copy icon button to the right of every `codigoBuceador`
render in `apps/panel/src/app/(app)/roster/engine/page.tsx`. Fire
`navigator.clipboard.writeText(code)` and show a 1.5 s "Copiado ✓"
toast/inline chip so the operator has feedback.

```tsx
// Small client component — reusable across grouped / manual / unassigned
// / flat-list renders.
"use client";
import { useState } from "react";

export function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="ml-1 text-[10px] text-ink-500 hover:text-brand-300"
      title="Copiar código"
    >
      {copied ? "✓" : "⧉"}
    </button>
  );
}
```

Drop it right after each `{d.codigoBuceador}` render — there are FOUR
call sites (engine-grouped row, manual bucket row, unassigned `<li>`,
flat list row). Same visual treatment on all four keeps the UX
consistent.

**Files affected:**
- `apps/panel/src/app/(app)/roster/engine/page.tsx` — 4 render sites.
- One new tiny client component (or inline the button — negligible
  code duplication for 4 uses).

**Priority:** 🟡 Small UX. Not blocking, but eliminates a paper-cut
Miguel does dozens of times a week when loading multi-day walk-ins.

**Time estimate:** 30 min including the 4 render-site changes + test
on Miguel's own row.

---

## #9 — Roster engine needs "next day" / "previous day" shortcut buttons

**Miguel's words (2026-07-01, on `/roster/engine` screenshot):**
> "aca un botos que diga next day."

Free translation: here [a button] that says "next day".

**Screenshot context:**
- `/roster/engine`, sede Gili Air, `Fecha: 01/07/2026`.
- Blue arrow drawn straight at the date input.
- Header shows the current picker + `Ver` submit button. No day-navigation
  shortcuts today — operator must open the native `<input type="date">`
  picker, pick tomorrow, click Ver.

**Why Miguel needs it:**

Directly complementary to #8 (copy ref code for multi-day walk-ins).
When Miguel loads a 3-day OW walk-in he now has to:

1. Load day 1 walk-in → copies code (see #8).
2. Open date picker → pick day 2 → click Ver → wait for reload.
3. Fill walk-in form again for day 2 → paste code.
4. Open date picker → pick day 3 → click Ver.
5. Fill walk-in form again for day 3 → paste code.

Steps 2 and 4 are the paper-cut. Native `<input type="date">` UI is
slow (calendar dropdown, small target on Bali's laptop screen) and
requires visually re-reading the current date.

**Fix shape (20 min):**

Add two subtle chevron buttons flanking the date input:

```
Sede: [Gili Air ▼]  Fecha: [<] [01/07/2026 📅] [>]     [Ver]
```

Clicking `<` submits the form with `fecha = fecha - 1 day`; `>` submits
with `fecha + 1 day`. Buttons wrap around month boundaries naturally
because we compute in ISO date.

Because the current form is a plain server-side form (`<form>` +
submit → server re-renders), the shortcut can be:

```tsx
// Two hidden-payload buttons that submit the SAME form with different
// values. We compute prev/next as ISO dates on the server side too
// so no client JS is needed.
const prevDate = subDays(fecha, 1);
const nextDate = addDays(fecha, 1);
<form className="...">
  <input type="hidden" name="sede" value={selectedSede.id} />
  <button
    type="submit"
    name="fecha"
    value={prevDate}
    className="btn-ghost text-xs"
    title="Día anterior"
  >←</button>
  <input type="date" name="fecha" defaultValue={fecha} />
  <button
    type="submit"
    name="fecha"
    value={nextDate}
    className="btn-ghost text-xs"
    title="Día siguiente"
  >→</button>
  <button className="btn-primary">Ver</button>
</form>
```

Note the gotcha: two `name="fecha"` inputs in the same form — the
LAST one wins by default when the user submits the middle button. The
back/next buttons override by supplying their own value. Verify browser
compatibility (works in all modern browsers per the WHATWG spec).

**Keyboard shortcut (optional polish):**

Add `←` / `→` keyboard shortcuts when the roster page has focus, using
a tiny client `useEffect` hook. Miguel didn't ask for this but it's a
2-line add on top of the same date math — matches how power users
navigate calendars.

**Files affected:**
- `apps/panel/src/app/(app)/roster/engine/page.tsx` — the top form.
- Optionally a small `date-nav.tsx` client component if we add keyboard
  shortcuts.

**Priority:** 🟡 Small UX. Same "paper-cut" tier as #8; both fixes serve
the multi-day walk-in workflow.

**Time estimate:** 20 min (server-side buttons only). +10 min if we
add keyboard shortcuts.

**Suggested bundling:** ship #8 + #9 in one commit — same file, same
workflow ("multi-day walk-in loading"), same operator (walk-in desk).

---

## #10 — Walk-in "Actividad" dropdown is missing course-upgrade codes

**Miguel's words (2026-07-01, on `/roster/engine` walk-in form):**
> "faltaria agregar los posibles upgrades."

Free translation: we're missing the possible upgrades to add.

**Screenshot context:**
- Walk-in form's `Actividad` dropdown is open.
- Blue arrow drawn from the open dropdown DOWN to the `Cargar walk-in`
  submit button — pointing out "these options let me create a walk-in,
  BUT there's no upgrade option in the list".
- Current options visible: `BD_CONFINADA (pool)`, `BD_BARCO (boat)`,
  `OW1`, `OW2`, `OW3`, `FD`, `AA`, `AA2`, `ADV`, `SP`, `RES`,
  `REF_FASE1`, `REF_FASE2`.
- URL confirms sede = a57384ee (Gili Trawangan by uuid), fecha =
  2026-07-02.

**What "upgrade" means in DPM context:**

A course upgrade happens when a customer who already started (or
completed) a lower-tier program pays the delta to progress to the next
tier. Common paths:

- **Try Scuba (BD) → Open Water**: BD customer decides during / after
  the pool session to continue as full OW student. Only the additional
  days (usually OW2 + OW3) need loading — pool day is already done.
- **Scuba Diver → Open Water**: SSI has a "Scuba Diver" mid-cert; some
  customers finish OW later.
- **OW → Advanced Open Water (AOW)**: certified OW divers add the AOW
  program on the same trip.
- **AOW → Rescue** / **Rescue → DMT**: further progression.

Each path has DIFFERENT day/slot footprint from the "start from zero"
version — that's why they need dedicated activity codes.

**Root cause:**

The `Actividad` enum today only lists the canonical training days
(BD_CONFINADA / BD_BARCO / OW1-3 / AA / AA2 / ADV / SP / RES / REF_*),
plus FD (Fun Dive). It doesn't have a "this customer is upgrading FROM
X TO Y" identity for the roster.

Two paths a fix could take:

### Option A — add dedicated upgrade activity codes
```
BD_TO_OW           (skip pool day, do OW2 + OW3 only)
SD_TO_OW           (skip OW1, do OW2 + OW3)
OW_TO_AOW          (2-day AOW starting from OW cert)
AOW_TO_RES         (Rescue days for already-AOW customer)
```

Each new code needs a matching entry in
`packages/shared/src/program-schedule.ts` — `programaToActivityFootprint`
mapping — so the engine knows day-by-day slot/activity assignments.

Ties to open memory item `project_missing_program_schedules` (Miguel
still owes day-by-day breakdown for 7+ programs).

### Option B — reuse existing codes + tag upgrades via `activityDetail`
Keep the current 13 codes; use the free-text `activity_detail` field
to note "upgrade from BD" or similar. Simpler DB-wise, but the engine
can't distinguish, and the roster reports don't show upgrade
separately.

**Recommended:** Option A, phased. Add codes only for the upgrades
Miguel actually books today. Don't try to enumerate every possible
SSI/PADI upgrade upfront.

**What we need from Miguel before implementing:**

1. **Which upgrade paths do we need TODAY?** (Prioritized list —
   probably starts with BD→OW since it's the most common conversion.)
2. **For each upgrade path**, the day-by-day footprint:
   - How many days total?
   - Which slots (AM/PM/POOL_AM/POOL_PM/NIGHT) on each day?
   - Which activity on each slot?
   - Depth cap per day?
3. **Should the upgrade activity block the same slots as the
   "start-from-zero" version?** (Capacity check — an upgrade to OW2 on
   day 1 should count against the same boat slot as a fresh OW student
   doing OW1.)

Without this input we can't implement — enumerated activity codes are
just labels; the ENGINE needs schedule + capacity rules.

**Files affected (once Miguel provides the spec):**
- `packages/shared/src/program-schedule.ts` — new entries in
  `programaToActivityFootprint`.
- `apps/panel/src/lib/roster-activity-rol.ts` — extend `COURSE_ACTIVITIES`
  set (upgrades are still instructor-only; DMs can't lead them).
- `apps/panel/src/app/(app)/roster/engine/page.tsx` — dropdown option
  list (add labels: `BD → OW (upgrade)`, `OW → AOW (upgrade)`, etc.).
- `apps/panel/src/app/actions/roster-engine.ts` — allow the new codes
  through the create-walk-in Zod schema.

**Priority:** 🟠 Feature blocking new activity type — but the block is
Miguel-side (needs his upgrade spec), not code-side. As soon as he
sends the spec, the actual coding is ~30 min per upgrade path.

**Time estimate:** 30 min per upgrade path (add code + schedule + role
gate + dropdown entry) once Miguel provides the day-by-day breakdown.

**Related memory:**
- `project_missing_program_schedules` — same shape of open ask
  (multi-day programs missing footprint definitions).
- `feature_sandbox_roster_grid` — sandbox testing path for verifying
  the new codes behave correctly.

---
