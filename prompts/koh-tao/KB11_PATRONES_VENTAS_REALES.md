# KB-11 — PATRONES DE VENTAS REALES (KOH TAO)
## Análisis empírico de 40 conversaciones curadas de agentes humanos con clientes reales

> **Origen del dataset:** 40 conversaciones cerradas o con señales fuertes de cierre (cierre_score≥1) seleccionadas de un corpus de 767 conversaciones / 26.570 mensajes (Abril 2025 – Marzo 2026).  
> **Filtros aplicados:** longitud 10–150 mensajes, variedad de programa, variedad de idioma (16 ES / 22 EN / 2 mixto).  
> **De las 40, 15 cerraron completo** (cliente envió PDF de comprobante + agente ejecutó post-depósito), 5 enviaron PDF pero sin post-depósito completo, 20 quedaron en señales sin PDF.

> **Cómo se usa este archivo:** Es la base empírica para que la AI tome decisiones igual de bien que los agentes humanos. Inyectar en el prompt como contexto, o usar las secciones de "Frases textuales" como few-shot examples.

---

## 1. RESUMEN EJECUTIVO

### Métricas clave de los cierres reales

| Métrica | Valor |
|---|---|
| Cierres completos (PDF + post-depósito) | 15 de 40 (37%) |
| Mediana tiempo de respuesta al PDF | **1,6 minutos** |
| Promedio tiempo de respuesta al PDF | 5,5 minutos |
| Cierres relámpago (<2h totales) | 1 caso |
| Cierres en 2-24h | 2 casos |
| Cierres en 1-7 días | 6 casos |
| Cierres en >7 días | 6 casos |

### Objeciones más comunes (entre 40 conversaciones)

| Objeción | % de convs | Comentario |
|---|---|---|
| **Precio / descuento** | **30 %** | Objeción #1 — siempre la más frecuente |
| **Pago no funciona** (tarjeta, Revolut, Wise) | **25 %** | Crítico: el switch a Stripe es la solución estándar |
| PADI vs SSI | 10 % | Confusión común, fácil de resolver |
| "Today/tomorrow" / "ya estoy aquí" | 7 % | ⚠️ Ver hallazgo crítico en sección 8 |
| Swimming / no sé nadar | 7 % | |
| Salud / ansiedad (asma, claustrofobia, miedo) | 7 % | |
| Niños / menores | 5 % | |
| Clima | 5 % | |
| Competencia (encontró cheaper / ya reservó otro) | 2 % | |
| Tiempo limitado | 2 % | |

### Upsells intentados (los agentes humanos los ofrecen muy seguido)

| Upsell | % de convs que lo ofrecieron |
|---|---|
| **Alojamiento** | **82 %** ← oferta casi universal |
| OW → Advanced (próxima certificación) | 67 % |
| OW Convencional → OW30 | 62 % |
| Solo Fun Dives → Deep Adventure + Fun Dive | 62 % |
| OW → Night Dive | 52 % |
| Try Scuba → OW como día 1 | 7 % |

---

## 2. LA ARQUITECTURA DE UNA VENTA EXITOSA — LAS 9 JUGADAS

Reconstruidas a partir de las 15 conversaciones que cerraron. **No todas las ventas usan todas las jugadas**, pero las que cerraron rápido (<24h) sí completaron las 9 sin saltar pasos.

1. **Saludo personalizado** ("Hola, soy [Nombre] de DPM Diving 👋🏻") — los agentes que cierran rápido se identifican con nombre
2. **Calificación implícita** (leer lo que el cliente ya dijo) o **explícita** (1 sola pregunta por mensaje)
3. **Catálogo de programas** — siempre OW Conv + OW30 juntos cuando aplica, con recomendación EXPLÍCITA del OW30
4. **Video de DPM** (refuerza la decisión)
5. **Pregunta de upsell directa**: *"¿pensaste en obtener tu próxima certificación?"* (literal en varias conversaciones)
6. **Urgencia con número específico** (*"solo nos quedan 4 espacios en barco en la fecha preferida"*) — no urgencia genérica
7. **Datos bancarios o Stripe** según moneda — primer intento bank transfer si es EU/UK/AUS, fallback Stripe siempre disponible
8. **Pedido específico de PDF descargado**: *"Por favor descarga el comprobante de pago y compártelo con nosotros una vez procesado el depósito 🙂"* — frase literal repetida en TODAS las conversaciones que cerraron
9. **Post-depósito en mensajes separados** — los 6 mensajes secuenciales (ver sección 6)

---

## 3. MANEJO DE OBJECIONES — FRASES TEXTUALES REALES

### 3.1 Precio / Descuento

**Cliente:** *"Therefore I was wondering if you could apply a discount to your price"*  
**Agente (que funcionó):** *"There are over 70 schools on KT, and although the products might be similar, we know that service makes the difference, and we're amazing at it from the moment you arrive until you leave 👌🏻 But please don't just take my word for it and take a quick look at our reviews on Google, you'll be able to see we're number 1, on the number 1 island for diving in the whole world 🙂🤿"*

**Cliente:** *"Nos interesa el de 30m pero se nos va un poco de presupuesto sinceramente"*  
**Agente:** *"Entiendo Martin 🙏🏻 Me temo que el Open Water 30 ya tiene incluido el descuento, pero con gusto podríamos ofrecerte el Open Water convencional por [MONTO] 😊"*

**Cliente:** *"will it possible for you to give us a discounted price?"*  
**Agente:** *"For 2 people right? As we really want to have you onboard, we are happy to offer you the try scuba diving for [MONTO] per person ☺️"*

**Cliente:** *"Yeah was still comparing prices. I think if I do the 30 meter I'll go with you guys cuz your the only ones that offer it but may go with a slightly cheaper option pending availability"*  
**Agente:** *"We really appreciate it, Theo! If you are looking for cheaper option, I spoke with our office and we can do the conventional open water program at [MONTO] 😊🤿 How do you feel about that Theo? 👌🏽🤿"*

**Cliente:** *"Hice hace unos meses el open waters con DPM pero en Gili. Hay algún descuento para clientes fieles?"*  
**Agente:** *"Iré a verificar con nuestra oficina y vuelvo lo más pronto que pueda con la información! ... Tras comprobarlo, ¡podemos ofrecerte un descuento del 10 %, Héctor! 😉"*

**Patrón:** los agentes humanos negocian precio activamente. No se mantienen en floor. Cuando el cliente objeta precio, ofrecen: (a) el "70 schools" pitch antes que el descuento, (b) downgrade a OW convencional manteniendo la venta, (c) descuento explícito 10% para clientes fieles, (d) descuento ad-hoc verificando con oficina.

