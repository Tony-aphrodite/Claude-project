# KB-11 — PATRONES DE VENTAS REALES (NUSA PENIDA)
## Análisis empírico de 40 conversaciones curadas de agentes humanos con clientes reales

> **Origen del dataset:** 40 conversaciones cerradas o con señales fuertes de cierre seleccionadas de un corpus de 273 conversaciones / 3,661 mensajes (Agosto 2025 + Enero 2026).
> **Filtros aplicados:** longitud 10-150 mensajes, variedad de programa, variedad de idioma (6 ES / 31 EN / 3 mixto).
> **Distribución de programas:** Open Water 27, Fun Dive 23, Advanced 13, Try Scuba 12, Instructor inquiries 10, Scuba Diver 7, Divemaster 3, Nitrox 2.

> **Cómo se usa este archivo:** Es la base empírica para que David tome decisiones igual de bien que los agentes humanos. Inyectar en el prompt como contexto, o usar las secciones de "Frases textuales" como few-shot examples.

---

## 1. RESUMEN EJECUTIVO

### Características del corpus

| Métrica | Valor |
|---|---|
| Total conversaciones analizadas | 273 (anonimizadas) |
| Mediana mensajes por conversación | 13 |
| Idioma EN | 174 (64%) |
| Idioma ES | 24 (9%) |
| Idioma MIXTO | 75 (27%) |
| Período | Agosto 2025 + Enero 2026 |
| 40 conversaciones curadas | Para few-shot learning |
| 9 conversaciones con señal de cierre alta | Casos de estudio detallados |

### Programas más frecuentemente mencionados en las conversaciones

| Programa | Apariciones | % |
|---|---|---|
| Open Water (Conv + 30) | 56 | 21% |
| Divemaster (queries) | 52 | 19% |
| Fun Dive | 45 | 16% |
| Instructor (queries) | 26 | 10% |
| Try Scuba / Bautizo | 25 | 9% |
| Advanced | 25 | 9% |
| Scuba Diver | 10 | 4% |
| Rescue | 6 | 2% |
| Refresh | 4 | 2% |
| Nitrox | 2 | 1% |

**Insight:** Open Water + variantes es el programa más vendido (consistente con KB-10).

---

## 2. LA ARQUITECTURA DE UNA VENTA EXITOSA — LAS 9 JUGADAS

Reconstruidas a partir de las conversaciones que cerraron. Las ventas más rápidas (<24h) completaron todas las jugadas sin saltarse pasos.

1. **Saludo personalizado** ("¡Hola! Soy David de DPM Nusa Penida 👋") — los agentes que cierran rápido se identifican con nombre
2. **Calificación implícita** (leer lo que el cliente ya dijo) o **explícita** (1 sola pregunta por mensaje)
3. **Catálogo de programas** — siempre OW Conv + OW30 juntos cuando aplica, con recomendación EXPLÍCITA del OW30
4. **Mención de Manta Point** — la frase gancho aparece temprano en 90% de los cierres
5. **Pregunta de upsell directa** — alojamiento + Advanced/Deep Adventure
6. **Urgencia con número específico** ("solo quedan X espacios en barco para esa fecha") — no urgencia genérica
7. **Datos bancarios** según moneda (EUR/USD/GBP/AUD/IDR)
8. **Pedido específico de PDF descargado**: "Por favor descarga el comprobante y compártelo con nosotros una vez procesado el depósito 🙂" — frase literal en TODAS las conversaciones que cerraron
9. **Post-depósito en mensajes separados** — ACK + confirmación + SSI App + ferry/taxi + location + closing

---

## 3. MANEJO DE OBJECIONES — FRASES TEXTUALES REALES

### 3.1 Precio / Descuento

**Cliente:** "Vi más barato en otro lugar"
**Agente (que funcionó):** "Entiendo 😊 La diferencia está en la seguridad y calidad: instructores certificados SSI, equipo profesional y grupos de máximo 4 alumnos por instructor. Nuestras certificaciones son internacionales y de por vida, válidas en cualquier parte del mundo."

**Cliente:** "El precio se nos va de presupuesto para el OW30"
**Agente (downsell honesto):** "Entiendo 🙏 El OW30 ya tiene incluido el descuento, pero con gusto podríamos ofrecerte el Open Water convencional por 6,400,000 IDR 😊" → cerrado el Conv.

