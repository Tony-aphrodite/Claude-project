# Catálogo de cursos PP — mapeo definitivo de imágenes Cloudinary

**Estado: ACTIVO 2026-06-04.** Source: Miguel Villar (URLs originales en KB-05) + verificación operacional con cards renderizadas inline en WhatsApp via Respond.io Attachment API.

---

## Contexto técnico — por qué imágenes y no Meta catalog cards

**Probado y descartado** durante 2026-06-04 (ver memoria `respondio_catalog_send_limitation`):

- ❌ `message.type = "custom_payload"` con `interactive.type = "product"` → Respond.io devuelve **HTTP 403** *"Sorry Channel trying to send to not supporting custom payload!"*. El API público no expone catalog product sends para WhatsApp channels.
- ❌ Templates con botón `catalog` / `mpm` → DPM no tiene ninguno registrado en Meta (verificado vía `GET /v2/space/channel/{id}/template` en los 4 channels WhatsApp del workspace 216239, total 28 templates, 0 con catalog/mpm button).
- ❌ Endpoint interno `/messaging/ajax/message/send` (el que usa el botón UI *"Catálogo de productos Meta"*) → requiere session-cookie auth, Bearer token devuelve 401.

**Path que sí funciona** (Miguel 2026-06-04, sugerencia que destrabó el problema): cada curso tiene una imagen Cloudinary con el branding + precio + inclusiones **baked-in en la imagen misma**. La mandamos como `message.type = "attachment"` con `attachment.type = "image"`. WhatsApp la renderiza como foto nativa inline en el chat — el cliente ve foto + precio + lista de incluidos sin clicks, sin links, sin salir de WhatsApp. Funcionalmente equivalente a la catalog card excepto por el botón "Reserve" (el AI maneja el closing en texto: *"¿lo armamos para [fecha]?"*).

---

## Mapping definitivo — programa → URL Cloudinary

Las 18 URLs (9 cursos × 2 idiomas, EN + ES) están en KB-05 como fuente documental. Esta tabla es la versión op-friendly:

| CatalogProgram | Course (label) | URL EN | URL ES |
|---|---|---|---|
| `TryScuba` | Try Scuba Diving / Bautizo | [try_scuba_en_uxzq8z](https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_try_scuba_en_uxzq8z.jpg) | [try_scuba_es_wrxmna](https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_try_scuba_es_wrxmna.jpg) |
| `ScubaDiver` | Scuba Diver (1-day cert) | [scuba_diver_en_v7bndp](https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_scuba_diver_en_v7bndp.jpg) | [scuba_diver_es_ivutxa](https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_scuba_diver_es_ivutxa.jpg) |
| *(alt. label)* | Basic Diver — Scuba Diver upgrade path | [basic_diver_en_srtufj](https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_basic_diver_en_srtufj.jpg) | [basic_diver_es_qg1rqs](https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_basic_diver_es_qg1rqs.jpg) |
| `FunDive` | Fun Dives | [fun_dives_en_ej5vy4](https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_fun_dives_en_ej5vy4.jpg) | [fun_dives_es_cinwd7](https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_fun_dives_es_cinwd7.jpg) |
| `Adventures` | Adventure Dives / SSI Adventure | [adventure_en_edtiye](https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_adventure_en_edtiye.jpg) | [adventure_es_ie7z18](https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_adventure_es_ie7z18.jpg) |
| `Refresh` | Refresh + 2 Fun Dives | [refresh_en_azdith](https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_refresh_en_azdith.jpg) | [refresh_es_ydgtsd](https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_refresh_es_ydgtsd.jpg) |
| `OW` | Open Water Course | [open_water_en_kgpsta](https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_open_water_en_kgpsta.jpg) | [open_water_es_rkyeno](https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_open_water_es_rkyeno.jpg) |
| `OW30` | Open Water 30 (intensivo 3 días) | [open_water_30_en_alu5fx](https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_open_water_30_en_alu5fx.jpg) | [open_water_30_es_s23xaw](https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_open_water_30_es_s23xaw.jpg) |
| `AOW` | Advanced / Curso Avanzado | [advanced_en_ks3ugc](https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_advanced_en_ks3ugc.jpg) | [advanced_es_og7z6b](https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_advanced_es_og7z6b.jpg) |

**Cobertura del funnel principal: 9/9 cursos esenciales.**

### Cursos SIN imagen Cloudinary (no en este set)

