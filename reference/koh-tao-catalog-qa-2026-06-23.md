# DPM Koh Tao — Catálogo completo 24 programas — QA uno por uno

**Source:** Miguel (Papu) — sent via WhatsApp to Steve 2026-06-24
**Purpose:** canonical source of truth for KT catalog, KB, prompt content.
Use this file as the reference for ALL KT content fixes (feedback #1, #2, #5,
#6 from the 2026-06-23 batch + 11 inconsistencies listed below).

## English summary (added by Claude for quick scan)

Miguel did a complete QA pass over KT's 24 catalog programs. For each program
he documents the card URLs (EN+ES), the card text, what should be in the KB,
and any inconsistency to fix. Then he summarises 11 specific
inconsistencies at the top.

Critical takeaways:
- **All 24 KT catalog cards exist** (Miguel uploaded them — including 6 new
  ones since our last audit: Night Adventure, Night Fun Dive, Perfect
  Buoyancy, Upgrade Basic, Upgrade Scuba, Instructor).
- **6 catalog enums must be added** to `CATALOG_PROGRAMS` in
  `packages/shared/src/types.ts`: `NightAdventure`, `NightFunDive`,
  `PerfectBuoyancy`, `UpgradeBasic`, `UpgradeScuba`, `Instructor`.
- **Deep Adventure changed**: was 2,900 / 1 dive — now **3,900 / 2-dive
  package**. New URLs in this doc replace the old `_1` suffix.
- **Card-text errors to fix** (Miguel needs to update Cloudinary card text):
  Try Scuba (lunch/schedule), Rescue (pool/exam wording).
- **KB inconsistencies to fix in our repo:**
  - Advanced discount 10% → 5% (only for DPM cert customers, not Fun Dive
    or Try Scuba)
  - Rescue KB-01 (12,600) vs KB-05 (12,900) — align to 12,600
  - Deep Specialty: add OW-prereq tier 8,900 + 40m max
  - Night Fun Dive: add standalone entry at 1,200 (currently missing)
  - Fun Dives / Refresh: align 6→12 months threshold across KB and prompt
  - 6 ecology programs: add KB entries + soften KB-07's "no eco / no
    snorkeling" line
- **Prompt fix:** separate Divemaster (cotiza + escala) from Instructor
  (only escala — "starting soon").

## Resumen de inconsistencias a resolver (Miguel's numbered list)

| # | Programa | Inconsistencia | Acción |
|---|---|---|---|
| 1 | Advanced | KB dice 10%, debe ser 5% (9,500) + solo cursos de cert | Editar KB-01/05/07/12 |
| 2 | Try Scuba | Card dice 'lunch' + horario 8:30-4:30 | Corregir texto card |
| 3 | Rescue | Card dice 'pool' + 'written exam' | Corregir texto card |
| 4 | Rescue | KB-01=12,600 vs KB-05=12,900 | Corregir KB-05 |
| 5 | Deep Adventure | Card 3,900 ✅ pero texto viejo decía 2,900 | Usar texto nuevo + KB-09 |
| 6 | Deep Specialty | KB solo 7,900, falta 8,900 + 40m | Editar KB-01 |
| 7 | Night Fun Dive | No está en KB (1,200) | Agregar KB |
| 8 | Fun Dives / Refresh | KB dice 6 meses, prompt dice 12 | Alinear KB a 12 |
| 9 | Ecología (6) | No están en KB-01; KB-07 dice 'no eco/no snorkel' | Agregar KB + matizar KB-07 |
| 10 | Divemaster/Instructor | Juntos en el prompt | Separar en prompt |
| 11 | Instructor | Card muestra precio vs regla 'starting soon' | Decidir badge |

## Programa-por-programa (full Miguel spec — Spanish, verbatim)

### 1. Try Scuba / Bautizo — `TryScuba` — 3,600 THB

URL EN: https://res.cloudinary.com/drk4qqccv/image/upload/v1781531779/dpm_koh_tao_tryscuba_en_dkbzvd.jpg
URL ES: https://res.cloudinary.com/drk4qqccv/image/upload/v1781531782/dpm_koh_tao_tryscuba_es_hqnhei.jpg

**Texto catálogo (EN):**
> Our Try Scuba Diving is a 1-day experience for beginners — a short intro class on equipment and safety, then 2 dives in the sea 🤿
> We start around 8:30am and finish around 4:30pm. No experience needed.
> It's 3,600 THB including full gear, pro instructor, lunch and insurance.
> Want me to check availability for you? 🤿

**Texto catálogo (ES):**
> Nuestro Bautizo de Buceo es una experiencia de 1 día para principiantes 🤿 Arranca con una breve clase de introducción (equipo y normas de seguridad) y después hacés 2 inmersiones en el mar.
> Empezamos cerca de las 8:30am y terminamos alrededor de las 4:30pm. No se requiere experiencia.
> Son 3,600 THB e incluye equipo completo, instructor profesional, almuerzo y seguro.
> ¿Te verifico disponibilidad? 🤿

**Lo que va en el KB:**
Precio 3,600/pp · grupo 2+ 3,300/pp · 1 día · edad mín 10 (8-9 máx 5m, confirmar con oficina) · prof máx 12m (1ra inm 6m, 2da 12m) · sin certificación · incluye 2 boat dives, instructor pro, equipo completo, seguro, snacks a bordo · clase 100% disponible en español.

**Inconsistencia / a corregir:**
❗ CARD A CORREGIR (punto 2): el texto dice **lunch/almuerzo** → debe ser solo **snacks** (no hay comida). Y el horario **8:30am–4:30pm** → cambiar a: clase de teoría a la mañana, barco al mediodía, vuelta ~4:30pm. El resto consistente.

### 2. Scuba Diver — `ScubaDiver` — 8,600 THB

URL EN: https://res.cloudinary.com/drk4qqccv/image/upload/v1781531764/dpm_koh_tao_scuba_en_iet9wt.jpg
URL ES: https://res.cloudinary.com/drk4qqccv/image/upload/v1781531768/dpm_koh_tao_scuba_es_cgqkih.jpg

KB: Precio 8,600 · 1 día · edad mín 10 · prof máx 12m · cert SSI Scuba Diver (internacional + de por vida), upgradeable a OW en cualquier momento/lugar · incluye licencia, 2 boat dives, instructor, equipo, seguro, snacks.

✅ Consistente.

### 3. Open Water — `OW` — 11,000 THB

URL EN: https://res.cloudinary.com/drk4qqccv/image/upload/v1781531736/dpm_koh_tao_ow_en_u7blqz.jpg
URL ES: https://res.cloudinary.com/drk4qqccv/image/upload/v1781531739/dpm_koh_tao_ow_es_bw6noq.jpg

KB: Precio 11,000 · piso negociación 10,000 (primera oferta) → mínimo absoluto 9,500 · 3 días (puede hacerse en 2 al mismo precio, 4 dives en vez de 6) · edad mín 10 · prof 18m (Junior <15 = 12m, auto-upgrade a 18m a los 15) · cert SSI Open Water · incluye cert, instructor, equipo, seguro, 6 boat dives, remera DPM o botella, snacks · alojamiento +1,000 THB (3 noches).

✅ Consistente. Card menciona alojamiento +1,000 → OW + 3 noches = 12,000.

### 4. Open Water 30 ⭐ — `OW30` — 17,900 THB

URL EN: https://res.cloudinary.com/drk4qqccv/image/upload/v1781531743/dpm_koh_tao_ow30_en_k8tdml.jpg
URL ES: https://res.cloudinary.com/drk4qqccv/image/upload/v1781531750/dpm_koh_tao_ow30_es_jqdvrd.jpg

KB: Precio 17,900 (ahorra 5,300 vs 23,200) · ~EUR 505 / GBP 426 / USD 518 · 3 días · edad mín 10 · prof 30m · exclusivo DPM · máx 4 alumnos/instructor · cert SSI OW + SSI Deep Adventurer · incluye ambas cert, instructor, equipo, seguro, 6 dives, remera + máscara&snorkel + botella gratis, todas las tasas, 50% off Fun Dives en las otras 4 sedes (1 vez por sede), snacks · alojamiento +1,000 (3 noches) = 18,900.

✅ Consistente.

### 5. Advanced — `AOW` — 10,000 THB

URL EN: https://res.cloudinary.com/drk4qqccv/image/upload/v1781531686/dpm_koh_tao_advanced_en_x3lpty.jpg
URL ES: https://res.cloudinary.com/drk4qqccv/image/upload/v1781531674/dpm_koh_tao_advanced_es_b142kz.jpg

KB: Precio 10,000 · 2 días · requisito Open Water · prof 30m · sin teoría ni exámenes · 5 dives (Perfect Buoyancy, Navigation, Deep, Wreck, Night) · cert SSI Advanced Adventurer · incluye instructor, equipo, seguro, 5 dives, snacks.

**Descuento correcto: 5% (9,500)** solo para quien hizo un curso de certificación (OW/OW30/Advanced) con DPM en cualquier sede — NO Fun Dive, NO Bautizo.

❗ KB A CORREGIR (punto 1): KB-01 dice **10% (9,000)** → cambiar a **5% (9,500)** + elegibilidad. La CARD ya dice 5%. Replicar el % en KB-05/07/12.

### 6. Deep Adventure (paquete) — `Adventures` — 3,900 THB

URL EN: https://res.cloudinary.com/drk4qqccv/image/upload/v1782221440/dpm_koh_tao_deepadv_en_2_lflppo.jpg
URL ES: https://res.cloudinary.com/drk4qqccv/image/upload/v1782221451/dpm_koh_tao_deepadv_es_2_kuzjri.jpg

**Texto catálogo (EN):**
> The Deep Adventure takes you down to 30 m even with just your Open Water 🤿 You get a lifetime SSI Deep Adventurer recognition card. It comes as a 2-dive package — your deep dive plus a fun dive — for 3,900 THB, including pro instructor, full gear and insurance.
> Want me to check availability? 🤿

**Texto catálogo (ES):**
> La Aventura Profunda te lleva a 30 m incluso con tu Open Water 🤿 Te llevás la tarjeta SSI Deep Adventurer de por vida. Viene como paquete de 2 inmersiones — tu buceo profundo más un fun dive — por 3,900 THB, e incluye instructor profesional, equipo completo y seguro.
> ¿Te verifico disponibilidad? 🤿

KB: Precio **3,900 = paquete de 2 inmersiones** (1 buceo profundo a 30m + 1 fun dive) · requisito Open Water · tarjeta SSI Deep Adventurer de por vida · incluye instructor, equipo, seguro, 2 boat dives, snacks.

❗❗ DOS COSAS (punto 5):
1) CARD a 3,900 / 2 inmersiones ✅ (URL nueva con sufijo `_2`)
2) TEXTO de catálogo viejo decía 2,900 / 1 inmersión + opcional → reemplazar con el texto NUEVO de arriba. Alinear KB-09 y prompt (hoy dice Adventures=2,900).

