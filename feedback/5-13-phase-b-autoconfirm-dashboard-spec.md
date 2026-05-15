# Phase B — Auto-Confirm Dashboard Spec

**Status**: draft for Tony's approval
**Author**: Steve
**Date**: 2026-05-13
**Companion**: [5-13-feedback-deposit-autoconfirm-spec.md](5-13-feedback-deposit-autoconfirm-spec.md)

## Why

Phase A (deployed 2026-05-13) widened the OCR auto-confirm gate:
- Ref code dropped from gate → informational only
- Images accepted for all currencies (not just IDR)
- Amount tolerance ±2% → ±5%

This trades upfront blocking for faster customer onboarding. The
trade-off is real: a malicious PDF showing the right amount in the
right currency could now auto-confirm — same risk Miguel flagged on
2026-05-12 (Bertrand Klein's 40 EUR PDF could re-validate another
40 EUR conversation).

Phase B is the **safety net**: a live dashboard the sede team
cross-references against the Wise/Mandiri/BCA bank notification
emails landing in `gilit@dpmdiving.com` (ground truth of cash
actually received). When something doesn't match, the team flags
the row and contacts the client.

## Functional spec (per Miguel 2026-05-13)

| # | Requirement | Notes |
|---|---|---|
| 1 | New panel section "Depósitos auto-confirmados hoy" | Under existing Depósitos navigation |
| 2 | Live (not periodic dump) — refreshes on every panel load | Server Component, no client polling needed |
| 3 | Row data: comprobante preview, monto detectado, contacto, programa, timestamp | See "Columns" below |
| 4 | "Flag this" button per row → marks for human investigation | Writes to errores with new type |
| 5 | Cross-reference workflow: bank emails → dashboard → flag → contact client | Workflow lives outside our system; we provide the dashboard primitive |

## Columns

| Column | Source | Render |
|---|---|---|
| Comprobante | mensajes table joined where conversacion_id matches AND attachment present, ordered by created_at desc, limit 1 | Thumbnail for image MIMEs (`image/*`), PDF icon + filename for `application/pdf`; click to open in new tab |
| Monto detectado | `conv.lead_metadata.ocr_result.extraction.amount` + `.currency` | "40,00 EUR" formatted via existing currency utils |
| Esperado | `conv.lead_metadata.deposit_amount` + `.deposit_currency` | Same format. Side-by-side with detected so deltas are visible. |
| Contacto | `chat_contacts.name` + `.phone` (joined on `conversaciones.respond_io_contact_id`) | Existing avatar+initials pattern from payments page |
| Programa | `conv.lead_metadata.programa` + `.start_date` | e.g. "OW 15/05" |
| Sede | `sedes.nombre` (joined) | e.g. "Gili Trawangan" |
| Confirmado | `conv.lead_metadata.history` last entry with `note: "ocr_auto_confirmed"` → `at` | Relative time (e.g. "hace 15m"), color-grade by recency |
| OCR mismatches | `conv.lead_metadata.ocr_result.mismatches` | Pills showing `ref_code_missing`, `ref_code_mismatch`. Hidden when empty. Helps spot "this auto-confirmed without a ref" cases for closer review. |
| Acciones | — | Two buttons: `Flag` (yellow) + `Ver chat` (ghost) |

## Filters / time scope

- Default view: **today** (auto-confirms with `at >= today midnight in workspace TZ`)
- Tabs at top: `Hoy` / `Últimos 7 días` / `Todos`
- Sort: most recent first

## Flag action

Click `Flag` → server action writes:

```ts
db.insert(errores).values({
  source: "internal",
  conversacionId,
  errorType: "auto_confirm_review_requested",
  errorMessage: `Operator flagged auto-confirmed deposit for review`,
  context: {
    flaggedBy: session.userEmail,  // Supabase auth user
    detectedAmount: extraction.amount,
    detectedCurrency: extraction.currency,
    expectedAmount: metadata.deposit_amount,
    expectedCurrency: metadata.deposit_currency,
    refCode: metadata.ref_code,
    autoConfirmedAt: <timestamp from history entry>,
  },
});
```

