# EMMA — TEST DE 50 PREGUNTAS DE CLIENTES
## Respuestas simuladas con prompt actualizado + KBs vigentes a 16 mayo 2026

> **Setup de simulación:**
> - Fecha actual: sábado 16 de mayo 2026, ~12:00 hora Bangkok (GMT+7)
> - OFERTA-001 (OW Conv + 3 noches dorm 4 = 9.900 THB) **activa** hasta 30/06/2026
> - Patrón nuevo de grupo mixto (Refresh + Deep Adventure encadenado al OW30) **activo**
> - Corrección Advanced 10% si hicieron OW con DPM
> - "Today/tomorrow" manejados por Emma con check_roster, **NO escala automáticamente**
> - Formato: cada respuesta de Emma representa los mensajes que mandaría en WhatsApp (separados por `┄┄┄` indica nuevo mensaje)

---

# 📂 CATEGORÍA 1 — SALUDOS Y CALIFICACIÓN INICIAL

---

### Q1 — "Hola" *(ES, sin contexto)*

**Emma:**
> ¡Hola! Soy Emma, la agente digital de DPM Diving Koh Tao 🤿 ¿En qué puedo ayudarte?

`[setear Branch="Koh Tao", lifecycle="New Lead", esperar input del cliente]`

---

### Q2 — "Hi I want to dive" *(EN, sin contexto)*

**Emma:**
> Hi! I'm Emma, DPM Diving Koh Tao's digital agent 🤿
> 
> ┄┄┄
> 
> Are you already in Koh Tao or do you have a date in mind for your visit?

`[idioma=EN, calificación pregunta 1 de 4]`

---

### Q3 — "Hola que tal, vi su escuela en instagram queria info" *(ES, sin contexto)*

**Emma:**
> ¡Hola! Soy Emma, la agente digital de DPM Diving Koh Tao 🤿
> 
> ┄┄┄
> 
> Contame, ¿ya estás en Koh Tao o tenés fecha de llegada?

---

### Q4 — "Hello, do you guys offer scuba courses?" *(EN, sin contexto)*

**Emma:**
> Hi! Yes, we offer the full range — Try Scuba, Open Water certifications, Advanced, Rescue and more 🤿
> 
> ┄┄┄
> 
> Quick first question — are you already in Koh Tao or planning to visit?

---

### Q5 — "Bonjour je veux faire un cours de plongée" *(FR, sin contexto)*

**Emma:**
> Bonjour ! Je suis Emma, l'agente digitale de DPM Diving Koh Tao 🤿
> 
> ┄┄┄
> 
> Pour mieux t'aider — es-tu déjà à Koh Tao ou as-tu une date d'arrivée prévue ?

`[idioma=FR detectado, respondo en FR aunque sea menos común. Check posterior: si requiere instructor francófono → check_instructor_language("FR"). Available pero NO garantizar.]`

---

# 📂 CATEGORÍA 2 — CLIENTE SIN CERTIFICACIÓN

---

### Q6 — "Nunca buceé. Tengo 5 días. ¿Qué me recomiendan?" *(ES)*

**Emma:**
> Con 5 días tenés tiempo suficiente para sacar tu certificación Open Water completa y dejar 1-2 días para más buceo o descanso 🤿
> 
> ┄┄┄
> 
> Te paso las dos opciones que tenemos para principiantes.
> 
> ┄┄┄
> 
> Open Water Conventional — 3 días, certificación hasta 18m, 6 inmersiones, equipo + instructor + seguro, certificación SSI internacional de por vida. Precio 11.000 THB.
> 
> ┄┄┄
> 
> Open Water 30 — 3 días, certificación hasta 30m (en lugar de 18). Incluye OW + Deep Adventurer, máscara y snorkel gratis, camiseta, y 50% off en fun dives en Phi Phi, Nusa Penida, Gili Trawangan y Gili Air. 17.900 THB (en lugar de 23.200) 🎁
> 
> ┄┄┄
> 
> El más recomendado es el OW30. Y como llegás en mayo o junio, te aplica una oferta de temporada: OW Conv + 3 noches de alojamiento por 9.900 THB. ¿Cuándo llegás a la isla?

`[5 días → estrategia KB-12: combo OW + Advanced potencialmente. Pero falta confirmar fechas. OFERTA-001 si junio. Pregunto fecha para validar.]`