### 7. Deep Specialty — `DeepSpecialty` — 7,900 / 8,900 THB

URL EN: https://res.cloudinary.com/drk4qqccv/image/upload/v1782218928/dpm_koh_tao_deepspec_en_ansq50.jpg
URL ES: https://res.cloudinary.com/drk4qqccv/image/upload/v1782218956/dpm_koh_tao_deepspec_es_d1ys4p.jpg

KB: Precio doble — **7,900** si Advanced (1 día, 2 dives) / **8,900** si Open Water (2 días, 4 dives) · prof **40m** · requisito Open Water · cert SSI Deep Specialty de por vida · incluye instructor, equipo, seguro, snacks.

❗ KB A CORREGIR (punto 6): KB-01 solo tiene **7,900** y no menciona el tier 8,900 ni los 40m. La CARD está completa. Agregar a KB-01 el tier 8,900 (OW=4 dives / Advanced=2 dives) y los 40m.

### 8. Nitrox Specialty — `NitroxSpecialty` — 7,900 THB

URL EN: https://res.cloudinary.com/drk4qqccv/image/upload/v1782219037/dpm_koh_tao_nitrox_en_guetss.jpg
URL ES: https://res.cloudinary.com/drk4qqccv/image/upload/v1782219024/dpm_koh_tao_nitrox_es_trar3i.jpg