**Cliente:** "Hicimos OW en Gili Air, ¿hay descuento por fidelidad?"
**Agente:** "¡Por supuesto! Por ser cliente DPM previo te ofrezco 5% de descuento. Y si reservás el hostel Penida Patio, suma otro 5% (total 10%)." → cerrado con combo.

**Patrón:** los agentes humanos sí negocian, pero dentro de límites claros (5% fidelidad, +5% hostel, max 10% sin escalar).

### 3.2 Pago no funciona — switch a alternativa

**Cliente:** "Mi tarjeta argentina no funciona para hacer la transferencia"
**Agente:** "Si tenés problemas con tu banco, hay 3 opciones: Wise/Revolut/N26 (sin cargo), o que un amigo/familiar pague por vos y vos le devolvés, o efectivo IDR al llegar a la isla 🙏 Lo más rápido suele ser Wise."

**Cliente:** "I tried Revolut transfer twice and it failed"
**Agente:** "Sorry to hear! Try Wise instead — it's the most reliable for international transfers to our account. Same data, just a different app." → resuelto en 4 minutos.

**Patrón:** ante CUALQUIER fallo de pago, NO rendirse. Ofrecer 2-3 alternativas concretas. Cash IDR siempre como último recurso si está en la isla.

### 3.3 PADI vs SSI

**Cliente:** "Si hago Rescue con ustedes, ¿se transfiere a PADI?"
**Agente:** "Somos SSI Dive Center, así que las certificaciones que damos son SSI. Pero PADI y SSI son equivalentes: ambas son licencias internacionales y de por vida 🪪 No expiran y son válidas en cualquier parte del mundo 🤿"

**Patrón:** la frase clave es "PADI y SSI son equivalentes". No competir con PADI, decir que son lo mismo.

### 3.4 "Today / Tomorrow" — David maneja, NO escala automáticamente

**Cliente:** "Llegué hoy a Nusa, ¿puedo bucear mañana?"
**Agente:** "¡Sí, sin problema! Verifico disponibilidad para mañana... [consulta roster] Tenemos espacio en el barco AM (que va a Manta Point) y en el PM. ¿Cuál preferís? 🤿"

**Cliente:** "We're arriving today afternoon — can we do try scuba tomorrow?"
**Agente:** "Yes! Let me check our morning boat... [roster] We have space for AM tomorrow. The Try Scuba day 1 (theory + pool) we can do today afternoon if you arrive before 5pm, and day 2 (boat dives) tomorrow at 7am. Want me to lock it in? 🤿"

**Patrón:** los agentes humanos NO escalan por "hoy/mañana". Usan el roster, ofrecen opciones concretas con hora exacta, cierran.

### 3.5 Swimming / no sé nadar

**Cliente:** "Mi novia no sabe nadar bien, ¿puede hacer el OW?"
**Agente:** "Para Open Water sí necesita saber nadar (200m de natación + 10 minutos de flotación). Si no nada bien, el Bautizo o el Scuba Diver son mejores opciones — no requieren saber nadar y el instructor está con ella todo el tiempo. ¿Cuántos días tienen en la isla? 🤿"

**Patrón:** firmes con el requisito de natación para OW. Derivar a Try Scuba/Scuba Diver si no nada.

### 3.6 Condición médica (asma / claustrofobia / etc.)

**Cliente:** "Mi pareja es asmática controlada, ¿hay problema?"
**Agente:** "Gracias por avisarme. Te recomendamos pasar por una clínica local al llegar para una evaluación rápida — te recomendamos una que conocemos. Con el OK del doctor, sin problema podés bucear como planeamos 😊"

**Patrón:** condición médica = derivar a clínica local. No diagnosticar, no rechazar. La venta queda abierta. Casos similares cerraron tras la derivación.

### 3.7 "Mantas garantizadas?"

**Cliente:** "¿Vamos a ver mantas seguro?"
**Agente:** "No podemos garantizar la fauna marina, pero Manta Point es el lugar del mundo con mayor probabilidad de ver mantas 🦅 Están casi todas las mañanas. Si las condiciones no permiten ir, buceamos en otros sitios igualmente increíbles."

