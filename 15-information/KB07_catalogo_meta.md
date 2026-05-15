# KB-07 — CATÁLOGO DE PRODUCTOS META — GILI AIR

**Versión:** v1.0
**Sede:** Gili Air
**Fuente:** Catálogo Meta WhatsApp Business — Canal WAP EN (main) — ID canal 274637
**Última extracción:** 2026-05-15
**Total productos GA confirmados:** 12 (de un universo de 109 productos en el catálogo de DPM)

---

## Para qué sirve este KB

Es el backup textual del catálogo Meta. Colomba NORMALMENTE invoca las tarjetas
vía la acción `send_product_card` (ver §catalogo-meta del system prompt), porque
las tarjetas Meta tienen imagen + formato visual + Branch Code que el cliente
percibe como "oficial".

Este KB se usa cuando:
1. El envío de la tarjeta falla técnicamente (ver §catalogo-meta-fallback)
2. El cliente habla en un idioma sin tarjeta disponible (IT, FR, DE, PT)
3. Colomba necesita citar contenido específico de una tarjeta para responder a un detalle
4. Programa NO tiene tarjeta y Colomba debe armar la presentación en texto

⚠️ **NO usar este KB para sustituir tarjetas válidas.** Si la tarjeta existe, es válida
para GA, y el envío funciona, SIEMPRE preferir invocar la tarjeta.

---

## Estructura de cada tarjeta del catálogo Meta

Toda tarjeta del catálogo Meta de DPM tiene esta estructura visual cuando llega al
cliente:

```
[IMAGEN del programa]
[TÍTULO del producto]
[ID del producto]
[BLOQUE de descripción larga con emojis decorativos]
[Branch Code: GAEN o GAES al final]
```

El cliente ve la imagen primero, luego el título, luego puede expandir para leer
toda la descripción. El precio aparece embebido en la descripción larga.

---

═══════════════════════════════════════════════════════════════════════
SECCIÓN 1 — PROGRAMAS PARA PRINCIPIANTES (sin certificación previa)
═══════════════════════════════════════════════════════════════════════

## 1.1 Try Scuba Diving (Gili Air) — EN

**product_id:** `eb8phdq04n`
**Branch Code:** GAEN
**Idioma:** Inglés
**Cuándo enviar:** Cliente sin certificación previa, en inglés, pregunta por curso/programa de "discover scuba", "try scuba", "first time diving", "we want to try diving", "no experience".

**Contenido literal de la tarjeta:**

> 🤿 Our Try Scuba Diving program is a 1 day experience for beginners that includes a short class to learn the basics about the scuba diving equipment and safety rules, then a pool session and 2 dives in the sea. This is an activity specifically designed for beginners so no previous experience is required. 🎯 Price is 1,750,000 IDR including: ✅ 2 Dives ✅ Pro Dive Instructor ✅ Full Dive Gear ✅ Diving Insurance ✅ Snacks on board 🌊 National Marine Park Fee: For all diving activities in Gili Air there's a 100,000 IDR fee that needs to be paid (by Cash only) for the use of the National Marine Park. This fee is to support conservation efforts put in place by the government. This must be paid only once and you can dive unlimited times. 📅 Please note that while deposits are non-refundable, you can always change your reservation to a different date or another DPM location at no additional charge. Branch Code: GAEN

**Texto recomendado para acompañar el envío de la tarjeta** (incluye precio fijo + calibración):

- "Here you go 🤿 1,750,000 IDR per person — full day with theory, pool and 2 ocean dives. Solo or with someone?"
- "Sending the details 🤿 1,750,000 IDR each. What dates are you thinking?"
- "All the info here 🤿 1,750,000 IDR per person. Any specific date in mind?"

---

## 1.2 Bautizo de Buceo (Gili Air) — ES

**product_id:** `jvp0z08jy7`
**Branch Code:** GAES
**Idioma:** Español
**Cuándo enviar:** Cliente sin certificación previa, en español, pregunta por "bautismo", "bautizo de buceo", "probar el buceo", "primera vez", "sin experiencia".

**Contenido literal de la tarjeta:**