### 3.2 Pago no funciona — el switch universal a Stripe

**Cliente:** *"He intentado realizar la transferencia desde mi cuenta de Revolut dos veces pero me da error"*  
**Agente:** *"Bueno si estás teniendo problemas para realizar la transferencia te voy a enviar un link de pago con tarjeta. Por favor, utilice el siguiente enlace para procesar su pago de depósito de débito / crédito. Será [MONTO] por buzo, así que por favor ajuste la 'cantidad' en consecuencia 🙂💳 https://buy.stripe.com/8wMdUJcMCgBZ1K8bIK"*

**Cliente:** *"Do you have the revolut @m"*  
**Agente:** *"I'm afraid we don't have revolut, but you can do a manual bank transfer from your revolut account going to our THB local bank account 🙏"*

**Cliente:** *"No me funciona la tarjeta. Tengo una visa argentina."*  
**Agente:** *"Hola, ¿puedo preguntarte si estás intentando pagar con tarjeta de crédito/débito?"* → eventual switch a Stripe → resuelto

**Patrón:** ante CUALQUIER fallo de pago, el agente NO se rinde. Manda link de Stripe inmediatamente. En la 0041 esto cierra una venta de 2 personas en 4 minutos después del fallo de Revolut.

### 3.3 PADI vs SSI

**Cliente:** *"if i do the rescue certification, how much does it cost to 'transfer' to padi?"*  
**Agente:** *"By the way Miguel, we are SSI Dive center. That means that the certification that we are giving out are under SSI. But PADI and SSI are the same, they provide the same lifetime and international license 🪪 Meaning that, besides not expiring, you'll be able to use it anywhere in the world 🤿"*

**Patrón:** la frase clave es "PADI y SSI son lo mismo, ambos lifetime e internacional". No competir con PADI, decir que son equivalentes.

### 3.4 "Today / Tomorrow" — ⚠️ Los agentes NO escalan

Esto es un hallazgo crítico que va contra el EMMA_PROMPT actual. Ver sección 8.

**Cliente:** *"i would be amazing if i could do the theorical part today :)"*  
**Agente:** *"Let me check it with our office if we can start today 👌"* — **maneja, no escala**

**Cliente:** *"is it possible for me to go diving with him tomorrow?"*  
**Agente:** *"Hey there, how's it going? This is [Agente] from DPM Diving 👋 Thanks for reaching out today!"* — saluda y entra en calificación normal, NO escala

**Cliente:** *"hello, i'm [nombre] and i arrived today at koh tao. i'm aowd and would like to dive for 2 or 3 days"*  
**Agente:** *"Hey there [Nombre], how's it going? This is [Agente] from DPM Diving 👋 Thanks for reaching out today!"* — proceso normal

**Cliente:** *"es necesario concretar un día en específico o se puede avisar por ejemplo el día 19 de: oye he llegado hoy! empecemos mañana día 20!"*  
**Agente:** *"Siempre recomendamos reservar con antelación, aunque no hay mínimo. Pero, por supuesto, lo mejor es reservar tu cupo cuanto antes. Los cupos son limitados y reservar con antelación te garantiza que podrás elegir tus fechas preferidas. 😊"* — convierte la objeción en urgencia

**Cliente:** *"we can't tomorrow 😓 would be either tuesday or wednesday"*  
**Agente:** *"Sure! We still have available slots on Tuesday or Wednesday 😊"* — pivot a fecha alternativa, no escala

### 3.5 Swimming / no sé nadar

**Cliente:** *"but she wants to do the same open water course. will that be problem. she can float on the pool but not a good swimmer"*  
**Agente:** *"Not possible, Niloy. I am afraid that for doing the Open Water anywhere in the world, she'll need to swim well 🙏🏻"* — recomendación clara, no Open Water si no nada

**Patrón:** los agentes humanos son **firmes** con el requisito de natación para OW. Si no nada bien → derivar a Try Scuba o Scuba Diver (que no requieren natación), no forzar OW.

### 3.6 Condición médica (asma / claustrofobia / etc.)

**Cliente:** *"El es asmático pero está tratado, habrá algun problema con eso?"*  
**Agente:** *"Gracias por hacernos saber esto. En el caso de tu novio, necesitan ir a la clínica una vez que estén en la isla y explicar la condición de tu novio para que así tengan información precisa sobre esto. Recomendamos ir a la Clínica Ocean aquí en Koh Tao."*

**Patrón:** condición médica = "Clínica Ocean en la isla". No diagnostica, no rechaza, no contradice. Deriva a evaluación profesional local Y mantiene la venta abierta. **Esta venta cerró** después de la derivación.

### 3.7 Cliente reactivado / lead frío

**Cliente:** *"Hola! No aún. Estoy viendo otros destinos pero te aviso si voy para allá"*  
**Agente:** *"Hola [Nombre]. Muchas gracias por su respuesta. ¡Todavía estamos esperando que podamos tenerte aquí en DPM! Ya sea en Koh Tao, Koh Phi Phi, Nusa Penida, Gili Trawangan o Gili Air 🤿. Por favor, no dudes en contactarnos si sientes que necesitas más ayuda, ¡tenga un gran resto de su día! 🙂"*

**Patrón:** mantener la puerta abierta sin presión + mencionar TODAS las sedes de DPM (puerta para cross-sell entre branches).

### 3.8 "El depósito se descuenta o se pierde?"

**Cliente:** *"Or do you return/discount the value after?"*  
**Agente:** *"No worries about that! The deposit will be deducted to your grand total 👌🏽"*

---

## 4. SEÑALES DE COMPRA — qué dicen los clientes JUSTO antes de pagar

Estos son los mensajes textuales que aparecen justo antes de que el cliente envíe el PDF del comprobante. Los agentes deben detectar estas señales y NO dar más información — solo cerrar.

### Confirmaciones directas (intención clara)
- *"Yes please"* (0206 — disparó cierre)
- *"Send me everything and as soon as I can, I'll make the payment so I can confirm the reservation!"* (0033)
- *"OK lo pago"* / *"Ahora te pago"* / *"Ahora te pago el segundo"* (0008)
- *"De acuerdo. Realizo la transferencia en breve y te envío comprobante"* (0041)
- *"Perfecto, lo hago y envío el comprobante"* (0004)
- *"Will do it right away"* / *"Okay, will do it right away"* (0206)
- *"I will send a screenshot when i transferred the money"* (0048)
- *"Okay we will do it as soon as we are in the hostel"* (0048)