KB: Precio 7,900 · aire enriquecido hasta 40% O2 · 2 inmersiones Nitrox · cert SSI Enriched Air de por vida · incluye instructor, equipo, seguro, snacks.

✅ Consistente. (A confirmar: ¿requiere OW como mínimo? KB-01 no especifica requisito.)

### 9. Night Adventure — `NightAdventure` — 2,900 THB

URL EN: https://res.cloudinary.com/drk4qqccv/image/upload/v1782219570/dpm_koh_tao_nightadventure_en_whq0cl.jpg
URL ES: https://res.cloudinary.com/drk4qqccv/image/upload/v1782219582/dpm_koh_tao_nightadventure_es_i8cace.jpg

KB: Precio 2,900 · formato 1 sola inmersión (excepción a la regla de mínimo 2) · requisito Open Water mínimo · certifica de por vida para buceos nocturnos · reconocimiento SSI Night.

✅ Consistente. Ojo: NO confundir con Night Fun Dive (1,200). Esta es la **certificación** nocturna.

### 10. Night Fun Dive — `NightFunDive` — 1,200 THB

URL EN: https://res.cloudinary.com/drk4qqccv/image/upload/v1782219274/dpm_koh_tao_nightdive_en_kgxkyf.jpg
URL ES: https://res.cloudinary.com/drk4qqccv/image/upload/v1782219261/dpm_koh_tao_nightdive_es_p8kks2.jpg