> 🤿 Nuestro programa de Bautizo de Buceo es una experiencia de un día que incluye una breve clase para aprender lo básico sobre el equipo de buceo y las normas de seguridad, luego una sesión en la piscina y 2 inmersiones en el mar. 🎯 El precio es 1,750,000 IDR e incluye: ✅ 2 inmersiones ✅ Instructor profesional de buceo ✅ Equipo de buceo completo ✅ Clase 100% en español ✅ Snacks en barco 🌊 Tasa del Parque Marino Nacional: Para todas las actividades de buceo en Gili Air hay que pagar una tasa de 100.000 IDR (solo en efectivo) por el uso del Parque Marino Nacional. Esta tasa es para apoyar los esfuerzos de conservación puestos en marcha por el gobierno. Es un pago único, por lo que si luego deseas seguir buceando en Gili no tienes que volver a pagarlo. 📅 Ten en cuenta que, si bien los depósitos no son reembolsables, siempre puedes cambiar tu reserva a una fecha diferente u otra ubicación de DPM sin costo adicional. Branch Code: GAES

**Texto recomendado** (incluye precio + calibración):

- "Acá te paso toda la info 🤿 1.750.000 IDR por persona — día completo con teoría, piscina y 2 inmersiones. ¿Van a venir solos o con alguien más?"
- "Te comparto los detalles 🤿 1.750.000 IDR cada uno. ¿Qué fechas estás pensando?"
- "Toda la info acá 🤿 1.750.000 IDR por persona. ¿Tenés alguna fecha en mente?"

---

═══════════════════════════════════════════════════════════════════════
SECCIÓN 2 — REFRESH PARA BUCEADORES CERTIFICADOS
═══════════════════════════════════════════════════════════════════════

## 2.1 Refresh + 2 Dives (Gili Air) — EN

**product_id:** `dh8865lxuc`
**Branch Code:** GAEN
**Idioma:** Inglés
**Cuándo enviar:** Cliente certificado OW o superior, en inglés, cuya última inmersión fue hace más de 1 año (regla Indonesia). Triggers: "haven't dived in years", "been a while", "last dive 2 years ago", etc.

**Contenido literal de la tarjeta:**

> 🤿 The Refresh program is for certified Open Water divers or higher, this includes: 🐠 A brief class to remember the basic concepts of scuba diving 👌 Pool session to practice some skills 🐟 2 dive in the sea to enjoy the stunning marine life of the Gili Islands 🎯 Price is 1,540,000 IDR including: ✅ Professional Divemaster / Instructor ✅ Pool Session + 2 Dives ✅ Full Dive Gear (computer not included, available for rent) ✅ Snacks on board 🌊 National Marine Park Fee: For all diving activities in Gili Air there's a 100,000 IDR fee that needs to be paid (by Cash only) for the use of the National Marine Park. This fee is to support conservation efforts put in place by the government. This must be paid only once and you can dive unlimited times. 📅 Please note that while deposits are non-refundable, you can always change your reservation to a different date or another DPM location at no additional charge. Branch Code: GAEN

**Texto recomendado** (incluye precio + gancho):

- "All set 🤿 1,540,000 IDR — teaches you everything you need to get comfortable again, plus 2 ocean dives same day. When were you thinking of getting back in the water?"
- "Here's the refresh details 🤿 1,540,000 IDR including pool + 2 dives. Afternoon boat has guaranteed turtles 🐢"

---

## 2.2 Refresh + 2 Inmersiones (Gili Air) — ES

**product_id:** `hppagembqp`
**Branch Code:** GAES
**Idioma:** Español
**Cuándo enviar:** Cliente certificado OW o superior, en español, cuya última inmersión fue hace más de 1 año. Triggers: "hace años que no buceo", "última vez fue hace 2 años", "necesito refrescar", etc.

**Contenido literal de la tarjeta:**