### Preguntas operativas (señal alta — el cliente ya está en modo "cómo pago")
- *"Cuánto se debe poner de depósito?"* (0031)
- *"What should go in the payment reference/purpose field?"* (0048)
- *"Hello! I need your address to make the payment!"* (0033)
- *"Can you generate some n26 or revolut qr code?"* (0016)
- *"It's total 12000 bath right? should i pay when i arrive tomorrow?"* (0057)

### Confirmaciones cortas (después de pregunta de cierre del agente)
- *"Sí"* / *"Si"* / *"Yes"* / *"Yep"*
- *"Sii 🙌🏼"* / *"Yeah"* / *"Sure"*
- *"Okay"* / *"Ok"*
- *"👍"* / *"Perfect"* / *"Perfecto"*

> **Regla operativa:** ante cualquiera de estas señales, el siguiente mensaje del agente debe ser **datos bancarios o link Stripe + petición de PDF**. Nada más. No volver a explicar el programa.

---

## 5. FRASES DEL AGENTE QUE DISPARARON EL CIERRE

Estos son los mensajes que el agente envió JUSTO ANTES de que el cliente diera la señal de compra.

| Frase del agente | Señal del cliente que disparó |
|---|---|
| *"Would you like to continue with the reservation?"* | "yes please" |
| *"Would you like to proceed on booking so we can lock your boat space?"* | "send me everything" |
| *"Por favor, descarga el comprobante de pago y compártelo con nosotros una vez procesado el depósito 🙂"* | "perfecto, lo hago" |
| *"After the payment we will ask your information 😊"* | "perfect" |
| *"Looking forward to hearing from you tomorrow morning!"* | "we will do it asap" |
| *"Whenever you can please let me know if you will join us on the 15/01, so we can arrange it accordingly 😊"* | "ok i would like to book only for me the open water course and the accommodation" |

**Patrón común:** las preguntas de cierre son **binarias** ("would you like to / shall I / proceed?"), con tono **suave pero específico** ("lock your boat space" en vez de "reservar tu lugar"). No son frases agresivas.

---

## 6. SECUENCIA POST-DEPÓSITO — LOS MENSAJES SEPARADOS

Confirmado en las conversaciones 0024, 0041 y otras: una vez recibido el PDF correcto, el agente envía estos mensajes en **mensajes SEPARADOS** (no concatenados):

### Mensaje 1 — ACK PDF + petición de datos personales
> *"¡Muchas gracias por la prueba! Antes de continuar. La siguiente información nos ayudará a brindar un mejor servicio y a tener todo organizado antes de su llegada. 🙂 Recuerde incluir a todos los buceadores. 👇🏻*
> *Nombre y Apellido:*
> *Fecha de nacimiento (DD/MM/AAAA):*
> *N.° de pasaporte:*
> *(equipo de buceo): 🤿🩳👙*
> *Camiseta:*
> *Zapatos:*
> *Esperamos su respuesta para proceder con su reserva. 🙂👌🏻"*

### Mensaje 2 — Confirmación del booking
> *"¡Todo listo para tu [PROGRAMA] el [FECHA] a las [HORA] para [N] persona(s)! 😃 Solo tienes que pasar por la tienda de buceo el día anterior a empezar tu actividad, para que podamos registrarte y verificar tus tallas de equipo de buceo. Te recordamos que el horario de atención de nuestra oficina es de 8am a 8pm 👩‍💼🏢 ¡Te esperamos!"*

### Mensaje 3 — SSI App
> *"Mi SSI App 😎🤿 Con el fin de acelerar los procedimientos, te pedimos que tengas la amabilidad de descargar... Nuestro número de centro de formación es 766502 / DPM Diving 🙂.*
> *ANDROID 🖥 https://play.google.com/store/apps/details?id=com.divessi.ssi*
> *IOS - iPhone 🖥 https://..."*

### Mensaje 4 — Koh Tao Booking Center (transporte)
> *"Oficina de transporte de confianza. Obtén información y asistencia para billetes de ferry, tren, autobús y avión. También pueden ayudarte con el alquiler de scooters y ciclomotores.*
> *Koh Tao Booking Center ⛴️🚂🚌✈️*
> *[+66 84 423 6278] (WhatsApp)*
> *[Google Maps link]*
> *¡Asegúrate de hacerles saber que [AGENT] de DPM Diving te dio su número!"*

### Mensaje 5 — Location
> *"DPM Diving Location (Google Maps) 👇 [maps link]"*

### Mensaje 6 — Closing
> *"¡Muchas gracias de nuevo por elegirnos! Nos vemos el [FECHA] para completar tu registro si es posible. No dudes en escribirnos si necesitas más ayuda. ¡Que tenga una buena noche! 🙂🤿"*

---

## 7. UPSELL PLAYBOOKS PROBADOS

### 7.1 Try Scuba → OW (cuando el cliente tiene 3+ días)

**Frase exacta:** *"Since you'll already be in the water on day 1 — the Try Scuba is actually day 1 of the Open Water course. If you love it, you just continue and the whole day counts toward your certification. No extra cost for that day 🤿"*

### 7.2 OW Convencional → OW30 (presentación dual obligatoria)

Los agentes humanos **siempre** envían los DOS catálogos (Open Water Conv + OW30) juntos, y luego recomiendan explícitamente el OW30:

> *"El primero es el programa Open Water en su versión convencional, y el segundo es el generalmente más solicitado y siempre recomendado Open Water 30. Recomendado no solo por los regalos y 'amenities' incluidos en el paquete, sino también por la posibilidad de obtener una licencia internacional y de por vida para bucear a una profundidad máxima de 30 metros en lugar de 18."*

Esto aparece en el 62% de las conversaciones. La AI debería hacerlo igual.

### 7.3 OW → Advanced (pregunta de "próxima certificación")

**Frase exacta:** *"[Nombre], has pensado en obtener tu próxima certificación? 😊"*

Si responde "no sé" → presentar Advanced. Si responde "solo fun dives" → ir a Deep Adventure (siguiente playbook).

### 7.4 Solo Fun Dives → Deep Adventure + Fun Dive (sube ticket 86%)

**Frase exacta:** *"Una inmersión de aventura podría certificarte para bucear hasta 30 metros. Te interesaría? 😊"*

Resultado típico: cliente que iba a pagar 2.100 THB (Fun Dives) termina pagando 3.900 THB (Deep Adventure + Fun Dive).

### 7.5 Accommodation (el upsell más ofrecido — 82% de convs)

**Frase exacta para OW + 3 noches:**
> *"Si necesitás alojamiento, nuestro hostel está al lado del centro. Por las 3 noches del curso son solo +1,000 THB más — el paquete completo sale 12,000 THB en vez de 11,000. Habitaciones con AC, muy limpias y cómodas 🙂 ¿Te interesa?"*