KB: Precio **1,200** · inmersión guiada nocturna (1 dive) · requisito **buceador nocturno** (Advanced o tener la Night Adventure certificada) · incluye equipo, guía, seguro.

❗ KB A AGREGAR (punto 7): KB-01 NO tiene el Night Fun Dive a 1,200. Agregar entrada propia: 1,200 + requisito buceador nocturno.

### 11. Fun Dives — `FunDive` — 2,100 THB

URL EN: https://res.cloudinary.com/drk4qqccv/image/upload/v1781531722/dpm_koh_tao_fundives_en_bwrdxl.jpg
URL ES: https://res.cloudinary.com/drk4qqccv/image/upload/v1781531726/dpm_koh_tao_fundives_es_crqekn.jpg

KB: Precio 2,100/salida · 2 boat dives por salida · requisito cualquier certificación · **requiere haber buceado dentro de los últimos 12 meses** (si no, Refresh).

❗ INCONSISTENCIA TRANSVERSAL (punto 8): KB-01 (Fun Dives y Refresh) dice **6 meses**, pero el PROMPT (Refresh Rule, unificada 2026-06-20) dice **>12 meses**. Alinear KB-01 a **12 meses**.

### 12. Refresh + Fun Dive — `Refresh` — 2,600 THB

URL EN: https://res.cloudinary.com/drk4qqccv/image/upload/v1781531746/dpm_koh_tao_refresh_en_ohu0zc.jpg
URL ES: https://res.cloudinary.com/drk4qqccv/image/upload/v1781531754/dpm_koh_tao_refresh_es_w89eio.jpg

KB: Precio 2,600 · requerido si el certificado no buceó en **+12 meses** · requisito Scuba/OW/Advanced/Rescue · DM e Instructor no necesitan Refresh · incluye repaso teórico, inmersión de skills en aguas poco profundas, 1 fun dive, guía, equipo, seguro, snacks.

❗ Mismo tema 6 vs 12 meses que Fun Dives — alinear KB a 12 meses.

### 13. React Right + Rescue — `StressRescue` — 12,600 THB

URL EN: https://res.cloudinary.com/drk4qqccv/image/upload/v1781531761/dpm_koh_tao_rescue_en_pgfyfr.jpg
URL ES: https://res.cloudinary.com/drk4qqccv/image/upload/v1781531757/dpm_koh_tao_rescue_es_dxes8m.jpg

KB: Precio **12,600** · 3 días · requisito **Advanced** · cert SSI Rescue Diver + SSI React Right · 4 boat dives · incluye instructor, equipo, seguro, snacks.

❗ DOS COSAS:
1) CARD A CORREGIR (puntos 3): el texto dice **pool skills** → 'shallow bay / aguas poco profundas en la bahía' (no hay piscina); y **written exam** → 'knowledge review'. Requisito Advanced se mantiene.
2) INCONSISTENCIA KB (punto 4): KB-01 dice 12,600 pero KB-05 (árbol de decisión) dice **12,900**. Corregir KB-05 a 12,600.

### 14. Divemaster — `DMT` — 44,000 THB

