# 2026-05-12 — Customer feedback (Round 2)

Miguel's second feedback round after running 13 tests over 2 hours on top of our morning fixes. 7 perfect, 6 acceptable, 0 critical failures. Confirms the AI logic and most of round-1 fixes landed. Three architectural / wiring gaps remain.

> **Miguel's verbatim priority list (his order):**
> 1. Lifecycle PATCH on every stage transition
> 2. Remaining 7 custom fields wiring
> 3. OCR amount validation
> 4. Bidirectional sync (Respond.io changes → server DB)

---

## ✅ Confirmed working from round-1 fixes

| Field | Status |
|---|---|
| `pax` | ✅ populating automatically |
| `Turno` | ✅ |
| `programa` | ✅ |
| `start_date` | ✅ |
| `motivo_escalation` | ✅ |
| `Idioma` | ✅ "Spanish" (this is our §4 language push working) |
| AI logic + tool calls | ✅ solid across 13 tests |

---

## ❌ Remaining gaps

### Gap 1 — Lifecycle PATCH (Miguel's #1 priority, MOST IMPORTANT)

**Miguel's words:** *"LIFECYCLE never updates. Miguel stayed at 'New Lead' through 13 tests, even after John quoted Advanced 5.400.000 IDR, verified availability for OW, and Turno + programa + start_date got populated. Server's internal stage classifier works (we saw it in Command Center) but it doesn't PATCH lifecycle to Respond.io. This is the most important wiring gap — without lifecycle sync, the operations team can't see in Respond.io who is hot vs cold."*

**Root cause (confirmed by probing 2026-05-12):**
- Respond.io v2 `PUT /contact/id:{id}` SILENTLY DROPS the `lifecycle` key. Every variant tried returned 200 OK with no actual change:
  - `{lifecycle: "Engaging"}` → 200, no change
  - `{lifecycle_stage: ...}` → 200, no change
  - `{stage: ...}` → 200, no change
  - `{lifecycle: {stage: ...}}` → 200, no change
- Dedicated endpoints: PUT/POST `/contact/id:{id}/lifecycle` → 404. PATCH same path → 403 (AWS WAF block).

**Why this matters more than we initially realized:**
Miguel ran 13 tests and the operations team can't tell at a glance which contacts are "hot" (in deposit_pending, ready to close) vs "cold" (proposed, exploring). The Respond.io operator UI's primary triage signal IS lifecycle. Without sync, the team relies on tags + custom fields, which is slower.

**Confirmed against Respond.io public docs 2026-05-12** (`respond.io/help/workflows/step-update-lifecycle`): lifecycle change is ONLY possible via the workflow "Update Lifecycle Step" — there is no direct API endpoint, period. This is a platform-design choice on Respond.io's side, not something we can engineer around.

**However**, the same docs (`workflows/workflow-triggers`) confirm workflows can be triggered programmatically via:
- Trigger #6: Incoming Webhook (unique URL per workflow, accepts JSON POST)
- Trigger #3: Contact Tag Updated (we control tags via API)

So we have two viable paths to drive lifecycle from server logic:

**Option D — Incoming Webhook (NEW recommendation):**
- Miguel creates 5 workflows in Respond.io workspace, each with:
  - Trigger: Incoming Webhook (contact identifier = Contact ID)
  - Step 1: Update Lifecycle → {New Lead | Engaging | Following Up | Customer | Lost Lead}
- Each workflow generates a unique stable webhook URL (visible in the trigger config UI).
- Miguel hands us the 5 URLs. We store them as env vars (e.g. `RESPONDIO_LIFECYCLE_WEBHOOK_ENGAGING`, etc.) OR as a column on the `sedes` table.
- On every `leadStageService.applyTransition`, fire-and-forget POST `{contactId: ...}` to the matching URL.

Pros: no tag pollution, direct mapping, workflows can chain additional actions (e.g. notify team), webhook URLs are stable. ~20 min server code + ~30 min Miguel workflow setup.

**Option A — Tag-driven (original recommendation):**
- Server emits internal tags (e.g. `__lc_engaging`, `__lc_customer`) on each transition.
- Miguel creates 5 workflows triggered by "Contact Tag Updated" filtering on each tag, with an Update Lifecycle step.

Pros: no URL management. Cons: pollutes the contact with 5 housekeeping tags, requires cleanup. ~25 min server code + ~15 min Miguel workflow setup.

**Recommended: Option D.** Cleaner long-term — keeps `deposit_paid` / `ai_escalation` semantically meaningful instead of mixed with lifecycle plumbing.

---

### Gap 2 — Custom fields still empty (the 7 Miguel listed)

