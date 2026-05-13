# 2026-05-13 — Miguel feedback: assignee fix (his side) + Deposit auto-confirm spec

## Context

After the bidirectional sync + panel Confirmar flow shipped end-to-end
on 2026-05-13 morning, Miguel ran a test from his phone (PDF dummy →
Panel Confirmar). Two outcomes:

1. He fixed the `Sin asignar` problem on his side (Onboarding Piloto
   workflow waits + assignee filter).
2. He sent a new spec for how deposit auto-confirmation should work,
   based on what he saw in real-world chat patterns.

## Miguel's message (verbatim, Spanish)

```
Steve, te ordeno mejor lo que te tiré recién + cierro el tema "Sin asignar":

*Lo del "Sin asignar" del caso Yuri* — ya lo resolví yo del lado del workflow
Onboarding Piloto. Eran dos cosas combinadas: los Esperar acumulaban ~16 min
antes de llegar al step Asignar (por eso a los 5 min que chequeaste todavía no
había disparado), y el toggle "Asignar solo a usuarios en línea" estaba ON sin
fallback, así que si nadie del team estaba con status online en ese segundo
exacto quedaba colgado sin reintento. Bajé todos los Esperar a 30 seg
(total ~3,5 min) y desactivé el filtro de "solo online" en las dos cajas
Asignar (A#1 y A#2). Próximo depósito confirmado debería terminar asignado al
Round Robin sí o sí.

*Cambios al flujo de auto-confirmación de depósitos* — el caso de hoy (PDF sin
código → la IA no auto-confirmó, tuve que ir al panel y clickear Confirmar) es
el ejemplo perfecto del problema. Spec:

1) *Trigger para auto-confirmar = EL MONTO, no el código de referencia.* Si la
   IA extrae un monto que matchea el esperado (con la tolerancia de abajo) →
   confirmar. El código DPM-GT-MMDD-XXXXXX lo seguimos generando y enviándoselo
   al cliente como sugerencia para que lo ponga en el concepto de la
   transferencia, pero NO lo usamos como condición de matcheo dentro del
   comprobante. En la práctica casi nadie lo incluye.

2) *Aceptar fotos/capturas además de PDFs.* La regla "solo PDF" no funciona —
   clientes IDR mandan screenshots del Mandiri/BCA, muchos europeos pagan desde
   apps mobile que solo exportan imagen. Si rechazamos screenshots perdemos
   ventas.

3) *Si la IA no puede extraer el monto* (foto borrosa, PDF protegido, formato
   raro): *escalar a /Depósitos como hoy.* No auto-confirmar a ciegas. El costo
   de un humano clickeando Confirmar es bajo; confirmar una reserva sin saber
   realmente cuánto pagó el cliente es caro.

4) *Tolerancia de monto: subir de ±2% a ±5%.* Con fotos/screenshots la lectura
   por OCR es menos exacta que con PDFs parseables. Más permisivo para que más
   casos auto-confirmen. Si después vemos casos abusivos, lo bajamos.

5) *Dashboard live de auto-confirmaciones en el panel.* Sección "Depósitos
   auto-confirmados hoy" dentro del panel actual, en vivo (no dump cada X
   horas). Muestra: comprobante, monto detectado, contacto, programa,
   timestamp. Y un botón para flagear si algo está raro. Patrick/equipo lo
   cruzan contra el email de Wise/Mandiri a gilit@dpmdiving.com (ground truth
   de plata realmente recibida) y si hay discrepancia contactan al cliente.
   Red de seguridad sin bloquear la UX.

Lógica de fondo: confirmar al cliente al toque para que arranque su onboarding
(mensajes + asignación al Round Robin), reconciliar en paralelo. Si algo se
cuela falso, el equipo lo agarra en el dashboard antes de que el cliente llegue
al día del buceo.

creo que es la unica forma de que funcione mejor por que ho
mirando todos los chat con los agantes humanos muchos no puede o no saben como
pasar el pdf y seguro que mas del 50 % nunca va a poner el codigo que le damos
entonces va a ser dificil para la ai poder confirmar directo lo bueno es que ya
cambia a customer buen trabajo jun jun esta casi listo.

muy buen trabajo solo me va a quedar calibrar bien el promt para las
respuestas, de verdad buen trabajo ya esta todo el cableado hecho
```

## Steve's analysis

### Change 1 — Amount-first matching (drop ref code as gate)

