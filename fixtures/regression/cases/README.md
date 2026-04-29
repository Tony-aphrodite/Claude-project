# Regression cases

Each `*.json` is one curated conversation. The runner walks every file in
this directory and asks the AI to respond to `clientMessage` given
`history`, then checks the response with both layers (deterministic +
LLM-judge).

## File schema

```json
{
  "id": "001",
  "sedeId": "<uuid from sedes table>",
  "sedeName": "Gili Trawangan",
  "clientMessage": "the next inbound message the AI should respond to",
  "history": [
    { "sender": "cliente|ai|agente_humano", "content": "...", "agente": "Patrick" }
  ],
  "expected": {
    "mustInclude": ["regex pattern", "..."],
    "mustExclude": ["regex pattern", "..."],
    "judgeNotes": "free-form notes for the LLM judge",
    "outcome": "label like closed_OW, lost, follow_up"
  },
  "tags": ["principiante", "price", ...]
}
```

## Curation guidelines

- **40 conversations across 5 sedes** (12-15 Gili Trawangan + 5-6 each
  Koh Tao / Phi Phi / Gili Air / Nusa Penida) per guide §13.
- Anonymize: client name, passport, DOB. Keep prices, dates, course names,
  agent names verbatim.
- 10-15 cases should be tagged "gold-standard" — these never change so we
  detect drift across prompt iterations.
- Profile distribution (40 total): principiante→OW (6-8), price comparison
  (4-6), mixed group (3-4), follow-up reactivation (4-5), strong objection
  (5-6), travel-day planning (5-6), upsell (5-6).

## Adding a new case

1. Pick the next free `id` (zero-padded 3 digits).
2. Copy an existing file as template.
3. Fill in `clientMessage`, `history`, expected criteria.
4. Run locally: `pnpm --filter @dpm/regression run -- run --version=active --cases=fixtures/regression/cases --kb-dir=fixtures/regression/kb`
5. If the AI fails on this case in a way you didn't expect, EITHER fix
   the prompt OR fix the case (don't relax `mustInclude` to make it pass —
   that defeats the purpose).
