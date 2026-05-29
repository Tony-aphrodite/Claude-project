# Miguel feedback log

Rolling log of feedback messages from Miguel / Papu, each as a numbered
entry with the verbatim message + analysis + actions taken. Newest at
the top. Cap: keep the last ~20 entries; older ones can be pruned once
the actions are deployed and confirmed.

This file is the source of truth for "what did Miguel ask us to change
and when". For deeper specs (prompt drops, roster contracts, etc.)
the entries link out to dedicated files.

---

## Entry #16 — 2026-05-23 — Four corrections to my draft reply (scope/architecture alignment)

**Topic:** Tony drafted a unified Spanish reply to Miguel's v1 brief that included a milestones section. Miguel responded with **four explicit corrections** before approving the go-ahead. The draft was never sent — the corrections need to land in the actual reply (English, per Tony's instruction).

**Verbatim from Miguel (key excerpts):**

1. *"El alcance es las 5 sedes, no un piloto. Cuando leí 'solo Gili T usa el sistema en producción' me sonó a piloto de una sede dejando las otras cuatro afuera, y eso no es lo que busco... Lo que necesito es que las 5 estén construidas y que el escalonado sea de días, no de semanas con las otras esperando."*

2. *"¿Qué querés decir con 'BubbleManager apagado'? Esto me frenó. La regla madre del proyecto es que BubbleManager NO se toca y queda intacto — ahí viven las finanzas serias (caja, gastos, sueldos, impuestos) y se quedan ahí. DPM Cloud solo le manda 'el cliente pagó'. Así que apagar el Access no va."*

3. *"Tres cosas que aparecieron y no estaban en el brief: la 'factura SAT', el 'flujo de reembolsos con trazabilidad' y la 'solicitud de review SSI al certificar'. La factura SAT me llamó la atención — SAT es el sistema fiscal de México y nosotros operamos en Tailandia e Indonesia... Los reembolsos son un tema entero que toca plata, que justamente vive en el Access. Y el review SSI se me mezcla con las dos reseñas que pedimos no mezclar."*

4. *"Orden de encendido: arrancamos por Gili Trawangan, no Gili Air. En tu cronograma pusiste Gili Air en el rollout pero Gili T en el prototipo."*

**Plus payment structure:** *"El pago va por Workana Escrow en porcentajes, como venimos trabajando desde que empezamos. Atamos cada tramo a los hitos del cronograma — se libera cuando se cumple cada milestone."*

### Corrections to internalize (forever)

| # | Wrong in draft | Correct rule |
|---|---|---|
| 1 | "Piloto en Gili T en semanas 3-4" | **All 5 sedes built complete. Staggered activation in DAYS not weeks, GT first.** Same destination, robust landing. No sede "waits" while another runs. |
| 2 | "BubbleManager apagado" at end of rollout | **BubbleManager is NEVER touched. Stays intact forever.** It owns finances (cash, expenses, salaries, taxes). DPM Cloud only sends ONE event: "customer paid." |
| 3 | "Factura SAT emitida en automático" | **SAT does not apply.** SAT = Mexican fiscal authority; DPM operates in Thailand + Indonesia. This was contamination from another project. Remove entirely. |
| 4 | "Flujo de reembolsos con trazabilidad" | **Refunds are out of scope.** Refunds touch money → money lives in Access. If a refund use case comes up, it's an Access workflow, not DPM Cloud. |
| 5 | "Solicitud de review SSI al certificar" | **There is NO SSI review.** Two reviews only: (a) internal instructor review (unlocks 10% off + ranking), (b) public Google review (triggers on photo download). Do NOT introduce a third. |
| 6 | "Activación: GT first then Gili Air..." with timeline inconsistency | **GT first, period.** GT is where everything is most aceitado. Then stagger the others over days. |
| 7 | Payment terms unspecified | **Workana Escrow, percentage-based, released on milestone completion.** Specific percentages per milestone TBD jointly. |

### What this changes in the milestones section

The "Semanas 1–2 / 3–4 / 5–6 / 7–8" cadence stays, but the content shifts:
- Weeks 1–2: Build Phase 1 complete (5 sedes, not pilot) + instructor panel prototype.
- Weeks 3–4: Build Phase 2 complete (5 sedes) + full integration testing.
- Weeks 5–6: End-to-end QA across all 5 sedes; SSI seam hardened; everything proven before any sede goes live.
- Weeks 7–8: Staggered activation in days starting Gili Trawangan; if first weekend is clean, the other 4 follow within the same week. BubbleManager stays untouched throughout; the only handshake is the "customer paid" event.

### Architectural rule, written in stone

> **BubbleManager (Access) is NEVER touched.** DPM Cloud is a connector that adds a cloud DB + web surface alongside Access. The only thing DPM Cloud writes to Access is the confirmed-payment event keyed by `DPM-XXXX`. Everything else (cash, expenses, salaries, taxes, refunds, accounting reports) lives in Access and stays there.

This is the "regla madre" of the project. Any feature that proposes touching Access for anything other than the payment-confirmed write is out of scope by definition.

**Files touched in this entry:**

- `information/MIGUEL_FEEDBACK_LOG.md` (this entry)

---

## Entry #15 — 2026-05-19 — DPM Cloud canonical v1 execution brief

**Topic:** Miguel sent the formal v1 execution brief plus 2 interactive HTML demos (Phase 1 registration + Phase 2 red viva). **This is now the canonical spec.** Every prior discovery / mockup / verbal scope discussion is superseded by this document where they conflict.

**Saved to:** [DPM_CLOUD_EXECUTION_BRIEF_v1.md](DPM_CLOUD_EXECUTION_BRIEF_v1.md) — full verbatim text plus structured summary of the 2 HTML demos.

### Key changes vs my prior understanding

| Topic | Before | v1 brief says |
|---|---|---|
| Price | Open / minimum quoted was €15,500 | **Closed at USD 9,000 for both phases** (Miguel framed as "ya cerrado") |
| Code generation | "one code per booking" | **One code per (diver + course)** — a single payment can cover multiple divers/courses → multiple codes |
| SSI integration | Mentioned as desirable | **Core scope.** SSI API integration is part of Phase 1. Old BubbleManager VBA had it; check the .accdb for legacy logic. Robustness rule: if SSI is down, DPM Cloud still saves the record and retries. |
| Field set | 5 fields shown in mockups | **~20 fields** (the OnlineCustomers set) + emergency contact + equipment sizes (wetsuit + footwear sizes) |
| Office workflow | Just review | **Tri-state semáforo:** datos completos → documentos firmados → revisado y OK por oficina. THEN office finishes registration in SSI. Final step: certify + confirm paid. |
| Instructor panel | Standard schedule + commissions | **Activity-block-based** (not student-by-student). Multiple groups chained in time, each on a different course day. Assign per-activity in real-time. Load dive + certify at group level. **Miguel explicitly asked to see Steve's design BEFORE building.** |
| Reviews | Single rating system | **Two distinct systems**: internal review to instructor (unlocks 10% off + feeds fair ranking with min review threshold + monthly prize 2-3 days hotel) AND public Google review to school (triggers on photo download = max emotion moment) |
| Course close | Diploma unlock | **Full "enamorate" close**: SSI cert + photo download button + Photo Preset Pack + 10% OFF for 10 hours (unlocked by leaving review, not by score) |
| Course timeline | Generic | **Strict order:** Reservation+deposit → Registration+sign (Phase 1) → Manager assigns instructor → Theory+pool → Sea dives → **Full payment (at end, after dives)** → Certification |
| No-fly logic | Not mentioned | **Required.** Instructor loads dive once (from their computer data), student sees countdown, marketed as DAN/SSI guide with disclaimer (not a dive computer) |
| Financial scope | Implied broad | **Drastically limited.** DPM Cloud does NOT touch accounting. Finances stay in BubbleManager. The only money event we send to Access is "customer paid" when confirmed. |
| Rollout strategy | Single-sede pilot first | **Build all 5 complete, staggered rollout sede-by-sede over days starting with Gili Trawangan.** No single-sede-only release. |
| Bug-fix policy | Not specified | **Bug = free; scope change = quoted separately.** Should be in writing. |

