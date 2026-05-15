# 2026-05-12 — Miguel ↔ Steve lifecycle webhook debug exchange

## Context

After Pieza 1 launch tests on 2026-05-12, we observed that the OUTGOING
lifecycle sync (server → Respond.io) returned HTTP 200 ("enqueued") for
every `triggerLifecycleWebhook` call, **but the contact's lifecycle in
Respond.io stayed at "LOST LEAD"** instead of moving to the new stage.

This is independent of the INCOMING sync (Respond.io → server) issue we
are still debugging (HMAC auth mismatch on the 3 Sync webhooks). The two
problems share no code path:

| Direction | Path | Status |
|---|---|---|
| Server → Respond.io | `triggerLifecycleWebhook` → workflow webhook | 200 OK, no effect (this thread) |
| Respond.io → Server | Sync webhook → `/webhook/respond-io` | 401 auth_mismatch (other thread) |

## Steve's question to Miguel (earlier today)

Steve asked Miguel to verify on the Respond.io side:
- All 5 lifecycle workflows are published
- The trigger config (Webhook entrante, contactId → Contact ID mapping)
- That nothing else was overwriting lifecycle (e.g. a tag workflow)

## Miguel's reply (this message)

```
Steve — checked Execution History side. Everything on Respond.io looks fine:

✅ All 5 Sync Lifecycle workflows are Published
✅ Trigger config: Webhook entrante, contactId → Contact ID mapping correct
✅ "Detección Venta Incompleta" only adds tags (venta_incompleta/venta_completa),
   doesn't touch lifecycle — not the culprit
✅ Re-enabled "Sync - Ciclo de vida" webhook (was 422-disabled, now Active)

Can you double-check on your end:

1. The 5 URLs in your Railway env vars match exactly what's in Respond.io?
   I'll re-send them just in case:

   NEW_LEAD:   https://hooks.respond.io/workflows/CCseYDVhevkF/AUJvpTKZnTpT
   IN_PROCESS: https://hooks.respond.io/workflows/iRStKYcYiLVU/HmYHPiwYgzTh
   PAYMENT:    https://hooks.respond.io/workflows/EmiaZpZbPkLB/nHKzfhwgRGqD
   CUSTOMER:   https://hooks.respond.io/workflows/voNDFGHcGzYz/YcnjDyraisWH
   LOST_LEAD:  https://hooks.respond.io/workflows/qfXMNHUPteUw/xdIHTfuxaEFz

2. The payload your server sends — is the JSON key exactly "contactId"
   (camelCase)? Workflow trigger expects that exact key.

3. When you saw "200 enqueued" — was it the IN_PROCESS URL specifically?
   Or could the server be hitting LOST_LEAD URL by mistake?

Everything is configured correctly on my end. The "200 enqueued" suggests
the wrong URL is being hit, or the workflow is running but the contactId
in the payload doesn't match a real contact.
```

## Reference: official workflow IDs

Each URL ends with `/{workflowId}/{secretToken}`. The workflow IDs that
will be visible in our `urlKey` log field (added in this commit) are:

| Stage | Workflow ID | Secret Token |
|---|---|---|
| NEW_LEAD   | `CCseYDVhevkF` | `AUJvpTKZnTpT` |
| IN_PROCESS | `iRStKYcYiLVU` | `HmYHPiwYgzTh` |
| PAYMENT    | `EmiaZpZbPkLB` | `nHKzfhwgRGqD` |
| CUSTOMER   | `voNDFGHcGzYz` | `YcnjDyraisWH` |
| LOST_LEAD  | `qfXMNHUPteUw` | `xdIHTfuxaEFz` |

(Storing in our repo is fine — these URLs are already known to Miguel and
ourselves; the secret token only authenticates the workflow trigger, not
the Respond.io account.)

## Steve's analysis (code review)

### Q1 — URLs in Railway match what Miguel sent?