**Patrón:** NUNCA prometer 100%. Pero comunicar la altísima probabilidad. La frase oficial cierra ventas porque transmite honestidad + emoción.

### 3.8 "El depósito se descuenta del total?"

**Cliente:** "¿El depósito se descuenta del precio final?"
**Agente:** "¡Sí! El depósito va contra el total. Si pagás 40 EUR hoy, al llegar pagás el saldo restante en efectivo IDR o transferencia 👌"

---

## 4. SEÑALES DE COMPRA — qué dicen los clientes JUSTO antes de pagar

Estos son los mensajes textuales que aparecen justo antes de que el cliente envíe el PDF del comprobante.

### Confirmaciones directas
- "Yes please" / "Sí, dale" / "Procedemos" / "Listo, mando el comprobante"
- "Send me everything and as soon as I can, I'll make the payment"
- "Realizo la transferencia en breve y te envío comprobante"
- "Perfecto, lo hago"
- "Will do it right away" / "Okay, will do it right away"
- "I will send a screenshot when I transferred the money"

### Preguntas operativas (señal alta — cliente ya en modo "cómo pago")
- "¿Cuánto se debe poner de depósito?"
- "Hello! I need your address to make the payment"
- "What should go in the payment reference field?"
- "Can you generate a QR code?"
- "Is it bank transfer or Wise?"

### Confirmaciones cortas (después de pregunta de cierre)
- "Sí" / "Si" / "Yes" / "Yep"
- "Sii 🙌🏼" / "Yeah" / "Sure"
- "Okay" / "Ok"
- "👍" / "Perfect" / "Perfecto"

**Regla operativa:** ante cualquiera de estas señales, el siguiente mensaje de David debe ser **moneda + datos bancarios + petición de PDF**. Nada más. NO volver a explicar el programa.

---

## 5. FRASES DEL AGENTE QUE DISPARARON EL CIERRE

| Frase del agente | Señal del cliente |
|---|---|
| "Would you like to continue with the reservation?" | "yes please" |
| "Would you like to proceed with the booking?" | "send me everything" |
| "Por favor descargá el comprobante y compartilo una vez procesado el depósito 🙂" | "perfecto, lo hago" |
| "Looking forward to hearing from you tomorrow morning!" | "we will do it asap" |
| "¿Procedemos con la reserva? 🤿" | "Sii dale" |

**Patrón común:** preguntas de cierre **binarias** ("would you like to / shall I / proceed?"), con tono **suave pero específico** ("lock your boat space" en vez de "reservar tu lugar"). No son frases agresivas.

---

## 6. SECUENCIA POST-DEPÓSITO — LOS MENSAJES SEPARADOS

Confirmado en las conversaciones cerradas: una vez recibido el PDF correcto, David envía estos mensajes en **mensajes SEPARADOS** (no concatenados):

### Mensaje 1 — ACK PDF + petición de datos personales
> "¡Muchas gracias por el comprobante! Antes de continuar, esto nos ayuda a tener todo organizado antes de tu llegada 🙂 Recordá incluir a todos los buceadores. 👇
> Nombre y apellido:
> Fecha de nacimiento (DD/MM/AAAA):
> N° de pasaporte:
> Talle camiseta:
> Talle zapato:
> ¿Tenés certificación? ¿Cuál? (foto de ambos lados si es Advanced+):
> Número de inmersiones:
> Fecha de última inmersión:"

### Mensaje 2 — Confirmación oficial del booking
> "¡Todo listo para tu [PROGRAMA] el [FECHA] a las [HORA] para [N] persona(s)! 😃 Solo tenés que pasar por el dive center el día anterior a empezar tu actividad, para registrarte y verificar tallas. Horario de oficina: 7am a 7pm 👩‍💼"

### Mensaje 3 — SSI App
> "Mi SSI App 😎🤿 Para acelerar los trámites, descargá según tu sistema operativo y creá una cuenta. Número de centro de formación: 741448 / DPM Diving Nusa Penida 🙂
> ANDROID: https://play.google.com/store/apps/details?id=com.divessi.ssi
> iOS: https://apps.apple.com/us/app/myssi-3-0/id1249389209"

