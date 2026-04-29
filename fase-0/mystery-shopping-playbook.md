# Mystery Shopping playbook (Fase 0)

Goal: extract the actual sales style of Patrick / Giovanni / Grecia / etc.
**that documents don't capture** — silence handling, objection sequencing,
upsell timing, closing technique. This material feeds the system prompt
(Bloque 1) and ~5-8 of the inline few-shots.

## Logistics

- **Numbers:** 3 different WhatsApp numbers (Steve's Singapore + 2 friends).
  Each profile uses one number per sede contacted. Rotate so we don't look
  bot-like.
- **Sedes contacted:** all 5 (Koh Tao, Phi Phi, Gili Trawangan, Gili Air,
  Nusa Penida). Aim for 1 conversation per profile per sede = 20 total.
- **Window:** 48-72 hours of natural-pace messaging. Not all in one day.
- **Tooling:** screenshots + timestamps. Optional Krisp / Otter for any
  unexpected voice notes.

## 4 profiles

### Profile 1 — Principiante indeciso
> "Nunca buceé. Vi videos en TikTok y me llamó la atención. ¿Es muy difícil?
> ¿Qué pasa si me da miedo?"

**Watch for:**
- How does the agent reduce fear?
- What's the upsell path? (TryScuba → OW vs. straight to OW?)
- Do they mention medical concerns?

### Profile 2 — Tiempo justo (5 días de viaje)
> "Llego martes 22:00 y me voy domingo 23:00. ¿Puedo hacer Open Water
> completo?"

**Watch for:**
- Do they apply the 24h post-flight rule?
- How do they sequence pool / ocean dives across the available days?
- Do they propose a Plan B if the calendar doesn't fit?

### Profile 3 — Comparador de precios
> "En [otra escuela competidor genérica] me cotizaron 8500 THB / 4.5M IDR.
> ¿Ustedes cuánto?"

**Watch for:**
- Do they defend value without bashing the competitor by name?
- What's the discount policy? Fixed price? Group discount? Long-stay rate?
- Do they mention non-price differentiators (instructor ratio, equipment,
  dive sites, food, accommodation deals)?

### Profile 4 — Caso médico (edge case)
> "Tengo asma controlada. ¿Puedo bucear?"

**Watch for:**
- Do they ask the right safety questions?
- Do they direct to medical form / doctor sign-off?
- Do they balance "no" without being dismissive?

## 48-72h pacing playbook

### Hour 0
First message. Brief, like a real client would write. NOT polished.
Lowercase, typos OK. Wait for reply.

### Hour 2-6
If they replied within 30 min → reply with a vague follow-up question
("y cuánto cuesta?"). If they didn't → don't reply yet. Observe the
follow-up cadence.

### Hour 24
Reply (if pending) with one objection from the profile. Watch reaction.

### Hour 36-48
If they're upselling, accept tentatively. If they're closing, say "te
confirmo en un rato". Observe what happens at hour 48-72.

### Hour 72
End: either say "ya reservé en otro lado" (Profile 3 ending), "dejame
pensarlo más" (Profile 1), "perfecto, mando datos" (Profile 2-success), or
"asma severa, los doctores dijeron que no" (Profile 4-rejection).

## Report structure

Deliverable: `fase-0/mystery-shopping-report.md` (will be filled by Steve).

1. **Executive summary** — 3-5 bullet observations
2. **Per-agent profile** — Patrick vs Giovanni vs others
3. **Response time distribution** — median, P95, off-hours behaviour
4. **Sales funnel structure** — what they ask first, second, third
5. **Quick reply usage patterns** — codes, when, why
6. **Upsell techniques** — where in the funnel, how phrased
7. **Closing techniques** — how they handle silence + price
8. **Objection handling** — price / safety / time
9. **Extracted sales principles** — to fold into system prompt
10. **Few-shot candidates** — pick 8-15 standout exchanges to anchor the
    inline examples in Bloque 1

## Ethical note

Mystery shopping is a known practice in retail / hospitality QA, but Miguel
is engaging it on his own staff. Two ground rules:
1. Do not use these conversations to penalize agents. They're for prompt
   tuning only. Steve and Miguel agree on this in writing.
2. Once the report is delivered, all PII (timestamps + numbers used) is
   destroyed except the anonymized excerpts used in Bloque 1.
