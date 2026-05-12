# 2026-05-12 — Miguel-side action items

These three items live in Miguel's Respond.io workspace / Apps Script. They can't be fixed from our server side — we've done the matching server work already and left these as one-time owner actions. Everything else from the 8-bug feedback list has been shipped.

---

## 1. Update Railway env var (1 min — operations, not Miguel directly)

`HANDOFF_NOTIFICATION_EMAIL` is currently set to `aupwork00@gmail.com` (Steve's dev mailbox). Change to `gilit@dpmdiving.com`.

- Path: Railway → `@dpm/server` → Variables → `HANDOFF_NOTIFICATION_EMAIL` → edit value → Save (Railway auto-redeploys).
- Belt-and-braces: our code now refuses to use any non-`@dpmdiving.com` address at use-time and falls back to `gilit@dpmdiving.com` with a warn log. So even if Railway is forgotten, no more notifications leak to a personal Gmail. But please still fix Railway so the warn log stops firing on every confirmation.

---

## 2. Update "DPM GT - Onboarding Piloto" workflow language filter (§4)

Today the workflow routes Spanish-speaking customers to the English chain because the language branch reads `País` (Country). For an Indonesian-prefix number like Miguel's +62, País is "Indonesia" and the workflow defaults to English.

Two options — pick one:

**Option A (recommended, one-line change in Respond.io):**
- Open the workflow → find the language branch that reads `País`.
- Change the filter to read the top-level **`Idioma`** field (Respond.io's built-in contact language property).
- Set Rama 1 condition to `Idioma = es` (or `tiene cualquiera de "es", "es-ES", "es-419"` if your version exposes regional codes).
- Otra branch stays as the English/default fallback.

Our server already pushes the detected language to the top-level `language` field on every customer message that's 60+ chars (we detect "español" / "english" / "português" via franc-min, then map to ISO 639-1 codes). So once the workflow filter reads from there, real customers will route correctly from message 1.

**Option B (if Idioma can't be referenced directly):**
- Create a custom field named `Idioma` (Text type) in workspace settings.
- Tell me, and I'll add it to our `updateContactCustomFields` push so the field gets populated alongside `branch`/`programa`/etc.
- Then point the workflow filter at the custom field.

---

## 3. Enable bidirectional sync events in workspace settings (§1)

We just shipped the server side — it accepts these event types, but Respond.io has them disabled by default. To turn on real-time state sync between Respond.io and our server:

- Path: Respond.io workspace → Settings → Integrations → Webhooks → DPM webhook → Events.
- Enable:
  - `contact.lifecycle.updated`
  - `contact.tag.added`
  - `contact.tag.removed`
  - `conversation.assignee.updated`
- Keep the existing `message.*` events on (those are how customer messages reach us).

What this unlocks: when you manually clear `deposit_paid` or change lifecycle from "Customer" → "New Lead" in the Respond.io UI for a contact, our server picks up the event and rolls `lead_stage` back to `proposed` (tag removal) or `new` (lifecycle reset). The AI can re-engage that contact without me needing to hit `/admin/reset-conversation` for you each time.

If the event names above are different in your workspace settings (Respond.io has multiple versions of event naming), screenshot the picker and I'll line them up with what our handler accepts (one-line edit in `apps/server/src/routes/webhook.ts`).

---

## 4. Apps Script — disable night slot for GT (§8)

Today the GT roster Apps Script (folder ID `1AlY3LFHVecVYJpqUzzWU0Y-Ll646ZNmh`) returns `turno_nocturno = {disponible: true, espacios: 20}` for every date, even though GT doesn't operate night dives. Our server already force-disables this defensively (any `turno_nocturno` for sede=Gili Trawangan is rewritten to `{disponible: false, espacios: 0, capacidad: 0}` before the model sees it), so the model can't surface a night option. But for cleanliness on your side:

- Open the script (Apps Script editor).
- In the night-slot generation block, hardcode `disponible: false, espacios: 0, capacidad: 0` for GT.
- Also exclude the night slot from `buildResumen` for GT so the resumen text doesn't mention it.

This is ~5 lines. Once it ships, you can remove the server-side defensive block (or leave it — the defense is cheap).

---

## 5. Spanish register sweep on Onboarding Piloto snippets (§10)

Papu's call: unify ES to "tú" (Spain + Latam universal). Our prompt + few-shots are now done. The Onboarding Piloto ES snippets (sent by Respond.io workflow after deposit_paid) still use mixed register:

- `tenés` → `tienes`
- `querés` → `quieres`
- `debés` → `debes`
- `decime` → `dime`
- `mandame` → `mándame`
- `dale` → `vale` (or `ok`)

You mentioned you'd handle this with Papu in a separate doc — flagging here for completeness so nothing slips between the cracks.

---

## 6. KB id `validacao-comprobante` audit (§5)

You mentioned seeing this Portuguese-looking KB id "in source declarations". I grepped `information/`, `apps/`, `packages/` and found zero matches in our repo, so it's either:

- A snippet/workflow on your side that I can't see, or
- A `fuentes` value Claude invented in a recent reply (the prompt says "NO inventes ids" but doesn't enforce it).

Could you screenshot where you saw it? If it's a Claude-invented value, we'll add server-side detection that logs any `fuentes` entry not in our KB index — once-and-done audit.

---

## Done from our side (no Miguel action needed)

For reference, the 9 items we already shipped:

| # | Bug | Commit |
|---|---|---|
| §2 | OCR validates total deposit (pax × per-person) + tighten beneficiary fallback | `d28e542` |
| §3 | Refuse non-dpmdiving.com handoff email at use-time | `6b2ad3c` |
| §11 | Strip URLs/paths/filenames before franc-min language detection | `d9a9d08` |
| §8 (server) | Force-disable night slot from Apps Script response for GT | `aeda6ee` |
| §10 | Sweep customer-facing Spanish phrases to "tú" register | `c9c7dee` |
| §1 §6 §7 | Bidirectional sync: lifecycle PUT + incoming event handler + tag refresh | `6d00ed7` |

All deployed to Railway main. Run a fresh test after items 1-3 above are done and the new event subscriptions should make manual resets unnecessary.