### Miguel's two explicit asks of Steve in the brief

1. **Show how you'll think about the instructor panel BEFORE building it.** Activity-block-based scheduling with chained overlapping groups is "where the app either serves the instructor or becomes a pretty mockup nobody uses." Surface design / wireframe / interactive prototype needed.

2. **Look in the .accdb files for the old SSI integration VBA.** It existed in the past, will save us from discovering the SSI API from scratch.

### What we still need from Miguel (beyond the 5 hard blockers already known)

- The 2 HTML demo files themselves (he referenced them as attachments — need the actual files to study the interactions in detail, not just the screenshots)
- The official SSI PDFs (medical questionnaire + liability release) for use as signature templates
- Photo Preset Pack — what is this exactly? A Lightroom preset file? A LUT? Needs spec.
- Photo storage / delivery — where do the underwater photos come from? Does the instructor upload? How? To where?
- Multiple-instructor-per-group case (assistants in larger courses?)
- Refund flow — if a customer cancels mid-course, what happens to the code, the registration, the SSI pre-load?

### Open commercial question for Tony

Miguel framed USD 9,000 as "ya cerrado." That's roughly half of what we'd quoted internally. Decision: Tony either accepts (margin question) or pushes back BEFORE acknowledging the brief.

**Files touched in this entry:**

- `information/DPM_CLOUD_EXECUTION_BRIEF_v1.md` (NEW — verbatim canonical)
- `information/BUBBLEMANAGER_REGISTRATION_BRIEF.md` (annotated as superseded, kept for history)

---

## Entry #14 — 2026-05-19 — Future ecosystem integration: dpmdiving.com website

**Topic:** Miguel mentioned he's independently building out **dpmdiving.com as an e-commerce site** with 109 catalogs of courses. He wants this **wired into the ecosystem in the future** and asked us to design Phase 1 + Phase 2 so the integration works without breaking changes.

**Verbatim from Miguel:**

> Tengo algo que vengo trabajando con la parte de web site que me gustaría que se pudiera cablear en el futuro con todo el ecosistema. La estamos haciendo más e-commerce. www.dpmdiving.com. Ahí viven 109 catálogos como los que tenemos en WhatsApp para los cursos pero. Creo que mejor. Prepara el archivo definitivo de la que vas a armar con si tenes algunas mejoras y partimos.

**Key architectural insight:**

This adds a **4th surface** to the ecosystem (alongside AI agent, Phase 1 form, Phase 2 cloud platform). The clean way to handle it: separate concerns by source-of-truth. Website CMS owns content (titles, descriptions, photos, marketing copy of the 109 catalogs). Cloud DB owns transactional data (availability, bookings, payments, signatures). BubbleManager owns sede operations. DPM AI panel owns conversational state. Each surface reads what it needs from the canonical source via API.

**Improvements I'm baking into Phase 1 + 2 design to enable this later (no extra cost now):**

1. Stable `product_id` field on every course row — later maps to website catalog IDs
2. `DPM-XXXX` code generation as a stable function, callable from the website's checkout
3. Cloud platform API surface is public-callable with auth (not tightly coupled to panel)
4. Audit trail accepts multiple "entry channels" (whatsapp / website / walk-in)
5. Web form is embeddable as an iframe if the website ever wants to inline it

**Materials I need from Miguel before we can fully scope Phase 3 (website integration):**

1. Website stack (WordPress / Shopify / Webflow / custom Next.js?)
2. Catalog schema export (or sample of 3-5 entries with all fields)
3. Current e-commerce state (Stripe configured? Checkout wired?)
4. Hosting + admin access (read-only API access at minimum)
5. DNS situation for `registro.dpmdiving.com` / `cloud.dpmdiving.com` subdomains

**Status:**

- Phase 3 (website integration) is **future work, not in current scope**
- Architectural seams baked in now → no breaking refactor when we wire it in later
- Miguel asked for the "archivo definitivo" of what we're building — that's [BUBBLEMANAGER_REGISTRATION_BRIEF.md](BUBBLEMANAGER_REGISTRATION_BRIEF.md), now consolidated with Phase 1 + 2 + 3 visions

**Files touched in this entry:**

- `information/BUBBLEMANAGER_REGISTRATION_BRIEF.md` (added Phase 3 / Future Integration section)

---

## Entry #13 — 2026-05-19 — New project brief: restore BubbleManager online registration

**Topic:** Miguel sent a detailed brief asking us to **restore the online customer registration** feature that used to exist in BubbleManager (Microsoft Access) before the previous dev (Karl) stopped paying for A2 Hosting. The VBA on the Access side is intact; only the cloud SQL Server + the public web form need rebuilding. Plus the AI agent on our side needs to send the registration link after deposit confirmation.

**Critical framing:** This is a **separate project** from the DPM AI panel we built today. The integration point with our system is one place — appending a registration link to the deposit-confirmation flow.

**UPDATE 2026-05-19 — Miguel sent 5 mockups** labeled "MOCKUP DE REFERENCIA · PARA STEVE". These supersede several scope decisions in the verbal brief:

- Entry-by-code (DPM-XXXX) not entry-by-shopID URL param. AI agent must **create the registration record before sending the link** (not just send a static URL with shop param).
- SSI medical signature is **core Phase 1**, not optional. Via real e-signature provider, audit-trail required, minor → tutor flow.
- Per-diver link / per-diver code / per-diver signature model.
- Phase 1 field set is the **5 essentials** (Nombre/Apellido/Email/WhatsApp/País), not the 35-field RegisterFormField table.

Revised estimate: **~3-4 weeks** (was ~2). Revised hosting cost: **~$35-115/mo** (was ~$5-10) because e-signature provider charges per envelope.

Full mockup analysis in [BUBBLEMANAGER_REGISTRATION_BRIEF.md](BUBBLEMANAGER_REGISTRATION_BRIEF.md) §"Mockup-driven scope revision".

**UPDATE 2026-05-19 (Step 2 mockups received)** — Miguel sent 4 additional mockups under the **"DPM Cloud"** brand showing a full multi-role cloud platform: Owner global dashboard, Manager per-sede operations, Instructor personal dashboard (with commissions, ratings, schedule, visa runs), and Alumno self-service portal (keyed by the same `DPM-XXXX` code from Phase 1).