**Para clientes que piden privado:** ofrecer privado a precio diferenciado (vs habitación compartida 350 THB/noche).

---

## 8. ⚠️ HALLAZGOS PARA LA MIGRACIÓN — REGLAS DEL EMMA_PROMPT QUE CAMBIAN AL PASAR A LA AI PROPIA

> **Contexto:** el EMMA_PROMPT actual se diseñó para correr en la AI nativa de respond.io, que tenía limitaciones de tokens y lógica condicional. Varias reglas del prompt son **workarounds** que dejan de aplicar al migrar a la AI propia (con acceso real al roster, lógica condicional completa, y mejor razonamiento contextual).
>
> Esta sección distingue **lógica de negocio real de DPM** (mantener) vs **band-aids de respond.io** (eliminar/relajar en la AI nueva).

### 8.1 ❌ ELIMINAR EN AI NUEVA — Regla de escalación automática de "Today/Tomorrow"

**EMMA_PROMPT actual:**
> HOY/MAÑANA—CRÍTICO: Cliente dice "today"|"tomorrow"|"hoy"|"mañana"|"tonight"|"already here"|"ya estoy aquí"|"ya llegué"→NO consultar roster. EN:"Let me pass you to someone on the island 😊"...→[AGENTE REQUERIDO]

**Por qué existe:** workaround de respond.io. La AI nativa no manejaba bien la lógica combinada de roster + corte por hora + contexto de urgencia, entonces se forzaba a escalar para evitar respuestas malas.

**Estado en la AI nueva:** **ELIMINAR.** La AI propia ya tiene el endpoint del roster funcional (validado) con corte por hora GMT+7 (AM/PM/Night automático). Debe manejar today/tomorrow exactamente como los agentes humanos en las 40 conversaciones:

- *"i could do the theorical part today"* → consultar roster con date=hoy → si PM disponible: ofrecerlo, si lleno: pivot a mañana AM
- *"already in Koh Tao tomorrow"* → calificar + roster mañana → cerrar normal
- *"podríamos avisar el día 19 he llegado hoy"* → urgencia: *"siempre recomendamos reservar con antelación, cupos limitados"*

**Regla nueva sugerida para la AI propia:** consultar roster siempre, manejar normalmente, escalar **solo** cuando aparezca razón real de las que ya están en KB-07 (médico, reembolso, grupo 8+, queja, emergencia, etc.).

### 8.1.bis — Reglas a revisar bajo la misma lente

Candidatas a auditar caso por caso al armar el prompt nuevo:

| Regla | Tipo probable | Acción sugerida |
|---|---|---|
| Escalación por "today/tomorrow" | Workaround respond | ❌ Eliminar |
| `NUNCA decir pool/piscina` | Lógica DPM (no hay piscina) | ✅ Mantener |
| `MÁX 1 PREGUNTA/MSG` | Estilo WhatsApp humano | ✅ Mantener |
| `MÁX 3 LÍNEAS/MSG` | Estilo WhatsApp humano | ✅ Mantener |
| `NUNCA mencionar resumen técnico` | Lógica DPM | ✅ Mantener |
| `"value" en vez de "price"` | Estilo de venta | ✅ Mantener |
| Lista PROHIBIDO ("Let me check", "I'll confirm") | Anti-vaguedad genérica | ⚠️ Revisar — algunas son válidas |
| Triggers de cierre ("how do I book", "sounds good") | Detección de señal de compra | ✅ Mantener |
| Reglas de KB routing ("para X → KB-Y") | Workaround respond (no tenía RAG) | ⚠️ En AI nueva con RAG real → eliminar; con KB inyectada al prompt → mantener |
| Escalación a [AGENTE REQUERIDO] genérica | Mixto | ⚠️ Mantener las del KB-07 (médico, etc.), eliminar las defensivas |

> **Próximo paso recomendado:** auditoría sistemática del EMMA_PROMPT con esta tabla. Cada regla → ¿lógica DPM o workaround respond? → mantener / eliminar / relajar.

### 8.2 La AI debe negociar precio activamente, no solo defender el floor

**EMMA_PROMPT actual:** menciona floor de 9.500 THB para OW, 3.300 para Try Scuba grupo. Eso está bien como límite, pero NO indica cuándo y cómo negociar.

**Lo que hacen los agentes humanos:**
1. Primera respuesta a precio: pitch del **"70 schools en Koh Tao, somos número 1"** (no descuento)
2. Si cliente insiste: **downsell a OW Conv si pidió OW30** (mantiene venta, mejora valor percibido)
3. Si cliente menciona **cliente fiel DPM previo**: ofrecer 10% verificando con oficina
4. Solo si TODO falla: descuento ad-hoc verificando con oficina

**Recomendación:** agregar esta escalera de negociación al prompt antes del floor de precios.

### 8.3 La velocidad de respuesta al PDF tiene un benchmark humano

**Mediana real: 1,6 minutos.** La AI debe responder al recibir comprobante PDF en menos de 2 minutos para mantener el momentum del cierre.

### 8.4 "70 schools" pitch no está en KB-05 ni en EMMA, pero es la respuesta #1 a precio

Agregar este snippet a KB-08 (KTEN70Schools ya existe en respond.io según el listado) — asegurar que la AI tenga acceso.

### 8.5 Mensaje de reactivación de lead frío

Si cliente dijo "estoy viendo otros destinos" o "te aviso", el mensaje de reactivación funcional es:
> *"¡Todavía estamos esperando que podamos tenerte aquí en DPM! Ya sea en Koh Tao, Koh Phi Phi, Nusa Penida, Gili Trawangan o Gili Air 🤿"*

Notar que **menciona TODAS las sedes** — eso abre puerta a cross-sell entre branches.

### 8.6 "Hostel privado" existe en la realidad operativa (no solo shared)

En la 0024 el cliente termina pagando habitación PRIVADA a precio diferenciado. El KB-03 actual solo lista shared rooms (4 y 12 personas). Verificar si existe privado o fue caso excepcional.

---

## 9. FRASES TEXTUALES GANADORAS — biblioteca para few-shot

### 9.1 Frases de calificación (UNA por mensaje)
- *"Tienen alguna fecha específica de llegada a la isla?"*
- *"¿Cuántos días planean estar en la isla?"*
- *"¿Es la primera vez que bucean o ya tienen alguna certificación?"*
- *"¿Cuándo fue tu última inmersión?"* (solo si dijo tener certificación)

