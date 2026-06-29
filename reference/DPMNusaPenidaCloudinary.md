# DPM Diving — Nusa Penida · Tarjetas en Cloudinary

Cloud name: `drk4qqccv` · 22 tarjetas (11 programas × EN/ES). Precios IDR — la tarifa de Nusa Penida no incluye tasa de parque marino (se paga aparte en cash al llegar). Pegá la URL según programa e idioma.

## Try Scuba Diving
- **EN (NPEN):** https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_tryscuba_en_akuftv.jpg
- **ES (NPES):** https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_tryscuba_es_jfthrf.jpg

## Scuba Diver
- **EN (NPEN):** https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_scuba_en_y8qi3v.jpg
- **ES (NPES):** https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_scuba_es_mosstp.jpg

## Open Water
- **EN (NPEN):** https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_ow_en_mh1hqf.jpg
- **ES (NPES):** https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_ow_es_icqoky.jpg

## Open Water 30
- **EN (NPEN):** https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_ow30_en_aepdq4.jpg
- **ES (NPES):** https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_ow30_es_e2kf4k.jpg

## Advanced (AOW)
- **EN (NPEN):** https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_advanced_en_wxqr2h.jpg
- **ES (NPES):** https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_advanced_es_tm9o1k.jpg

## Deep Adventure
- **EN (NPEN):** https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_deepadv_en_g3idgn.jpg
- **ES (NPES):** https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_deepadv_es_aquctv.jpg

## Fun Dives
- **EN (NPEN):** https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_fundives_en_whwv3f.jpg
- **ES (NPES):** https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_fundives_es_wrczfx.jpg

## Refresh
- **EN (NPEN):** https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_refresh_en_rvsziz.jpg
- **ES (NPES):** https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_refresh_es_vus5yh.jpg

## React Right (EFR)
- **EN (NPEN):** https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_reactright_en_lxdy0a.jpg
- **ES (NPES):** https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_reactright_es_pxh4s6.jpg

## Nitrox Specialty
- **EN (NPEN):** https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_nitrox_en_oqygod.jpg
- **ES (NPES):** https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_nitrox_es_aiqi0l.jpg

## Stress & Rescue
- **EN (NPEN):** https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_rescue_en_bureqc.jpg
- **ES (NPES):** https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_rescue_es_ubokt5.jpg

---

## Mapeo de programa → catálogo `CatalogProgram` enum

| URL slug | `programa` (en código) | Notas |
|---|---|---|
| `tryscuba` | `TryScuba` | |
| `scuba` | `ScubaDiver` | 1-day cert |
| `ow` | `OW` | Open Water Diver |
| `ow30` | `OW30` | Open Water 30 intensivo |
| `advanced` | `AOW` | Advanced Open Water |
| `deepadv` | `Adventures` | Deep Adventure → SSI Deep Adventurer card |
| `fundives` | `FunDive` | Fun Dives 2-dive trip |
| `refresh` | `Refresh` | Refresh + 2 Fun Dives |
| `reactright` | `ReactRight` | EFR equivalent |
| `nitrox` | `NitroxSpecialty` | |
| `rescue` | `StressRescue` | Stress & Rescue |

## Env vars para Railway (copy/paste)

Patrón: `RESPOND_IO_CATALOG_NUSA_PENIDA_<PROGRAM>_<LANG>=<url>`. Las imágenes son JPG bare-URL → el server las envía como `image attachment` por WhatsApp (no necesita aprobación Meta, no abre browser).

```
RESPOND_IO_CATALOG_NUSA_PENIDA_TRYSCUBA_EN=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_tryscuba_en_akuftv.jpg
RESPOND_IO_CATALOG_NUSA_PENIDA_TRYSCUBA_ES=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_tryscuba_es_jfthrf.jpg
RESPOND_IO_CATALOG_NUSA_PENIDA_SCUBADIVER_EN=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_scuba_en_y8qi3v.jpg
RESPOND_IO_CATALOG_NUSA_PENIDA_SCUBADIVER_ES=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_scuba_es_mosstp.jpg
RESPOND_IO_CATALOG_NUSA_PENIDA_OW_EN=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_ow_en_mh1hqf.jpg
RESPOND_IO_CATALOG_NUSA_PENIDA_OW_ES=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_ow_es_icqoky.jpg
RESPOND_IO_CATALOG_NUSA_PENIDA_OW30_EN=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_ow30_en_aepdq4.jpg
RESPOND_IO_CATALOG_NUSA_PENIDA_OW30_ES=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_ow30_es_e2kf4k.jpg
RESPOND_IO_CATALOG_NUSA_PENIDA_AOW_EN=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_advanced_en_wxqr2h.jpg
RESPOND_IO_CATALOG_NUSA_PENIDA_AOW_ES=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_advanced_es_tm9o1k.jpg
RESPOND_IO_CATALOG_NUSA_PENIDA_ADVENTURES_EN=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_deepadv_en_g3idgn.jpg
RESPOND_IO_CATALOG_NUSA_PENIDA_ADVENTURES_ES=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_deepadv_es_aquctv.jpg
RESPOND_IO_CATALOG_NUSA_PENIDA_FUNDIVE_EN=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_fundives_en_whwv3f.jpg
RESPOND_IO_CATALOG_NUSA_PENIDA_FUNDIVE_ES=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_fundives_es_wrczfx.jpg
RESPOND_IO_CATALOG_NUSA_PENIDA_REFRESH_EN=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_refresh_en_rvsziz.jpg
RESPOND_IO_CATALOG_NUSA_PENIDA_REFRESH_ES=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_refresh_es_vus5yh.jpg
RESPOND_IO_CATALOG_NUSA_PENIDA_REACTRIGHT_EN=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_reactright_en_lxdy0a.jpg
RESPOND_IO_CATALOG_NUSA_PENIDA_REACTRIGHT_ES=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_reactright_es_pxh4s6.jpg
RESPOND_IO_CATALOG_NUSA_PENIDA_NITROXSPECIALTY_EN=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_nitrox_en_oqygod.jpg
RESPOND_IO_CATALOG_NUSA_PENIDA_NITROXSPECIALTY_ES=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_nitrox_es_aiqi0l.jpg
RESPOND_IO_CATALOG_NUSA_PENIDA_STRESSRESCUE_EN=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_rescue_en_bureqc.jpg
RESPOND_IO_CATALOG_NUSA_PENIDA_STRESSRESCUE_ES=https://res.cloudinary.com/drk4qqccv/image/upload/dpm_nusa_penida_rescue_es_ubokt5.jpg
```

22 env vars total.