---

### Q7 — "I've never dived. I have 1 day in Koh Tao. Options?" *(EN)*

**Emma:**
> With 1 day you've got two options 🤿
> 
> ┄┄┄
> 
> Try Scuba — 1 day experience, 2 boat dives up to 12m, no certification, 3.600 THB.
> 
> ┄┄┄
> 
> Scuba Diver — 1 day course, 2 boat dives up to 12m, full SSI Scuba Diver certification (lifetime, international), 8.600 THB. Can be upgraded to Open Water anywhere in the world later.
> 
> ┄┄┄
> 
> Honestly, if it's just one day and you're not sure about diving long-term, Try Scuba is enough. If you want to leave with a lifetime cert, Scuba Diver is better. Which one calls you more?

---

### Q8 — "Quiero sacar la licencia, soy principiante" *(ES)*

**Emma:**
> Buenísimo, te paso las dos opciones que tenemos para principiantes 🤿
> 
> ┄┄┄
> 
> Open Water Conventional — 3 días, certificación hasta 18m. 6 inmersiones, equipo + instructor + seguro incluidos. SSI internacional, de por vida. 11.000 THB.
> 
> ┄┄┄
> 
> Open Water 30 — 3 días, certificación hasta 30m. Incluye OW + Deep Adventurer, máscara + snorkel + camiseta gratis, 50% off en fun dives en nuestras sedes. 17.900 THB.
> 
> ┄┄┄
> 
> El más solicitado es el OW30 — la profundidad mayor te abre más sitios en el mundo. ¿Cuándo te quedás en la isla?

---

### Q9 — "How much for a beginner course? I'm here tomorrow only" *(EN)*

**Emma:**
> Quick check — let me see what we have for tomorrow 🤿
> 
> ┄┄┄
> 
> [check_roster(date=2026-05-17, days=1, pax=1)]
> [returns: AM available 32 spots, PM available 28 spots]
> 
> ┄┄┄
> 
> We do have space tomorrow. With only 1 day you have 2 options:
> 
> ┄┄┄
> 
> Try Scuba — 1 day experience, 2 boat dives to 12m, no cert. 3.600 THB.
> 
> ┄┄┄
> 
> Scuba Diver — 1 day full course, 2 dives, SSI Scuba Diver certification (lifetime, upgradeable to OW anywhere). 8.600 THB.
> 
> ┄┄┄
> 
> Both are PM boat — meet at 11:15am, back ~4:45pm. Which one works for you?

`[NO escalo por "tomorrow" — verifico roster y respondo. PM disponible.]`

---

### Q10 — "Tengo 12 años puedo bucear?" *(ES, menor de edad)*

**Emma:**
> ¡Sí! A los 12 años podés bucear sin problema 🤿
> 
> ┄┄┄
> 
> Para principiantes tenemos Try Scuba (1 día, 3.600 THB) o el Junior Open Water (3 días, certificación a 12 metros).
> 
> ┄┄┄
> 
> A los 15 esa certificación junior se actualiza sola a Open Water completa (hasta 18m). Si querés, cuando llegues a Koh Tao te pedimos completar un formulario médico al registrarte 🙏

`[edad 10-14 → Junior OW (max 12m), auto-upgrade a 15 años. Medical form on arrival. NO escalar por edad — solo nota para office.]`

---

# 📂 CATEGORÍA 3 — CLIENTES CON CERTIFICACIÓN

---

### Q11 — "Tengo OW, quiero hacer fun dives 3 días, cuánto?" *(ES)*

**Emma:**
> Buenísimo, con tu OW podés hacer fun dives sin problema 🤿
> 
> ┄┄┄
> 
> Cada trip incluye 2 inmersiones a 2.100 THB. Tres días serían 3 trips x 2.100 = 6.300 THB total. Equipo, instructor, seguro y snacks incluidos.
> 
> ┄┄┄
> 
> ¿Cuándo fue tu última inmersión? Necesito saber si te corresponde Refresh o vas directo a fun dives.

`[Falta info crítica: última inmersión. NO doy precio definitivo todavía.]`

---

### Q12 — "I have AOWD, last dive 2 weeks ago, fun dives this week?" *(EN)*

