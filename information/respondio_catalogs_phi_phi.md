# Respond.io Catalog Fragment IDs — Koh Phi Phi

Source: Miguel Villar, 2026-06-02 (PP launch). Each Respond.io fragment renders a
WhatsApp catalog product card with the course's photo, price, and "Reserve"
CTA. The AI calls `enviar_catalogo` with `programa` → server resolves to the
fragment ID below → Respond.io sends the card to the customer.

**Bilingual:** each course has a separate fragment per language. The server
picks EN or ES from the conversation's detected language at call time.

---

## Mapping table — canonical CatalogProgram → fragment IDs

| CatalogProgram (code) | Course (label) | EN fragment | ES fragment |
|---|---|---|---|
| `TryScuba` | Try Scuba Diving / Bautizo de Buceo | `xini7rpxbl` | `ysjbu87ht6` |
| `ScubaDiver` | Scuba Diver (entry-level cert) | `6vg4o7zs5s` | `dlktjmvret` |
| `OW` | Open Water Course / Curso Open Water | `ttselz0g8v` | `z41eyixkoi` |
| `OW30` | Open Water 30 (3-day intensive) | `ooq52j5fzn` | `jei93wl11i` |
| `AOW` | Advanced Course / Curso Avanzado | `sqzfvmz0si` | `wfvtyjotgq` |
| `Adventures` | Adventures / Aventuras (SSI Adventure Diver) | `6z7uro2we0` | `tkckxja7tc` |
| `OWAOWCombo` | Open Water + Advanced / Open Water + Avanzado | `0lwjj4eit2` | `k13xkqd39c` |
| `OWDeepCombo` | Open Water + Deep / Open Water + Av. Profunda | `gqayqfkayy` | `32i97ilzjw` |
| `DeepSpecialty` | Deep Specialty / Especialidad Profunda | `g2lbo94dld` | `0xax7rh0kt` |
| `NitroxSpecialty` | Nitrox Specialty / Especialidad Nitrox | `qmg83wfmqu` | `atabmcyyab` |
| `StressRescue` | Stress & Rescue (SSI Rescue Diver) | `ap4inly8uw` | *(none provided)* |
| `ReactRight` | React Right (SSI first aid / EFR) | `gvbz80sebg` | *(none provided)* |
| `FunDive` | Fun Dives / Fun Dives 2 inmersiones | `4cpnzcmpjw` | `lvyj0v2t6s` |
| `Refresh` | Refresh + FD / Refresh + FD | `gacgdg5y2q` | `oslk9dechr` |

**Total: 14 courses · 28 fragment IDs (some EN-only).**

---

## Railway env vars to set (Variables tab of `@dpm/server`)

Add ONE env var per (sede, course, language) combination. Format:

```
RESPOND_IO_CATALOG_KOH_PHI_PHI_<PROGRAM>_<LANG>=<fragment_id>
```

Copy-paste-ready list:

