# AI personas per sede — Miguel 2026-06-07

Source: Miguel WhatsApp 2026-06-07.

When the AI closes a sale via `close_sale`, the `agente_cierre` field in
the DPM_Ventas_Master row must carry the AI persona's name registered in
Miguel's Config tab (so his reporting can filter AI vs human rows). Each
sede has a distinct persona — the name matches the AI's character /
prompt for that sede.

## Mapping

| Sede (DB name) | AI persona name (`agente_cierre`) | Prompt file |
|---|---|---|
| Koh Tao | Emma | `information/16-information-koh-tao/EMMA_PROMPT_NEW.txt` |
| Koh Phi Phi | Francisco Emilio | `information/17-information-phi-phi/system_prompt_phi_phi.md` |
| Gili Trawangan | John | (legacy "system prompt v13" / John was the original DPM_AI_LAUNCH persona) |
| Gili Air | Colomba | `information/15-information/COLOMBA_SYSTEM_PROMPT.md` |
| Nusa Penida | David | `information/18-information/DAVID_PROMPT.md` |

## Where this is wired in code

`apps/server/src/services/sales-logger-mapping.ts` →
`SEDE_AI_AGENTE_CIERRE`. `agenteCierreFor(sedeNombre)` returns the
string above. Empty string for unknown sede (defensive).

The sales-logger handler (`process-message.ts → logSaleRowsForBooking`)
resolves the persona name ONCE per call (outside the per-program loop)
and applies it to every row that conversation produces. If the lookup
returns empty (unknown sede), a warning is logged AND the row still goes
out — but Miguel can't filter it as AI in his reporting until the name
is added.

## Test coverage

`apps/server/test/sales-logger-mapping.test.ts → describe(agenteCierreFor)`
pins every sede→persona mapping. Any future name change (e.g. Miguel
renames the persona in his Config tab) requires a corresponding test
update — keeps drift from going silent.