### 9.2 Frases de transición a catálogo
- *"En este caso déjame compartir nuestros programas contigo, para que tengas la información más clara! 😎"*
- *"Aquí te dejo la información de nuestros programas open water disponibles al momento 👇"*

### 9.3 Frases de upsell directo
- *"[Nombre], has pensado en obtener tu próxima certificación? 😊"*
- *"Una inmersión de aventura podría certificarte para bucear hasta 30 metros. Te interesaría?"*
- *"By the way Miguel, we are SSI Dive center"* (cuando cliente menciona PADI)

### 9.4 Frases de urgencia
- *"Solo nos quedan [N] espacios en barco en la fecha preferida"* (con número específico)
- *"Los cupos son limitados y reservar con antelación te garantiza que podrás elegir tus fechas preferidas. 😊"*

### 9.5 Frases de cierre / disparo del depósito
- *"Would you like to continue with the reservation?"*
- *"¿Me gustaría saber si podemos proceder a agendar tu espacio en el barco?"*
- *"Would you like to proceed on booking so we can lock your boat space?"*

### 9.6 Pedido del PDF (literal en todas las cerradas)
- *"Por favor, descarga el comprobante de pago y compártelo con nosotros una vez procesado el depósito 🙂"*
- *"Please, download the proof of payment and share it with us once deposit has been processed 🙂"*
- *"Recuerda que no podremos bloquear tu plaza hasta que recibamos la confirmación del pago 🙏🏻"*

### 9.7 Frases ante fallo de pago
- *"Bueno si estás teniendo problemas para realizar la transferencia te voy a enviar un link de pago con tarjeta"* → Stripe
- *"Ah ok ok, no te preocupes"* (calmar antes de proponer alternativa)

### 9.8 Frases ante condición médica
- *"Gracias por hacernos saber esto. En este caso necesitan ir a la clínica una vez que estén en la isla y explicar la condición para que así tengan información precisa. Recomendamos ir a la Clínica Ocean aquí en Koh Tao."*

### 9.9 Frases ante "voy a pensarlo" / silencio
- *"¿Continúas en línea?"*  (después de ~20 min sin respuesta dentro del flow)
- *"Esperamos poder seguir ayudándote y contar con tu apoyo 🙂 Por favor, avísanos cuando estés disponible para continuar 🤿"*
- *"Hola [Nombre], espero que todo vaya genial 🙂 ¿Me pregunto si tuviste la oportunidad de chequear la info que te compartimos anteriormente? Dinos si tienes alguna pregunta, y esperamos tus comentarios sobre cómo te gustaría avanzar 🙂"*

### 9.10 Frase de reactivación lead frío (>2 días sin respuesta)
- *"¡Todavía estamos esperando que podamos tenerte aquí en DPM! Ya sea en Koh Tao, Koh Phi Phi, Nusa Penida, Gili Trawangan o Gili Air 🤿"*

---

## 10. FICHAS RESUMIDAS DE LAS 15 CONVERSACIONES CERRADAS


### koh_tao_0004 — Argentina viviendo en China
- **Idioma:** ES  |  **Mensajes:** 147  |  **Duración:** 457.6h  |  **Pax cerrados:** 1
- **Programa(s) vendidos:** OW
- **Objeciones:** pago_problema (tarjeta argentina, Alipay), competencia (viendo otros destinos)
- **Señal de compra:** "Perfecto, lo hago y envío el comprobante"
- **Aprendizaje clave:** Lead frío reactivado por agente. Switch a Stripe resolvió pago. Pero novio se perdió como venta (50% del lead).


### koh_tao_0006 — EN, pidió descuento
- **Idioma:** EN  |  **Mensajes:** 137  |  **Duración:** 117.0h  |  **Pax cerrados:** 1
- **Programa(s) vendidos:** OW + Fun Dive + Instructor talks
- **Objeciones:** precio (discount), competencia (compared schools)
- **Señal de compra:** "You don't have an iban?"
- **Aprendizaje clave:** El "70 schools" pitch funcionó. Cliente comparó pero terminó eligiendo.


### koh_tao_0007 — EN, aspiring Divemaster
- **Idioma:** EN  |  **Mensajes:** 134  |  **Duración:** <1h (relámpago)  |  **Pax cerrados:** 1
- **Programa(s) vendidos:** Advanced + camino a DM
- **Objeciones:** precio (bigger than expected), pago (Revolut no), PADI confusion
- **Señal de compra:** "Ohh okok got it"
- **Aprendizaje clave:** Múltiples objeciones manejadas en cadena: PADI/SSI, precio, Revolut. Cerró Advanced sin DM completo (correcto: limitado por tiempo).


### koh_tao_0008 — ES Martin, presupuesto
- **Idioma:** ES  |  **Mensajes:** 130  |  **Duración:** <1h (relámpago)  |  **Pax cerrados:** 1
- **Programa(s) vendidos:** OW Conv (downsell desde OW30)
- **Objeciones:** precio (se va de presupuesto OW30)
- **Señal de compra:** "Ahora te pago el segundo"
- **Aprendizaje clave:** Downsell honesto: "OW30 ya tiene descuento, ofrezco Conv". Cerró el OW Conv en vez de perder la venta.


### koh_tao_0011 — EN Theo, comparando schools
- **Idioma:** EN  |  **Mensajes:** 122  |  **Duración:** 50.0h  |  **Pax cerrados:** 1
- **Programa(s) vendidos:** OW Conv (downsell desde OW30)
- **Objeciones:** precio (comparing), competencia (otra escuela)
- **Señal de compra:** Mensaje del cliente: "Not at all! Maybe put me down..."
- **Aprendizaje clave:** Cliente seriamente comparando. Agente ofreció OW Conv en lugar de OW30 para retener. Funcionó.


### koh_tao_0016 — EN, pago QR Revolut/N26
- **Idioma:** EN  |  **Mensajes:** 114  |  **Duración:** <1h (relámpago)  |  **Pax cerrados:** 1
- **Programa(s) vendidos:** OW
- **Objeciones:** pago_problema (QR codes)
- **Señal de compra:** "Just to be sure" + "Can you generate some n26 or revolut qr code?"
- **Aprendizaje clave:** Cliente pidió QR. Agente switch a métodos disponibles (Stripe + bank transfer).


### koh_tao_0017 — ES Héctor, ex-DPM Gili
- **Idioma:** ES  |  **Mensajes:** 112  |  **Duración:** <1h (relámpago)  |  **Pax cerrados:** 1
- **Programa(s) vendidos:** OW + Fun Dive + Advanced
- **Objeciones:** precio (cliente fiel pidió descuento)
- **Señal de compra:** "Lo haremos más tarde! Gracias!!"
- **Aprendizaje clave:** Cliente fiel DPM Gili → ofrecido 10% verificando oficina. Cerró.