> 🤿 El programa Refresh es para buceadores certificados en Open Water o superior, esto incluye: 🐠 Una breve clase para recordar los conceptos básicos del buceo 👌 Sesión de piscina para practicar algunas habilidades 🐟 2 inmersiones en el mar para disfrutar de la impresionante vida marina de las Islas Gili ✅ Tasa del Parque Marino Nacional: Para todas las actividades de buceo en Gili Air hay que pagar una tasa de 100.000 IDR (solo en efectivo) por el uso del Parque Marino Nacional. Esta tasa es para apoyar los esfuerzos de conservación puestos en marcha por el gobierno. Es un pago único, por lo que si luego deseas seguir buceando en Gili no tienes que volver a pagarlo. 📅 Ten en cuenta que, si bien los depósitos no son reembolsables, siempre puedes cambiar tu reserva a una fecha diferente u otra ubicación de DPM sin costo adicional. Branch Code: GAES

**NOTA:** La tarjeta ES omite explícitamente el precio (1.540.000 IDR) y la lista de inclusiones (instructor, piscina, equipo, snacks) — esto parece un error de carga en Meta. Como Colomba SIEMPRE incluye el precio en texto (regla §catalogo-meta-texto del prompt), el cliente igual ve el monto en el chat. Sugerir al equipo de DPM corregir la tarjeta para que también lo traiga embebido.

**Texto recomendado** (incluye precio obligatorio + gancho):

- "Te paso la info 🤿 1.540.000 IDR — incluye instructor, piscina y las 2 inmersiones en el mismo día. ¿Tenés alguna fecha en mente?"
- "Acá los detalles del Refresh 🤿 1.540.000 IDR total. Las tortugas son fijas en el barco de la tarde 🐢"

---

═══════════════════════════════════════════════════════════════════════
SECCIÓN 3 — CERTIFICACIÓN OPEN WATER 30 (EL CABALLO DE BATALLA)
═══════════════════════════════════════════════════════════════════════

## 3.1 Open Water 30 (Gili Air) — EN

**product_id:** `v50zmrpgyy`
**Branch Code:** GAEN
**Idioma:** Inglés
**Cuándo enviar:** Cliente sin certificación quiere certificarse — SIEMPRE preferir OW30 sobre OW básico. Triggers: "open water course", "want to get certified", "diving license".

**Contenido literal de la tarjeta:**

> 👌 The *Open Water 30* is a 3-day program. It's been specifically designed for beginners so no previous experience is required. 🤿 After completion, you'll get certified to dive anywhere in the world to a *max depth of 30 mts (100 feet)*. International and lifetime certificate ;) 🤿 Small groups of maximum *4 students per 1 instructor*. 🏅 This is an *exclusive program developed by DPM Diving*, no other school will be able to offer this insane value offer package that includes: ✅ SSI Open Water international license ✅ SSI Deep Adventurer lifetime recognition ✅ Free DPM Diving T-Shirt ✅ Free Pro Diving Mask + Snorkel ✅ Free Reusable Eco Friendly Bottle ✅ 6 Dives included ✅ Full Dive Gear ✅ Dive insurance ✅ Certified Pro Instructor ✅ All certification fees, no hidden costs. ✅ 50% discount for Fun Dives at DPM Diving Koh Tao ✅ 50% discount for Fun Dives at DPM Diving Koh Phi Phi ✅ 50% discount for Fun Dives at DPM Diving Gili Trawangan ✅ 50% discount for Fun Dives at DPM Diving Nusa Penida The 50% off deal can be used ONCE at every location of DPM Diving. 👉 Pricing: regular grand total for all of the above would be 12.220.000 IDR ❗ Book Now and get the discounted *9.500.000 IDR offer* 🎁 *Save 2.722.000 IDR* 🤯 € Approx price in EUR: 509 - Save 146 EUR £ Approx price in GBP: 434 - Save 124 GBP $ Approx price in USD: 576 - Save 165 USD 🌊 National Marine Park Fee: For all diving activities in Gili Air there's a 100,000 IDR fee that needs to be paid (by Cash only) for the use of the National Marine Park. This fee is to support conservation efforts put in place by the government. This must be paid only once and you can dive unlimited times. 📅 Please note that while deposits are non-refundable, you can always change your reservation to a different date or another DPM location at no additional charge. Branch Code: GAEN

