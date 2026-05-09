# DPM Diving — Snippets Textos

**Versión:** 2026-05-08
**Sede:** Gili Trawangan + Genéricos Indonesia
**Uso:** Referencia para system prompt y KB del AI Agent John

> ⚠️ Texto literal cargado en Respond.io. NO modificar al pasarlo al AI.
> John debe usar estos textos como referencia para NO duplicarlos ni reescribirlos en sus propias respuestas.

---

## ÍNDICE

### Sección 1 — Workflow post-confirmación (auto-disparados por tag `deposit_paid`)
1. `GTENPaperwork` / `GTESPAPERWORK` — Confirmación reserva
2. `GTENSizes` / `GTESSizes` — Datos personales y tallas
3. `GTENPreDiveTips` / `GTESPreDiveTips` — Tips pre-buceo
4. `GTENSSIApp` / `GTESSSIApp` — App SSI
5. `GTENlocation` / `GTESlocation` — Ubicación centro
6. `GTENaccommodation` / `GTESaccommodation` — Hoteles recomendados
7. `GTENQuma` / `GTESQuma` — Maps Quma standalone

### Sección 2 — Genéricos (invocables por John en conversación)
8. `GENENMedical` / `GENESMedical` — Cuestionario médico SSI
9. `INDOENFerryInfo` / `INDOESFerryInfo` — Fast boats / 12go
10. `GTENClosingDays` / `GTESClosingDays` — Días de cierre

---

## SECCIÓN 1 — WORKFLOW POST-CONFIRMACIÓN

> Estos 7 snippets se disparan automáticamente por el workflow `DPM GT - Onboarding Piloto` cuando el server aplica el tag `deposit_paid`. John NO debe duplicarlos ni anticiparlos en conversación pre-depósito.

### 1. GTENPaperwork / GTESPAPERWORK
**Categoría:** Gili Trawangan · Confirmación post-depósito
**Variables:** `$contact.programa`, `$contact.start_date`, `$contact.pax`

**EN:**
```
All set for your $contact.programa on $contact.start_date for $contact.pax diver(s)! 😃 Next step is to swing by the dive shop the day before you start your activity, so we can get you registered and verify your dive gear sizes. Our office hours are from 8am to 6pm 👩‍💼🏢 Looking forward to seeing you in Gili Trawangan! 🤿
```

**ES:**
```
¡Todo listo para tu $contact.programa el $contact.start_date para $contact.pax buceador(es)! 😃 El siguiente paso es pasarte por el centro de buceo el día anterior a tu actividad para que podamos registrarte y verificar las tallas de tu equipo. Nuestro horario de oficina es de 8am a 6pm 👩‍💼🏢 ¡Te esperamos en Gili Trawangan! 🤿
```

---

### 2. GTENSizes / GTESSizes
**Categoría:** Gili Trawangan · Captura datos personales

**EN:**
```
Thank you for choosing DPM Diving Gili Trawangan! 🙂 Please share the following info for all divers 👇 Full Name: Date of birth (DD/MM/YYYY): Passport#: Have diving certification?: Amount of dives: Date of last dive: 📎 Photo of certification (both sides) Sizes (diving gear) 🤿 T-Shirt: Shoes:
```

**ES:**
```
¡Muchas gracias por elegir DPM Diving Gili Trawangan! 🙂 Por favor compartí la siguiente info de todos los buceadores 👇 Nombre completo: Fecha de nacimiento (DD/MM/AAAA): Nro. pasaporte: ¿Tenés certificación de buceo?: Cantidad de inmersiones: Fecha de última inmersión: 📎 Foto de la certificación (ambos lados) Tallas (equipo de buceo) 🤿 Camiseta: Calzado:
```

---

### 3. GTENPreDiveTips / GTESPreDiveTips
**Categoría:** Gili Trawangan · Tips pre-buceo

**EN:**
```
A few quick tips before your diving day with us 🤿😎 🛌 Get a good night's sleep before your activity 💧 Stay well hydrated — no alcohol 12hs before diving 🍽 Have a light meal before, nothing heavy 🌞 Bring sunscreen (reef-safe if possible 🐠) 🩳 Swimsuit, towel and a change of clothes 👓 If you wear glasses or contacts, let us know — we have prescription masks available ✈️ Very important: do NOT fly within 24hs after your last dive If you're feeling unwell or have any health concerns the morning of your dive, please tell us — safety always comes first 🙏 Any questions, we're here for you 🤿
```

**ES:**
```
Algunos consejos rápidos antes de tu día de buceo con nosotros 🤿😎 🛌 Dormí bien la noche previa a la actividad 💧 Mantenete bien hidratado — nada de alcohol 12hs antes de bucear 🍽 Comé liviano antes, nada pesado 🌞 Llevá protector solar (preferentemente reef-safe 🐠) 🩳 Traje de baño, toalla y muda de ropa 👓 Si usás anteojos o lentes de contacto, avisanos — tenemos máscaras graduadas disponibles ✈️ Muy importante: NO volar dentro de las 24hs después de tu última inmersión Si te sentís mal o tenés alguna duda médica la mañana del buceo, avisanos — la seguridad siempre va primero 🙏 Cualquier consulta, acá estamos 🤿
```