URL EN: https://res.cloudinary.com/drk4qqccv/image/upload/v1781531707/dpm_koh_tao_divemaster_en_x7vjea.jpg
URL ES: https://res.cloudinary.com/drk4qqccv/image/upload/v1781531711/dpm_koh_tao_divemaster_es_monoe4.jpg

KB: Precio 44,000 (incluye Deep Specialty + alojamiento durante la formación) · 6 semanas · bucea 5-6 días/sem · alojamiento incluido en DPM Hostel · para consultas: pedir número, dar oficina +66636575799, escalar — NUNCA cotizar disponibilidad.

✅ Card correcta (cotiza 44,000 + pide número + escala). PROMPT A CORREGIR (punto 10): separar Divemaster (cotiza + escala) de Instructor (solo escala) — hoy están en la misma regla.

### 15-20. Ecology (6 programas) — 3,500-4,500 THB

| # | Programa | Enum | Precio | Método | URL EN | URL ES |
|---|---|---|---|---|---|---|
| 15 | Coral Ecology | `CoralEcology` | 4,500 | 2 dives | v1781531682/coral_en | v1781531689/coral_es |
| 16 | Fish Ecology | `FishEcology` | 4,500 | 2 dives | v1781531714/fish_en | v1781531718/fish_es |
| 17 | Marine Ecology | `MarineEcology` | 4,500 | 2 dives | v1781531729/marine_en | v1781531732/marine_es |
| 18 | Blue Oceans | `BlueOceans` | 4,500 | 2 dives | v1781531675/blueoceans_en | v1781531679/blueoceans_es |
| 19 | Sea Turtle Ecology | `SeaTurtleEcology` | 3,500 | **snorkel** | v1781531786/turtle_en | v1781531790/turtle_es |
| 20 | Shark Ecology | `SharkEcology` | 3,500 | **snorkel** | v1781531772/shark_en | v1781531775/shark_es |

KB: 1 día · dirigido por bióloga marina de DPM KT · taller + 2 actividades aplicando técnicas · cert SSI correspondiente · incluye equipo, seguro, remera gratis.

❗ KB A AGREGAR (punto 9): los 6 cursos de ecología NO están en KB-01. Agregar entradas. Además **KB-07 dice 'no eco-dives' y 'no snorkeling'** → contradice (especialmente Sea Turtle / Shark que usan snorkel). Matizar KB-07: "no offering general snorkeling/eco trips, but the ecology specialties (which include snorkel sessions) ARE available."

### 21. Perfect Buoyancy — `PerfectBuoyancy` — 7,900 THB

URL EN: https://res.cloudinary.com/drk4qqccv/image/upload/v1782264806/dpm_koh_tao_perfectbuoy_en_tuhvfr.jpg
URL ES: https://res.cloudinary.com/drk4qqccv/image/upload/v1782264821/dpm_koh_tao_perfectbuoy_es_zdtfmz.jpg

**Texto catálogo (EN):**
> The Perfect Buoyancy specialty fine-tunes your control underwater — you'll hover effortlessly, save air and protect the reef 🤿 2 specialty dives with a pro instructor, and you earn a lifetime SSI Perfect Buoyancy certification.
> It's 7,900 THB including full gear, instructor and insurance.
> Want me to check availability? 🤿

**Texto catálogo (ES):**
> La especialidad de Flotabilidad Perfecta afina tu control bajo el agua — vas a flotar sin esfuerzo, ahorrar aire y cuidar el arrecife 🤿 2 inmersiones con instructor profesional, y te llevás la certificación SSI Perfect Buoyancy de por vida.
> Son 7,900 THB e incluye equipo completo, instructor y seguro.
> ¿Te verifico disponibilidad? 🤿

KB: Precio 7,900 · especialidad de flotabilidad · 2 inmersiones · cert SSI Perfect Buoyancy de por vida · incluye instructor, equipo, seguro, snacks. (Requisito: a confirmar — típicamente OW.)

🆕 NUEVO PROGRAMA. CARD subida. KB-01 ya tiene la entrada ✅.

### 22. Upgrade Open Water (Basic Diver) — `UpgradeBasic` — 7,400 THB

