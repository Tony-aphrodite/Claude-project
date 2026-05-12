# 2026-05-12 — Customer feedback analysis (Miguel)

This file holds the bugs Miguel reported on 2026-05-12 after running the full Open Water flow with contact 208082561. The overlap with my own session-internal analysis (A/B/D below) has been removed so only the non-overlapping items remain. Each item is followed by the concrete root cause traced through the code/DB and what would need to change.

> **Already covered in my session analysis (excluded from this file):**
> - **A** — AI replied in Portuguese after Miguel's drag-drop file path triggered franc-min mis-classification (file:// URL → `por`). **NOTE 2026-05-12 follow-up:** Miguel re-listed this as item #5 in his consolidated list with CRITICAL severity, so it's been re-included below as section §5 instead of staying excluded — even though the root cause was the same one I already named A.
> - **B** — `POST_HANDOFF_STAGES` guard silences the AI as soon as `lead_stage` reaches `handed_off`, even when the customer follows up with a brand-new topic. Same end-user symptom as Miguel's URGENT 1, kept here only for the broader bidirectional-sync angle.
> - **D** — Drag-drop in WhatsApp Web sends the file path as a text message before the actual PDF attachment arrives, causing a duplicate ACK (Portuguese ack first, Spanish ack second).

> **Miguel's consolidated list (2026-05-12 follow-up message):**
> ```
> 1. Miguel stuck in "Con humano" — need reset + bidirectional sync (URGENT)
> 2. OCR auto-confirms any PDF without validating amount (URGENT — fraud risk)
> 3. Email going to aupwork00@gmail.com instead of gilit@dpmdiving.com (URGENT)
> 4. Onboarding workflow sends English to Spanish customers (CRITICAL)
> 5. AI switched to Portuguese because of file path (CRITICAL)
> 6. Native wiring missing: 8 custom fields + lifecycle + tags don't sync (IMPORTANT)
> 7. Apps Script returns NIGHT as available + schema mismatch (IMPORTANT)
> 8. Spanish register inconsistency, decision: unify to "tú" (LOW)
> ```
> Miguel asked Steve to **start with item 1 (reset) + item 2 (OCR amount validation)** first because those block real customers right now.
>
> **Mapping to this document's sections:**
> | Miguel # | Severity | This doc § | Status |
> |---|---|---|---|
> | 1 | URGENT | §1 | Analyzed below |
> | 2 | URGENT | §2 | Analyzed below |
> | 3 | URGENT | §3 | Analyzed below |
> | 4 | CRITICAL | §4 | Analyzed below |
> | 5 | CRITICAL | §11 (new — promoted from "excluded A") | Analyzed below |
> | 6 | IMPORTANT | §6 | Analyzed below |
> | 7 | IMPORTANT | §8 + §9 (split) | Analyzed below |
> | 8 | LOW | §10 | Analyzed below |

---

## 1. URGENT 1 (the architectural part) — Respond.io ↔ server state is one-way only

**Miguel's words:** he cleared `deposit_paid`, changed lifecycle from LOST LEAD to New Lead, and unassigned the round-robin agent in Respond.io. Server still had `lead_stage = handed_off` and silenced 4 retries.

**Overlap with my B:** B is the same SYMPTOM. The new angle in URGENT 1 is the SCOPE: even if we fix the guard, the two systems will continue drifting any time an operator touches Respond.io. URGENT 1 is asking for an actual sync layer.

**Root cause (verified):**
- Outgoing direction (server → Respond.io) is already wired — `respondIoClient.addContactTag`, `updateContactCustomFields` push our state up. But:
- Incoming direction (Respond.io → server) only carries customer messages. We **never subscribe** to `contact.tag.removed`, `contact.lifecycle.changed`, or `conversation.assignee.changed` events, so any operator edit is invisible to the server.
- `apps/server/src/routes/webhook.ts` only branches on `event.startsWith("message.") || event === "incoming_message"`. Everything else returns `ok:true, ignored:event`.

**Why it bit Miguel today:** he assumed clearing the tag would also reset our server state. Our `lead_stage` machine has no input from Respond.io webhooks, so it stayed `handed_off`. From the AI side the customer became permanently muted on this conversation.