---

### 4. GTENSSIApp / GTESSSIApp
**Categoría:** Gili Trawangan · App SSI
**Centro de entrenamiento SSI:** 741421 / DPM Gili Trawangan

**EN:**
```
My SSI app 😎🤿 In order to speed things up, we ask you to kindly download according to your OS and create an account. You'll need to enter your email twice for verification. Our training centre number is 741421 / DPM Gili Trawangan 🙂 ANDROID 🖥 https://play.google.com/store/apps/details?id=com.divessi.ssi IOS - iPhone 🖥 https://apps.apple.com/us/app/myssi-3-0/id1249389209 Let us know if you have any questions 😁🙏
```

**ES:**
```
Mi app SSI 😎🤿 Para agilizar todo, te pedimos descargar la app SSI según tu sistema operativo y crear una cuenta. Vas a tener que ingresar tu email dos veces para verificarlo. Nuestro número de centro de entrenamiento es 741421 / DPM Gili Trawangan 😀 ANDROID 📱 https://play.google.com/store/apps/details?id=com.divessi.ssi iPhone 📱 https://apps.apple.com/us/app/myssi/id1249389209 ¡Avisanos si tenés alguna duda! 😁🙏
```

---

### 5. GTENlocation / GTESlocation
**Categoría:** Gili Trawangan · Ubicación centro

**EN:**
```
This is the location of our dive center in Gili Trawangan 👇🏻🤿 https://www.google.com/maps/search/Dpm+Diving+Gili+Trawangan/@-8.3460334,116.0413900,17z
```

**ES:**
```
Esta es la ubicación de nuestro centro de buceo en Gili Trawangan 👇🏻🤿 https://www.google.com/maps/search/Dpm+Diving+Gili+Trawangan/@-8.3460334,116.0413900,17z
```

---

### 6. GTENaccommodation / GTESaccommodation
**Categoría:** Gili Trawangan · Hoteles recomendados (Quma + Green Banana)

**EN:**
```
Here are our top recommended hotels in Gili Trawangan 🏠 🌴 QUMA Boutique Hotel — Adults Only (4★) Our #1 recommendation. Located right next to our dive center — the most convenient option for your stay. Outdoor pool, garden, free WiFi, and an excellent restaurant serving Indonesian, Italian and Japanese cuisine. ⚠️ Adults only — not suitable for guests under 18. 📞 +62 859 51406855 📍 https://maps.app.goo.gl/uyCT96NfsScVWbfP7 🌳 Green Banana (3★) A great alternative — 2 min walk from the beach, 5 min from the harbor. Garden, terrace, bar and laundry service. Rooms with garden views and private bathrooms. Family friendly. 📞 +62 81239786629 📍 https://maps.app.goo.gl/rkXcvBxeKotithvc7 Let us know if you need any other recommendations 😊🤿
```

**ES:**
```
Aquí están nuestros hoteles recomendados en Gili Trawangan 🏠 🌴 QUMA Boutique Hotel — Solo Adultos (4★) Nuestra recomendación #1. Ubicado al lado de nuestro centro de buceo — la opción más conveniente para tu estadía. Pileta al aire libre, jardín, WiFi gratis y un excelente restaurante con comida indonesia, italiana y japonesa. ⚠️ Solo adultos — no apto para menores de 18. 📞 +62 859 51406855 📍 https://maps.app.goo.gl/uyCT96NfsScVWbfP7 🌳 Green Banana (3★) Una excelente alternativa — a 2 minutos a pie de la playa y 5 minutos del puerto. Jardín, terraza, bar y servicio de lavandería. Habitaciones con vistas al jardín y baño privado. Apto para familias. 📞 +62 81239786629 📍 https://maps.app.goo.gl/rkXcvBxeKotithvc7 ¡Avisanos si necesitás otras recomendaciones! 😊🤿
```

---

### 7. GTENQuma / GTESQuma
**Categoría:** Gili Trawangan · Maps Quma standalone

**EN:**
```
Here is our recommended accommodation in Gili Trawangan 🏠 Quma Hotel 🌴 https://maps.app.goo.gl/qmbzy2QjhgsdiSn76 It is conveniently located close to our dive center, perfect for your stay! Let us know if you need any further assistance 😊🤿
```

**ES:**
```
Aquí está nuestro alojamiento recomendado en Gili Trawangan 🏠 Quma Hotel 🌴 https://maps.app.goo.gl/qmbzy2QjhgsdiSn76 Está convenientemente ubicado cerca de nuestro centro de buceo, perfecto para tu estadía. ¡Haznos saber si necesitas más ayuda! 😊🤿
```

---

## SECCIÓN 2 — GENÉRICOS

> Estos snippets pueden ser invocados por John en conversación cuando el cliente pregunte por los temas correspondientes (médica, ferries, días feriados). NO los reescribas — invocá el snippet o cita el texto literal.