### koh_tao_0031 — ES, pago efectivo
- **Idioma:** ES  |  **Mensajes:** 89  |  **Duración:** <1h (relámpago)  |  **Pax cerrados:** 1
- **Programa(s) vendidos:** OW + Fun Dive + Instructor chat
- **Objeciones:** pago_problema (quiere efectivo allí)
- **Señal de compra:** "Cuanto se debe poner de depósito?"
- **Aprendizaje clave:** Cliente quería pagar en efectivo al llegar. Agente firme: depósito necesario para reservar.


### koh_tao_0033 — EN Juli, accommodation
- **Idioma:** EN  |  **Mensajes:** 89  |  **Duración:** <1h (relámpago)  |  **Pax cerrados:** 1
- **Programa(s) vendidos:** OW Conv + accommodation 4 noches
- **Objeciones:** competencia (amigos ya bookearon), pricing accommodation
- **Señal de compra:** "Send me everything and as soon as I can, I'll make the payment so I can confirm the reservation!"
- **Aprendizaje clave:** Solo en grupo de amigos. Vendió OW + alojamiento. Frase cierre fue señal muy fuerte.


### koh_tao_0041 — ES Melchor+Julio, ya conocían DPM
- **Idioma:** ES  |  **Mensajes:** 83  |  **Duración:** 1.7h  |  **Pax cerrados:** 2
- **Programa(s) vendidos:** OW + Aventura Profunda + Fun Dive
- **Objeciones:** pago_problema (Revolut falló), "más gente para conocer?"
- **Señal de compra:** "De acuerdo. Realizo la transferencia en breve y te envío comprobante"
- **Aprendizaje clave:** CIERRE RELÁMPAGO 1h 43min. Switch Revolut→Stripe en 4 min. Upsell Fun Dive → Deep Adventure exitoso.


### koh_tao_0048 — EN, reference field question
- **Idioma:** EN  |  **Mensajes:** 78  |  **Duración:** <1h (relámpago)  |  **Pax cerrados:** 2
- **Programa(s) vendidos:** OW + Scuba Diver
- **Objeciones:** pago_problema (campo de referencia)
- **Señal de compra:** "I will send a screenshot when i transferred the money"
- **Aprendizaje clave:** Agente clarificó campo de referencia bancaria. Cliente procedió.


### koh_tao_0057 — EN, llegando tomorrow
- **Idioma:** EN  |  **Mensajes:** 72  |  **Duración:** 154.0h  |  **Pax cerrados:** 1
- **Programa(s) vendidos:** OW + accommodation
- **Objeciones:** today_tomorrow (llega mañana), salud_anxiety (amigo never dived)
- **Señal de compra:** "ok i would like to book only for me the open water course and the accommodation"
- **Aprendizaje clave:** "Tomorrow" no escaló. Amigo never dived → ofrecido OW también. Cerró 1 venta + lead caliente para amigo.


### koh_tao_0206 — EN Daan, simple
- **Idioma:** EN  |  **Mensajes:** 43  |  **Duración:** 45.0h  |  **Pax cerrados:** 1
- **Programa(s) vendidos:** OW
- **Objeciones:** (ninguna mayor)
- **Señal de compra:** "Yes please" + "Okay, will do it right away"
- **Aprendizaje clave:** Cierre limpio. Cliente decidido. Cierre clásico con "Would you like to continue with the reservation?"


### koh_tao_0267 — EN, BIC problem
- **Idioma:** EN  |  **Mensajes:** 36  |  **Duración:** 102.0h  |  **Pax cerrados:** 1
- **Programa(s) vendidos:** OW
- **Objeciones:** pago_problema (BIC wrong)
- **Señal de compra:** "The bank says your bic code wrong"
- **Aprendizaje clave:** Cliente reportó BIC mal. Agente verificó y cliente terminó pagando con datos correctos.


---

## 11. PRÓXIMOS PASOS Y MEJORAS

1. **Ampliar a 50** — los 10 adicionales sacarlos del corpus general (155 conversaciones con cierre_score=1) que tengan: programa específico no cubierto (ej. Rescue, Specialty), idioma escaso (mixto), o segmento de cliente subrepresentado (familia con niños).
2. **Validar el ajuste del EMMA_PROMPT** en los 6 hallazgos críticos de la sección 8.
3. **Integrar al KB-08** el snippet del "70 schools" si no existe (KTEN70Schools ya está listado en respond.io).
4. **Medir velocidad de respuesta** de la AI al recibir PDF — el benchmark humano es 1,6 min mediana.
5. **Agregar pruebas de regresión** en el simulador con los escenarios de las 8 objeciones más comunes, usando las frases textuales como ground truth de respuesta esperada.

---

*Documento generado a partir del análisis empírico de conversaciones reales. Las anonimizaciones [NOMBRE_CLIENTE], [MONTO], [PASAPORTE] están preservadas del dataset original.*


---

> Basado en análisis empírico de **12 conversaciones top** de grupo mixto del corpus completo (133 detectadas, 33 cerraron exitosamente entre abril 2025 y marzo 2026)

---

## 12. GRUPO MIXTO — Uno con certificación + uno sin certificación

> Sección basada en análisis empírico de **12 conversaciones top** de grupo mixto del corpus completo (133 detectadas, 33 cerraron exitosamente entre abril 2025 y marzo 2026)

---

## 12.1 Frecuencia y peso

- **133 conversaciones** identificadas como grupo mixto en 12 meses de corpus (~2.8% del total de leads)
- **33 cerraron exitosamente** (24.8% de cierre, ALTO comparado con el 37.5% global de las 40 curadas)
- Patrones típicos:
  - Cliente certificado + amigo/novia/hermano principiante
  - 2 personas, ambos llegan juntos a Koh Tao
  - El que ya tiene cert suele tener última inmersión hace meses o años → Refresh obligatorio
- Ticket promedio del grupo: **9.000 – 25.000 THB** (depende mucho de si hacen OW30 + Advanced o solo OW Conv + Refresh)

---

## 12.2 Apertura — Las 3 preguntas críticas de calificación

Cuando el cliente revela que es grupo mixto, los agentes humanos preguntan en **este orden** antes de cualquier pitch:

### Pregunta 1 — Nivel exacto de la certificación
> "May I know the level of his certification?"
> "May we know the level of your certification?"

⚠️ **CRÍTICO:** "tiene la cert" no es suficiente. Hay diferencia entre Open Water (18m), Advanced (30m), Rescue, DM. El programa siguiente depende del nivel exacto.