**What needs to change:**
1. Accept `contact.tag.removed` / `contact.lifecycle.changed` / `conversation.assignee.changed` webhook events (Miguel needs to enable them in Respond.io workspace settings — those event types are off by default).
2. New handler that maps Respond.io edits to allowed `lead_stage` transitions. Concretely: clearing `deposit_paid` from a `handed_off` conversation should drop the stage back to `proposed` (or `new` if `programa` is also wiped). Lifecycle move to `New Lead` should do the same.
3. Keep `POST_HANDOFF_STAGES` as the local guard but expose `/admin/reset-conversation` as the documented bypass for testing.

---

## 2. URGENT 2 — OCR auto-confirms 40 EUR when the booking required 80 EUR

**Miguel's words:** he sent an unrelated PDF from yesterday (Bertrand Klein, 40 EUR) for a 2-pax Open Water booking that should have required 80 EUR. OCR validated in 4 seconds.

**Root cause (traced through code):**
- `solicitar_deposito` handler in `apps/server/src/handlers/process-message.ts:823` writes:
  ```ts
  const monto = depositAmountFor(currency);
  // ... stored as lead_metadata.deposit_amount
  ```
- `depositAmountFor(EUR)` in `packages/shared/src/types.ts:556` returns `40` — **per-person**, not total.
- `runOcrOnAttachment` then validates with `expected.amount = 40` (line 286 in process-message.ts: `amount: meta.deposit_amount`).
- `reconcile` in `services/ocr-comprobante.ts:199-208` compares the extracted amount to that per-person `expected.amount` with ±2% tolerance. So a 40 EUR transfer matches a 40 EUR expectation, regardless of how many divers were on the booking.

**Why the Bertrand Klein PDF passed even though it has the wrong reference:**
- The PDF's "Libellé" is `Virement de Bertrand KLEIN`, not our `DPM-GT-XXXX-XXXXXX` code → `ref_code_mismatch`.
- `reconcile` has a beneficiary-fallback branch (lines 217-233): if `amount + currency` match AND the extracted beneficiary contains our expected `DPM Diving Gili T LLC`, validation is accepted with `softMatch: "no_refcode_beneficiary_ok"`.
- The Bertrand Klein PDF was a real DPM Wise transfer from 2026-05-07, so beneficiary = `DPM Diving Gili T LLC` matches. Amount matches per-person. So it passes.

**Combined effect:** any customer can reuse any prior DPM-amount PDF and get auto-confirmed. No coupling to the booking's actual pax count, no coupling to the booking's actual ref code.

**What needs to change (two independent fixes):**
1. **Multiply expected amount by pax** before passing to OCR. The deposit per-person stays at 40; the booking-level expected is `40 × pax`. Pax has to be captured in `lead_metadata` (today it lives only in `chat_contacts.pax` and the Respond.io custom field, not in `lead_metadata`). When `solicitar_deposito` runs, snapshot `pax` into metadata.
2. **Tighten the beneficiary fallback.** Right now `no_refcode_beneficiary_ok` accepts the transfer outright. For a launch flow that auto-confirms without a human in the loop, beneficiary-only should NOT validate — it should mark `validated=false` with `softMatch` so the operator reviews. Or: require an additional signal (date within last 7 days, payer name not already linked to another booking, etc).

---

## 3. URGENT 3 — Handoff email goes to `aupwork00@gmail.com`, should go to `gilit@dpmdiving.com`

**Verified in DB:** all 5 `handoff_email_pending` rows in the last 24 h have `context.targetEmail = aupwork00@gmail.com`.

**Root cause:**
- `apps/server/src/handlers/process-message.ts:493-494`:
  ```ts
  const targetEmail =
    loadEnv().HANDOFF_NOTIFICATION_EMAIL ?? "gilit@dpmdiving.com";
  ```
- `apps/server/src/env.ts:52-56` defines `HANDOFF_NOTIFICATION_EMAIL` with default `"gilit@dpmdiving.com"`.
- Local `.env` has no `HANDOFF_NOTIFICATION_EMAIL` line (would default correctly). But **Railway has the env var set to `aupwork00@gmail.com`** (left over from development when Steve was the test recipient).