**Miguel's words:** *"Custom fields still empty in panel: Monto, Moneda, sede, descuento, descuento_aplicado, codigo_referencia, ad_source. Monto + Moneda + codigo_referencia + sede are the ones that matter for operations."*

**Root cause analysis per field:**

| Field | Why empty | What's needed |
|---|---|---|
| **Monto** | Only written by `solicitar_deposito` handler. Miguel's 13 tests were ALL pre-deposit (AI quoted but customer didn't confirm). Field is correctly null until deposit is requested. **NOT a bug** — but we could populate earlier as a "quoted amount" once price is mentioned. |
| **Moneda** | Same as Monto. We could populate earlier — as soon as we detect currency hint from phone prefix (e.g. `+34` → EUR). |
| **codigo_referencia** | Same as Monto. Ref code only minted when solicitar_deposito fires. Correct by design — there IS no code until then. |
| **sede** | **WE DON'T WRITE THIS FIELD.** We write to `branch` (= "Gili Trawangan"). Miguel has TWO separate fields (`branch` and `sede`) and we only set one. Fix: also write `sede` with the same value (or have Miguel collapse the two fields). |
| **descuento** | Only written when AI confirms a discount value ("Sin descuento" / "5%" / "10%"). Miguel's tests didn't reach this branch (no discount requests). Correct by design. |
| **descuento_aplicado** | **WE NEVER WRITE THIS FIELD.** Probably meant to be a boolean ("was a discount applied?") separate from `descuento` (the value). Need to wire. |
| **ad_source** | Lead-source attribution work was DEFERRED (per memory `project_lead_source_attribution.md` — Miguel asked 2026-05-11 but said defer until GT stable). Requires Meta CTWA integration. Not implemented yet. |

**Action plan:**
- ✅ **sede**: 1-line add to `updateContactCustomFields` calls — write `sede: sede.nombre` alongside `branch`. ~5 min.
- ✅ **Monto/Moneda early populate**: when AI mentions a price during consultar_disponibilidad, optionally write monto+moneda from detected currency hint. ~15 min, low-risk.
- ✅ **descuento_aplicado**: wire as boolean. When `descuento` is anything other than "Sin descuento", set `descuento_aplicado = true`. ~5 min.
- ⏸️ **ad_source**: deferred per memory. Skip unless Miguel re-prioritizes.

---

### Gap 3 — Tags don't clear

**Miguel's words:** *"The deposit_paid tag from this morning is still on the contact even though we ran a completely new pre-deposit flow today. Tags should clean up when lifecycle changes."*

**Root cause:**
- We ADD tags (`deposit_paid`, `ai_escalation`) but never REMOVE them.
- `/admin/reset-conversation` only wipes server DB (mensajes + lead_stage), doesn't touch Respond.io contact tags.
- Until 2026-05-12 we had no `removeContactTag` method at all. We added it for §7 tag-refresh (remove+add cycle), but never used it for cleanup.

**Fix path:**

1. **Server-side `/admin/reset-conversation` enhancement:** when admin resets, ALSO call `removeContactTag` for `deposit_paid` and `ai_escalation`. ~10 min.
2. **Auto-cleanup on bidirectional sync:** when our incoming webhook handler detects "lifecycle changed back to New Lead" (operator manually reset), wipe our tags too. ~10 min — depends on Miguel enabling the webhook events (round-1 §1).

---

### Gap 4 — OCR amount validation (Miguel's #3 priority)

**Miguel listed this as still needed, but we already shipped it in round 1 (`5f1d0f5` and earlier).**

The §2 fix is live and verified end-to-end during Tony's pilot retest:
- Bertrand-Klein 40 EUR PDF for 80 EUR booking → `validated: false`, `mismatches: ['amount_too_low', 'ref_code_mismatch']`
- Lead stayed at `deposit_pending` (no auto-confirmation)

Miguel hasn't reached the deposit phase in his 13 tests, so he hasn't observed it live yet. **No new work — just communicate that it's done and ask him to test deposit flow.**

---

### Gap 5 — Bidirectional sync (Miguel's #4 priority)

**Code is shipped (round 1 `6d00ed7`). Inbound webhook handler accepts:**
- `contact.lifecycle.updated`
- `contact.tag.added` / `removed`
- `conversation.assignee.updated`

But the handler is **dormant until Miguel enables those event types** in workspace settings → Webhooks → Events.

Documented in `5-12-miguel-action-items.md` §3. No new server work — just Miguel-side activation.

---

## What Miguel said they'd fix on their side