Once flagged:
- Row gets a yellow border / `flagged` badge
- Stays visible in the dashboard (we don't hide flagged rows — operator wants to track them)
- If operator wants to UN-flag (false alarm), separate `Unflag` button writes
  a follow-up errores row with `errorType: "auto_confirm_review_resolved"`

## Empty state

If today has zero auto-confirms:
```
No hay auto-confirmaciones hoy.
Los depósitos confirmados automáticamente por la IA aparecerán acá
para que el equipo de sede los cruce contra los emails de
Wise/Mandiri/BCA en gilit@dpmdiving.com.
```

## Files to add / change

### New
- `apps/panel/src/app/(app)/depositos-auto/page.tsx` — the page
- `apps/panel/src/app/(app)/depositos-auto/ComprobantePreview.tsx` — thumbnail / PDF icon component
- `apps/panel/src/app/actions/flag-autoconfirm.ts` — server actions for flag/unflag

### Modified
- `apps/panel/src/lib/db-queries.ts`
  - Add `listAutoConfirmedDeposits({ scope: 'today' | '7d' | 'all' })` —
    selects from conversaciones where `lead_metadata->>'ocr_result'` has
    `validated=true`, joined with chat_contacts + sedes + most-recent
    mensaje with attachment
  - Filter by time scope using `history` array's latest `ocr_auto_confirmed` entry
- `apps/panel/src/app/(app)/layout.tsx` — add nav item "Auto-confirmados" under Depósitos

### No server-side changes needed
The OCR side already persists everything we need in
`conversaciones.lead_metadata.ocr_result` (Phase A) and the audit
history. Phase B is panel-only.

## DB query sketch

```ts
export async function listAutoConfirmedDeposits(opts: {
  scope: "today" | "7d" | "all";
}) {
  const db = getDb();
  const cutoff =
    opts.scope === "today"
      ? startOfDayWorkspaceTz()
      : opts.scope === "7d"
        ? Date.now() - 7 * 86400_000
        : 0;

  // Select conversaciones where ocr_result.validated = true AND the
  // most recent auto-confirm history entry is after cutoff. Join in
  // contact + sede + the message that carried the attachment.
  return db
    .select({
      conv: conversaciones,
      contact: chatContacts,
      sedeName: sedes.nombre,
      attachment: sql`(
        select json_build_object(
          'mime', m.metadata->'attachment'->>'mime',
          'url', m.metadata->'attachment'->>'url',
          'filename', m.metadata->'attachment'->>'filename'
        )
        from mensajes m
        where m.conversacion_id = ${conversaciones.id}
          and m.sender = 'cliente'
          and m.metadata->'attachment' is not null
        order by m.created_at desc
        limit 1
      )`.as("attachment"),
    })
    .from(conversaciones)
    .leftJoin(chatContacts, eq(chatContacts.respondIoContactId, conversaciones.respondIoContactId))
    .leftJoin(sedes, eq(sedes.id, conversaciones.sedeId))
    .where(
      and(
        sql`${conversaciones.leadMetadata}->'ocr_result'->>'validated' = 'true'`,
        sql`${conversaciones.leadMetadata}->'ocr_result'->>'at' >= ${new Date(cutoff).toISOString()}`,
      ),
    )
    .orderBy(desc(sql`${conversaciones.leadMetadata}->'ocr_result'->>'at'`))
    .limit(100);
}
```

(Pseudocode — actual Drizzle syntax may need tweaks for JSONB navigation.)

## Open questions for Tony

1. **Workspace timezone** for "today" cutoff — Gili Trawangan is GMT+8.
   Hard-code `Asia/Makassar` or read from `sedes` table?
2. **Comprobante preview**: thumbnail size? Inline preview vs click-to-open?
3. **Flag button** — does it need a confirmation modal ("Are you sure you
   want to flag this?") or one-click is OK?
4. **Multi-sede future**: when DPM expands beyond GT, the page should
   default-filter by sede. For now (GT-only pilot) we skip the filter.

## Miguel's answers (2026-05-13 evening)

Verbatim:

```
1) FLAG → (a) + (c). Marca la fila como "to review" en el dashboard
Y crea una nota en respond.io en ese contacto. La nota en respond.io
es la pieza clave: si alguien retoma la conversación después (handoff,
follow-up del cliente), va a ver el flag al toque y entender que hay
algo a revisar. (b) lo dejamos afuera por ahora — no me hace falta
email a mí personal. Si más adelante querés sumar email, que sea al
inbox del equipo (gilit@dpmdiving.com), no a mí.

2) UN-FLAG → dale al default tuyo. Botón "Resuelto" que esconde la
fila del default view + toggle "Mostrar resueltos" para audit trail.
Perfecto así.

3) FRECUENCIA → una vez al día. Resumen automático a las 6pm hora
Bali al email gilit@dpmdiving.com con: depósitos auto-confirmados
ese día, pendientes en /Depósitos, y flagged sin resolver. Le sirve
al equipo como checklist de cierre de jornada. Si el volumen crece
después, subimos la cadencia.
```

### Decisions locked in

| # | Decision | Implementation note |
|---|---|---|
| 1a | Flag marks row as "to review" in dashboard | Already in core (this commit). |
| 1c | Flag also creates a note on the Respond.io contact | NEW work: needs respond.io API for contact notes. The note text encodes who flagged, when, and the detected-vs-expected delta so anyone re-opening the conversation sees the flag context immediately. |
| 1b | Personal-email-to-Miguel route is REJECTED | Skip. If we add email later it goes to gilit@dpmdiving.com only. |
| 2 | Un-flag default plan is approved | Default already chosen: "Resolver" button hides row + `?showResolved=1` toggle reveals audit-only view. NEEDS WIRING. |
| 3 | Daily summary at 18:00 Asia/Makassar to gilit@dpmdiving.com | NEW work: server endpoint that computes (auto-confirmed today, deposit_pending list, flagged unresolved) and queues the body in `errores` with `error_type = "daily_summary_pending"`. Tony schedules an external cron (Railway Cron / Vercel Cron / cron-job.org) to POST to the endpoint every day at 10:00 UTC (= 18:00 Asia/Makassar). When email transport is wired, the queued rows get drained. |

### Implementation order (this turn)

1. **Un-flag toggle + "Mostrar resueltos"** — UI/DB only, smallest scope.
2. **Respond.io contact note on Flag** — research API endpoint, add helper.
3. **Daily summary endpoint** — queue in `errores` like handoff_email_pending.

## Effort estimate

- DB query: ~1 hour (JSONB navigation in Drizzle is the trickiest part)
- Page component: ~3 hours (table, preview component, formatting)
- Server actions: ~30 min (flag/unflag mirroring the payments pattern)
- Nav item + page link: ~15 min
- Smoke test in dev + edge cases: ~1 hour

**Total: ~6 hours focused work** (less if Tony has questions answered upfront)

## Ship plan

1. Tony reviews this spec, answers open questions, approves
2. I implement in one PR
3. Tony pushes → Vercel auto-deploys
4. Tony eyeballs in panel with a deposit_paid contact from today's e2e tests
5. Tell Miguel: "Phase B live — bookmark /depositos-auto and have the
   sede team cross-check it against the Wise/Mandiri emails every morning"

## Doesn't change

- Phase A behavior (already deployed) is independent
- Existing /Depósitos page (manual confirm) keeps working as-is
- Existing workflows in Respond.io don't need touching