`OWAOWCombo`, `OWDeepCombo`, `DeepSpecialty`, `NitroxSpecialty`, `StressRescue`, `ReactRight`. Cuando un cliente pregunta por uno de estos, el AI degrada a descripción en texto desde KB-01 (precios + duración + inclusiones). Si Miguel quiere imágenes para esos, hay que generarlas en Cloudinary y agregar las env vars correspondientes.

### `Basic Diver` (etiqueta alternativa)

KB-05 lista una imagen separada de "Basic Diver" como upgrade path desde Scuba Diver. Operacionalmente sirve si el cliente pregunta por upgrade tras un Try Scuba o Scuba Diver. **No tiene un `CatalogProgram` enum propio** — Miguel debe decidir si lo mapeamos como variante de `ScubaDiver` o si extendemos el enum. Por ahora queda como referencia documental (no se setea env var).

---

## Railway env vars (copy/paste-ready)

Setear bajo Variables del servicio `@dpm/server`. Cada línea es una env var separada. Si la key ya existe con un fragment ID viejo (e.g. `xini7rpxbl`), **reemplazá el valor con la URL** — el código nuevo en `catalog-registry.ts` auto-detecta URL vs fragment ID por el prefijo `http(s)://`.

```
RESPOND_IO_CATALOG_KOH_PHI_PHI_TRYSCUBA_EN=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_try_scuba_en_uxzq8z.jpg
RESPOND_IO_CATALOG_KOH_PHI_PHI_TRYSCUBA_ES=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_try_scuba_es_wrxmna.jpg
RESPOND_IO_CATALOG_KOH_PHI_PHI_SCUBADIVER_EN=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_scuba_diver_en_v7bndp.jpg
RESPOND_IO_CATALOG_KOH_PHI_PHI_SCUBADIVER_ES=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_scuba_diver_es_ivutxa.jpg
RESPOND_IO_CATALOG_KOH_PHI_PHI_FUNDIVE_EN=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_fun_dives_en_ej5vy4.jpg
RESPOND_IO_CATALOG_KOH_PHI_PHI_FUNDIVE_ES=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_fun_dives_es_cinwd7.jpg
RESPOND_IO_CATALOG_KOH_PHI_PHI_ADVENTURES_EN=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_adventure_en_edtiye.jpg
RESPOND_IO_CATALOG_KOH_PHI_PHI_ADVENTURES_ES=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_adventure_es_ie7z18.jpg
RESPOND_IO_CATALOG_KOH_PHI_PHI_REFRESH_EN=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_refresh_en_azdith.jpg
RESPOND_IO_CATALOG_KOH_PHI_PHI_REFRESH_ES=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_refresh_es_ydgtsd.jpg
RESPOND_IO_CATALOG_KOH_PHI_PHI_OW_EN=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_open_water_en_kgpsta.jpg
RESPOND_IO_CATALOG_KOH_PHI_PHI_OW_ES=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_open_water_es_rkyeno.jpg
RESPOND_IO_CATALOG_KOH_PHI_PHI_OW30_EN=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_open_water_30_en_alu5fx.jpg
RESPOND_IO_CATALOG_KOH_PHI_PHI_OW30_ES=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_open_water_30_es_s23xaw.jpg
RESPOND_IO_CATALOG_KOH_PHI_PHI_AOW_EN=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_advanced_en_ks3ugc.jpg
RESPOND_IO_CATALOG_KOH_PHI_PHI_AOW_ES=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_phi_phi_advanced_es_og7z6b.jpg
```

**Total: 16 env vars (8 cursos del funnel × 2 idiomas).**

Notas operativas:
- Cloudinary devuelve `content-type: image/jpeg`, sin auth, ~150–210 KB por imagen → Respond.io / Meta lo descargan y entregan inline a WhatsApp.
- El código en `catalog-registry.ts` setea `mimeType: "image/jpeg"` automáticamente cuando detecta URL (no hace falta especificar en la env var).
- Si Miguel sube nuevas versiones de las cards a Cloudinary, **basta con actualizar la env var en Railway** — sin redeploy de código, sin re-seed de prompts. Cache de imagen en WhatsApp/CDN se invalida solo cuando cambia el `version` en la URL (`v1774854327` → nueva).

---

## Verificación post-deploy

1. **Push código + setear env vars + re-seed prompts**:
   ```bash
   git push origin main
   # Railway redeploy automático
   pnpm --filter @dpm/db seed-content
   # KB-05 actualizado llega a DB
   ```