> *"Most remaining issues are prompt content (voseo vs tú, missing snorkel→Try Scuba, '1000 instructors' copy bug). We'll fix that on the prompt side, no work for you."*

Three content items Miguel will own:

1. **voseo vs tú** — still some `vos` forms slipping through. Our round-1 §10 swept the customer-facing template phrases in our prompt, but Miguel may be referring to AI-generated output where the model produced `vos` despite the `tú` instruction. Worth a regression check later.
2. **snorkel → Try Scuba** — when a customer asks about snorkeling, AI should redirect to Try Scuba (the closest DPM service). Currently doesn't.
3. **"1000 instructors" copy bug** — KB has "más de 1.000 instructores" phrasing somewhere that's getting reproduced verbatim.

These are KB / prompt content, not code. Miguel + Papu handle.

---

## Priority-ordered action plan (server side)

| Order | Item | Effort | Outcome |
|---|---|---|---|
| 1 | Add `sede` custom field write | 5 min | One of Miguel's "operations-critical" fields filled |
| 2 | Add `proposed` / `deposit_pending` / `lost` tag emissions on matching transitions | 30 min | Miguel can wire workflows to map our tags → his lifecycles (Gap 1 Option A) |
| 3 | Add `descuento_aplicado` boolean write | 5 min | One of Miguel's listed fields filled |
| 4 | Populate `Monto` + `Moneda` early (from currency hint, before solicitar_deposito) | 15 min | Operations team sees quoted amounts sooner |
| 5 | Auto-cleanup tags on `/admin/reset-conversation` | 10 min | Eliminates "stale deposit_paid tag" complaint |
| 6 | Auto-cleanup tags on lifecycle reset via incoming webhook | 10 min | Depends on Miguel enabling webhook events |
| — | `ad_source` (deferred per existing memory) | — | Skip unless re-prioritized |
| — | OCR amount validation | — | Already done, communicate to Miguel |
| — | Bidirectional sync server code | — | Already done, awaits Miguel enabling events |

**Total new server work: ~75 minutes.** Items 5-6 depend on Miguel enabling webhook events.

---

## What to tell Miguel

> Hey Miguel — 13 tests + 7 perfect / 6 acceptable / 0 critical is the cleanest end-to-end run yet. The Idioma → "Spanish" fix landed, custom fields populating from consultar are all working.
>
> On your three remaining items:
>
> **1. Lifecycle PATCH** — Confirmed Respond.io v2 API silently drops `lifecycle` in PUT body (probed extensively). It's a platform-side limitation, not a code bug on our end. Best path is **workflow-driven from tags**: I'll add `proposed`, `deposit_pending`, `lost` tag emissions on the matching server transitions (already emit `deposit_paid` + `ai_escalation`). You wire 5 small workflows in Respond.io that move lifecycle on those tag events. Net effect = same as if the API supported it, with 30 min of code on my side and ~15 min of workflow setup on yours.
>
> **2. Remaining custom fields** — Some are by-design empty until matching tool fires:
> - Monto + Moneda + codigo_referencia: only populate AFTER deposit is requested. Your 13 tests stayed pre-deposit so these stayed null — correct behavior. They DO fill on deposit (verified in Tony's pilot retest this morning: monto="80", moneda="EUR", codigo_referencia="DPM-GT-0512-XK2EU9").
> - sede: I wasn't writing this — only `branch`. Adding now alongside branch.
> - descuento_aplicado: I wasn't writing this either. Adding as boolean derived from `descuento`.
> - ad_source: deferred per our 2026-05-11 agreement on lead-source attribution work. Skip unless you want me to pull it forward.
>
> **3. Tag cleanup** — Adding to `/admin/reset-conversation` so the next reset wipes stale `deposit_paid`. Auto-cleanup on operator lifecycle reset works once you enable the webhook events I shipped in round 1 (Settings → Webhooks → Events → `contact.tag.removed` + `contact.lifecycle.updated`).
>
> **OCR amount validation** — Already shipped + verified. Bertrand-Klein 40 EUR PDF correctly rejected for an 80 EUR 2-pax booking this morning. You'll see it when you run the deposit flow.
>
> **Bidirectional sync server code** — Also shipped, awaiting your event-enable step.
>
> Will send when the 5 fixes above land (~75 min). Test queue can stay pre-deposit until then, but a deposit-flow test would let you verify OCR + 3 of the custom fields too.

---

## Cross-reference

- `5-12-feedback.md` — Round 1 (8 items, 6 server-side shipped)
- `5-12-miguel-action-items.md` — Round 1 owner-side items (Railway env done, workflow + events pending)
- `5-12-feedback-round2.md` — **this file** — round 2 (3 wiring gaps)