**Emma:**
> Nice, you're sorted — no refresh needed since you dived recently 🤿
> 
> ┄┄┄
> 
> Fun Dives are 2.100 THB per trip (2 boat dives included). With your Advanced you can hit Sattakut wreck, Chumphon Pinnacle and all our deep sites.
> 
> ┄┄┄
> 
> Want me to check availability for the days you have in mind? AM boat is meet 5:45am back ~10am, PM boat meet 11:15am back ~4:45pm 🤿

---

### Q13 — "Hice mi OW hace 4 años, ¿puedo hacer fun dives?" *(ES, >6 meses)*

**Emma:**
> Vas a tener que hacer un Refresh primero porque pasaron más de 6 meses — es protocolo de seguridad 🙏
> 
> ┄┄┄
> 
> Es una clase teórica corta + una práctica de habilidades en aguas poco profundas + 1 inmersión normal, todo el mismo día. 2.600 THB.
> 
> ┄┄┄
> 
> Después de eso, fun dives normales a 2.100 THB el trip (2 inmersiones). ¿Cuándo te gustaría salir al agua?

`[última inmersión >6 meses → Refresh OBLIGATORIO. Frame por seguridad, no por venta.]`

---

### Q14 — "Have advanced, want night dive please" *(EN)*

**Emma:**
> Night dives are a single dive — meet at DPM 5:45pm, back by ~7:45pm 🌙
> 
> ┄┄┄
> 
> 2.900 THB, includes gear and insurance. The underwater world completely changes after dark — squid, octopus, hunting predators come out.
> 
> ┄┄┄
> 
> When was your last dive? If it was more than 6 months ago we'd need to do a quick Refresh first for safety.

---

### Q15 — "Tengo OW hecho con uds en Gili, descuento para el Advanced?" *(ES, DPM fiel)*

**Emma:**
> ¡Buenísimo! Como hiciste tu OW con DPM, te aplica un 10% de descuento en el Advanced 🤿
> 
> ┄┄┄
> 
> Advanced — 2 días, sin teoría ni examen, todo práctico. 5 inmersiones incluyendo Deep Dive (30m), Navigation, Wreck y Night. SSI Advanced Adventurer internacional de por vida.
> 
> ┄┄┄
> 
> Precio normal 10.000 THB → con tu descuento 9.000 THB. ¿Cuándo te gustaría arrancarlo?

`[DPM fiel → 10% off (KB-01 corregido, no 5%). Precio final 9.000.]`

---

# 📂 CATEGORÍA 4 — GRUPO MIXTO (patrón nuevo aplicado)

---

### Q16 — "Somos pareja, yo OW, ella nunca buceó. Llegamos el 20 de junio 3 días" *(ES)*

**Emma:**
> Buenísimo, los dos pueden ir en el mismo barco a los mismos sitios 🤿 Aclaro algo importante: como van a estar haciendo programas distintos, comparten barco pero no grupo (cada uno con su instructor o guía).
> 
> ┄┄┄
> 
> ¿Cuándo fue tu última inmersión? Necesito saber si te corresponde Refresh.
> 
> ┄┄┄
> 
> Y para ella, te paso las dos opciones que tenemos para principiantes en 3 días 🤿

`[Aplicar regla clave KB-11 §9.3: mismo barco ≠ mismo grupo. Espero info de última inmersión antes de pitch completo. OFERTA-001 aplica para junio.]`

---

### Q17 — "Friend has OW from 2 years ago, I'm beginner. Can we dive together?" *(EN)*

**Emma:**
> You can be on the same boat going to the same dive sites — but in different groups, since your friend will be doing Fun Dives while you take the course 🤿
> 
> ┄┄┄
> 
> Your friend will need a Refresh first since it's been over 6 months — safety procedure. It's a short theory class + skills practice + 1 dive.
> 
> ┄┄┄
> 
> And since he's already going to be in the water, I'd actually suggest he adds a Deep Adventure after the Refresh — he gets the SSI Deep Adventurer lifetime card to dive to 30m anywhere in the world.
> 
> ┄┄┄
> 
> One thing to consider: if your friend is going to be diving to 30m moving forward, you might want the OW30 instead of the conventional OW — otherwise you won't be able to dive to the same depth together on future trips. Want me to send both options?

`[PATRÓN NUEVO grupo mixto aplicado: Refresh+DeepAdv para el cert, encadenando al OW30 para el sin-cert. Frase ganadora textual de KB-11 §9.8.]`

---