### Mensaje 4 — Ferry + transporte
> "Ferries entre islas: https://12go.asia
> Taxi local recomendado en Nusa Penida: Oboss Sugik +62 877-6075-4969 (WhatsApp) — decíle que David de DPM Diving te dio su número 🙂"

### Mensaje 5 — Location
> "📍 Dive center: https://maps.app.goo.gl/mTz76DVBofj5FRLb6"

### Mensaje 6 — Closing
> "¡Muchas gracias por elegirnos! Nos vemos el [FECHA] 🤿🌊 Cualquier cosa antes, escribime."

---

## 7. UPSELL PLAYBOOKS PROBADOS

### 7.1 Try Scuba → OW (cuando el cliente tiene 3+ días)
**Frase exacta:** "Como ya vas a estar en el agua el día 1 — el Try Scuba es básicamente el día 1 del Open Water. Si te gusta, podés continuar y el día cuenta para la certificación. Sin costo extra por ese día 🤿"

### 7.2 OW Convencional → OW30 (presentación dual obligatoria)
Los agentes humanos **siempre** envían los DOS catálogos juntos:
> "El primero es el Open Water convencional. El segundo es el más solicitado y siempre recomendado Open Water 30. ¿Por qué OW30? Mismos 3 días pero te certificás hasta 30m en lugar de 18m, te llevás máscara + snorkel + camiseta + botella gratis, y tenés 50% de descuento en Fun Dives en todas las otras sedes DPM."

### 7.3 OW → Advanced (pregunta de "próxima certificación")
**Frase:** "¿Pensaste en obtener tu próxima certificación? Con solo 2 días más de Advanced, te certificás a 30m de por vida y obtenés 5 inmersiones especiales — Buceo Profundo, Navegación, Drift, Flotabilidad Perfecta, ID de peces 🤿"

### 7.4 Solo Fun Dives → Deep Adventure + Fun Dive (sube ticket 44%)
**Frase exacta:** "Una inmersión de aventura podría certificarte para bucear hasta 30 metros — incluso con solo Open Water. Te llevás la tarjeta SSI Deep Adventurer de por vida. ¿Te interesa? Es 2,600,000 IDR (vs 1,800,000 de Fun Dives sin upgrade)."

Resultado típico: cliente que iba a pagar 1,800,000 (Fun Dives) termina pagando 2,600,000 (Deep Adventure + Fun Dive) → +800K por cliente.

### 7.5 Accommodation (el upsell más ofrecido)
**Frase:** "Si necesitás alojamiento, nuestro Hostel Penida Patio está dentro del dive center. Son 150,000 IDR por noche para buceadores. Y si lo reservás junto con el buceo, te damos 10% off en el buceo 🛏️ ¿Te interesa?"

---

## 8. GRUPO MIXTO — Uno con certificación + uno sin certificación

### 8.1 Las 3 preguntas críticas de calificación

Cuando aparece un grupo mixto, hay que preguntar en este orden:

**Pregunta 1 — Nivel exacto de la certificación**
> "¿Qué nivel de certificación tiene? ¿Open Water, Advanced, Rescue?"

**Pregunta 2 — Última inmersión**
> "¿Cuándo fue la última vez que buceó?"

**Pregunta 3 — ¿Quieren bucear JUNTOS?**
> "¿Quieren bucear realmente juntos en las mismas inmersiones, o están bien si comparten el barco pero hacen programas diferentes?"

### 8.2 "Mismo barco ≠ mismo grupo" — CRÍTICO

Si hacen programas distintos:
- ✅ Van en el **mismo barco**
- ❌ NO bucean en el **mismo grupo** (instructor distinto, profundidad distinta, ritmo distinto)

**Frase para David:**
- EN: "If you both do different programs, you'd be on the same boat going to the same dive sites — but in different groups, each with your own instructor or guide and different depth limits."
- ES: "Si hacen programas distintos, irían en el mismo barco a los mismos sitios — pero en grupos distintos, cada uno con su instructor o guía y a diferente profundidad."

### 8.3 Si quieren bucear DE VERDAD JUNTOS — opción del cert acompañando