### Pregunta 2 — Última inmersión
> "When was the last time he went diving?"
> "May we know the exact month of your last dive?"

⚠️ Define si aplica Refresh (>6 meses → obligatorio).

### Pregunta 3 — ¿Quieren bucear JUNTOS?
> "By the way, are you referring if you guys can dive together?"
> "While you are doing the advanced program and while your friend is doing the open water program?"

Esta pregunta es la que más cambia el pitch. (Ver sección 9.4)

---

## 12.3 La aclaración crítica que falta en los KBs actuales — "mismo barco NO es mismo grupo"

**HALLAZGO IMPORTANTE:** los agentes humanos aclaran sistemáticamente que cuando hacen programas distintos:
- ✅ Van en el **mismo barco**
- ❌ NO bucean en el **mismo grupo** (instructor distinto, profundidad distinta, ritmo distinto)

### Frases textuales reales (EN):
> "I'm afraid since you guys are gonna be doing 2 different programs, we cannot put you in one group and dive together. If you guys want to dive together, you can take fun dive and join with your friend. Or you can take advanced program and open water for your friend, and you're gonna be on the same boat." — conv 354513688

> "I do understand Richard, if you'd decide take different courses, the schedules will be different. Yes you can be in the same boat, just one afternoon." — conv 413122233

> "Your friend would be 1 Fun Dives on the 6th afternoon or on the 8th? So he can be with you at the same boat." — conv 370530653

### Frases textuales reales (ES):
> "Bueno, estarían en el mismo barco, no podrían bucear juntos por temas de profundidad 🙏🏻" — conv 347930853

> "Podríamos cambiar las inmersiones de la mañana para la tarde, para que así puedan bucear juntos 😊" — conv 347930853

**Regla para Emma:** cuando los dos quieren "bucear juntos" y hacen programas distintos, NO mentir diciendo "buceen juntos". Decir "mismo barco" y aclarar que es diferente grupo. Y si quieren bucear EN EL MISMO GRUPO, ofrecer alternativas (sección 9.4).

---

## 12.4 Manejo del "queremos bucear juntos" — qué ofrecer

Si la pregunta de "¿pueden bucear juntos?" tiene peso emocional (luna de miel, viaje único, etc.), los agentes ofrecen estas alternativas:

### Opción A — Ambos Fun Dives (si los dos tienen cert)
Caso fácil. Si ambos están certificados → Fun Dives. Si uno no buceó hace mucho → Refresh + Fun Dives.

### Opción B — ⭐ Cert acompaña al sin-cert en Try Scuba (MISMO GRUPO, MISMO GUÍA)
**Esta es la jugada más fuerte si la pareja prioriza experiencia compartida.**

El cert se suma al grupo del Try Scuba con un solo guía. Se compromete a quedarse a la profundidad máxima del Try Scuba (12m) durante TODAS las inmersiones del día. Un solo guía lidera ambos — no se necesita instructor adicional.

> "tu novio tendrá que hacer el programa de Open Water primero si a él le gustaría tomar nuestro programa de Fun Dive, ya que el programa de Fun Dive solo es para buceadores certificados. O él podría hacer el programa de Try Scuba Diving que es perfecto para principiantes. En este caso, si les gustaría bucear juntos, la mejor opción para ustedes podría ser tomar el programa de Try Scuba" — conv 373182869

**Precio para el cert en esta modalidad:** tarifa Fun Dive (2.100 THB las 2 inmersiones), limitado a 12m. No paga Try Scuba completo porque ya está certificado.

**Frase ganadora para Emma:**
- EN: "If you really want to dive together for every dive — you can join your friend's Try Scuba group with a single guide. You'd stay at 12m all day (the Try Scuba limit) but you'd be diving side by side the whole time. One guide for both — no extra instructor needed. For you it's 2.100 THB (Fun Dive rate)."
- ES: "Si querés bucear juntos en todas las inmersiones — te podés sumar al grupo del Try Scuba de tu amigo con un solo guía. Te quedás a 12m todo el día (el límite del Try Scuba) pero buceás al lado todo el tiempo. Un guía para los dos, sin instructor extra. Para vos son 2.100 THB (tarifa Fun Dive)."

⚠️ Solo ofrecer si el cert valora la experiencia compartida por encima de profundidad/upsell. Si el cert es exigente con sus dives, mejor opción C.

### Opción C — Combinar horarios (no programa)
> "Podríamos cambiar las inmersiones de la mañana para la tarde, para que así puedan bucear juntos" — conv 347930853

Si el cert hace Fun Dives mientras el sin-cert hace clase de OW, programar las inmersiones del cert para que coincidan con las salidas en barco del curso. Aún así no van en el mismo grupo, pero comparten viaje en barco y comida.

---

## 12.5 Refresh para el certificado — frase ganadora

Cuando aplica (última inmersión >6 meses), los agentes humanos usan una explicación basada en **seguridad**, no en venta:

### EN:
> "In that case, you will need to take our refresh program since it's more than 6 months already since your last dive. This is part of our safety procedure to ensure the safety of all divers on board, and for you to be comfortable again underwater 👌" — conv 413122233

### ES:
> "Te recomendamos hacer el Refresh + Fun Dives primero ya que tu última inmersión fue hace [tiempo]. Esto te ayudará a estar más cómodo y confiado bajo el agua. Y por la seguridad de todos los buceadores, ya que la seguridad es nuestra prioridad 😊" — conv 347930853

**Estructura:** [hecho objetivo: pasaron X meses] + [framing por seguridad] + [beneficio para el cliente: estar cómodo]

---

## 12.6 ⭐ Patrón NUEVO — Upsell en cadena con Deep Adventure

> ⚠️ **NOTA HONESTA:** este patrón **NO está documentado en las conversaciones humanas** del corpus. Solo aparece textualmente una vez (conv 306024683: "we also can offer you the deep adventure... same schedule as the fun dives and you will get a recognition to dive up to 30m deep") y como opción aislada, NO como combo encadenado.
>
> **Esta es una jugada nueva propuesta por la dirección de DPM (no observada en los datos pero estratégicamente sólida).** Documentarla acá significa que Emma la va a aplicar ANTES que los agentes humanos. Si funciona, vale extenderla al equipo humano también.

### El concepto

En grupo mixto donde el cert necesita Refresh (>6 meses), **no solo vender Refresh sino Refresh + Deep Adventure**:

```
Amigo (con OW, última inm. 3 años) → necesita Refresh
   ↓
Upsell: Refresh + Deep Adventure (otro día)
   ↓
Resultado para el amigo:
   - Tarjeta SSI Deep Adventurer (válida de por vida)
   - Recognition para bucear a 30m con guía en cualquier escuela del mundo
   ↓
EFECTO EN CADENA SOBRE EL CLIENTE SIN-CERT:
   - "Si tu amigo va a poder bajar a 30m, te conviene OW30 en lugar
     del Open Water Conventional para acompañarlo en el futuro"
   ↓
Doble upsell con un solo movimiento
```

### Matemática del upsell

**Escenario A — sin upsell (baseline):**
- Cliente sin cert: OW Conv = 11.000 THB
- Amigo con cert: Refresh + Fun Dive = 2.600 + (Fun Dives extra a 2.100/día)
- Total mínimo: ~16.000 THB

**Escenario B — con upsell en cadena:**
- Cliente sin cert: OW30 = 17.900 THB
- Amigo con cert: Refresh + Fun Dive (2.600) + Deep Adventure + Fun Dive (3.900) = 6.500 THB
- Total: 24.400 THB
- **Δ ticket bruto: +8.400 THB**

### Cómo aplicarlo en conversación

**Paso 1 — Plantear Refresh (igual que el patrón existente):**
> "Va a necesitar un Refresh primero — pasaron más de 6 meses y es protocolo de seguridad 🙏"
> "Es una clase teórica corta + práctica en aguas poco profundas + 1 inmersión normal."

**Paso 2 — Inmediatamente después, plantar el Deep Adventure:**
> "Y ya que va a estar en el agua, te recomiendo que sume una Aventura Profunda después del Refresh. Es 1 inmersión a 30 metros + 1 fun dive, y se lleva la tarjeta SSI Deep Adventurer de por vida. Así con ese reconocimiento puede bajar a 30 metros en cualquier parte del mundo desde ahora 🤿"

**Paso 3 — Si acepta o no objeta fuerte, encadenar al sin-cert:**
> "Y ojo — si tu amigo va a poder bucear a 30 metros, te recomiendo que vos también consideres el Open Water 30 en vez del convencional. Si no, después en otro destino no van a poder bajar al mismo nivel."

### Frase ganadora textual a usar

> **"Si tu amigo va a poder bucear a 30 metros, te recomiendo que vos también consideres el OW30 — si no, después en otro destino no van a poder bajar al mismo nivel."**

Esta frase es nueva y vale rastrear su tasa de conversión durante los primeros meses de Emma.

---

## 12.7 ⚠️ Riesgos del patrón nuevo Deep Adventure

| Riesgo | Mitigación |
|---|---|
| Cliente percibe presión de venta | Plantar UNA vez. No insistir si dice "no" |
| Cert objeta precio del combo Refresh+DA | Fallback: solo Refresh + Fun Dive (vuelta al patrón base) |
| Cliente no quiere los regalos del OW30 (caso real de la simulación) | Aplicar OFERTA-001 si la fecha lo permite: OW Conv + 3 noches dorm = 9.900 THB, que sale incluso más barato que el OW Conv solo |
| Cert dice "ya buceé a 30m con OW antes" | No es la cert SSI, es solo una experiencia. La tarjeta Deep Adventurer es un reconocimiento internacional permanente |
| Quedó claro que NO le interesa | NO insistir más. Cerrar con la opción base (Refresh + Fun Dives) |

---

## 12.8 Diccionario de frases textuales (banco probado por agentes humanos)

### Apertura — calificación
| EN | ES |
|---|---|
| "May I know the level of his certification and when was the last time he went diving?" | "¿Me podés decir el nivel exacto de su certificación y cuándo fue la última vez que buceó?" |
| "Are you referring if you guys can dive together?" | "¿Estás preguntando si pueden bucear juntos?" |
| "Are you interested in getting your advanced certification this time?" | "¿Te interesa sacar tu certificación Advanced esta vez?" |

### Mismo barco / mismo grupo
| EN | ES |
|---|---|
| "You're gonna be on the same boat, but in different groups" | "Van a estar en el mismo barco, pero en grupos distintos" |
| "We cannot put you in one group since the programs are different" | "No podemos ponerlos en el mismo grupo porque los programas son distintos" |
| "Same boat, different group — you can share the trip" | "Mismo barco, grupos distintos — comparten el viaje" |

### Refresh (cuando >6 meses)
| EN | ES |
|---|---|
| "You will need to take our refresh program since it's more than 6 months already since your last dive. This is part of our safety procedure 👌" | "Va a necesitar hacer el Refresh primero porque pasaron más de 6 meses — es protocolo de seguridad 🙏" |

### Deep Adventure (NUEVO — propuesto)
| EN | ES |
|---|---|
| "Since he's already going to be in the water, I'd recommend adding a Deep Adventure after the Refresh. He gets the SSI Deep Adventurer lifetime card to dive to 30m anywhere in the world 🤿" | "Ya que va a estar en el agua, te recomiendo sumar una Aventura Profunda después del Refresh. Se lleva la tarjeta SSI Deep Adventurer de por vida para bajar a 30m en cualquier parte del mundo 🤿" |

### Cadena al OW30 (NUEVO — propuesto)
| EN | ES |
|---|---|
| "If your friend is going to be diving to 30m, I'd suggest you consider the OW30 too — otherwise on future trips you won't be able to go to the same depth together" | "Si tu amigo va a poder bucear a 30m, te recomiendo que también consideres el OW30 — si no, después en otros destinos no van a poder bajar al mismo nivel juntos" |

---

## 12.9 Caso de referencia para entrenar el detector — conversación 354513688_2025-12

Conversación más extensa del corpus (219 mensajes, cerró). Recomendada como caso de estudio porque:
- Cliente DPM fiel (ya hizo OW en Phi Phi con DPM) + amigo principiante
- El agente preguntó última inmersión, ofreció upsell a Advanced, planteó dilema "Advanced + OW = no mismo grupo"
- Cliente terminó eligiendo Basic Diver para los 4 (downgrade voluntario para todos bucear juntos)
- Cierre con descuento por volumen: 12.600 THB / 4 personas

**Decisión clave que tomó el agente:** cuando el cliente pidió bucear juntos sí o sí, el agente NO insistió en cursos separados. Aceptó el downsell para preservar la venta del grupo.

**Lección para Emma:** la "venta grande" no siempre es la venta correcta. Si el grupo prioriza experiencia compartida sobre certificaciones, ofrecer Basic Diver (Try Scuba) para todos puede ser la jugada que cierra el grupo entero.

---

*Datos: 12 conversaciones analizadas en profundidad (incluyendo cierres y no-cierres), 133 conversaciones detectadas como grupo mixto, corpus completo abril 2025 – marzo 2026 (4.738 conversaciones únicas).*