2. **Reset del contact tester**:
   ```bash
   node --env-file=.env scripts/reset-pp-contact.mjs 461474747
   ```

3. **Test e2e en WhatsApp** (desde +1 659-281-4080):
   - "Hola" → Francisco saluda
   - "Quiero bucear por primera vez"
   - "Primera vez"
   - "Sí claro" → **debe aparecer la imagen TryScuba ES inline en el chat** (la card con foto + ฿3,600 + inclusiones)

4. **Si la imagen no aparece** → Railway Deploy Logs → buscar `send_catalog`. El log nuevo dice `payloadType: image`. Si hay error, body de Respond.io es verbatim en el log.

5. **Confirmar en DB**:
   ```bash
   node --env-file=.env scripts/diag-recent-pp-calls.mjs
   ```
   La última `llamadas_api` para conv del test debería tener `tool_use_called: [enviar_catalogo]` y `status: success`. Y `errores` table para esa conv debería estar vacía.

---

## Apéndice — fragment IDs de Meta originales (DEPRECATED 2026-06-04)

Miguel originalmente envió 28 IDs alfanuméricos (e.g. `xini7rpxbl`, `k13xkqd39c`) que él identificó como "Respond.io fragments". Después de verificación contra Meta Business Manager, **resultaron ser Meta `product_retailer_id` values** de productos en el catálogo conectado (catalog_id `843708400728480`, 109 productos total). El plan original era usarlos en `message.type="custom_payload"` con shape `interactive.type="product"` para mandar cards nativas de Meta. **No funcionó** — ver "Contexto técnico" arriba.

**Estos IDs se preservan acá por si en el futuro DPM registra Meta-approved templates con catalog/mpm buttons, en cuyo caso este path se puede reactivar:**

| Program | EN id | ES id |
|---|---|---|
| TryScuba | `xini7rpxbl` | `ysjbu87ht6` |
| ScubaDiver | `6vg4o7zs5s` | `dlktjmvret` |
| OW | `ttselz0g8v` | `z41eyixkoi` |
| OW30 | `ooq52j5fzn` | `jei93wl11i` |
| AOW | `sqzfvmz0si` | `wfvtyjotgq` |
| Adventures | `6z7uro2we0` | `tkckxja7tc` |
| OWAOWCombo | `0lwjj4eit2` | `k13xkqd39c` |
| OWDeepCombo | `gqayqfkayy` | `32i97ilzjw` |
| DeepSpecialty | `g2lbo94dld` | `0xax7rh0kt` |
| NitroxSpecialty | `qmg83wfmqu` | `atabmcyyab` |
| StressRescue | `ap4inly8uw` | *(none)* |
| ReactRight | `gvbz80sebg` | *(none)* |
| FunDive | `4cpnzcmpjw` | `lvyj0v2t6s` |
| Refresh | `gacgdg5y2q` | `oslk9dechr` |

Channel context: workspace `216239`, channel `274637` "WAP EN (main)", catalog connection at `app.respond.io/space/216239/settings/channels/274637/whatsapp-catalog`. 109 Meta products total in the connected catalog (see Miguel's screenshots 2026-06-03/04). 5 product sets within: All Products (109), Koh Tao ENG (15), Koh Tao ES (8), Koh Tao Marine Ecology (6), Phi Phi ENG (10), Phi Phi ES (9).

---

## Cambios al código asociados (resumen)

1. **`apps/server/src/services/catalog-registry.ts`** — `getCatalogEntry` ahora detecta env vars que empiezan con `http(s)://` y devuelve `{type: "image", url, mimeType: "image/jpeg"}` en vez del fragment-id path antiguo.
2. **`apps/server/src/services/respond-io.ts`** — `SendCatalogInput.payload` extendido con variante `image`. `buildCatalogMessageBody` formatea esa variante como `{message: {type: "attachment", attachment: {type: "image", url, mimeType}}}` — el shape oficial de Respond.io v2 confirmado por SDK (`@respond-io/typescript-sdk` `AttachmentMessage` type).
3. **`information/17-information-phi-phi/kb_05_snippets_quick_replies.md`** — sección "IMÁGENES DEL CATÁLOGO" reescrita: prohibe al AI pegar URL en texto, ordena invocar siempre la tool `enviar_catalogo` (que el server resuelve a image-attachment).
4. **Sin cambios al AI tool** (`enviar_catalogo`) — sigue tomando `sede_id` + `programa`. El cambio es server-side internal (catalog-registry resuelve diferente).
