# Miguel feedback 2026-06-06 — Ref-code per sede/program + close_sale + AI assignment

## Source

Miguel WhatsApp feedback 2026-06-06 evening (screenshot: Koh Phi Phi
conversation with `codigo_referencia = DPM-GT-0606-RC6YJ4` — wrong sede
prefix). Three asks bundled in one message.

## Topic 1 — AI self-assignment (verify deploy, no code change)

**What Miguel asked.** "Necesitamos que la AI se asigne ella la
conversación así con un solo click la AI está activa sin tener necesidad
de desactivar el webhook cada vez."

**Status.** Already implemented in slice 3d + handoff slice (commits
`1ae0378`, `279d792`). What's deployed:

- AI auto-assigns conversation to `RESPOND_IO_AI_ASSIGNEE_ID = 440519`
  (DPM Phi Phi) after every successful reply
- Human "Assign to me" → `conversation.assignee.changed` webhook →
  `leadMetadata.human_took_over = true` + `lead_stage = handed_off` →
  AI silenced definitively
- Human reassigns back to AI bot (or `null`) → flag cleared +
  `lead_stage` force-reset `handed_off → qualified` → AI fully resumes

**What's left.** Verification only:

1. Confirm Railway env has `RESPOND_IO_AI_ASSIGNEE_ID=440519` and the
   latest deploy is `Active`.
2. Confirm Respond.io webhook "Sync - Cesionario" subscribes to
   `conversation.assignee.changed` (or `.updated`). The handler accepts
   both event names; if the workspace fires `contact.assignee.updated`
   instead, code needs a one-line addition.

No code changes in this topic.

## Topic 2 — Ref-code per-sede prefix (BUG FIX)

**What Miguel asked.** "El campo `codigo_referencia` está definido con
formato `DPM-GT-MMDD-XXXXXX` debería ser con PhiPhi no GT."

**Bug.** `apps/server/src/tools/solicitar-deposito.ts:122` hardcodes
`"GT"` regardless of sede. Every reference issued from any sede comes
out tagged as Gili Trawangan.

**Fix.**

- Add sede-prefix table:
  - Koh Phi Phi → `PP`
  - Gili Trawangan → `GT`
  - Gili Air → `GA`
  - Koh Tao → `KT`
  - Nusa Penida → `NP`
- `generateRefCode(sedeNombre: string, now?: Date)` accepts sede; returns
  `DPM-<PREFIX>-MMDD-XXXXXX`.
- `isValidRefCode(code)` accepts any sede prefix (regex broadened).
- Caller `process-message.ts → solicitarDepositoHandler` passes
  `sede.nombre`.

**Backward compat.** Existing `DPM-GT-MMDD-XXXXXX` codes already issued
remain valid (the regex still accepts `DPM-GT-`). No DB migration.

## Topic 3 — Per-program multi ref-codes (NEW)

**What Miguel asked.** "Si es más de un programa debería generar más de
un código ya que ese código único es para cada persona y puede que sean
diferentes programas."

**Model.** One ref code PER PROGRAM in the booking. Multi-pax with the
same program shares one code (one row in the master sheet, with the
program's pax aggregated). Multi-program (whether by 1 person doing
multiple programs or by a group where members chose different programs)
generates one code per distinct program.

Examples:
- 1 person, OW only → 1 code
- 3 people, all OW → 1 code (pax = 3 on the row)
- 1 person, OW + AOW → 2 codes
- 3 people: TryScuba + Refresh + AOW → 3 codes (each row pax = 1)

**Data shape.**

```ts
type LeadMetadata = {
  // ...existing fields...

  /** Legacy: primary ref code (first one generated). Kept for backward compat. */
  ref_code?: string;

  /**
   * Multi-program ref codes (Miguel rule 2026-06-06). Set when
   * solicitar_deposito generates codes for >1 program. Key = programa
   * key (e.g. "OW"), value = ref code. When only one program is in the
   * booking this map has 1 entry and ref_code === values()[0].
   */
  ref_codes_by_program?: Record<string, string>;
};
```

**Generation point.** `solicitar_deposito` handler. Input gains an
optional `programas` array (length ≥ 1). When absent, falls back to
`leadMetadata.programa` (the singular field already stamped by
`consultar_disponibilidad`) and generates 1 code (backward compat).

**Tool result shape.**

```ts
type SolicitarDepositoResult =
  | {
      ok: true;
      ref_code: string;           // primary, kept for backward compat
      ref_codes_by_program?: Record<string, string>;  // when >1
      // ...rest unchanged...
    }
  | // ...errors unchanged...
```

**AI surface.** When `ref_codes_by_program` has >1 entry, the AI surface
the codes per program in the deposit message:
```
Tu seña total: 120 USD (3 personas)
Códigos:
  TryScuba: DPM-PP-0606-AB12CD
  Refresh:  DPM-PP-0606-XY34ZW
  AOW:      DPM-PP-0606-QR56ST
```

Prompt rule added in `system_prompt_phi_phi.md`.

## Topic 4 — close_sale tool (NEW)

**What Miguel asked.** "close_sale writes to the existing
DPM_Ventas_Master — the same sheet the humans use, single source of
truth (no separate AI file). One row PER PROGRAM."