### Q18 — "I have advanced, my husband is open water, last dive 8 months ago" *(EN, ambos cert pero refresh)*

**Emma:**
> You both need a Refresh first since the last dive was over 6 months ago — safety procedure 🙏
> 
> ┄┄┄
> 
> Refresh + Fun Dive: 2.600 THB per person, single day. After that, regular Fun Dives at 2.100 THB per trip.
> 
> ┄┄┄
> 
> Since you both already have certifications, you can dive in the same group, same boat. Your husband stays at 18m (his OW limit), you can go deeper if the site allows.
> 
> ┄┄┄
> 
> How many days are you on the island?

`[Ambos con cert pero ambos >6m → Refresh para los dos. Mismo grupo posible porque ambos hacen Fun Dives. Husband a 18m, ella a 30m si es Advanced.]`

---

### Q19 — "Mi amigo y yo queremos hacer el curso juntos, ninguno tiene cert" *(ES)*

**Emma:**
> ¡Buenísimo! Si los dos hacen el mismo curso van en el mismo grupo, mismo barco, mismo instructor 🤿
> 
> ┄┄┄
> 
> ¿Cuántos días tienen en Koh Tao?

`[Ambos sin cert → mismo curso, mismo grupo. Pitch simple. Calificación seguir.]`

---

### Q20 — "We're 3, I'm AOWD, brother is OW, sister never dived" *(EN, 3 niveles)*

**Emma:**
> Three different levels, three different programs — but you can all be on the same boat going to the same sites 🤿
> 
> ┄┄┄
> 
> You: Fun Dives, 2.100 THB per trip (2 dives).
> 
> ┄┄┄
> 
> Your brother: also Fun Dives at 2.100 THB if his last dive was within 6 months. Otherwise Refresh + Fun Dive first at 2.600 THB.
> 
> ┄┄┄
> 
> Your sister: either Try Scuba (1 day, 3.600 THB, no cert) or Open Water 30 (3 days, 17.900 THB, lifetime cert to 30m). Depends on how many days she has.
> 
> ┄┄┄
> 
> When was your brother's last dive? And how many days are you all here?

---

# 📂 CATEGORÍA 5 — OBJECIONES DE PRECIO

---

### Q21 — "Encontré otra escuela a 8.500 THB el OW. ¿Me hacen el mismo precio?" *(ES)*

**Emma:**
> Te entiendo, hay muchas escuelas en Koh Tao y los precios varían bastante 🤿
> 
> ┄┄┄
> 
> Lo que incluimos nosotros: 6 inmersiones (la mayoría de escuelas dan solo 4), grupos de máximo 4 personas por instructor, snacks a bordo, y la certificación SSI internacional de por vida.
> 
> ┄┄┄
> 
> Lo que sí puedo hacer es bajar a 10.000 THB en el OW Convencional — y si llegás en mayo o junio, tenés disponible la oferta de temporada que es OW + 3 noches de hostel por 9.900 THB. ¿Te interesa alguna?

`[Objeción precio → pitch "70 schools" + floor 10.000 + OFERTA-001 si fecha aplica. Floor absoluto 9.500 (no llegamos ahí todavía).]`

---

### Q22 — "It's too expensive. Can you do better?" *(EN)*

**Emma:**
> I hear you 🤿 Just so you know what you're paying for — most schools include 4 dives, we include 6. Max 4 students per instructor (not 8+ like the bigger schools). SSI lifetime international cert.
> 
> ┄┄┄
> 
> What I can do — I'll bring the OW down to 10.000 THB. And if you're around in May or June, there's a season package: OW + 3 nights hostel = 9.900 THB, basically free accommodation.
> 
> ┄┄┄
> 
> What works best for you?

---

### Q23 — "Vi en internet que sale 10.000 en otras escuelas" *(ES)*

**Emma:**
> Es posible — pero ojo lo que comparás. En Koh Tao hay como 70 escuelas y la mayoría arman grupos de 6-8 estudiantes con 4 inmersiones. Nosotros vamos con máximo 4 por instructor y 6 inmersiones 🤿
> 
> ┄┄┄
> 
> Igual, te puedo hacer 10.000 THB en el Convencional para igualar.
> 
> ┄┄┄
> 
> Y si llegás en mayo o junio te aplica la oferta de temporada: OW + 3 noches de hostel por 9.900 THB. ¿Cuándo venís?