This is what the original brief listed as **"fase 2 futura, NO cotizar ahora"** — Miguel is now committing to build it as Step 2 (immediately after Phase 1 connector).

Key continuity: the alumno's code from Phase 1 (`DPM-7K3M`) becomes their **permanent zero-friction login** to the cloud platform — no email/password ever required. One code spans deposit → registration → in-water progress → diploma unlock.

Full Step 2 analysis in [BUBBLEMANAGER_REGISTRATION_BRIEF.md](BUBBLEMANAGER_REGISTRATION_BRIEF.md) §"Step 2 — DPM Cloud multi-role platform".

**Full brief saved to:** [information/BUBBLEMANAGER_REGISTRATION_BRIEF.md](BUBBLEMANAGER_REGISTRATION_BRIEF.md). That file has Miguel's verbatim spec + my technical analysis + draft answers to his 7 questions + risk inventory.

**Quick summary of what's in vs out:**

- ✅ In scope: cloud DB, web form, Access reconnection, AI-agent link send
- 🔵 Optional: photo upload, waivers w/ digital signature, equipment sizes
- ❌ Out of scope (phase 2): instructor profiles, commissions, student portal, Access modernization

**What's pending — Tony decides:**

1. Take this on himself or sub-contract the Access VBA part?
2. Stack choice for the web form (recommend Next.js + Vercel for consistency)
3. Get materials from Miguel (.accdb files, catalog exports)
4. Verify a critical open question: are the catalog IDs (Country, State, DiveOrg, DiveLevel, Language) **the same across all 5 sedes' .accdb files** or have they drifted? This affects scope significantly.
5. Quote model — fixed-price recommended

**Estimated scope:** ~2 weeks of work for one full-stack dev, ~$5-10/month ongoing hosting. See the brief file for the breakdown.

**Actions taken on our side:**

- ✅ Brief saved + analyzed
- ✅ Draft answers to Miguel's 7 questions prepared (in the brief)
- ⏳ Tony to reply to Miguel with decision + quote
- ⏳ No code changes on our existing project until Miguel confirms direction

**Files touched in this entry:**

- `information/BUBBLEMANAGER_REGISTRATION_BRIEF.md` (NEW)

---

## Entry #12 — 2026-05-19 — Hardening: kill ES→PT language drift

**Topic:** Miguel reported the AI flipping to Portuguese on Spanish-speaking conversations "en casi todas las sedes" — recurring. Two-root-cause fix applied: an inbound-side PT-grapheme cross-check + removal of the `contact.language` runtime fallback that was acting as a persistence layer for franc-min misclassifications.

**Verbatim from Miguel:**

> hay un problema recurrente que es el cambio de idioma al portugues. esta pasando en casi todas las sedes.

**Diagnosis:**

The failure was at the language-detection layer, not at any single sede's prompt — that's why it presented as cross-sede. Two interacting issues created a feedback loop:

1. **franc-min false-positive on accent-less Spanish.** Spanish without `ñ` / `¿` / accents looks statistically like Portuguese to a tri-gram detector. A single substantive (60+ char) Spanish message could get classified as `por`.

2. **`contact.language` Respond.io fallback persisted the misclassification.** Once franc said "por" on one turn, the server wrote `contact.language = "pt"` to Respond.io. Every subsequent short message (≤60 chars: "sí", "ok", "gracias", typical tourism follow-ups) returned `undefined` from franc → fell back to the polluted `contact.language` → produced a HARD anchor "IDIOMA OBLIGATORIO: português" in Bloque 4. The AI stayed in PT for the rest of the conversation until a long-enough Spanish message overwrote the contact field.

**Two-layer fix:**

**A. PT-grapheme cross-check in [services/language.ts](../apps/server/src/services/language.ts).** When franc returns `por`, require the text to contain PT-specific markers (`ã`, `õ`, `ç`, `mergulh`, `obrigad[ao]`, `-ção`, `entendo`, `fazendo`, `instrutor`) before accepting the verdict. Real Portuguese customers almost always include at least one. Spanish misclassified as PT essentially never does.

  - `PT_ONLY_PATTERNS` and `looksLikePortuguese()` moved from anthropic.ts to language.ts as the single source of truth.
  - anthropic.ts now imports them from language.ts for its outbound reply-side drift guard (same set used in both directions: detection + emission).