**Texto recomendado** (incluye precio + gancho):

- "Here's the OW30 🤿 9,500,000 IDR — our most popular by far (regular 12,220,000 — you save 2,722,000). Solo or with someone?"
- "Sending the details 🤿 9,500,000 IDR total. The 50% off Fun Dives at our other locations is great if you're traveling through Asia after Gili"

---

## 3.2 Open Water 30 (Gili Air) — ES

**product_id:** `v1u97orycb`
**Branch Code:** GAES
**Idioma:** Español
**Cuándo enviar:** Cliente sin certificación quiere certificarse, en español. SIEMPRE preferir OW30 sobre OW básico.

**Contenido literal de la tarjeta:**

> 👌 El *Open Water 30* es un programa de 3 días. Ha sido diseñado específicamente para principiantes, por lo que no se requiere experiencia previa. 🤿 Una vez finalizado, obtendrás la certificación para bucear en cualquier parte del mundo a una *profundidad máxima de 30 mts*. Certificado internacional y de por vida ;) 🤿 Grupos reducidos de máximo *4 alumnos por 1 instructor*. 🏅 Este es un *programa exclusivo desarrollado por DPM Diving*, ninguna otra escuela podrá ofrecer este paquete de oferta de valor increíble que incluye: ✅ SSI Open Water licencia internacional ✅ Reconocimiento de por vida SSI Deep Adventurer ✅ Camiseta de buceo DPM gratis ✅ Máscara de buceo profesional gratuita + snorkel ✅ Botella de DPM reutilizable ✅ 6 Inmersiones incluidas ✅ Equipo de buceo completo ✅ Seguro de buceo ✅ Instructor profesional certificado ✅ Todas las tasas de certificación, sin costes ocultos. ✅ 50% de descuento en Fun Dives en DPM Diving Koh Tao ✅ 50% de descuento en Fun Dives en DPM Diving Koh Phi Phi ✅ 50% de descuento en Fun Dives en DPM Diving Gili Trawangan ✅ 50% de descuento en Fun Dives en DPM Diving Nusa Penida El 50% de descuento puede utilizarse una vez en cada sede de DPM Diving. 👉 Precio: El valor total para todo lo anterior sería 12.222.000 IDR ❗ Reserva ahora y consigue el precio con descuento de *9.500.000* IDR. 🎁 *Ahorra 2.722.000 IDR* 🤯 € Precio aproximado en EUR: 509 - Ahorra 146 EUR £ Precio aproximado en GBP: 434 - Ahorra 124 GBP $ Precio aproximado en USD: 576 - Ahorra 165 USD 🌊 Tasa del Parque Marino Nacional: Para todas las actividades de buceo en Gili Air hay que pagar una tasa de 100.000 IDR (solo en efectivo) por el uso del Parque Marino Nacional. Esta tasa es para apoyar los esfuerzos de conservación puestos en marcha por el gobierno. Es un pago único, por lo que si luego deseas seguir buceando en Gili no tienes que volver a pagarlo. 📅 Ten en cuenta que, si bien los depósitos no son reembolsables, siempre puedes cambiar tu reserva a una fecha diferente u otra ubicación de DPM sin costo adicional. Branch Code: GAES

**Texto recomendado** (incluye precio + gancho):

- "Te paso el OW30 🤿 9.500.000 IDR — es nuestro programa más vendido (precio regular 12.222.000, te ahorrás 2.722.000). ¿Es solo para vos o son varios?"
- "Acá los detalles 🤿 9.500.000 IDR total. El 50% off Fun Dives en las otras sedes es buenísimo si seguís viajando por Asia"

---

═══════════════════════════════════════════════════════════════════════
SECCIÓN 4 — ADVANCED ADVENTURER (con puente nocturno)
═══════════════════════════════════════════════════════════════════════

## 4.1 Advanced Adventurer (Gili Air) — EN

**product_id:** `9296zkgo1w`
**Branch Code:** GAEN
**Idioma:** Inglés
**Cuándo enviar:** Cliente certificado OW que quiere subir a Advanced. La tarjeta SE ENVÍA — pero Colomba agrega un puente textual sobre el nocturno (ver abajo).