**What needs to change:** update the `HANDOFF_NOTIFICATION_EMAIL` variable in Railway → Service → Variables to `gilit@dpmdiving.com`. No code change. After save, Railway redeploys automatically (~2 min) and the next OCR auto-confirm queues to the right address.

---

## 4. LANGUAGE BUG 1 — Onboarding workflow routed to English because it filters on País, not Idioma

**Miguel's words:** the workflow's language branch reads `País` (Indonesia → defaults to English). It should read `Idioma`, or detect from message content.

**Root cause (mixed: workflow side + our server side):**
- Miguel's workflow uses `País` (Country) for language routing — that's a configuration choice on his side, not in our code.
- On our side, my fix yesterday started pushing the **top-level `language` field** on the Respond.io contact (e.g. `language = "es"`). But Miguel's workflow ignores that top-level field; it looks at the `País` country code OR a separate `Idioma` custom field. Neither is set by our server.
- There is **no `Idioma` custom field** in Miguel's workspace today — listed custom fields are `branch, dpm_name, notes, pax, monto, moneda, turno, programa, descuento, sede, descuento_aplicado, codigo_referencia, start_date, motivo_escalation, ad_*` (8 ad-tracking fields). No `Idioma`.

**What needs to change:** pick one of:
1. Miguel adds an `Idioma` custom field in Respond.io, then changes the workflow's language branch to filter on it. We then add `Idioma` to the `updateContactCustomFields` push (already trivially wired through our `language: detectedLanguageIso` parameter — just give it a custom-field name too).
2. Miguel changes the workflow filter to read the **top-level `language`** field we already push. No new custom field needed. Cleaner.

Recommend option 2. One-line workflow edit on Miguel's side, no code on ours.

---

## 5. KB ID audit — `validacao-comprobante` (Portuguese leftover)

**Miguel's words:** noticed a KB ID called `validacao-comprobante` (Portuguese) in source declarations, probably leftover from another agent. Worth auditing.

**Root cause check (just performed):** grepped `validacao` / `validacão` across `information/`, `apps/`, `packages/` — **no matches**. Either:
- The ID is in a Respond.io snippet/workflow on Miguel's side (not our repo).
- Or it's in a regression suite case file that didn't show up in my grep — but I covered the standard paths.
- Or Miguel saw it in a prompt-version row's `fuentes` output, written by Claude as a guess (since the system prompt mentions "fuentes" must reference a real KB id, but doesn't enforce it).

**What needs to change:** ask Miguel to share the screenshot/location of the `validacao-comprobante` ID so we can confirm where it lives. If it's a Claude-invented `fuentes` value, the fix is a prompt rule (already covered: "NO inventes ids" in §formato-salida) — we may need to log when Claude emits an unknown KB id so we can audit.

---

## 6. NATIVE WIRING — 8 custom fields, lifecycle, and tags don't sync server → Respond.io

**Miguel's words:** `pax` does populate (he confirmed). But Monto, Moneda, Turno, programa, descuento, sede, descuento_aplicado, codigo_referencia, start_date all stay empty. Lifecycle stays at LOST LEAD. Tags don't clean up on lifecycle change.

**Root cause (verified, partially contradictory with what I saw yesterday):**

Looking at Miguel's contact RIGHT NOW (immediately after today's test):
```
custom_fields with values:
  branch = "Gili Trawangan"
```
Only `branch` is non-null. Everything else (monto, moneda, codigo_referencia, programa, start_date, turno) is null.

But our server DOES call `updateContactCustomFields` with all of these — verified in `process-message.ts` lines 686 (consultar no-boat), 778 (consultar proposed), 881 (solicitar_deposito). Yesterday's Tony test (contact 445381935) had all 7 fields written correctly. So the code path IS firing.

Three candidate explanations:
1. **Miguel manually cleared the fields** during his "reset" routine — he mentioned clearing tags and lifecycle, may have wiped fields too.
2. **A subsequent PUT wiped them** — if his "reset" was done via Respond.io UI that internally PUTs the contact, and our merge logic only protects fields we read from `getContact` AT THE MOMENT OF WRITE, a subsequent operator edit can clobber them.
3. **The fields ARE being written but lifecycle/tag changes Miguel made via UI race against our PUT.** Need server-side log inspection from this morning's session (Railway logs for `respond_io update_custom_fields ok` around 05:07-05:12 UTC) to confirm we hit the API successfully.