**Cannot verify from code alone — Tony must check Railway dashboard.**

The env var names the server expects (defined in `apps/server/src/env.ts`
lines 129-133) are:

- `RESPONDIO_LIFECYCLE_WEBHOOK_NEW_LEAD`
- `RESPONDIO_LIFECYCLE_WEBHOOK_IN_PROCESS`
- `RESPONDIO_LIFECYCLE_WEBHOOK_PAYMENT`
- `RESPONDIO_LIFECYCLE_WEBHOOK_CUSTOMER`
- `RESPONDIO_LIFECYCLE_WEBHOOK_LOST_LEAD`

⚠️ **Naming gotcha**: `RESPONDIO_` (no underscore between RESPOND and IO).
A natural typo would be `RESPOND_IO_LIFECYCLE_WEBHOOK_*` (with the
underscore), in which case the env var loads as undefined and
`lifecycleWebhookUrlFor()` returns `null` for that stage — call is
silently skipped, no log line, lifecycle never updates. Tony to verify
the exact spelling in Railway's Variables tab.

### Q2 — Payload key is exactly `contactId` (camelCase)?

**✅ Confirmed in code** — `apps/server/src/services/lifecycle-webhook.ts`
line 98:

```ts
body: JSON.stringify({ contactId: input.respondIoContactId }),
```

The key is camelCase `contactId`. The value is the Respond.io contact ID
that we store in `conversaciones.respond_io_contact_id` (snake_case in
DB → camelCase in our JS code via the column mapper).

### Q3 — Which URL was hit when we saw "200 enqueued"?

**Was not directly visible from logs — fixed in this commit.** The old
log line was:

```
"lifecycle webhook fired ok"  leadStage="proposed" contactId="446XXX"
```

— it showed the *stage* but not the *URL*, so we couldn't tell whether
the `proposed` → IN_PROCESS mapping was actually firing IN_PROCESS or
silently falling through to a different bucket. Updated to extract the
workflow ID from the URL and include it as `urlKey` on every log line
(success, non-2xx, exception, and the skip case):

```
"lifecycle webhook fired ok"  leadStage="proposed" urlKey="iRStKYcYiLVU"
                                                          ↑ matches IN_PROCESS
```

After deploying this commit and reproducing the transition, we can match
`urlKey` against the reference table above to confirm the mapping. If
`urlKey="qfXMNHUPteUw"` (LOST_LEAD) shows up for a `proposed` transition,
that pinpoints a mapping bug. If `urlKey` matches but the lifecycle
still doesn't move, the issue is between Respond.io's workflow trigger
and its lifecycle update step.

## Code mapping (for Miguel's reference)

Our `lead_stage` → Miguel's lifecycle URL:

| Our stage | URL env var |
|---|---|
| `new` | NEW_LEAD |
| `qualified`, `proposed` | IN_PROCESS |
| `deposit_pending` | PAYMENT |
| `deposit_paid`, `handed_off`, `closed` | CUSTOMER |
| `lost` | LOST_LEAD |

## Next steps

1. **Tony**: open Railway → `@dpm/server` → Variables tab. Confirm the 5
   `RESPONDIO_LIFECYCLE_WEBHOOK_*` env vars exist and their values match
   Miguel's URLs above. Pay attention to the `RESPONDIO_` prefix (no
   underscore).
2. **Tony**: push the `urlKey` logging commit (this turn) → redeploy.
3. **Tony**: trigger a real stage transition (e.g. tag own contact with
   `deposit_paid` so server moves `deposit_pending` → `deposit_paid` →
   fires CUSTOMER workflow) and confirm Railway logs show
   `urlKey="voNDFGHcGzYz"`.
4. **Steve**: review the URL hit in logs vs Miguel's reference table. If
   correct URL but no lifecycle change in UI → ball back in Miguel's
   court (the workflow itself isn't updating lifecycle even though it
   received the right contactId).
