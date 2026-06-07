# Sales Logger Apps Script — Miguel's spec (2026-06-07)

Source: Miguel WhatsApp 2026-06-07. Final answer to the
"how does close_sale write to the master sheet" architecture question.

## Architecture decision (FINAL)

The "webhook" the human agents trigger via Respond.io workflow AND the
endpoint the AI will hit directly are the **same Apps Script `/exec`**.
Only the caller differs:

| Caller | Mechanism | Notes |
|---|---|---|
| Human | Respond.io workflow "DPM Ventas Master Logger" | Workflow auto-fills `$contact.X` variables before posting |
| AI | Direct POST from our server | We build the JSON ourselves — no Respond variables |

**"booked by ai" close category** is a LABEL ONLY. No workflow attached.
That's why it doesn't fire the Logger — there's nothing to fire.
Result: exactly ONE writer per sale (the AI's direct POST), no
duplicates.

**No new Apps Script needed.** We use Miguel's existing one.

## 1) URL (production)

```
https://script.google.com/macros/s/AKfycbx--c5FNmhAzRjV52ZDsCeKBYgukJx_BacJHGCTlhIwwskM1wRDM2KjWyiUForGNobawg/exec
```

Same URL for all sedes — the script routes by the `sede` field in the body.

Store in env var: `SALES_LOGGER_URL`.

## 2) Auth token (production)

```
dpm_8f3k2j9m4n7p1q5w8e2r6t9y
```

Sent as the `token` field IN THE BODY (not header). Store in env var:
`SALES_LOGGER_TOKEN`.

## 3) Body — one POST per program

```json
{
  "token": "dpm_8f3k2j9m4n7p1q5w8e2r6t9y",
  "fecha_venta": "2026-06-07 14:30:00",
  "sede": "Koh Phi Phi",
  "firstName": "John",
  "lastName": "Smith",
  "phone": "+66812345678",
  "email": "john@mail.com",
  "countryCode": "GB",
  "language": "en",
  "programa": "OW 18",
  "turno": "AM",
  "pax": 2,
  "monto": 5000,
  "moneda": "THB",
  "agente_cierre": "Francisco Emilio",
  "marketing_source": "web",
  "marketing_campaign": "(la de la atribución del contacto)",
  "gclid": "",
  "precio_total_usd": "",
  "resto_a_pagar_usd": "",
  "descuento": "Sin descuento",
  "codigo_referencia": "(código único, distinto por fila)"
}
```

## 4) Required fields (sale won't count as "Complete" without these)

- `programa`
- `turno`
- `pax`
- `monto` — TOTAL amount, not per-person
- `moneda`

## 5) Exact-match fields (Miguel's revenue calculator drops to 0 on mismatch)

- `sede` — must match the sede name in Miguel's tarifario EXACTLY
  - ✅ "Koh Phi Phi" (not "Phi Phi")
  - ✅ "Gili Trawangan"
  - ✅ "Gili Air"
  - ✅ "Koh Tao"
  - ✅ "Nusa Penida"

- `programa` — must match the program name in Miguel's tarifario EXACTLY
  - **Our internal enum uses short codes (e.g. `"OW"`). Miguel's
    tarifario uses display names (e.g. `"OW 18"`). MAPPING REQUIRED.**
  - For Phi Phi: we need Miguel's exact program-name list to build the
    mapping. Pending (Miguel sends tomorrow with per-sede schedules).

- `agente_cierre` — must match Miguel's Config table for the agent name
  - **Phi Phi AI agent = `"Francisco Emilio"`** (exact: capital F, capital E,
    one space). Already configured on his side.
  - Other sedes' AI agent names TBD (Miguel will send when AI activates
    for those sedes).

## 6) Optional fields (empty string is OK, doesn't break anything)

- `email`
- `countryCode`
- `language`
- `marketing_source` / `marketing_campaign` / `gclid` — Meta CTWA
  attribution. Source: `leadMetadata.lead_source_attribution` (deferred
  field — see [[project_lead_source_attribution]] memory)
- `precio_total_usd` / `resto_a_pagar_usd` — full course price + remaining
  balance after deposit
- `descuento` — defaults to "Sin descuento"

## 7) `codigo_referencia`

Column already exists in the sheet. Apps Script auto-maps it. We send a
DISTINCT code per row (one per program in a multi-program booking).
Pulled from `leadMetadata.ref_codes_by_program[programa]` (or
`leadMetadata.ref_code` for single-program).

## 8) Date format (gotcha)

`fecha_venta` is `"YYYY-MM-DD HH:MM:SS"` — NOT ISO 8601. Local time,
no timezone suffix. Example: `"2026-06-07 14:30:00"`.

## 9) Multi-program logic

One POST per distinct program (Miguel's words: "una fila por programa, N
veces si son varios cursos"). Each POST has its own `codigo_referencia`.
Server already tracks `leadMetadata.ref_codes_by_program` — iterate that
map and POST once per entry.

## 10) Optional architectural suggestion from Miguel

> "capaz podrias usar el id de phi phi para creaer el usuario de
> francisco emilio asi ya tiene su manera de vivir en respond como
> usuario"

Translation: maybe create a separate Respond.io user called "Francisco
Emilio" so it lives independently in the panel. Today we use DPM Phi
Phi (ID 440519) as the AI assignee — conversations show "Asignado a:
DPM Phi Phi". With a dedicated Francisco Emilio user they'd show
"Asignado a: Francisco Emilio" — clearer visual distinction.

NOT URGENT. Current setup works. If Tony decides to create the user,
update `RESPOND_IO_AI_ASSIGNEE_ID` in Railway env to the new user ID.

## Implementation checklist for our side

- [ ] Env vars: `SALES_LOGGER_URL`, `SALES_LOGGER_TOKEN` (Railway)
- [ ] Refactor `apps/server/src/services/sales-logger.ts`:
  - Change `SalesLoggerRow` type to match the spec above
  - Move from per-sede `sede.roster_config.sales_logger_url` to GLOBAL
    `SALES_LOGGER_URL` env (same URL for all sedes)
  - Add `token` field from env to every POST
  - Drop `closed_by_ai` boolean — use `agente_cierre` instead
- [ ] Build sede-name mapping (CONFIRM each one matches Miguel's tarifario)
- [ ] Build program-name mapping (CatalogProgram enum → Miguel's display
  names — pending Miguel's per-sede tarifario)
- [ ] Build `agente_cierre` mapping (sede → AI agent name; Phi Phi =
  "Francisco Emilio")
- [ ] Refactor `logSaleRowsForBooking` in process-message.ts to build
  the new shape
- [ ] Format `fecha_venta` as "YYYY-MM-DD HH:MM:SS"
- [ ] Split contact name into firstName/lastName
- [ ] Add marketing attribution fields (Meta CTWA) — partial; deferred
  until source data lands
- [ ] Tests for the new shape

## Test plan after deploy

1. Real customer in Phi Phi books OW → OCR confirms deposit →
   close_sale fires
2. Open DPM_Ventas_Master, June 2026 tab
3. New row should appear at bottom with:
   - `agente_cierre = "Francisco Emilio"` (column O)
   - `codigo_referencia` populated
   - `sede = "Koh Phi Phi"`
   - `programa` matching Phi Phi tarifario
4. For multi-program: N new rows, one per program, each with its own
   `codigo_referencia`
5. Conversation in Respond.io closes with category "booked by ai" →
   Logger workflow does NOT fire (no double-write)