### 8. GENENMedical / GENESMedical
**Categoría:** Genérico · Cuestionario médico SSI
**Tag Respond.io:** MEDICAL
**📎 Adjuntos:** PDFs del cuestionario médico SSI (EN + ES) están adjuntos al snippet en Respond.io. Solo se envían post-depósito vía workflow. John NO debe enviar el cuestionario antes del pago.

**EN:**
```
Hey! Quick health check before your dive day 🤿 📎 Attached is the SSI Medical Questionnaire (the standard form used worldwide for diving). You don't need to fill it out — just read it and reply with: ✅ "All NO" if you answered NO to all 10 questions on page 1, plus your age ⚠️ The question number(s) if you answered YES to anything (page 1 or 2), plus your age A YES doesn't mean you can't dive — it just means we may need a quick doctor's approval first. Most conditions are perfectly fine for diving 👌 Thanks for being honest, safety always comes first 🙏
```

**ES:**
```
¡Hola! Chequeo rápido de salud antes del día de buceo 🤿 📎 Adjunto va el Cuestionario Médico de SSI (el formulario estándar usado en buceo en todo el mundo). No hace falta que lo completes — solo leelo y respondé con: ✅ "Todas NO" si respondiste NO a las 10 preguntas de la página 1, más tu edad ⚠️ El o los número(s) de pregunta si respondiste SÍ a algo (página 1 o 2), más tu edad Un SÍ no significa que no puedas bucear — solo que capaz necesitamos una aprobación rápida de tu médico primero. La mayoría de condiciones son totalmente compatibles con el buceo 👌 ¡Gracias por la honestidad, la seguridad siempre va primero! 🙏
```

---

### 9. INDOENFerryInfo / INDOESFerryInfo
**Categoría:** Genérico Indonesia · Fast boats / 12go

**EN:**
```
Here is the best website to buy your inter-island ferry tickets 👇🏽🎫🎟 https://12go.asia Whether you're traveling from Bali to Nusa Penida, Gili Trawangan or even Lombok. Easier and convenient as ferry timings and prices are listed on the site 🚢
```

**ES:**
```
Aquí tienes la mejor web para comprar tus billetes de ferry entre islas 👇🏽🎫🎟 https://12go.asia Ya sea que viajes de Bali a Nusa Penida, Gili Trawangan o incluso Lombok. Es más fácil y conveniente, ya que los horarios y precios de los ferris están listados en la web 🚢
```

---

### 10. GTENClosingDays / GTESClosingDays
**Categoría:** Gili Trawangan · Días de cierre del centro

**EN:**
```
We're open year-round in Gili Trawangan! 🤿 The dive center only closes 2 days a year: 🎄 December 25 (Christmas) 🎆 January 1 (New Year) If your course is already in progress and falls on those days, we just pause and continue the next day — you won't lose any dives 👌
```

**ES:**
```
¡Estamos abiertos todo el año en Gili Trawangan! 🤿 El centro de buceo solo cierra 2 días al año: 🎄 25 de diciembre (Navidad) 🎆 1 de enero (Año Nuevo) Si tu curso ya está en marcha y cae uno de esos días, simplemente pausamos y continuamos al día siguiente — no perdés ninguna inmersión 👌
```

---

## NOTAS IMPORTANTES PARA EL AI AGENT (John)

### Reglas de uso de snippets

1. **No duplicar contenido del workflow.** Los 7 snippets de la Sección 1 son disparados automáticamente post-depósito. John NO debe enviarlos manualmente ni anticipar su contenido en conversación pre-pago.

2. **Solo lenguaje del cliente.** Si el cliente escribe en español, usar exclusivamente snippets `GTES*` / `GENES*` / `INDOES*`. Si escribe en inglés, usar `GTEN*` / `GENEN*` / `INDOEN*`.

3. **Cuestionario médico — protocolo estricto.** El PDF del cuestionario médico SSI se envía ÚNICAMENTE post-depósito vía el workflow GT. Si un cliente pregunta por temas médicos antes de pagar, John puede mencionar que se le pedirá completar un cuestionario estándar de SSI tras la confirmación de la reserva, pero NO debe enviar el PDF ni reproducir el contenido literal del cuestionario.

4. **Preferencia por invocación de snippet vs reescritura.** Si John necesita comunicar la info de uno de estos 10 snippets, debe invocar el snippet por nombre (ej. `/GTESlocation`) en lugar de reescribir el texto en sus propias palabras. Esto garantiza consistencia y evita información desactualizada.

### Variables de contacto usadas

Solo `GTENPaperwork` / `GTESPAPERWORK` usan variables dinámicas:
- `$contact.programa` — Programa contratado (ej. "Open Water", "Try Scuba")
- `$contact.start_date` — Fecha de inicio de la actividad
- `$contact.pax` — Cantidad de buceadores

Estos campos los popula el server cuando aplica el tag `deposit_paid`, antes de que dispare el workflow.

### Escalación

Si el cliente solicita info que no está en estos snippets ni en el resto del KB de John, John debe aplicar el tag `ai_escalation` para que un agente humano del equipo Agents tome la conversación.

---

**Última actualización:** 2026-05-08
**Próxima revisión sugerida:** después de la primera semana del piloto (verificar que los textos siguen vigentes y que no hay snippets nuevos)