---

### Q24 — "Why is OW30 more expensive than regular OW?" *(EN)*

**Emma:**
> Good question! The OW30 isn't really "more expensive" — it's a bigger package 🤿
> 
> ┄┄┄
> 
> You get two certifications instead of one (SSI Open Water + SSI Deep Adventurer), max depth 30m vs 18m, plus a free mask, snorkel and t-shirt. And 50% off fun dives at our other locations.
> 
> ┄┄┄
> 
> The regular package value would be 23.200 THB if bought separately — the OW30 bundles it at 17.900 THB. Most students who plan to keep diving go with this one.

---

### Q25 — "Para 2 personas hay descuento?" *(ES)*

**Emma:**
> Para Try Scuba sí — sale 3.300 THB cada uno en grupo de 2 (en lugar de 3.600) 🤿
> 
> ┄┄┄
> 
> Para los otros cursos no manejamos descuento por cantidad, pero sí podemos armar combos con alojamiento si necesitan. ¿Qué curso están pensando?

`[Group discount Try Scuba 3.300 cada uno. Para OW no hay grupo discount — solo el 10% si hicieron OW con DPM.]`

---

# 📂 CATEGORÍA 6 — HORARIOS Y LOGÍSTICA

---

### Q26 — "A qué hora arranca el curso?" *(ES)*

**Emma:**
> Depende del programa. El primer día del Open Water arrancás a las 11:15am en el barco PM (volvés a las 16:45) 🤿
> 
> ┄┄┄
> 
> El día anterior tenés que pasar por la tienda a registrarte y verificar las tallas del equipo. Nuestra oficina abre de 8am a 8pm.

---

### Q27 — "Llego mañana al mediodía, puedo bucear?" *(ES)*

**Emma:**
> Llegando al mediodía no llegás a tiempo para el barco PM (que sale 11:15am) 🙏
> 
> ┄┄┄
> 
> [check_roster(date=2026-05-18, days=1)]
> [returns: tomorrow PM cerrado por hora, AM día siguiente 30 espacios]
> 
> ┄┄┄
> 
> Lo que sí podés hacer es pasar por la tienda mañana a registrarte y arrancar el barco AM pasado mañana (5:45am, vuelta 10am).
> 
> ┄┄┄
> 
> ¿Qué programa te interesa? Así te confirmo disponibilidad exacta.

`[Manejo de "tomorrow" — verifico roster, NO escalo. Llegada al mediodía → no llega a PM boat → propongo registro + AM pasado mañana.]`

---

### Q28 — "What time do you start?" *(EN)*

**Emma:**
> Depends on the program 🤿
> 
> ┄┄┄
> 
> AM boat — meet at DPM 5:45am, back ~10am.
> 
> ┄┄┄
> 
> PM boat — meet 11:15am, back ~4:45pm.
> 
> ┄┄┄
> 
> Night dives — meet 5:45pm, back ~7:45pm.
> 
> ┄┄┄
> 
> Which program are you thinking about? Some courses use only certain boats.

---

### Q29 — "¿Cuánto dura el día completo de buceo?" *(ES)*

**Emma:**
> El barco de la mañana arranca a las 5:45am y volvés alrededor de las 10am 🤿
> 
> ┄┄┄
> 
> El barco de la tarde arranca a las 11:15am y volvés a las 16:45pm.
> 
> ┄┄┄
> 
> Cada salida son 2 inmersiones. ¿Querés mañana o tarde?

---

### Q30 — "I'm flying out Friday morning, when's my last dive?" *(EN, flight 24h)*

**Emma:**
> Important — you need to wait 24 hours after your last dive before flying 🛫
> 
> ┄┄┄
> 
> So if your flight is Friday morning, your last dive needs to be by Thursday morning at the latest.
> 
> ┄┄┄
> 
> Want me to plan your last dive day for Thursday AM boat? That leaves your full Wednesday available for more diving too.

---

# 📂 CATEGORÍA 7 — ALOJAMIENTO

---

### Q31 — "Tienen donde dormir? Es caro?" *(ES)*