**B. Removed the `contact.language` READ fallback in [handlers/process-message.ts:747](../apps/server/src/handlers/process-message.ts#L747).** When franc can't detect (short message), the prompt-builder's soft anchor now takes over — the AI uses conversation history from Bloque 3 to maintain language continuity, instead of inheriting from a pollutable external sticky variable.

  - The write-side stays intact: we still push `contact.language` to Respond.io for operator-UI visibility. Just no longer use it as a runtime fallback.

**Why this is "perfect" enough:**

- Single-turn misclassification: prevented by (A). franc says PT but no PT markers → return undefined → soft anchor → no wrong hard anchor.
- Multi-turn drift via persistence: prevented by (B). Even if (A) somehow fails, there's no sticky pollution path anymore.
- Real PT customers: still detected correctly. Their substantive messages contain PT markers.
- Recovery from any latent flip: automatic on next turn, since there's no longer a sticky variable to overwrite.

**Actions taken:**

- ✅ Moved PT_ONLY_PATTERNS + looksLikePortuguese to language.ts (single source of truth, exported)
- ✅ Added PT-grapheme cross-check inside `detectLanguage()`
- ✅ Dropped `contact.language` READ fallback in process-message.ts
- ✅ Kept `contact.language` WRITE intact (for operator visibility in Respond.io)
- ✅ anthropic.ts imports the shared patterns instead of duplicating them
- ⏳ Tony to push so Railway picks up. No re-seed needed — this is server code, not prompts/KBs.

**Files touched in this entry:**

- `apps/server/src/services/language.ts`
- `apps/server/src/services/anthropic.ts`
- `apps/server/src/handlers/process-message.ts`

---

## Entry #11 — 2026-05-19 — Behavior change: always show OW + OW30 (GT + GA)

**Topic:** Both John (GT) and Colomba (GA) had a rule that offered OW30 first and only fell back to the Conventional OW if the customer said no. Miguel is reversing that: both options must be shown **together** from the start, OW30 marked as recommended, customer chooses. 4 edits total, 2 per sede.

**Verbatim from Miguel:**

> CHANGESET — DPM AI — Mostrar siempre OW + OW30 (Gili Air + Gili Trawangan)
>
> Cuando el cliente pregunta por el Open Water, o cuando el agente recomienda según los días que el cliente va a estar en la isla, el agente debe presentar siempre las dos opciones (OW Convencional 18m y OW30) y dejar que el cliente elija. El OW30 sigue siendo el recomendado, pero ya no se oculta el convencional ni se ofrece "OW30 primero, convencional solo si dice que no".

**Four edits requested:**

| # | Sede | File | Anchor |
|---|---|---|---|
| 1 | GT | `KB01_programas_precios.md` | §ow30-cuando-ofrecer |
| 2 | GT | `KB04_sales_patterns.md` | §gancho-ow30 |
| 3 | GA | `KB03_calificacion_ventas.md` | §arbol-decision (rama "sin certificación, 3+ días") |
| 4 | GA | `KB03_calificacion_ventas.md` | §upsells "OW convencional → OW30" |

**KB-bundle sync note (GA only):** GA's KB is seeded via the pre-concatenated [COLOMBA_KB_BUNDLE.md](15-information/COLOMBA_KB_BUNDLE.md), not the individual KB files. Same pattern as Entry #3 — I edit **both** the individual KB-03 file AND the bundle so the change actually reaches Supabase. GT doesn't have this issue (seeder reads the individual files directly).

**Analysis:**

- Behavior change, not a structural one. The pitch language stays the same; only the **ordering / coupling** of the two options changes.
- New pitch presents both options in one message and lets the customer pick — better UX than the previous "guess + retry" pattern.
- Miguel explicitly added bilingual EN/ES variants for the GA upsell section.

**Actions taken:**

- ✅ Applied 4 edits (GT 2 + GA 2)
- ✅ Bundle sync done for GA
- ⏳ Tony to re-seed → John prompt + GT KB bump, Colomba prompt + GA KB bundle bump

**Files touched in this entry:**

- `information/KB01_programas_precios.md`
- `information/KB04_sales_patterns.md`
- `information/15-information/KB03_calificacion_ventas.md`
- `information/15-information/COLOMBA_KB_BUNDLE.md` (bundle sync)

---

## Entry #10 — 2026-05-19 — Koh Phi Phi ferry/arrival block

**Topic:** Adds a `## LÓGICA DE FERRY / LLEGADA {#ferry-llegada}` section to Francisco Emilio's prompt covering crossings from 4 source islands (Phuket, Krabi, Koh Lanta, Ao Nang/Railay) plus airport combos. Closes the ferry-block rollout for the 4 sedes that need one (NP/GA/KT/PP). GT is still HELD as Entry #8.

**Verbatim from Miguel:**

> ahora vamos con koh phi phi.
>
> REGLA CENTRAL: un cliente que todavía está en Phuket, Krabi, Ao Nang, Koh Lanta o el continente NO llega a tiempo al barco de buceo AM el mismo día.

**What the block enforces:**

1. **PP boat cut-offs** (from KB-02, source of truth): AM 7:00–12:00 (cursos con teoría 8:00 en oficina), PM 12:30–17:00, Night 18:00–20:00. Office 8am–8pm, **closes when the AM boat leaves and reopens 10am**.
2. **AM impossible same-day** — first Phuket ferry ~08:30, first Krabi ~09:00 → both arrive after AM boat departure.
3. **5 source routes**: Phuket (Rassada, ~1h speedboat / ~2h ferry), Krabi (Klong Jilad, ~1–2h), Koh Lanta (Saladan, ~30 min–1h30), Ao Nang/Railay (Nopparat Thara, ~50 min direct), plus airport combos for Krabi/Phuket.
4. **Day-trip explicitly forbidden** — last ferry off ~16:00 doesn't match dive boat schedules. Frame as "stay at least 1 night".
5. **Matrix A/B/C** (no D — PP has a night boat so it's the C bucket, same shape as KT/GA's "Nocturno = late-arrival escape valve").
   - Bucket B has a PP-specific note about Advanced: 2-day course, **Day 1 includes the night dive** (so a customer crossing in time for PM Day 1 can start that day).
6. **ES + EN canned phrases** for two scenarios: (a) same-day AM-blocker, (b) airport arrival.
7. **Anti-hallucination rule** + referral to 12go.asia and snippets **PPENFerryInfo / PPESFerryInfo**.

**Coupling note from Miguel** (kept inside the section, same pattern as #6 / #7 / #9):

> si en algún momento se ajustan los cortes de barco en el roster de Phi Phi (AM 7:00 / PM 12:30 / nocturno 6:00 PM), sincronizar este bloque. La fuente de verdad son las horas del KB-02 §horarios.

**Analysis:**

- Insertion point in Francisco Emilio's prompt: same logic as #6 / #7 / #9 — adjacent to TODAY/TOMORROW timing logic.
- Closes 4-of-5 sedes for ferry blocks. GT still HELD as Entry #8.

**Actions taken:**

- ✅ Inserted new `## LÓGICA DE FERRY / LLEGADA` section in system_prompt_phi_phi.md
- ⏳ Tony to re-seed → Francisco Emilio prompt bumps after Entry #5's v3

**Files touched in this entry:**

- `information/17-information-phi-phi/system_prompt_phi_phi.md`

---

## Entry #9 — 2026-05-19 — Koh Tao ferry/arrival block + preflight audit

**Topic:** Adds a `## FERRY / ARRIVAL LOGIC {#ferry-arrival}` section to Emma's prompt. Routes covered: Koh Phangan, Koh Samui, Surat Thani (airport), Chumphon — the four entry points to Koh Tao. Includes a same-day arrival matrix (A/B/C) and ES + EN canned phrases.

**Verbatim from Miguel — two parts:**

1. **Preflight check** before loading the block:

> Please check Emma's current prompt for a rule that looks like this (remove it if present):
> HOY/MAÑANA—CRÍTICO: Cliente dice "today"|"tomorrow"|...→NO consultar roster…→[AGENTE REQUERIDO]
>
> What should be there instead — the prompt should keep only the roster-based version, which handles today/tomorrow by checking availability with the hourly cutoff.

2. **The ferry block itself** for the prompt.

**Audit result (preflight):** Option 2 — only the new roster-based rule is present at line 36 of EMMA_PROMPT_NEW.txt. The text even includes Miguel's note "Esto era workaround de respond.io" confirming the historical context. Old auto-escalation rule absent. **No deletion needed.** A sibling rule at line 30 ("Si cliente llega hoy → verificar hora actual GMT+7…") is consistent.

**What the block enforces:**

1. **CORE RULE**: a client still on Samui/Phangan/mainland does NOT reach Koh Tao's 5:45am AM boat the same day. AM is only possible by sleeping on KT the night before.
2. **Route table** for the 4 entry points with crossing times, first useful departures, and (for Surat Thani) a hard rule that the flight must land before ~1pm to make the same-day combo.
3. **Two same-day options**: cross + sleep + AM tomorrow, OR cross + PM boat if arrives by 11:15am, OR cross + Night boat (5:45pm, OW cert minimum) as the late-arrival escape valve.
4. **Day-trip = NOT feasible** explicit statement.
5. **Arrival matrix A/B/C** (no D — KT has a night boat so the matrix is shorter than NP/GA which had D for "Nocturno = flexible escape" because for KT that's already bucket C).
6. **Customer-facing phrases** in EN + ES for both the Samui/Phangan/mainland same-day case and the Surat Thani airport-landing case.
7. **Anti-hallucination rule** + referral to 12go.asia and Koh Tao Booking Center (KB-10, +66844236278).

**Coupling note from Miguel** (kept inside the section, same pattern as Entries #6 + #7):

> if the Koh Tao roster cutoffs ever change (AM 5:45 / PM 11:15 / night 5:45pm), sync this block. Source of truth = KB-02 boat times table.

**Analysis:**

- This entry covers two requests in one Miguel message: a preflight audit + a content addition. Both handled in this turn.
- Insertion point in Emma's prompt: same logic as Entry #6 (NP) — place near the TODAY/TOMORROW timing rule since the ferry crossing is "one more input" into the same scheduling logic.
- Closes the ferry-block rollout series for 3 of 5 sedes (NP / GA / KT). GT is still HELD as Entry #8 (content mismatch). PP not on Miguel's roadmap yet because the ferry context is mainland-Thailand-different.

**Actions taken:**

- ✅ Preflight audit complete (option 2 — nothing to delete)
- ✅ Inserted new `## FERRY / ARRIVAL LOGIC` section in EMMA_PROMPT_NEW.txt
- ⏳ Tony to re-seed → Emma prompt bumps after Entry #1's v3

**Files touched in this entry:**

- `information/16-information-koh-tao/EMMA_PROMPT_NEW.txt`

---

## Entry #8 — 2026-05-19 — ✅ APPLIED (after 2 held attempts) — Gili Trawangan ferry block

**Status:** ✅ **APPLIED** in the third send attempt. First two attempts (earlier in the day) contained the Gili Air block verbatim and were held. Third attempt arrived properly GT-specific.

**Final correctness checks on the applied block:**

- Boat cut-offs: AM 7:15–11:00 (customer in center 6:45), PM 12:15–4:00 (in center 12:00) — different from GA's 11:30 / 12:30 endings ✓
- "GT NO tiene buceo nocturno" stated explicitly + derive-to-Colomba note ✓
- Matrix has A/B/C only — no bucket D (no night-dive escape valve in GT) ✓
- Customer phrases reference "Gili Trawangan" / "GT", not "Gili Air" ✓
- Closing note explicitly tells future-Steve "GT no tiene nocturno, así que NO agregar bucket D ni frases de night dive aunque el bloque de Gili Air las tenga" — Miguel learned from the previous mishap and added a self-guard ✓
- Padangbai cut-off note: first fast boat ~7:00, arrival ~9:30 — too late for AM dive (7:15 meet at center 6:45). Hard rule preserved.
- Sanur/Serangan route omitted vs GA's block — accepted as Miguel's intent (likely either not a common route to GT or not preferred)

**Insertion point:** John's prompt at [information/00_SYSTEM_PROMPT.md](00_SYSTEM_PROMPT.md). Same pattern as Entries #6, #7, #9, #10 — placed near the timing/schedule logic.

**Actions taken:**

- ✅ Inserted new `## Logística de llegada y ferry` section in John's prompt
- ⏳ Tony to re-seed → John prompt bumps from v12 to v13

**Files touched in this entry:**

- `information/00_SYSTEM_PROMPT.md`

**Series complete:** ferry-block rollout now covers all 5 sedes that need one (NP #6, GA #7, KT #9, PP #10, GT #8). 🎉

**What Tony sent:** Message labeled "ahora vamos con gili trawangan" containing a `## Logística de llegada y ferry {#ferry-llegada}` block intended for John (GT) prompt.

**Why held:** The content of the block is **the Gili Air block from Entry #7, not the Gili Trawangan block**. Multiple lines reference GA verbatim:

| Reference | Quote |
|---|---|
| REGLA CENTRAL | "un cliente que NO está aún en **Gili Air**" |
| Cortes de barco header | "Cortes de barco de **Gili Air** (del KB-01)" |
| Matrix bucket D | "Diferenciador real de **GA** frente a Gili Trawangan" ← literally contrasts GA against GT, written from GA's POV |
| Frases ES/EN | "duermas en Gili Air" / "stay overnight in Gili Air" |
| Coupling note | "en el roster de Gili Air, sincronizar este bloque" |

**Partial adaptation Miguel did make:** Bangsal cruce changed from `~20 min` (GA) → `~30 min` (GT) — geographically correct (Bangsal → GT is further than Bangsal → GA). So Miguel started adapting but stopped after the first line.

**Additional GT-specific differences the block doesn't cover:**

1. **GT does not offer night dive** (John's prompt §no-ofrecidos derives to GA). The block's matrix bucket D ("Nocturno = más flexible") describes a program GT doesn't have — including it would directly contradict the existing prompt.
2. **GT may not have the "regla de las 10 AM" + SPLIT variants** the same way GA does — needs Miguel confirmation.
3. **GT boat cut-offs** (AM 7:15 / PM 12:30) need verification against GT's own KB-01 §horarios-barco, not GA's.

**Decision:** Don't apply. Ask Miguel to send the actual GT version.

**Actions taken:**

- ✅ Entry logged as held
- ⏳ Tony to forward the corrected GT-specific block back to Miguel
- ❌ No prompt/KB files touched in this entry

---

## Entry #7 — 2026-05-19 — Gili Air ferry/arrival rule from Bali + Lombok

**Topic:** Adds a `## Logística de llegada y ferry {#ferry-llegada}` section to Colomba's prompt covering same-day arrival realities from both Bali and Lombok. Richer than NP's equivalent (Entry #6) because GA is reached from two source islands instead of one, plus this version includes a **program-by-program arrival matrix** that distinguishes which programs can run same-day vs which need overnight.

**Verbatim from Miguel:**

> vamos con gili air.
>
> REGLA CENTRAL: un cliente que todavía está en Bali o Lombok NO llega a tiempo al barco de buceo AM el mismo día. El roster asume que el cliente ya está en la isla, pero tiene horas de viaje por delante. Antes de confirmar cualquier barco "hoy" o "mañana AM" a un cliente que NO está aún en Gili Air, sumá el tiempo de cruce.

**What the section enforces:**

1. **Ferry rules of thumb** for both Bali → GA (Padangbai ~1.5–2h, Sanur/Serangan ~2.15–3.5h, Amed CLOSED) and Lombok → GA (Bangsal ~20 min cruce, + access from Senggigi/Mataram/airport).
2. **Hard rule "AM imposible el día de llegada"** — first public Bali boat ~08:30, first Lombok public ~08:00, both arrive after GA's 07:15 dive boat is gone.
3. **Two valid alternatives** when the conflict appears:
   - Cross today, sleep in GA, dive AM tomorrow.
   - Cross today + PM dive (~12:30) or night shore dive (~17:30) if arriving early enough.
4. **Program-by-program arrival matrix** (A/B/C/D buckets):
   - **A — pool/theory day-1**: OW, OW30 — most flexible
   - **B — barco PM day-1**: TryScuba, ScubaDiver, Refresh, Advanced, Refresh+Advanced (+ SPLIT variants for the first 3)
   - **C — certificados directo al agua**: FunDives, DeepAdventure+FD — AM impossible same-day, PM only if arriving before noon
   - **D — Nocturno (shore)**: NightAdventure, NightFunDive — the only same-day option for late arrivals. GA-exclusive differentiator vs GT.
5. ES + EN canned phrases for both the AM-blocker case and the certified-customer same-day case.
6. **Anti-hallucination**: same rule as NP — never quote exact ferry times; defer to https://12go.asia (snippet INDOESFerryInfo / INDOENFerryInfo).

**Coupling note from Miguel:**

> si en algún momento se ajustan los cortes de barco en el roster de Gili Air (AM 7:15 / PM 12:30 / nocturno 5:30 PM), sincronizar este bloque para que las horas coincidan. Las horas viven en KB-01 §horarios-barco — esa es la fuente de verdad.

I'll include that coupling explicitly in the prompt section (same pattern as Entry #6's parens note in David's prompt).

**Analysis:**

- Pure prompt addition. No KB edits, no code change.
- This is GA-specific because the Lombok route (Bangsal) and the Padangbai vs Sanur split don't apply to other sedes.
- The A/B/C/D bucket matrix is a new construct — Miguel categorizes programs by "what does Day 1 actually look like" so Colomba can reason about which programs are recoverable same-day.

**Open from Miguel:**
- Gili Trawangan (John) ferry block — uses different routes (Padangbai-only) and likely a different program matrix. Pending.
- Koh Tao — totally separate problem (international flight, multi-day). Pending.

**Actions taken:**

- ✅ Inserted new `## Logística de llegada y ferry` section in COLOMBA_SYSTEM_PROMPT.md
- ⏳ Tony to re-seed → Colomba prompt bumps after Entry #3's v3

**Files touched in this entry:**

- `information/15-information/COLOMBA_SYSTEM_PROMPT.md`

---

## Entry #6 — 2026-05-19 — Nusa Penida ferry-arrival rule from Bali

**Topic:** New prompt section for David that prevents him from confirming impossible same-day morning dives when the customer is sleeping in Bali tonight. Ferry timing (boat departs Bali ~07:00 → arrives NP ~07:45) physically can't meet NP's morning dive cutoff (~06:30). Without this rule, David would happily confirm a dive that leaves the customer stranded at the port.

**Verbatim from Miguel:**

> Steve, acá va el bloque de ferry/llegada para el prompt de David (Nusa Penida) que esperabas. Es NP-específico (las rutas a las Gilis y a Koh Tao son distintas — si querés esos después te los armo aparte).
>
> Lo clave que resuelve: un cliente que está en Bali esta noche y quiere fun dive de la MAÑANA mañana en NP → es imposible por tiempos. Hoy David podría confirmarlo y dejar al cliente varado.

**Action requested:** add a new `## FERRY / LLEGADA DESDE BALI {#ferry-llegada}` section to David's prompt. Miguel suggests placing it "cerca de logística/horarios".

**What the section enforces:**

1. **Ferry schedule as a guide, not exact** — same anti-hallucination rule as everywhere else; defer to https://12go.asia for exact times.
2. **Hard rule: AM fun dive same-day from Bali is impossible.** Boat cutoff ~06:30 vs first Bali ferry ~07:00 (arriving 07:30-07:45, plus transit + fitting) means client wouldn't make it.
3. **Two valid alternatives David must offer** when the conflict appears:
   - Cross today, sleep on NP, AM dive tomorrow.
   - Cross tomorrow early (07:00-09:00), do the **afternoon** dive (PM cutoff ~12:00 → comfortable margin).
4. ES + EN canned phrases for both cases.

**Sync note from Miguel:**

> Los horarios de barco AM/PM de NP (~06:30 / ~12:00) salen de la lógica de corte del .gs que ya tenés. Si en algún momento ajustás esos cortes en el roster, actualizá también este bloque para que coincidan.

So this prompt block has a coupling to the `.gs` cutoffs in NP. If those change, the prompt needs to change too. Worth flagging in a comment so future-us doesn't drift.

**Open item from Miguel:**

> Cuando quieras te armo los equivalentes de Bali→Gili (GT/GA), que usan rutas y tiempos distintos.

The 2 Gilis use Padangbai (~3h ferry) — a much wider time gap. KT is also a separate problem. Both deferred to future entries.

**Analysis:**

- Pure prompt addition, no KB edits, no code change. Lowest-risk entry so far.
- The section is logically owned by David's prompt (sede-specific), not the shared roster — that's the right call because the AM cutoff is NP-specific and the ferry routes only apply to NP.
- The ES/EN frases give David ready-made language so he doesn't improvise — consistent with how the prompts have been built across the other sedes.

**Actions taken:**

- ✅ Inserted new `## FERRY / LLEGADA DESDE BALI` section in DAVID_PROMPT.md
- ⏳ Tony to re-seed → David prompt bump (next version after #2's v3)

**Files touched in this entry:**

- `information/18-information/DAVID_PROMPT.md`

---

## Entry #5 — 2026-05-19 — Koh Phi Phi Divemaster/Instructor policy

**Topic:** Closes the DM/Instructor rollout (Entries #1-#4 covered KT/NP/GA/GT). PP follows the same shape as KT/NP — capture phone, escalate to Fran (office +66 91 764 2151). Instructor is "próximamente".

**Verbatim from Miguel:**

> Steve, cuatro ediciones para cargar en la AI de Phi Phi (Francisco Emilio) — misma política que Koh Tao: nunca dar disponibilidad ni precio para DM/Instructor, pedir el número del cliente, derivar a la oficina (Fran, +66 91 764 2151). Instructor aún no se imparte en Phi Phi → framing "próximamente".

**Four edits requested (all in [information/17-information-phi-phi/](17-information-phi-phi/)):**

1. `system_prompt_phi_phi.md` — **insert** a new `CURSOS PROFESIONALES (Divemaster/Instructor)` line immediately above the existing `MÉDICO:` line (uses MÉDICO as anchor, doesn't modify it).
2. `kb_01_programas_y_precios.md` — `## DIVE MASTER PROGRAM` section: rewrite the customer-facing redirect message to ask for the phone first, plus add an Instructor "próximamente" paragraph.
3. `kb_01_programas_y_precios.md` — `REGLAS GENERALES DE PROGRAMAS` bullet: extend "Cursos profesionales" rule to require capturing the phone and add Instructor "próximamente".
4. `kb_02_dive_sites_operativa.md` — `TEMAS QUE NO SE MANEJAN DESDE EL BOT` bullet: same expansion (capture phone + Instructor "próximamente").

**Note from Miguel about KB-04 / KB-06 ("RefreshAdvanced"):** No edits needed — PP has no Refresh-vs-RefreshAdv mismatch, the `RefreshAdv → RefreshAdvanced` mapping we already have in apps-script.ts matches natively.

**Server-side note** (same as #1-#4): The PP .gs v3 returns `out_of_scope: true + accion: "capturar_numero_y_derivar" + oficina_tel + proximamente:false|true` for `curso=Divemaster|Instructor`. Our handler doesn't read these fields. Defense-in-depth gap still deferred — will batch the handler change once all 5 sedes are rolled out (which is **now**) so a single PR covers both `accion` types (`capturar_numero_y_derivar` for KT/NP/GA/PP + `derivar_a_sede` for GT).

**Actions taken:**

- ✅ Applied 4 edits
- ⏳ Tony to re-seed → Francisco Emilio prompt + PP KB bundle bump to v3 / v3
- 🎯 **Rollout complete:** 5 of 5 sedes now have the explicit DM/Instructor policy in prompt + KB. The handler-side batch change can now be planned.

**Files touched in this entry:**

- `information/17-information-phi-phi/system_prompt_phi_phi.md`
- `information/17-information-phi-phi/kb_01_programas_y_precios.md`
- `information/17-information-phi-phi/kb_02_dive_sites_operativa.md`

---

## Entry #4 — 2026-05-19 — Gili Trawangan Divemaster/Instructor policy

**Topic:** Closes the 5-sede rollout. GT is structurally different — it **doesn't teach** Divemaster or Instructor at all (those live in Gili Air). So John must **redirect to GA** instead of capturing the customer's phone for GT's office.

**Verbatim from Miguel:**

> Steve, seis ediciones para la AI de Gili Trawangan (John). OJO: GT es DISTINTO a las otras 4 sedes.
>
> ⚠️ DIFERENCIA CLAVE: GT NO imparte Divemaster ni Instructor — se ofrecen en Gili Air. Por eso el out_of_scope de GT NO captura número para la oficina de GT. En su lugar DERIVA A GILI AIR, igual que ya hace GT con el night dive. El objetivo: que John diga "eso no lo hacemos acá, sí en Gili Air, ¿te conecto?" y escale con escalation_reason: out_of_scope (NO instructor_request — ese queda solo para instructor-por-nombre / video call).

**Six edits requested:**

| # | File | Anchor / change |
|---|---|---|
| 1 | [information/KB01_programas_precios.md](KB01_programas_precios.md) | §no-ofrecidos list — add `Instructor training (IDC / OWSI)` bullet next to Divemaster |
| 2 | [information/KB01_programas_precios.md](KB01_programas_precios.md) | §no-ofrecidos — insert new "### Excepción — Divemaster / Instructor (sí derivar a Gili Air)" block right after the Night Dive exception block |
| 3 | [information/00_SYSTEM_PROMPT.md](00_SYSTEM_PROMPT.md) | §escalar — replace the "Solicita Divemaster, video call" bullet with two bullets (DM/Instructor → out_of_scope, video call standalone) |
| 4 | [information/00_SYSTEM_PROMPT.md](00_SYSTEM_PROMPT.md) | §escalar — insert new "### Excepción Divemaster / Instructor" block after the Night Dive exception |
| 5 | [information/00_SYSTEM_PROMPT.md](00_SYSTEM_PROMPT.md) | §formato-salida — tighten `instructor_request` definition: it no longer covers DM/Instructor courses (those go to out_of_scope) |
| 6 | [information/00_SYSTEM_PROMPT.md](00_SYSTEM_PROMPT.md) | §formato-salida — extend `out_of_scope` to explicitly cover DM/Instructor → Gili Air redirect (alongside night dive) |

**Critical .gs v3 contract Miguel surfaced:**

When the AI on GT calls `consultar_disponibilidad` with `curso=Divemaster` or `Instructor`, the GT .gs now returns:

```json
{
  "out_of_scope": true,
  "accion": "derivar_a_sede",
  "derivar_a_sede": "Gili Air",
  "sede": "Gili Trawangan",
  "proximamente": false
}
```

Note the different `accion`: **`derivar_a_sede`** (GT) vs **`capturar_numero_y_derivar`** (KT/NP/PP/GA from entries #1-#3). The `oficina_tel` field for GT is the general office, **not** for DM/Instructor (those routes go to GA).

**Handler gap I'm explicitly flagging:**

Our `AppsScriptService.fetchOne` validates `Array.isArray(json.detalle)` and returns `null` if not present (line 184 of apps-script.ts). The out_of_scope response from the .gs doesn't have a `detalle` array, so the response gets rejected as "malformed" and the handler returns `reason: "timeout"`. **Net effect:** if John (hypothetically) called the tool with `curso=Divemaster`, the AI would see a generic "le pregunto al equipo" instead of the proper "out_of_scope, derive to GA" payload.

This is **not a primary-path bug** because Miguel's prompt edits (3 + 4 + 6) steer John to escalate **before** calling the tool. The .gs out_of_scope is defense in depth that we're not picking up. I'm deferring the handler change because:

- The 4 prior entries (KT/NP/PP/GA) also have this same gap — each .gs returns out_of_scope fields that our handler ignores.
- A handler change has to deal with two different `accion` types simultaneously (`derivar_a_sede` for GT, `capturar_numero_y_derivar` for the rest).
- Better to do this as one focused change covering all 5 sedes' v3+ contracts, once the prompt rollout is fully done.

I'll batch the handler change after Miguel confirms PP's status (Entry #3 noted PP might already have the policy in v1.3, awaiting confirmation).

**Actions taken:**

- ✅ Applied 6 edits
- ⏳ Tony to re-seed → John prompt + GT KB bundle bump to v12 / v4
- ⏳ Handler-side out_of_scope/accion/derivar_a_sede plumbing deferred (still batching across sedes)

**Files touched in this entry:**

- `information/KB01_programas_precios.md`
- `information/00_SYSTEM_PROMPT.md`

---

## Entry #3 — 2026-05-19 — Gili Air Divemaster/Instructor policy

**Topic:** Same DM/Instructor policy as KT (Entry #1) and NP (Entry #2), now applied to Gili Air (Colomba). Different from the other sedes because Colomba **already has** the `instructor_request` escalation flow that captures name + email + WhatsApp, so this entry **reuses the existing machinery** instead of adding a new escalation_reason.

**Verbatim from Miguel:**

> Steve, tres ediciones para cargar en la AI de Gili Air (Colomba) — misma política que las otras sedes: nunca dar precio ni disponibilidad para Divemaster/Instructor, pedir el contacto del cliente (nombre + email + WhatsApp), derivar async a oficina (+6282266153697). En GA: Divemaster SE OFRECE (gestión de oficina); Instructor aún no se imparte → framing "próximamente".
>
> DIFERENCIA con NP/Phi Phi: Colomba YA tiene el flujo instructor_request que pide nombre+email+WhatsApp y deriva async. NO hace falta un escalation_reason nuevo: Divemaster/Instructor van por instructor_request.

**Three edits requested:**

1. [information/15-information/COLOMBA_SYSTEM_PROMPT.md](15-information/COLOMBA_SYSTEM_PROMPT.md) — §escalar list: replace the "Solicita Divemaster, Instructor training, video call" bullet with two bullets (one for DM/Instructor + one for video call standalone).
2. [information/15-information/COLOMBA_SYSTEM_PROMPT.md](15-information/COLOMBA_SYSTEM_PROMPT.md) — extend the `instructor_request` escalation_reason definition to cover Divemaster/Instructor course queries explicitly.
3. [information/15-information/KB08_casos_especiales.md](15-information/KB08_casos_especiales.md) — insert new section `## Cliente pregunta por curso Divemaster o Instructor` **before** the existing `## Pregunta sin respuesta en ningún KB` section.

**Critical note on KB sync:** Colomba's KB is seeded via a single pre-concatenated [COLOMBA_KB_BUNDLE.md](15-information/COLOMBA_KB_BUNDLE.md), not the individual KB files (see `buildGaKbBundle` in seed-content.ts — bundle wins when present). For the new section to land in production I have to edit **both** the individual KB-08 file AND the bundle file so they stay in sync.

**Caveats Miguel flagged:**

- Phone +6282266153697 also appears in KB-06 (office phone) and the prompt's §post-confirm-workflow. All edit blocks use surrounding context as the anchor, not the bare number.
- KB-03 (decision tree) and KB-05 (§refresh-obligatorio) mention DM/Instructor in a **different context** — those refer to *already-certified* DM/Instructor customers asking for Fun Dives, which is a separate case. Per Miguel: do NOT touch those.
- The `.gs` v3 already returns `out_of_scope: true + accion: "capturar_numero_y_derivar"` for `curso=Divemaster` (and `proximamente:true` for Instructor) — defense in depth. Our handler still doesn't read these fields (deferred from Entry #1).

**Analysis:**

- Smallest edit set of the three entries because the heavy lifting (collecting contact info, escalating async) was already wired in Colomba's prompt months ago.
- The new KB-08 section provides ES + EN snippet pairs so Colomba doesn't have to improvise the script.

**Actions taken:**

- ✅ Applied 3 edits + synced bundle
- ⏳ Tony to re-seed → Colomba prompt + GA KB bundle bump to v3
- ⏳ Server-side `out_of_scope` handling still deferred (still waiting on John/GT before batching across sedes)

**Files touched in this entry:**

- `information/15-information/COLOMBA_SYSTEM_PROMPT.md`
- `information/15-information/KB08_casos_especiales.md`
- `information/15-information/COLOMBA_KB_BUNDLE.md` (bundle sync)

---

## Entry #2 — 2026-05-19 — Nusa Penida Divemaster/Instructor policy

**Topic:** Same DM/Instructor policy as Koh Tao (Entry #1), now applied to Nusa Penida (David). Different office phone (+62 812-3769-3299). NP-specific: Divemaster IS offered (just derive to office), Instructor is "próximamente".

**Verbatim from Miguel:**

> Steve, cuatro ediciones para cargar en la AI de Nusa Penida (David) — misma política que Koh Tao y Phi Phi: nunca dar disponibilidad ni precio para DM/Instructor, pedir el número del cliente, derivar a la oficina (+62 812-3769-3299). En NP: Divemaster SE OFRECE (derivar a oficina); Instructor aún no se imparte → framing "próximamente".
>
> Contexto: el .gs v3 de NP ya está deployado y validado, /exec sin cambios (deployment AKfycbz8...). curso=Divemaster → `out_of_scope:true` + `accion:"capturar_numero_y_derivar"` + `oficina_tel` + `proximamente:false`. curso=Instructor → igual pero `proximamente:true`.

**Four edits requested (all in [information/18-information/](18-information/)):**

1. `DAVID_PROMPT.md` — replace the "CURSOS PROFESIONALES (DM/Instructor)" line with the new strict capture-phone-and-derive policy + Divemaster-offered + Instructor-próximamente framing.
2. `KB01_David_NusaPenida.md` — replace the Divemaster Program + Instructor Course block (two sections, ~8 lines total) with the new versions.
3. `KB07_David_NusaPenida.md` — `### DM / Instructor inquiries` FAQ block: 2 lines → 3 lines with capture-phone + Divemaster-offered + Instructor-próximamente framing.
4. `KB07_David_NusaPenida.md` — `ESCALATE TO HUMAN AGENT` list: bullet replaced with capture-phone + never-quote + próximamente policy.

**Critical caveat from Miguel:**

> ⚠️ OJO: el teléfono +62 812-3769-3299 aparece MUCHAS veces en el prompt y los KB de NP. Usá los bloques BUSCAR completos de abajo — son únicos por el texto que los rodea.

So all edits anchor against the surrounding text, not the phone number alone.

**Analysis:**

- Same shape as Entry #1 (KT). Edits are mandatory; server-side enforcement of `out_of_scope` / `accion` is deferred.
- One NP-specific difference: Divemaster is OFFERED in NP (in KT it's also offered but in KT the prompt just says "derive"). For NP we explicitly include "Divemaster: se ofrece, derivar a oficina" in the prompt.
- Instructor for NP gets the same "próximamente" framing as KT.

**Actions taken:**

- ✅ Applied 4 edits to NP files
- ⏳ Tony to re-run seed so David prompt + KB land in Supabase as v3
- ⏳ Server-side `out_of_scope` handling still deferred (will batch with v4 across all sedes)

**Files touched in this entry:**

- `information/18-information/DAVID_PROMPT.md`
- `information/18-information/KB01_David_NusaPenida.md`
- `information/18-information/KB07_David_NusaPenida.md`

---

## Entry #1 — 2026-05-19 — Koh Tao Divemaster/Instructor policy

**Topic:** Never quote Divemaster/Instructor availability or price. Capture phone, escalate.

**Verbatim from Miguel:**

> Steve, cuatro ediciones para cargar en la AI de Koh Tao — política nueva de Divemaster/Instructor: nunca dar disponibilidad ni precio, pedir el número del cliente, derivar a la oficina. Instructor todavía no se imparte → framing "próximamente".
>
> Contexto: el .gs v4 ya está deployado y validado. Cuando llega curso=Divemaster o Instructor devuelve `out_of_scope:true` + `accion:"capturar_numero_y_derivar"` + `oficina_tel` + (para Instructor) `proximamente:true`. Estas ediciones de prompt/KB son la otra mitad: hacen que la AI efectivamente pida el número y use el texto correcto.

**Four edits requested (all in [information/16-information-koh-tao/](16-information-koh-tao/)):**

1. `EMMA_PROMPT_NEW.txt` — replace the "CURSOS PROFESIONALES (DM/Instructor): →Tel +66636575799" line with a stricter version that mandates capturing the customer's phone and explicitly handles Instructor as "starting soon".
2. `KB01_PROGRAMS_AND_PRICES.txt` — Divemaster section: replace the 2-line bullet pair with one bullet that mandates capturing the phone.
3. `KB01_PROGRAMS_AND_PRICES.txt` — Instructor section: replace the "For all inquiries" line (the SECOND occurrence, NOT followed by "Do not provide further details") with a version that includes "starting soon" framing.
4. `KB07_FAQS_AND_SPECIAL_CASES.txt` — ESCALATE TO A HUMAN AGENT section: replace the Divemaster/Instructor bullet with the same capture-phone-then-escalate policy.

**Server-side note from Miguel:**

> Si tu handler ya enforcea el accion:"capturar_numero_y_derivar" del .gs, las ediciones de prompt son redundancia sana — igual cargalas.

**Analysis:**

- The four prompt/KB edits are mandatory — they're what Miguel asked for.
- The server-side enforcement of `out_of_scope: true` / `accion: "capturar_numero_y_derivar"` is OPTIONAL. Our current handler doesn't read those fields. If we don't add it, the prompt edits alone still produce correct behavior (the AI follows the rule based on its prompt). If we do add it, the rule becomes belt-and-suspenders (enforced both in prompt and in the tool result the AI sees).
- Decision: apply the 4 edits now. Defer the server-side enforcement until Miguel ships v4 for the other sedes too — that way one server change covers all 5 sedes instead of just KT.

**Actions taken:**

- ✅ Applied 4 edits to KT files
- ⏳ Tony to re-run seed so prompt + KB land in Supabase as v3
- ⏳ Server-side `out_of_scope` handling deferred (one-line addition to AvailabilityResponse + handler when needed)

**Files touched in this entry:**

- `information/16-information-koh-tao/EMMA_PROMPT_NEW.txt`
- `information/16-information-koh-tao/KB01_PROGRAMS_AND_PRICES.txt`
- `information/16-information-koh-tao/KB07_FAQS_AND_SPECIAL_CASES.txt`