**Architecture choice.** Per-sede Apps Script `sales_logger.url`, same
pattern as the existing roster Apps Script (`sede.roster_config.url`).
Why this over direct Google Sheets API:
- Matches Miguel's existing architecture
- Miguel owns the Apps Script — he can change sheet structure without
  asking us
- No service account credentials to provision/rotate
- We already POST JSON to per-sede Apps Scripts (proven path)

**Storage of the URL.** Add `sales_logger_url` to `sede.roster_config`
JSONB (already used for `url` and `default_capacity` and
`use_db_roster`). Per-sede, set via admin route or direct SQL.

**Tool signature.**

```ts
close_sale({
  sede_id: string;
  ref_code: string;           // the program-specific ref code
  programa: string;           // CatalogProgram key
  pax: number;                // pax for THIS program only
  start_date: string;         // YYYY-MM-DD
  monto_total: number;
  moneda: DepositCurrency;
  // Optional extras the sheet wants:
  cliente_nombre?: string;
  cliente_telefono?: string;
  // Always "Francisco" for AI rows — server sets this, not Claude.
})
```

**Calling pattern.** AI calls close_sale ONCE PER ROW. For a multi-
program booking with N programs, N tool calls. Each gets a different
`programa` + `ref_code` from `ref_codes_by_program`.

**When the AI calls it.** After deposit is confirmed (`lead_stage =
deposit_paid`). Currently the AI is silent post-deposit_paid (the
post-handoff guard). Two options:

- A. Extend the post-deposit_paid grace window logic to allow close_sale
  invocation
- B. Wire close_sale to fire from the OCR-validated → `deposit_paid`
  transition path server-side (no AI tool call needed)

**Decision: Option B.** Server-driven, more reliable. The
`leadStageService.transition({to: "deposit_paid"})` path already exists
(OCR success in `process-message.ts` → `lead_stage` advance). Hook
close_sale into the same callback so it fires once per program
automatically when the deposit is validated. Removes risk of the AI
forgetting / racing / hallucinating sheet writes.

The Anthropic tool definition is kept available so the AI CAN call it
manually (e.g. for office-flow handoffs) but the primary path is
server-automated.

**Response shape.**

```ts
type CloseSaleResult =
  | { ok: true; rowId?: string }
  | { ok: false; reason: "no_logger_url" | "upstream_error" | "timeout"; message: string };
```

**Idempotency.** Track `leadMetadata.sale_logged_at_by_program:
Record<string, string>` (ISO timestamp). If a program is already
logged, second call is a no-op. Prevents double-write on re-runs.

## Topic 5 — AI closes conversation with "booked by ai" category (NEW)

**What Miguel asked.** "Francisco closes the conversation with 'booked
by ai.' 'booked by ai' must NOT fire the DPM Ventas Master Logger
(close_sale already wrote the rows). But it MUST still unassign."

**Mechanism.** New tool `close_conversation(category)`. The category
arg is constrained by enum (today: only `"booked by ai"`).

Tool handler calls Respond.io v2:
```
POST /v2/contact/id:{contactId}/conversation/close
body: { category: "booked by ai" }
```

This handler stays minimal — it just translates AI intent to a Respond.io
state change. Respond.io workflows decide what fires (Miguel configures
"DPM Ventas Master Logger" to SKIP "booked by ai", keeps "Assignment:
Unassign After Conversation Closes" firing on all categories).

**When the AI calls it.** After all close_sale rows are written
(server-automated, so the AI sees the rows are logged via the
deposit_paid flow). Could also fire automatically server-side after the
last close_sale row to avoid relying on the AI.

**Decision: server-automated.** Same reasoning as close_sale —
remove the AI from the close path entirely. After all programs' rows
are logged, the server fires `close_conversation("booked by ai")` and
transitions `lead_stage = closed`.

The AI tool remains exposed for manual override paths but the primary
flow doesn't depend on Claude remembering to call it.

## Respond.io configuration (Miguel side, not code)

Miguel needs to:

1. **Verify webhook subscription**: Respond.io → Integrations → Webhooks
   → "Sync - Cesionario" → confirm event is `conversation.assignee.*`.
2. **DPM Ventas Master Logger workflow**: add filter "SKIP if
   conversation_close_category = 'booked by ai'".
3. **Assignment: Unassign After Conversation Closes**: confirm fires
   on ALL categories including "booked by ai" (already does today; no
   change needed unless he locked it to a specific category).
4. **Custom field `codigo_referencia`**: today shows one code. For
   multi-program bookings, the field will show the FIRST code; the
   master sheet rows have the program-specific codes. If Miguel wants
   all codes in the contact field, add a second field
   `codigos_referencia_por_programa` (text, joined with newlines).
   Defer until after pilot.

## Implementation order

1. **Topic 2** (sede prefix) — small, no contract break
2. **Topic 3** (per-program codes) — additive, backward compat preserved
3. **Topic 4** (close_sale tool + Apps Script integration + auto-fire
   from deposit_paid transition)
4. **Topic 5** (close_conversation tool + auto-fire after last
   close_sale row)
5. **Tests + monorepo typecheck + push**

Topic 1 is verification only — no code.