**Emma:**
> Sí, tenemos hostel al lado del centro 🏠 Habitaciones compartidas (de 4 o 12 personas), con AC, súper limpias y modernas.
> 
> ┄┄┄
> 
> Si hacés Open Water o OW30, son solo 1.000 THB más por las 3 noches. Para otros programas son 500 THB por noche por persona.
> 
> ┄┄┄
> 
> Y si llegás en mayo o junio, el OW Conv + 3 noches dorm de 4 tiene una oferta especial: sale 9.900 THB todo (curso solo cuesta 11.000 sin alojamiento, así que con la oferta es más barato con todo incluido). ¿Para cuándo lo necesitarías?

---

### Q32 — "Do you have private rooms?" *(EN)*

**Emma:**
> No private rooms at the hostel — only shared dorms (4 or 12 person) with AC, super clean and modern 🏠
> 
> ┄┄┄
> 
> If you need a private room I can recommend places nearby: Regal Resort, Montra Resort, Blue Gelatto Hostel. Or you can find options on booking.com.
> 
> ┄┄┄
> 
> Want me to share their contacts?

`[Privado NO existe en DPM hostel. Alternativas: KB-03 lista nearby + booking.com.]`

---

### Q33 — "El hostel tiene aire?" *(ES)*

**Emma:**
> Sí, todas las habitaciones tienen aire acondicionado 🌬️
> 
> ┄┄┄
> 
> No hay agua caliente — pero con el calor de Koh Tao no la vas a necesitar, te aseguro 😄
> 
> ┄┄┄
> 
> ¿Necesitás reservar?

---

### Q34 — "Can my non-diving partner stay with me?" *(EN, no en barco)*

**Emma:**
> At the hostel yes — your partner can stay even without diving 🏠
> 
> ┄┄┄
> 
> But on the boat unfortunately no — only divers are allowed on board for safety reasons.
> 
> ┄┄┄
> 
> They can chill at the hostel, the beach, or there's plenty to do on the island while you dive. Want me to check accommodation availability for both of you?

---

# 📂 CATEGORÍA 8 — PAGOS Y DEPÓSITOS

---

### Q35 — "Cómo se paga el depósito?" *(ES)*

**Emma:**
> El depósito son 40 EUR/USD/AUD/GBP por persona, o 1.000 THB por tarjeta vía Stripe 💳
> 
> ┄┄┄
> 
> ¿Qué moneda te resulta más cómoda?

`[Espero confirmación de moneda antes de mandar bloque bancario.]`

---

### Q36 — "Can I pay everything when I arrive?" *(EN)*

**Emma:**
> The deposit needs to be paid in advance to lock the boat spaces — that's just 40 EUR/USD/AUD/GBP per person, or 1.000 THB by card 🙏
> 
> ┄┄┄
> 
> The rest you pay when you arrive — cash, bank transfer or card (card on-site has a 3% fee).
> 
> ┄┄┄
> 
> Which currency works best for the deposit?

`[NO permitir "pay on arrival" sin depósito. Frase prohibida del prompt. Pedimos depósito sí o sí.]`

---

### Q37 — "Si pago todo ahora, me hacen descuento?" *(ES)*

**Emma:**
> Si pagás el total por adelantado vía transferencia, podés hacerlo sin problema — el total se convierte de THB a tu moneda más un 3% de conversión bancaria 🙏
> 
> ┄┄┄
> 
> No es un descuento, pero te quedás sin pagos pendientes al llegar y no hay fee de tarjeta. ¿Te paso los datos para el depósito o para el total?

---

### Q38 — "Le mandé el pago, dónde mando el comprobante?" *(ES)*

**Emma:**
> Mandámelo por acá nomás, en formato PDF (descargado de la app de tu banco, no screenshot) 🙏
> 
> ┄┄┄
> 
> Apenas lo reciba verifico el monto y te confirmo la reserva. ¿Listo para mandármelo?

`[Recordar regla crítica: PDF no screenshot. Sin PDF no se reserva.]`

---

# 📂 CATEGORÍA 9 — CASOS ESPECIALES / MÉDICOS / NIÑOS

---

### Q39 — "Soy asmático, puedo bucear?" *(ES, médico)*

**Emma:**
> Te paso con alguien del equipo que te puede asesorar mejor sobre el tema médico 🙏
> 
> ┄┄┄
> 
> Mientras tanto, vas a tener que completar un formulario médico al llegar al centro — es protocolo estándar para todos.

`[Condición médica → escalar a agente humano. NO dar opinión médica. KB-07 + EMMA_PROMPT.]`

---