**Contenido literal de la tarjeta:**

> 🐠 The Advanced course takes 2 days, once completed, you will receive a certification to dive anywhere in the world to a max depth of 30 mts (100 ft) 👌 Includes a total of 5 dives, which are stated below: ✅ Perfect Buoyancy ✅ Fish ID ✅ Deep Dive (30m) ✅ Wreck Dive ✅ Navigation ❗ Prerequisites: Open Water Diver certification is required. 💯 This course is a very practical course with no theory, classes or exams. 🎯 Price is 5,400,000 IDR including: ✅ Pro Dive Instructor ✅ SSI Advanced Adventurer Certificate ✅ Full Dive Gear ✅ Snacks on board ✅ 5 Dives 🌊 National Marine Park Fee: For all diving activities in Gili Air there's a 100,000 IDR fee that needs to be paid (by Cash only) for the use of the National Marine Park. This fee is to support conservation efforts put in place by the government. This must be paid only once and you can dive unlimited times. 📅 Please note that while deposits are non-refundable, you can always change your reservation to a different date or another DPM location at no additional charge. Branch Code: GAEN

**Realidad operativa GA + estrategia del puente nocturno:**

En GA el Advanced también ofrece la opción de un nocturno desde la
playa (1 shore dive nocturna en la tarde del día 2), intercambiable
con uno de los 5 dives listados en la tarjeta. Colomba debe
mencionarlo proactivamente en el texto acompañante para que el
cliente sepa que tiene esa flexibilidad.

**Texto recomendado para acompañar la tarjeta** (incluye precio + puente):

- "Here you go 🤿 the Advanced is 5,400,000 IDR — 2 days, 5 dives, no exams. Heads up — in Gili Air you can also pick night dive and swap it for one of the 5 listed on the card 🌙 What dates are you here?"
- "Sending the Advanced details 🤿 5,400,000 IDR total. Quick note — in GA we also offer night dive as a swap option for one of the 5 listed 🌙 When were you thinking?"

**Si el cliente acepta el nocturno:**

Confirmar en texto: "Got it 🤿 we'll swap [whichever] for the night dive — 5:30 PM shore dive on day 2 evening. Locking it in your schedule." y dejar nota en `notes` del contacto para el equipo operativo.

**Si el cliente no muestra interés en el nocturno:**

No insistir. Seguir con la calificación normal (fechas, número de personas, certificación válida).

---

## 4.2 Curso Avanzado (Gili Air) — ES

**product_id:** `mvse75migl`
**Branch Code:** GAES
**Idioma:** Español
**Cuándo enviar:** Idem 4.1 pero en español.

**Contenido literal de la tarjeta:**

> 🐠 El curso Avanzado consta de 2 días, una vez completado recibirás una certificación para bucear en cualquier parte del mundo a una profundidad máxima de 30 mts. 👌 Incluye un total de 5 buceos / 5 aventuras las cuales son: ✅ Flotabilidad perfecta ✅ Identificación de peces ✅ Buceo profundo (30m) ✅ Buceo en barco hundido ✅ Navegación ❗ Requisitos: Previa certificación de Open Water Diver requerida. 🛑 Este curso es totalmente práctico sin teoría, clases o examen. ✅ Tasa de Parque Marino Nacional: Para todas las actividades de buceo en Gili Air hay que pagar una tasa de 100.000 IDR (solo en efectivo) por el uso del Parque Marino Nacional. Esta tasa es para apoyar los esfuerzos de conservación puestos en marcha por el gobierno. Es un pago único, por lo que si luego deseas seguir buceando en Gili no tienes que volver a pagarlo. 📅 Ten en cuenta que, si bien los depósitos no son reembolsables, siempre puedes cambiar tu reserva a una fecha diferente u otra ubicación de DPM sin costo adicional. Branch Code: GAES

**NOTA:** La tarjeta ES no muestra el precio explícitamente en el texto visible (el precio 5.400.000 IDR está fuera del bloque que se ve). Por eso es crítico que Colomba lo agregue siempre en el texto.