```
RESPOND_IO_CATALOG_KOH_PHI_PHI_TRYSCUBA_EN=xini7rpxbl
RESPOND_IO_CATALOG_KOH_PHI_PHI_TRYSCUBA_ES=ysjbu87ht6
RESPOND_IO_CATALOG_KOH_PHI_PHI_SCUBADIVER_EN=6vg4o7zs5s
RESPOND_IO_CATALOG_KOH_PHI_PHI_SCUBADIVER_ES=dlktjmvret
RESPOND_IO_CATALOG_KOH_PHI_PHI_OW_EN=ttselz0g8v
RESPOND_IO_CATALOG_KOH_PHI_PHI_OW_ES=z41eyixkoi
RESPOND_IO_CATALOG_KOH_PHI_PHI_OW30_EN=ooq52j5fzn
RESPOND_IO_CATALOG_KOH_PHI_PHI_OW30_ES=jei93wl11i
RESPOND_IO_CATALOG_KOH_PHI_PHI_AOW_EN=sqzfvmz0si
RESPOND_IO_CATALOG_KOH_PHI_PHI_AOW_ES=wfvtyjotgq
RESPOND_IO_CATALOG_KOH_PHI_PHI_ADVENTURES_EN=6z7uro2we0
RESPOND_IO_CATALOG_KOH_PHI_PHI_ADVENTURES_ES=tkckxja7tc
RESPOND_IO_CATALOG_KOH_PHI_PHI_OWAOWCOMBO_EN=0lwjj4eit2
RESPOND_IO_CATALOG_KOH_PHI_PHI_OWAOWCOMBO_ES=k13xkqd39c
RESPOND_IO_CATALOG_KOH_PHI_PHI_OWDEEPCOMBO_EN=gqayqfkayy
RESPOND_IO_CATALOG_KOH_PHI_PHI_OWDEEPCOMBO_ES=32i97ilzjw
RESPOND_IO_CATALOG_KOH_PHI_PHI_DEEPSPECIALTY_EN=g2lbo94dld
RESPOND_IO_CATALOG_KOH_PHI_PHI_DEEPSPECIALTY_ES=0xax7rh0kt
RESPOND_IO_CATALOG_KOH_PHI_PHI_NITROXSPECIALTY_EN=qmg83wfmqu
RESPOND_IO_CATALOG_KOH_PHI_PHI_NITROXSPECIALTY_ES=atabmcyyab
RESPOND_IO_CATALOG_KOH_PHI_PHI_STRESSRESCUE_EN=ap4inly8uw
RESPOND_IO_CATALOG_KOH_PHI_PHI_REACTRIGHT_EN=gvbz80sebg
RESPOND_IO_CATALOG_KOH_PHI_PHI_FUNDIVE_EN=4cpnzcmpjw
RESPOND_IO_CATALOG_KOH_PHI_PHI_FUNDIVE_ES=lvyj0v2t6s
RESPOND_IO_CATALOG_KOH_PHI_PHI_REFRESH_EN=gacgdg5y2q
RESPOND_IO_CATALOG_KOH_PHI_PHI_REFRESH_ES=oslk9dechr
```

**Stress & Rescue / React Right:** EN-only. If a Spanish-speaking customer
asks about either, the server falls back to the EN fragment (better than
nothing) and the AI announces in Spanish that the card is in English. Ask
Miguel later if he wants to add ES versions.

---

## What was added to the code

1. **`packages/shared/src/types.ts`** — extended `CATALOG_PROGRAMS` enum with
   the 6 new SSI program keys: `ScubaDiver`, `Adventures`, `OWAOWCombo`,
   `OWDeepCombo`, `DeepSpecialty`, `NitroxSpecialty`, `StressRescue`,
   `ReactRight`.

2. **`apps/server/src/services/catalog-registry.ts`** — `getCatalogEntry`
   now accepts a `language` argument and reads the language-suffixed env
   var (`..._EN` or `..._ES`), falling back to EN when an ES isn't set.

3. **`Francisco prompt v4`** — added the "CATÁLOGO — cuándo enviar" section
   instructing the AI to call `enviar_catalogo` with the matching `programa`
   key when the customer asks about a specific course, BEFORE describing
   it in text.

---

## Verification after Tony sets the env vars

1. Push the code changes
2. Set the 26 env vars on Railway (copy-paste list above) → Save
3. Wait for Railway redeploy
4. Synthetic test:
   ```
   node --env-file=.env scripts/test-webhook-phiphi.mjs
   ```
   But first edit the test script's `message.text` to ask about a specific
   course (e.g. "I want to do Open Water"). The AI should now call
   `enviar_catalogo` with `programa: "OW"` → Respond.io sends fragment
   `ttselz0g8v` → customer would see the OW product card.
5. Verify in `mensajes` table: the AI message metadata should contain
   `toolCalls: [{name: "enviar_catalogo", ...}]` instead of `[]`.