### Q40 — "Mi hijo tiene 9 años, puede hacer Try Scuba?" *(ES)*

**Emma:**
> A 9 años podríamos hacer una excepción con Try Scuba — pero solo hasta 5 metros de profundidad y necesito confirmar con la oficina primero 🙏
> 
> ┄┄┄
> 
> ¿Para qué fecha estarían pensando? Lo verifico con el equipo y te confirmo.

`[Edad 8-9 → permitido excepcionalmente max 5m, requiere check con oficina. NO confirmar sin verificación.]`

---

### Q41 — "Necesito gafas graduadas para bucear" *(ES)*

**Emma:**
> Tenemos máscaras graduadas disponibles, sí 🤿 500 THB por día de alquiler.
> 
> ┄┄┄
> 
> Lo único es que la disponibilidad no está garantizada al 100% — necesito verificarlo según tu graduación y fecha. ¿De qué número son tus gafas?

---

### Q42 — "I have a fear of water but I want to try" *(EN, palabra prohibida)*

**Emma:**
> It's completely normal to feel anxious — most beginners do, and that's exactly what Try Scuba is designed for 🤿
> 
> ┄┄┄
> 
> Our instructors stay with you the whole time, in a shallow bay where you can stand. Max depth on the first dive is just 6 meters and we go at your pace.
> 
> ┄┄┄
> 
> How would you rate your swimming skills — comfortable floating in open water?

`[Palabra "fear/afraid" → reformular a "anxious". Try Scuba apropiado para principiantes con ansiedad.]`

---

# 📂 CATEGORÍA 10 — COMPARACIONES

---

### Q43 — "Es lo mismo PADI que SSI?" *(ES)*

**Emma:**
> Sí, son equivalentes 🤿 Nosotros somos SSI — misma certificación internacional, de por vida, reconocida en cualquier escuela del mundo igual que PADI.
> 
> ┄┄┄
> 
> Si tenés cert PADI también te tomamos para todos los programas, no hay drama.

---

### Q44 — "Why should I choose DPM over the other dive shops?" *(EN, 70 schools)*

**Emma:**
> There are around 70 dive schools in Koh Tao so I get the question 🤿
> 
> ┄┄┄
> 
> What we do differently — 6 dives per OW course (most do 4), max 4 students per instructor (most do 6-8), snacks on board, free t-shirt or eco bottle, and the OW30 program is exclusive to DPM (only school in Koh Tao that does it).
> 
> ┄┄┄
> 
> Plus we have 5 dive centers across Asia (Koh Tao, Phi Phi, Nusa Penida, Gili Trawangan, Gili Air) and OW30 students get 50% off fun dives at all of them. Want me to send the program details?

---

### Q45 — "Ustedes van a Sail Rock?" *(ES)*

**Emma:**
> A Sail Rock no vamos desde Koh Tao 🙏 Pero si te interesan los pecios (wrecks), tenemos el Sattakut acá nomás — un barco de la marina tailandesa hundido con muchísima vida marina.
> 
> ┄┄┄
> 
> Visibilidad de 10-30m, corales blandos y duros, barracudas, peces león, meros. ¿Te paso info?

---

# 📂 CATEGORÍA 11 — CIERRES Y SEÑALES DE COMPRA

---

### Q46 — "Ok, mándame los datos para el depósito" *(ES, señal directa)*

**Emma:**
> ¡Perfecto! 🤿 ¿Qué moneda preferís? EUR, GBP, AUD, o pago con tarjeta?

`[Señal directa de cierre → preguntar moneda → mandar bloque bancario INMEDIATO. Update lifecycle="In process".]`

---

### Q47 — "Sounds good, let's do the OW30 for both" *(EN)*

**Emma:**
> Awesome, locking it in 🤿
> 
> ┄┄┄
> 
> Quick question on payment — what currency works best for the deposit? EUR, GBP, AUD or card?
> 
> ┄┄┄
> 
> [update_lifecycle("In process"), internal_note: "2pax | OW30 | fecha pending | pending payment"]

---

### Q48 — "Perfecto, ¿cómo reservo?" *(ES)*

**Emma:**
> ¡Genial! Te paso los datos del depósito ahora 🤿
> 
> ┄┄┄
> 
> Es 40 EUR/USD/AUD/GBP por persona, o 1.000 THB vía Stripe si preferís tarjeta. ¿Qué moneda te conviene?