**For lifecycle specifically:** we never call any Respond.io endpoint that sets the contact's `lifecycle` field. Our server transitions `lead_stage` internally (`new → proposed → deposit_pending → deposit_paid → handed_off`), but that's a server-only state. Lifecycle in Respond.io stays at whatever it was unless an operator manually moves it or a workflow does. This is a real gap.

**For tag cleanup:** we ADD `deposit_paid` and `ai_escalation` but never REMOVE any tag. So when lifecycle moves Customer → New Lead via operator action, our prior tags persist.

**What needs to change:**
1. Add a `updateContactLifecycle(contactId, lifecycle)` method that hits the Respond.io PUT endpoint with top-level `lifecycle` field, and call it from each `leadStageService.transition` so lifecycle stays in lockstep. Mapping (proposal): `proposed → "Engaging"`, `deposit_pending → "Following Up"`, `deposit_paid → "Customer"`, `handed_off → "Customer"`, `lost → "Lost Lead"`.
2. Add `removeContactTag(contactId, tag)` so we can explicitly clean prior tags when a stage backs up (e.g. operator restarts the conversation).
3. Investigate the missing custom fields from today's session: pull Railway logs for `respond_io update_custom_fields ok` around 05:07-05:12 UTC and confirm we got 200 OK with all the field names listed. If we did, then Miguel's UI reset wiped them, and the fix is just "don't let operators clear custom fields the server writes" via Miguel's workspace settings — or document the workflow.

---

## 7. WORKFLOW TRIGGER — Pegged `deposit_paid` tag doesn't re-fire the Onboarding Piloto workflow

**Miguel's words:** he had to manually un-apply and re-apply `deposit_paid` to make the workflow run. If the tag is already present from earlier testing, the trigger doesn't fire.

**Root cause:** Respond.io's "Tag Updated" trigger only fires on a state CHANGE event. If the tag was added by us yesterday and is still present today, our PUT today doesn't emit a "tag added" event because the set didn't change. The workflow's trigger sees nothing and the chain never starts.

This is a Respond.io platform behavior, not a bug in our code.

**What needs to change (two options, Miguel's call):**
1. **Server-side workaround:** before calling `addContactTag("deposit_paid")`, ALWAYS issue a `removeContactTag("deposit_paid")` first (best-effort, ignore 404). The remove → add cycle guarantees a fresh "tag added" event. Cost: two API calls instead of one.
2. **Workflow-side rewire (Miguel):** change the trigger from "Tag Added: deposit_paid" to "Lifecycle changes to Customer" (or whatever lifecycle we mark on auto-confirm). Then the workflow fires when the LIFECYCLE flips, which is a discrete one-time event tied to OCR auto-confirm and never gets stuck.

Recommend option 2 — it dovetails with bug 6 above (lifecycle sync). If we land lifecycle sync, the workflow gets a clean event source for free and we drop tag manipulation from the critical path.

---

## 8. APPS SCRIPT BUG 1 — Night slot returns `disponible: true, espacios: 20` every day for GT

**Miguel's words:** the GT roster Apps Script (folder `1AlY3LFHVecVYJpqUzzWU0Y-Ll646ZNmh`) returns `turno_nocturno = {disponible: true, espacios: 20}` for every date even though GT doesn't operate night dives. The script's `buildResumen` even surfaces the night slot in the resumen text.

**Root cause (verified server-side):**
- Our `program-schedule.ts` only defines `AM` and `PM` slot keys. Night isn't a valid slot in our schedule definitions, so even if the Apps Script returns night availability, our `consultar_disponibilidad` handler never reads it.
- BUT the Apps Script's `buildResumen` produces a free-form text string that COULD end up in the dynamic block of the prompt (via the `notes` field of `consultar_disponibilidad`'s response). I haven't traced this end-to-end yet — would need to check what the Apps Script's `notes` contains.
- Risk: the model sees `turno_nocturno = {disponible: true, espacios: 20}` in the resumen text and offers night dives. KB-05 §programas-no-ofrece does say GT doesn't run night dives, but the explicit fresh tool output can override KB guidance.