Current behavior ([apps/server/src/services/ocr-comprobante.ts:166-241](apps/server/src/services/ocr-comprobante.ts#L166-L241)):
`reconcile()` requires THREE checks to pass for `validated: true`:
- ref code matches (exact or substring)
- currency matches
- amount within ±2% of expected (and not >+10%)

If any of the three fails, `validated: false` and the lead stays in
`deposit_pending` for human Confirmar.

Spec change: drop ref code as a gate. If amount + currency both pass,
mark validated regardless of ref code. Ref code becomes informational
(still extracted + persisted in ocr_result metadata for audit, never
again drives the verdict).

Risk: someone could send any PDF with the matching amount + currency
and trigger auto-confirm. Mitigated by Change 5 (live dashboard for
human cross-check against Wise/Mandiri bank emails to
gilit@dpmdiving.com).

### Change 2 — Accept images for all currencies

Current behavior ([apps/server/src/services/ocr-comprobante.ts:255-266](apps/server/src/services/ocr-comprobante.ts#L255-L266)):
For EUR/GBP/AUD/USD (FOREIGN_CURRENCIES), any `image/*` MIME is
rejected up-front with `reason: "screenshot_rejected"` before the
vision call. IDR is allowed images. The rationale was that
international bank PDFs are higher fidelity than mobile screenshots.

Spec change: drop the foreign-currency image rejection. Accept images
for all currencies. The vision model handles both PDFs and image
attachments equally well (already wired — see lines 318-334), so the
only thing changing is the early-reject gate.

### Change 3 — Escalate if amount can't be extracted

Already implemented. When `extraction.amount == null`, `reconcile()`
pushes `amount_missing` into mismatches → `validated: false` →
deposit_pending → /Depósitos panel for human Confirmar. No code change
needed.

### Change 4 — Amount tolerance ±2% → ±5%

Current: line 199 uses `expected.amount * 0.98` (lower bound).
Spec change: `expected.amount * 0.95`.

The upper bound (line 200: `expected.amount * 1.1`, ±10% high) stays
the same — that's a fraud / duplicate-transfer guard, separate from
the precision-of-OCR allowance.

### Change 5 — Live dashboard for auto-confirmed deposits

NEW PANEL PAGE. Requirements:
- Section in existing panel called "Depósitos auto-confirmados hoy"
- Live (not periodic dump) — real-time as auto-confirms happen
- Shows for each row:
  - Comprobante (image or PDF preview/link)
  - Monto detected by OCR
  - Contacto (name + phone)
  - Programa
  - Timestamp
- "Flag this" button per row → marks for human investigation
- Cross-reference workflow:
  - Wise/Mandiri email reports landing in gilit@dpmdiving.com is the
    ground truth of money actually received
  - Patrick / sede team compares dashboard against bank emails
  - If discrepancy: contact client manually

This is the safety net that makes Changes 1-4 safe to deploy.

Scope: this is a new panel page, requires server endpoint to stream/
poll auto-confirmed events, requires a UI design + table component. ~1
day of work. Spec separately before implementation.

### Praise

Miguel: "muy buen trabajo... ya esta todo el cableado hecho" —
infrastructure work is done. Next phase is prompt calibration (Miguel
will drive) + this auto-confirm UX polish.

### Sin asignar — closed

Was a Miguel-side workflow config issue, not a bug on our side. Fixed
by Miguel directly:
- Reduced Esperar waits in Onboarding Piloto from ~16 min total to
  ~3.5 min
- Disabled "Asignar solo a usuarios en línea" toggle on A#1 and A#2
  (was blocking when nobody on team was online at exact moment)

No action needed on our side.

## Implementation plan

### Phase A — server-side OCR changes (this commit, ~30 min)

1. Change 1: amend `reconcile()` so ref code is purely informational
   (mismatch never gates validation)
2. Change 2: drop foreign-currency image rejection
3. Change 4: change ±2% → ±5%
4. Update tests in `test/ocr-comprobante.test.ts` accordingly
5. Update inline comments + `EXTRACTION_PROMPT` if needed
6. Push, redeploy

Change 3 needs no code (already implemented).

### Phase B — Auto-confirm dashboard (separate, ~1 day)

Spec out + get Tony go-ahead before implementing. Outline:
- DB: new view or query against `conversaciones` filtered by
  `lead_metadata->ocr_result->validated = true` ordered by recent
- Server: new `GET /admin/auto-confirmed-deposits` endpoint with
  pagination + filters (today / last 7 days / all)
- Panel: new page `/depositos/auto` under Depósitos
- "Flag" button: writes to a new `auto_confirm_flags` table or to
  errores with type `auto_confirm_review_requested`

## Next actions

1. Steve: implement Phase A now (4 OCR changes + tests + comments)
2. Tony: push + verify in Railway
3. Steve: write Phase B spec for Tony's approval
4. Then continue with Simulator/Replay (Phase 1+2 from earlier spec)