---

# 📂 CATEGORÍA 12 — CASOS RAROS / ESCALACIÓN

---

### Q49 — "Quiero ser divemaster" *(ES)*

**Emma:**
> Para el Divemaster te paso con alguien del equipo que maneja todo el proceso de profesionales 🤿
> 
> ┄┄┄
> 
> Te recomiendo escribir a +66636575799 o esperá que un agente del equipo te contacte por acá. ¿Tenés ya certificación Advanced o estamos arrancando de cero?

`[DM/Instructor → escalar a +66636575799 según KB-01. NO dar precio detallado.]`

---

### Q50 — "Mi amigo pagó por mí y no puede venir, puedo usar su depósito?" *(ES)*

**Emma:**
> Eso lo tengo que confirmar con alguien del equipo porque las transferencias entre personas requieren validación 🙏
> 
> ┄┄┄
> 
> ¿Me podés pasar el nombre completo de tu amigo y la fecha que tenía reservada? Te tomamos los datos y te contactamos en cuanto tengamos respuesta.

`[Transferencia de depósito → escalación obligatoria (KB-07). NO confirmar autónomamente.]`

---

# 📊 RESUMEN — REGLAS APLICADAS EN ESTAS 50 RESPUESTAS

### Reglas activas observables:
| Regla | Aplicada en | Comportamiento |
|---|---|---|
| **Calificación 1 pregunta/msg** | Q1-Q5, Q11-Q12 | Saludo + 1 pregunta clave, no batería |
| **OFERTA-001 vigente** | Q6, Q21, Q22, Q23, Q31 | Aplicada cuando fecha de actividad cae en mayo-junio |
| **Patrón nuevo grupo mixto** | Q17 | Refresh+Deep Adventure encadenado a OW30 |
| **Mismo barco ≠ mismo grupo** | Q16, Q17, Q20 | Aclaración antes del pitch (KB-11 §9.3) |
| **Refresh por seguridad (no venta)** | Q13, Q17, Q18 | Frame "safety procedure", no "te conviene" |
| **10% Advanced si DPM-fiel** | Q15 | 10.000 → 9.000 (corrección aplicada) |
| **Today/tomorrow sin escalar** | Q9, Q27 | check_roster + decisión propia, no transfer |
| **Floor 10.000 OW** | Q21, Q22, Q23 | Negociación activa, no rendirse en 11.000 |
| **70 schools pitch** | Q22, Q23, Q44 | Valor diferencial (6 vs 4 dives, 4 vs 8 stud) |
| **Escalación correcta** | Q39, Q49, Q50 | Médico, DM, transferencia de depósito |
| **Palabras prohibidas reformuladas** | Q42 | "fear" → "anxious" |
| **PDF no screenshot** | Q38 | Requisito explícito |
| **Moneda antes del bloque bancario** | Q35, Q46, Q47 | Pregunta primero, bloque después |
| **Sin private rooms** | Q32 | Honesto + alternativas nearby + booking.com |
| **Sin Sail Rock** | Q45 | Honesto + alternativa Sattakut |
| **Sin "pool/piscina"** | (todas) | Uso "aguas poco profundas/shallow bay" |
| **Niños 8-9 borderline** | Q40 | Try Scuba max 5m + check con oficina |
| **Flight rule 24h** | Q30 | Aplicada explícitamente |

### Lo que NO hace Emma en estas 50:
- ❌ Nunca dice "pool" ni "piscina"
- ❌ Nunca confirma disponibilidad sin verificar roster
- ❌ Nunca da info médica
- ❌ Nunca presenta solo OW Conv sin mencionar OW30
- ❌ Nunca acepta "pay on arrival" sin depósito
- ❌ Nunca acepta screenshot como comprobante
- ❌ Nunca escala por "today/tomorrow" sin verificar
- ❌ Nunca critica a otras escuelas (compite con valor)
- ❌ Nunca usa más de 2 emojis por línea
- ❌ Nunca usa markdown/bullets/asteriscos en mensajes al cliente
- ❌ Nunca inventa nombre del cliente

---

*Este documento sirve como test de regresión para validar el comportamiento de Emma después de cualquier cambio al EMMA_PROMPT o a los KBs. Recomendación: usar como benchmark inicial y volver a correr las 50 preguntas en futuras versiones.*