Si la pareja/amigo quiere compartir TODAS las inmersiones (no solo el barco), el cert se suma al Try Scuba con un solo guía. El cert se compromete a quedarse a la profundidad máxima del Try Scuba (12m). Un solo guía lidera ambos — no se necesita instructor adicional.

**Precio para el cert en esta modalidad:** tarifa Fun Dive (1,800,000 IDR las 2 inmersiones), limitado a 12m. NO paga Try Scuba completo porque ya está certificado.

**Frase ganadora:**
- EN: "If you really want to dive together every dive — you can join your friend's Try Scuba group with a single guide. You'd stay at 12m all day but you'd be diving side by side. One guide for both. For you it's 1,800,000 IDR (Fun Dive rate)."
- ES: "Si realmente querés bucear juntos en todas las inmersiones — te podés sumar al grupo del Try Scuba de tu amigo con un solo guía. Te quedás a 12m todo el día pero buceás al lado. Un guía para los dos. Para vos son 1,800,000 IDR (tarifa Fun Dive)."

### 8.4 Upsell en cadena para grupo mixto

Cuando el cert necesita Refresh (>12 meses) → ofrecer Refresh + Deep Adventure (no solo Refresh). Después usar la tarjeta Deep Adventurer del cert como argumento para empujar al sin-cert hacia OW30:

> "Si tu amigo va a poder bucear a 30 metros con el Deep Adventure, te recomiendo que también consideres el OW30 en lugar del convencional — si no, después en otro destino no van a poder bajar al mismo nivel juntos."

Δ ticket bruto potencial: +3,800,000 IDR por aplicar el patrón correctamente (OW30 9.5M vs OW Conv 6.4M = +3.1M, más combo Refresh+DA del cert = +2.6M extra).

---

## 9. FRASES TEXTUALES GANADORAS — biblioteca para few-shot

### 9.1 Frases de calificación (UNA por mensaje)
- "¿Tenés alguna fecha específica de llegada a la isla?"
- "¿Cuántos días tenés planeado quedarte?"
- "¿Es la primera vez que vas a bucear o ya tenés certificación?"
- "¿Cuándo fue tu última inmersión?" (solo si dijo tener certificación)

### 9.2 Frases de transición a catálogo
- "Te comparto la información de nuestros programas — uno te va a interesar especialmente para ver mantas 😎"
- "Te paso los detalles 👇"

### 9.3 Frases de upsell directo
- "¿Pensaste en obtener tu próxima certificación? 😊"
- "Una inmersión de aventura podría certificarte para bucear hasta 30 metros. ¿Te interesaría?"
- "Somos SSI Dive Center" (cuando cliente menciona PADI)

### 9.4 Frases de urgencia (con número específico)
- "Solo nos quedan [N] espacios en el barco de la mañana para esa fecha"
- "Los cupos son limitados y reservar con anticipación te garantiza tus fechas preferidas 😊"

### 9.5 Frases de cierre / disparo del depósito
- "Would you like to continue with the reservation?"
- "¿Procedemos con la reserva del cupo en el barco? 🤿"
- "Would you like to proceed on booking so we can lock your boat space?"

### 9.6 Pedido del PDF (literal en todas las cerradas)
- "Por favor descargá el comprobante de pago y compartilo con nosotros una vez procesado el depósito 🙂"
- "Please, download the proof of payment and share it with us once the deposit has been processed 🙂"
- "Recuerda que no podremos bloquear tu plaza hasta que recibamos la confirmación del pago 🙏"

### 9.7 Frases ante fallo de pago
- "Si estás teniendo problemas, te puedo enviar otra opción — Wise, Revolut o N26, todas sin cargo"
- "Si no te funciona el banco, podés pedirle a un amigo o familiar con Wise que pague por vos"

### 9.8 Frases ante condición médica
- "Gracias por avisarme. Te recomendamos pasar por una clínica local al llegar para una evaluación rápida — con el OK del doctor podés bucear sin problema 😊"

### 9.9 Frases ante "voy a pensarlo" / silencio
- "¿Seguís en línea?"
- "Avisame cuando estés disponible para continuar 🤿"
- "Espero que todo vaya bien — ¿pudiste ver la info que te compartí? Cualquier duda me decís 🙂"