**Texto recomendado para acompañar la tarjeta** (incluye precio + puente):

- "Acá los detalles del Advanced 🤿 5.400.000 IDR — 2 días, 5 inmersiones, sin exámenes. Ojo, en Gili Air también está la opción de elegir buceo nocturno y cambiarlo por uno de los 5 que aparecen en la ficha 🌙 ¿Para qué fechas?"
- "Te paso la info del Advanced 🤿 5.400.000 IDR total. Detalle de Gili Air — también podemos sumar buceo nocturno como swap por uno de los 5 listados 🌙 Cuando lo definas me avisás."

---

═══════════════════════════════════════════════════════════════════════
SECCIÓN 5 — ADVENTURE DIVES PARA CERTIFICADOS
═══════════════════════════════════════════════════════════════════════

## 5.1 Deep Adventure + Fun Dive (Gili Air) — ES

**product_id:** `uqgwx0sd9n`
**Branch Code:** GAES
**Idioma:** Español
**Cuándo enviar:** Cliente OW (18m) certificado, en español, que quiere bajar a 30m sin hacer el Advanced completo. Triggers: "quiero llegar a 30m", "solo deep", "no tengo tiempo para el Advanced".

**Contenido literal de la tarjeta:**

> Las aventuras son buceos que forman parte del curso Avanzado, pero sin necesidad de hacer todo el curso. 🐠 La aventura profunda es la más popular de todo el programa de aventuras ya que te permite bucear hasta 30 m incluso siendo certificado de Open Water Diver 18m. 🎯 El precio es de 1,680,000 IDR e incluye: ✅ 2 Inmersiones ✅ Reconocimiento Deep Diver SSI ✅ Instructor de Buceo Profesional de habla hispana ✅ Equipo completo de buceo ✅ Snacks en barco 🌊 Tasa del Parque Marino Nacional... Branch Code: GAES

**NOTA:** No hay versión EN de Deep Adventure + Fun Dive en los 12 IDs confirmados. Para clientes EN que quieran este programa, describir en texto.

**Texto recomendado** (incluye precio + gancho):

- "Acá te paso el Deep Adventure 🤿 1.680.000 IDR — incluye la SSI Deep Adventurer card permanente y 2 inmersiones. ¿Para qué fecha lo estás pensando?"

---

═══════════════════════════════════════════════════════════════════════
SECCIÓN 6 — FUN DIVES (BUCEADORES CERTIFICADOS RECREATIVOS)
═══════════════════════════════════════════════════════════════════════

## 6.1 Fun Dives 2 Dives (Gili Air) — EN

**product_id:** `sij8s9jaot`
**Branch Code:** GAEN
**Idioma:** Inglés
**Cuándo enviar:** Cliente certificado (OW+, Scuba Diver con cert válida, etc.), última inmersión <1 año, quiere bucear recreativamente.

**Contenido literal de la tarjeta:**

> 🤿 For fun dives we have 2 boats a day; morning and afternoon. ✌️ We do 2 dives per trip. 💯 Some of the most popular dive sites around Gili Air are: ✅ Shark Point: Shipwreck & white and black tip sharks. ✅ Turtle Heaven: Nice coral and turtles. ✅ Halik: Coral reef & reef sharks. ✅ Bounty: Underwater platform, nice corals & turtles. 🎯 Price per trip is 1,180,000 IDR including: ✅ 2 Dives ✅ Professional Dive Guide ✅ Full Dive Gear (computer not included, available for rent) ✅ Snacks on board 🌊 National Marine Park Fee... Branch Code: GAEN

**Texto recomendado** (incluye precio + gancho):

- "Here you go 🤿 1,180,000 IDR per trip (2 dives). Morning boat has Shark Point and Bounty (the wreck), afternoon has the turtles. Which one calls you?"
- "All set 🤿 1,180,000 IDR per trip of 2 dives. Quick question, when was your last dive?"

---

## 6.2 Fun Dives 2 Inmersiones (Gili Air) — ES

**product_id:** `qhra0pdpvr`
**Branch Code:** GAES
**Idioma:** Español
**Cuándo enviar:** Idem 6.1 pero en español.