URL EN: https://res.cloudinary.com/drk4qqccv/image/upload/v1782264774/dpm_koh_tao_upgradebasic_en_eck2nf.jpg
URL ES: https://res.cloudinary.com/drk4qqccv/image/upload/v1782264789/dpm_koh_tao_upgradebasic_es_gedgqx.jpg

**Texto catálogo (EN):**
> If you already hold the SSI Basic Diver card, this upgrade takes you to the full Open Water certification 🤿 4 boat dives with a pro instructor, certified to 18 m anywhere in the world, lifetime.
> It's 7,400 THB including full gear, instructor and insurance.
> Want me to check availability? 🤿

**Texto catálogo (ES):**
> Si ya tenés la tarjeta SSI Basic Diver, este upgrade te lleva a la certificación Open Water completa 🤿 4 inmersiones con instructor profesional, certificado hasta 18 m en cualquier parte del mundo, de por vida.
> Son 7,400 THB e incluye equipo completo, instructor y seguro.
> ¿Te verifico disponibilidad? 🤿

KB: Precio 7,400 · requisito tarjeta SSI Basic Diver · cert SSI Open Water · 4 boat dives · incluye instructor, equipo, seguro, snacks · solo aplica a certificaciones SSI.

🆕 NUEVO PROGRAMA. CARD subida. KB-01 ya tiene la entrada ✅.

### 23. Upgrade Open Water (Scuba Diver) — `UpgradeScuba` — 5,000 THB

URL EN: https://res.cloudinary.com/drk4qqccv/image/upload/v1782264724/dpm_koh_tao_upgradescuba_en_vd0ean.jpg
URL ES: https://res.cloudinary.com/drk4qqccv/image/upload/v1782264754/dpm_koh_tao_upgradescuba_es_vhbrtp.jpg

**Texto catálogo (EN):**
> Already certified as SSI Scuba Diver? This upgrade completes your full Open Water certification 🤿 2 boat dives with a pro instructor, certified to 18 m worldwide, lifetime.
> It's 5,000 THB including full gear, instructor and insurance.
> Want me to check availability? 🤿

**Texto catálogo (ES):**
> ¿Ya sos SSI Scuba Diver? Este upgrade completa tu certificación Open Water 🤿 2 inmersiones con instructor profesional, certificado hasta 18 m en todo el mundo, de por vida.
> Son 5,000 THB e incluye equipo completo, instructor y seguro.
> ¿Te verifico disponibilidad? 🤿

KB: Precio 5,000 · requisito cert SSI Scuba Diver · cert SSI Open Water · 2 boat dives · incluye instructor, equipo, seguro, snacks · solo aplica a certificaciones SSI.

🆕 NUEVO PROGRAMA. CARD subida. KB-01 ya tiene la entrada ✅.

### 24. Instructor — `Instructor` — 80,000 THB

URL EN: https://res.cloudinary.com/drk4qqccv/image/upload/v1782264697/dpm_koh_tao_instructor_en_leuvju.jpg
URL ES: https://res.cloudinary.com/drk4qqccv/image/upload/v1782264711/dpm_koh_tao_instructor_es_ojl5aa.jpg

**Texto catálogo (EN):**
> Ready to go pro? The Instructor course is the level above Divemaster — you learn to teach and certify divers for life 🌊 It's a full professional training with DPM.
> We're about to start offering it — leave me your number and the team will reach out with all the details as soon as it opens 🤿

**Texto catálogo (ES):**
> ¿Listo para dar el salto profesional? El curso de Instructor es el nivel por encima del Divemaster — aprendés a enseñar y certificar buceadores de por vida 🌊 Es una formación profesional completa con DPM.
> Estamos por empezar a ofrecerlo — dejame tu número y el equipo te contacta con todos los detalles apenas abra 🤿

KB: Precio 80,000 · nivel por encima del Divemaster · **aún NO se imparte** — presentar como 'arranca pronto' · para consultas: pedir número, dar oficina +66636575799, escalar. NUNCA cotizar disponibilidad.

🆕 NUEVO PROGRAMA. CARD subida.
❗ TENSIÓN (punto 11): la card MUESTRA precio 80,000, pero la regla dice no cotizar y presentar como 'starting soon'. **Decisión pendiente con Miguel**: si preferís, cambio el badge de la card a 'PRÓXIMAMENTE / COMING SOON'.