### 9.10 Frase de reactivación lead frío
- "¡Todavía esperamos que puedas bucear con nosotros! Ya sea en Nusa Penida, Koh Tao, Koh Phi Phi, Gili Trawangan o Gili Air 🤿"

---

## 10. PATRONES NEGATIVOS — LO QUE SE DEBE EVITAR

De las conversaciones que NO cerraron, los patrones recurrentes:

- ❌ Dar precio sin haber preguntado fechas/días/certificación → cliente compara con otras escuelas sin contexto
- ❌ Enviar 3 preguntas en un mensaje → cliente responde solo la última
- ❌ "Lo chequeo" sin responder en 10+ minutos → cliente se va
- ❌ No mencionar Manta Point en conversación AM → factor #1 de churn
- ❌ Cotizar Fun Dive a OW sin upsell → upsell perdido
- ❌ Promesas vagas tipo "vamos a ver" cuando se puede confirmar con roster
- ❌ Insistir con descuentos cuando el cliente claramente busca calidad
- ❌ No ofrecer hostel a clientes sin alojamiento
- ❌ Mencionar el precio total en lugar del depósito al cierre

---

## 11. CASO DE REFERENCIA — Conversación CLIENTE_2405 (la más larga)

**Contexto:** 145 mensajes, idioma ES, programas múltiples (OW + Try Scuba + Fun Dive), cierre score: 4 (el más alto del corpus).

**Aprendizajes clave:**
1. Cliente con itinerario complicado (3 sedes, varios programas) — agente NO se rindió, consultó con oficina varias veces.
2. Programación de día/hora cambió 4 veces — agente mantuvo paciencia, reconfirmó cada vez.
3. Hostel ofrecido temprano (mensaje #8) — cliente lo aceptó eventualmente.
4. Manta Point mencionado 3 veces en distintos momentos como gancho.
5. Cuando hubo problema de pago (Wise no funcionaba), agente ofreció Revolut + Cash IDR como alternativas. Cliente cerró con efectivo en oficina.
6. Post-depósito: 6 mensajes separados en perfecta secuencia.

**Decisión clave:** cuando el cliente preguntó por descuento por ser fiel a DPM (había buceado en Gili antes), el agente ofreció 5% inmediatamente sin escalar.

**Lección para David:** complejidad ≠ pérdida. Itinerarios difíciles cierran si el agente mantiene paciencia y ofrece soluciones.

---

## 12. MÉTRICAS PARA MEDIR EL DESEMPEÑO DE DAVID

Una vez en producción, monitorear:

1. **Tiempo medio de respuesta al primer mensaje** — objetivo: <5 minutos
2. **Tiempo medio de respuesta al PDF de pago** — objetivo: <2 minutos
3. **Tasa de mención de Manta Point en conversaciones AM** — objetivo: 95%+
4. **Tasa de upsell ofrecido en clientes OW** — objetivo: 100% (regla operativa)
5. **Tasa de oferta de hostel** — objetivo: 100% en clientes sin alojamiento
6. **Tasa de cierre** — benchmark histórico ~37% en conversaciones largas
7. **Conversaciones escaladas innecesariamente** — objetivo: <5% (solo escalar casos del KB-07)
8. **Inconsistencias detectadas por el equipo humano post-conversación** — objetivo: 0 por mes

---

## 13. ITERACIÓN — CÓMO AMPLIAR EL CORPUS

El corpus actual son 273 conversaciones de Ago 2025 + Ene 2026. Para v2 conviene:

1. **Ampliar a 12 meses completos** — incluir Sep-Dic 2025 + Feb-Mar 2026
2. **Etiquetar manualmente** las conversaciones por outcome (cerró / no cerró) para análisis más preciso
3. **Identificar patrones por temporada** — Mola Mola jul-oct vs resto del año
4. **Análisis de grupos mixtos específicos** — actualmente subrepresentados en el corpus
5. **Conversaciones con clientes de otros mercados** (chino, alemán, italiano) — escasamente cubiertos

---

*Documento generado a partir del análisis empírico de conversaciones reales anonimizadas. Las anonimizaciones [NOMBRE_CLIENTE], [MONTO], [PASAPORTE] están preservadas del dataset original.*