**Contenido literal de la tarjeta:**

> 🤿 Para Fun Dives tenemos 2 barcos al día; mañana y tarde. ✌️ Hacemos 2 inmersiones por cada salida. 💯 Algunos de los sitios de buceo más populares alrededor de Gili Air son: ✅ Shark Point: Barco hundido y tiburones de punta blanca y negra. ✅ Turtle Heaven: Bonitos corales y tortugas. ✅ Halik: Arrecife de coral y tiburones de arrecife. ✅ Bounty: Plataforma hundida, corales y tortugas. 🎯 El precio por salida es de 1,180,000 IDR e incluye: ✅ 2 inmersiones ✅ Guía profesional de buceo ✅ Equipo de buceo (Ordenador no incluido, disponible en alquiler) ✅ Snacks en barco 🌊 Tasa del Parque Marino Nacional... Branch Code: GAES

**Texto recomendado** (incluye precio + gancho):

- "Acá los Fun Dives 🤿 1.180.000 IDR por salida (2 inmersiones). Barco AM tiene Shark Point y Bounty (el barco hundido), tarde tiene las tortugas. ¿Cuál te tira más?"
- "Te paso la info 🤿 1.180.000 IDR por salida de 2 inmersiones. ¿Cuándo fue tu última inmersión?"

---

═══════════════════════════════════════════════════════════════════════
SECCIÓN 7 — ESPECIALIDADES
═══════════════════════════════════════════════════════════════════════

## 7.1 Nitrox Specialty (Gili Air) — EN

**product_id:** `bvsdwsstj7`
**Branch Code:** GAEN
**Idioma:** Inglés
**Cuándo enviar:** Cliente certificado OW o superior, en inglés, que pregunta por nitrox, enriched air, o quiere extender bottom time.

**Contenido literal de la tarjeta:**

> Includes Theory + Dives. As a Nitrox diver you can reduce your surface intervals and extend your bottom durations, allowing you to spend more time diving and less time waiting. In this program you will gain new skills and expand your diving knowledge while studying how to properly plan and dive with enriched air mixtures that contain up to 40% oxygen. You will receive an SSI Enriched Air Nitrox 32% or 40% certification after completing the course and exam. ✅ National Marine Park Fee... Branch Code: GAEN

**NOTA:** La tarjeta omite el precio (3.200.000 IDR según KB-01). Como Colomba SIEMPRE incluye el precio en texto (regla §catalogo-meta-texto del prompt), el cliente igual lo ve. Sugerir al equipo de DPM agregarlo a la tarjeta.

**Texto recomendado** (incluye precio obligatorio + calibración):

- "Here's the Nitrox info 🤿 3,200,000 IDR for theory + dives. Have you done any specialty courses before?"
- "Sending the Nitrox details 🤿 3,200,000 IDR. Are you already Advanced or higher?"

---

═══════════════════════════════════════════════════════════════════════
PROGRAMAS GA SIN TARJETA META (describir en texto siempre)
═══════════════════════════════════════════════════════════════════════

Estos programas se ofrecen en GA pero NO tienen una tarjeta Meta confirmada
en los 12 IDs aprobados por el equipo. Para estos, Colomba arma la respuesta
en texto siguiendo §estructura-mensaje-info del prompt y citando los datos
de KB-01.