**What needs to change:**
1. **Apps Script (Miguel's side):** hardcode `turno_nocturno = {disponible: false, espacios: 0, capacidad: 0}` and exclude it from `buildResumen` for GT. ~5 lines.
2. **Server-side defensive belt:** after fetching the Apps Script response, force `detalle[].turno_nocturno = {disponible: false, espacios: 0}` and strip any night reference from the resumen text. So even if Miguel's Apps Script is misconfigured, we never surface a night offer.

Recommend both — Apps Script fix is the truth source, server defense is the safety net.

---

## 9. APPS SCRIPT BUG 2 — Spanish-vs-English schema "mismatch"

**Miguel's words:** Apps Script returns Spanish field names (`disponible`, `primer_dia_disponible`, `turno_manana/tarde/nocturno`, `hora_actual_wita`) but prompt v2.0 instructs the model to read English fields (`available`, `failingSlots`, `alternativeStartDate`). Wonders if this is the root cause of yesterday's `#H4` Día-misattribution.

**Root cause (verified — partly a misunderstanding):**
- The Apps Script's response is consumed by our **server's tool handler** (`process-message.ts:629-...`), NOT directly by the model. The handler translates Spanish → English: it reads `detalle[].turno_manana` etc. and emits a `SlotVerdict[]` in English shape, plus the new `failingSlots` field (since yesterday's commit `7cf2147`).
- The model only sees what the tool returns — i.e. the English shape. So Miguel's concern that the model reads Spanish raw is wrong.
- BUT: the `notes` string the handler passes through (e.g. "AM ya zarpó", "Programa sin requerimiento de barco…") is Spanish free-form, generated by the Apps Script. That portion is verbatim in the model's view.

The yesterday `#H4` Día-misattribution had a different root cause: `slots[]` had a TRUE entry on 15-May PM and a FALSE entry on 16-May AM. The model read the array but cited the wrong index. The fix (already shipped) was adding `failingSlots[]` so the model has a pre-filtered list to quote from. That fix is verified working in Tony's Open Water retest.

**What needs to change:** nothing on the server. If Miguel wants the prompt to reference Spanish field names because some other piece of his stack reads them, that's a documentation choice — but the actual model invocation flow uses the English shape today and it's working.

---

## 10. SPANISH REGISTER — Mix of `vos` and `tú` in prompt + workflow snippets

**Miguel's decision:** Papu wants everything unified to `tú` (Spain + Latam universal).

**Root cause:** my prompt v2.0 was written with `vos` (Río de Plata Spanish) reflexively. Several places still use `tenés`, `querés`, `debés`, `mandame`, `bloqueo`, `asegurés` — including:
- `00_SYSTEM_PROMPT.md` §identidad: `tenés que ser explícito`
- §calificacion: `Si ya tenés:`
- §cierre: `Si querés te bloqueo el lugar`, `si lo querés, mejor lo asegurés ya`
- §flujo: `vos querés re-afirmar plazas`, `llamá la herramienta`
- Several few-shots in `FEW_SHOTS_GiliTrawangan.md`.

Workflow snippets (Onboarding Piloto ES branch) live on Miguel's side, not our repo — same problem.

**What needs to change:**
1. Sweep the prompt + few-shots: replace `tenés → tienes`, `querés → quieres`, `debés → debes`, `decime → dime`, `mandame → mándame`, `bloqueo → reservo` (or keep but in `tú` conjugation), `asegurés → asegures`, `dale → vale` or `ok`. Owner spec said the customer-facing dialect should be neutral Spanish.
2. Owner side: same sweep on Onboarding Piloto ES snippets (`tenés` → `tienes` etc.). Miguel said he'd handle this with Papu in a separate doc.

This is content polish, not a code bug — but it's customer-visible and Miguel made it an explicit decision.

---

## 11. CRITICAL — AI switched to Portuguese mid-conversation because of the PDF file path

**Miguel's words (item #5 in his list):** when he sent the PDF, the file path contained the French token `virement-de-bertrand-klein.pdf`. John's next reply opened in Portuguese: *"Obrigado pelo comprovante! Vou encaminhar para validação..."*. Language detector is reading non-conversational tokens (URLs, file paths, filenames).

**Root cause (traced through code):**
- WhatsApp Web's drag-drop on Windows sends two consecutive WhatsApp messages: first a TEXT message with the literal local file path (`file:///C:/Users/.../virement-de-bertrand-klein...pdf`), then the actual PDF attachment a few seconds later.
- Our `services/language.ts` `detectLanguage(text)` runs franc-min on the raw text. franc operates on tri-gram statistics. The token `virement` is overwhelmingly French; combined with other Latin-language fragments in the URL and a short Spanish lead-in ("NO NINGUNA DUDA."), franc's `only: ["spa","eng","por"]` whitelist gets the closest hit on **`por`** (Portuguese tri-grams overlap with the romance Latin signal).
- `detectedLanguage` resolves to `"português"`, which then enters the dynamic block as `IDIOMA DETECTADO: português`. The model takes it as ground truth and emits the next reply in Portuguese.
- Tony's `language` whitelist {spa, eng, por} explicitly includes Portuguese (a real DPM traffic language per our 2026-05-11 memory). So removing `por` would break legitimate Portuguese-speaking customers.

**Why this slipped my own analysis as "minor":** I labeled it A and excluded it as an edge case of desktop WhatsApp Web (item D's territory). Miguel correctly re-prioritized it — the customer sees a sudden language switch and trust drops immediately, regardless of how the upload happened. Real customers on mobile shouldn't hit this, but the fix is cheap.

**What needs to change:**
1. **Strip non-conversational tokens before language detection.** In `language.ts`, before passing `text` to franc, scrub:
   - URLs (`https?://...`, `file://...`)
   - File paths (`C:\...`, `/Users/...`, `/home/...`)
   - File names ending in `.pdf`, `.jpg`, `.png`, `.docx`, `.xlsx`, etc.
   - Long token-runs without spaces (likely identifiers, not language).
2. **Re-check the length gate AFTER scrubbing.** If the scrubbed text drops under 60 chars, return `undefined` so the prompt-builder omits `IDIOMA DETECTADO` and the model infers from the actual conversation history.
3. **Bonus defense (already-shipped server logic, just confirm):** the persisted `chat_contacts.language` (set on earlier turns) should take precedence over a wobbly fresh detection. Currently `detectLanguage(incomingText) ?? contact.language` does the right thing IF detect returns undefined; the fix above ensures it does in this edge case.

---

## Priority ranking (re-ordered by Miguel's 2026-05-12 consolidated list)

Miguel explicitly asked Steve to begin with **§2 (reset) + §3 (OCR amount validation)**. I added §1 (sync) next because §2/§7 both depend on the same plumbing.

| Order | This doc § | Miguel # | Severity | Effort |
|---|---|---|---|---|
| 1 | §2 | Miguel #2 | 🔴 URGENT (fraud) | ~20 min — multiply expected.amount by pax + tighten beneficiary fallback |
| 2 | §1 + §6 | Miguel #1 + #6 | 🔴 URGENT | ~2 h — subscribe to tag/lifecycle/assignee webhooks + add `removeContactTag` + `updateContactLifecycle` PUT |
| 3 | §3 | Miguel #3 | 🔴 URGENT | 1 min Railway env edit (no code) |
| 4 | §4 | Miguel #4 | 🔴 CRITICAL | Miguel workflow edit (use top-level `language`) OR we add a custom-field push |
| 5 | §11 | Miguel #5 | 🔴 CRITICAL | ~15 min — scrub URLs/file-paths/filenames in `language.ts` before franc-min |
| 6 | §8 | Miguel #7a | 🟡 IMPORTANT | 5 lines Apps Script + server filter |
| 7 | §10 | Miguel #8 | 🟢 LOW | ~30 min `vos→tú` sweep |
| skip | §9 | Miguel #7b | 🟢 not a real bug | server already translates Spanish → English shape |
| skip | §7 | — | covered by §1 lifecycle migration | — |
| skip | §5 | — | needs Miguel screenshot | — |

**Minimum-viable cut for tomorrow's pilot launch:** §2, §3, §11. Those three are short and remove the fraud risk + the language-switch trust hit + the wrong email recipient. §1/§6 (bidirectional sync) is the right architectural fix but is bigger — operators can manually call `/admin/reset-conversation` in the meantime.
