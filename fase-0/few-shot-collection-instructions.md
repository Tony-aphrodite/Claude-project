# Few-shot collection — instructions for Miguel's team

Goal: 40 curated conversations (2 days of work spread across the team)
that we'll use to:
1. Teach the AI DPM's sales style by reference (5-8 inline in the system prompt).
2. Test every prompt change going forward (regression suite, 100 cases — the
   40 here become the seed of that 100).

## What we want

| Sede | Conversations |
|---|---|
| Gili Trawangan (pilot) | 12-15 |
| Koh Tao | 5-6 |
| Phi Phi | 5-6 |
| Gili Air | 5-6 |
| Nusa Penida | 5-6 |

Profile distribution (across all 40):
- Principiante indeciso → cerrado OW: **6-8**
- Comparador de precios → cerrado: **4-6**
- Grupo mixto (certificado + principiante): **3-4**
- Follow-up que reactivó: **4-5**
- Objeción fuerte (precio, seguridad, tiempo): **5-6**
- Planificación de viaje multi-día: **5-6**
- Upsell exitoso (OW → AOW, etc.): **5-6**

## Format

Either:

**Option A (preferred):** Respond.io export per conversation as JSON.
File-per-conversation in `fase-0/conversations/<sede>/<id>.json`.

**Option B:** This CSV. One row per message. Multiple conversations stitch
on `(sede, agent, profile)` plus consecutive timestamps. See the template
file in this directory.

**Option C (last resort):** Plain text with `[timestamp] CLIENTE/AGENTE: ...`.

## Anonymization rules

✅ ANONYMIZE:
- Cliente: name, passport, DOB
- Replace with `Cliente_ABC` / `Cliente_DEF` etc. (use the same alias if the
  same person appears across multiple conversations — that's a legit pattern
  the AI should learn).

❌ DO NOT modify:
- Prices in original currency
- Dates and times
- Course names (OW, AOW, DMT, TryScuba, etc.)
- Agent names (Patrick, Giovanni, Grecia, …) — the AI learns style by name
- Quick reply codes (GENENFollowUp1, etc.)
- Verbatim objections from the client ("muy caro", "ya reservé", etc.)

## Timing markers

Ideally include the time deltas between messages. The AI learns DPM's
response cadence from these. If you can't include timestamps for every
message, include them at least at conversation start + close.

## What makes a "gold-standard" conversation

Mark with `gold_standard: true` in the JSON / CSV. ~25-30 of the 100 final
suite should be gold-standard. Criteria:

1. The client outcome is unambiguous (definitely closed, definitely lost,
   definitely went to follow-up).
2. The agent's response style is exemplary — the kind of conversation
   you'd hand a new hire and say "do it like this".
3. No partial transcripts — full conversation start to outcome.

These never change once set. They're our drift detector across prompt
iterations.