- **Scuba Diver (1 día, 12m, 4.600.000 IDR)** — tarjeta visible en catálogo pero con Branch Code "GTEN" (error de carga). Confirmado con DPM que el programa SÍ se vende en GA. Por ahora describir en texto.
- **Open Water básico (18m, 6.400.000 IDR)** — sin tarjeta confirmada. Siempre se ofrece junto al OW30 (que sí tiene tarjeta) como alternativa más económica.
- **Refresh + Advanced combo (5.950.000 IDR)** — sin tarjeta. Solo ofrecer cuando hay riesgo de perder la venta del Advanced por el Refresh.
- **Deep Adventure + Fun Dive en EN** — solo existe en ES (`uqgwx0sd9n`). Para clientes EN describir en texto.
- **Night Adventure (1.090.000 IDR)** — sin tarjeta. Describir en texto.
- **Night Fun Dive (700.000 IDR)** — sin tarjeta. Solo para Advanced certificados o con Night Adventurer card.
- **Deep Diving Specialty (curso completo, no el adventure)** — visible en catálogo (GAEN) pero ID no confirmado en lista top-sellers. Si el cliente pregunta, describir en texto.
- **React Right (2.400.000 IDR, 2 años de validez)** — visible en catálogo (GAEN) pero ID no confirmado. Describir en texto.
- **Stress & Rescue (6.400.000 IDR, 3 días)** — sin tarjeta confirmada. Describir en texto.
- **Wreck / Drift / Perfect Buoyancy Specialty** — sin tarjeta. Describir en texto.
- **Upgrades a OW (Basic→OW, Scuba Diver→OW)** — sin tarjeta. Describir en texto.

---

═══════════════════════════════════════════════════════════════════════
DECISIONES Y TODOs CONFIRMADOS CON DPM
═══════════════════════════════════════════════════════════════════════

**Confirmado 2026-05-15:**

1. **Advanced GA — patrón "tarjeta + puente nocturno".** Las tarjetas Meta de Advanced (`9296zkgo1w` EN y `mvse75migl` ES) SÍ se envían, pero el texto acompañante incluye un puente corto que aclara la opción del nocturno como swap por uno de los 5 dives listados. Ver §catalogo-meta-advanced del prompt. Esto mantiene la tarjeta oficial intacta y le da al cliente más opciones operativas.

2. **Cuenta USD es la de Koh Tao** (silenciosa). Si el cliente pregunta por qué el beneficiario es "Dpm Diving" en vez de "DPM Diving Gili Air LLC", responder: "es nuestra cuenta corporativa para USD, todo va al mismo grupo".

3. **Scuba Diver de Gili Air tiene Branch Code "GTEN"** en la tarjeta del catálogo Meta — error de carga, debe corregirse a "GAEN". Hasta entonces NO se envía esta tarjeta y Scuba Diver se describe en texto.

4. **Regla universal: precio SIEMPRE en texto.** Colomba siempre agrega el precio del programa en su mensaje de texto, aunque la tarjeta ya lo traiga. Es defensivo (algunas tarjetas omiten precio por bug de carga) y reforza el cierre porque el monto queda referenciable en el chat. Ver regla §catalogo-meta-texto del prompt.

**TODOs pendientes con DPM (no bloquean producción, son mejoras):**

1. Actualizar tarjetas Meta de Advanced (EN: `9296zkgo1w`, ES: `mvse75migl`) para reflejar oficialmente que el nocturno es una opción seleccionable de Gili Air. Esto eliminaría el "puente textual" de Colomba.
2. Corregir Branch Code de Scuba Diver Gili Air EN (cambiar GTEN → GAEN). Una vez corregido, agregar el ID a la lista ALLOWED_PRODUCT_IDS_GA del server.
3. Agregar precio + inclusiones a la tarjeta ES del Refresh (`hppagembqp`) — actualmente falta la línea "El precio es 1.540.000 IDR e incluye...".
4. Agregar precio a la tarjeta de Nitrox EN (`bvsdwsstj7`) — actualmente solo dice "Includes Theory + Dives" sin monto.
5. **Identificar a qué programas corresponden los 7 IDs faltantes** que aparecen en la lista de top-sellers GA: `35metujcwu`, `79rx9lo14l`, `pc9ms617ix`, `te6y3jud4q`, `u4nwdc16qx`, `xf7wted2mo`, `zdpkxdjrcc`. Candidatos probables: Scuba Diver ES, Open Water básico EN/ES, Curso Open Water (Gili Air) ES (visible en captura pero ID no leído), Deep Adventure + FD EN, Night Adventure, Night Fun Dive, React Right ES, Stress & Rescue, Nitrox ES.

   Cuando se identifiquen, agregar a este KB-07 y a la lista cerrada del server (ver TOOL SPEC).

---

**Fin de KB-07.**
