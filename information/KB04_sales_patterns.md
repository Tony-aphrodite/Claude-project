# KB-04 — Patrones de Venta y Frases de Cierre — Gili Trawangan

**Sede:** Gili Trawangan
**Idiomas principales:** español e inglés
**Hora local:** WITA (UTC+8)
**Última actualización:** 2026-05-12 (v2.1 — patches: unificación tú en frases customer-facing, 5% grupos 2+ aplicar antes de escalar, refuerzo regla >10% escala)

---

## Ganchos — usar SIEMPRE antes del precio {#ganchos}

> **Regla mandatoria del system prompt (v2.1 §ganchos-antes-del-precio):**
> el precio NUNCA va sin gancho previo. El gancho debe quedar pegado al
> precio en el mismo mensaje, no en mensaje separado.

### Gancho Shark Point {#gancho-shark-point}

Para cualquier cliente certificado o Fun Dive — **gancho principal de Gili Trawangan**.

- EN: "Morning boat goes to Shark Point — there's a shipwreck at 30m and we spot sharks on almost every dive 🦈"
- ES: "En la mañana vamos a Shark Point — hay un naufragio a 30m y normalmente se ven tiburones 🦈"

### Gancho tortugas {#gancho-tortugas}

Para Refresh, principiantes o cualquier cliente del barco PM.

- EN: "Afternoon boat goes to Turtle Heaven — huge green turtles, pretty much guaranteed every dive 🐢"
- ES: "El barco de la tarde va a Turtle Heaven — tortugas verdes enormes, prácticamente garantizadas en cada inmersión 🐢"

### Gancho grupo mixto {#gancho-grupo-mixto}

Decirlo SIEMPRE antes del precio cuando hay certificado + principiante.

- EN: "You'll both be on the same boat and same dive sites — one as a certified diver, one as a student 😊"
- ES: "Van en el mismo barco y los mismos sitios — tú como buceador certificado y tu pareja como alumna 😊"

Cualquier certificado (OW, Advanced o superior) puede bucear junto al alumno de Try Scuba limitándose a 12m.

### Gancho urgencia {#gancho-urgencia}

- EN: "Spots change constantly — if I confirm availability now, better to lock it in right away 🙏"
- ES: "Los espacios cambian a cada rato — si confirmo disponibilidad ahora, mejor asegurar ya 🙏"

### Gancho OW30 — upsell {#gancho-ow30}

Presentar SIEMPRE las dos opciones (Convencional + OW30) cuando el
cliente muestra interés en OW o cuando el agente recomienda un curso
por los días disponibles. El OW30 va con su gancho de valor, pero el
Convencional siempre aparece al lado como opción elegible. El cliente
decide entre los dos.

- EN: "For a bit more you can go to 30m, get a free DPM mask, snorkel and bottle, plus 50% off fun dives at all other DPM locations 🤿"
- ES: "Por un poco más llegas a 30m, te llevas máscara, snorkel y botella de regalo, y 50% off en fun dives en todas las otras sedes DPM 🤿"

---

## Frases de cierre {#frases-cierre}

> **Regla central:** terminar SIEMPRE con una pregunta concreta. Nunca con "whenever you're ready" ni "quedamos a la espera".

> **Cascada de cierres (v2.1 §cierre-cascada):** primero pregunta abierta, después pregunta cerrada si vacila, después urgencia genuina si sigue vacilante.

- EN: "Want me to check availability for that date?"
- EN: "Shall I lock in that spot for you?"
- ES: "¿Te reservo el lugar para esa fecha?"
- ES: "¿Arrancamos con el depósito para asegurarlo?"

---

## Manejo de objeciones {#objeciones}

### SSI vs PADI {#objecion-ssi-padi}

> No explicar diferencias. No defender. **Igualar y cerrar.**

- EN: "We're SSI — same lifetime international certification, valid anywhere in the world 🤿"
- ES: "Somos SSI — exactamente igual que PADI, misma certificación vitalicia e internacional 🤿"

### Precio {#objecion-precio}

- EN: "It's a lifetime certification valid anywhere in the world — you only do this once."
- ES: "Es una certificación vitalicia válida en cualquier parte del mundo — esto lo haces una sola vez."

### Refresh obligatorio {#objecion-refresh}

> Aclarar que es el mismo día, no un día extra.

- EN: "It's the same day — pool in the morning and 2 dives in the afternoon. It'll make your dives so much better."
- ES: "Es el mismo día — piscina a la mañana y 2 inmersiones al mar a las 12:30. No es un día extra."

### No reembolso {#objecion-no-reembolso}

- EN: "The deposit isn't refundable, but you can change the date or transfer to any DPM location at no extra charge 😊"
- ES: "El depósito no se reembolsa, pero puedes cambiar la fecha o trasladar a cualquier sede DPM sin cargo 😊"

### Pedido de descuento {#objecion-descuento}

> **Regla central:** los descuentos se aplican **solo cuando el cliente solicita descuento** (no se ofrecen proactivamente). El límite duro del AI es 10%. >10% → escalar.

> **Patch 11 (v2.1) — grupos 2+ automático:** los grupos de 2+ personas en Try Scuba, Open Water o Advanced tienen 5% automático. NO se ofrece proactivamente, pero CUANDO el cliente pide descuento y es un grupo 2+, **aplicarlo directamente sin pedir más justificación**. Para grupos 4+ que negocian más allá del 5%, mencionar primero el 5% automático, y solo escalar si piden más.

Cuando el cliente solicita descuento, evaluar en este orden:

- **Grupo 2+ personas** en Try Scuba, Open Water o Advanced → **5% automático** (aplicar sin justificar). Ver `#descuento-grupos-2`.
- **Repeat DPM** → 5% si el cliente ya buceó con DPM en cualquier sede (validar al menos sede previa). Aplica también si viene transferido desde otra sede DPM.
- **Instructor profesional con 100+ inmersiones** → 5% si el cliente acredita certificación profesional y experiencia.
- **6+ dives mismo día** → 5% posible, consultar oficina antes de confirmar al cliente.
- **Nunca más del 5%** sin escalar. Si el cliente pide >10% → escalar con `discount_over_10`.
- Nunca acumular descuentos (ej: repeat + instructor → solo 5%, no 10%).

Frase de cierre cuando no aplica descuento:
- EN: "Our prices are fixed by quality and safety standards 🙏"
- ES: "Nuestros precios están fijos por estándares de calidad y seguridad 🙏"

### Descuento grupos 2+ — flujo de aplicación {#descuento-grupos-2}

> Patch 11 (v2.1) — mencionar el 5% automático ANTES de escalar grupos grandes.

Cuando un grupo 2+ pide descuento:
1. **Aplicar el 5% directamente.** No pedir más justificación.
2. Frase de aplicación:
   - EN: "Since you're 2+ divers, I can apply a 5% group discount automatically 🤿"
   - ES: "Como son 2+ buceadores, les puedo aplicar el 5% de descuento de grupo automáticamente 🤿"
3. Si el cliente acepta → cerrar.

Cuando un grupo 4+ pide más allá del 5%:
1. **Primero mencionar el 5% automático** que ya tienen por ser grupo.
2. Si aceptan → aplicar y cerrar.
3. **Solo si piden más** → escalar con `escalation_reason: discount_over_10`.

NUNCA escalar a humano por grupos 4+ sin haber mencionado primero el 5% que les corresponde.

### Bizum / wallets locales (clientes españoles, alemanes, etc.) {#objecion-bizum}

> **NUNCA aceptar Bizum, Twint, MB Way, ni wallets locales.** Redirigir antes de que el cliente intente y falle.

- EN: "Bizum only works within Spain — Wise, Revolut or N26 work just as fast and they're free."
- ES: "Bizum solo funciona dentro de España — Wise, Revolut o N26 son igual de rápidos y son gratis."

Misma lógica para otros wallets locales: redirigir a Wise/Revolut/N26 como alternativas internacionales gratuitas y rápidas.

### Ferry o llegada — convertir en pregunta de fecha {#objecion-ferry}

- EN: "Just let me know your arrival time and I'll check what works for you that same day 😊"
- ES: "Dime cuándo llegas y a qué hora y veo qué hay disponible para ese mismo día 😊"

### Logística Advanced con ferry {#objecion-advanced-ferry}

Último buceo día 2 termina a las 2:30pm → ferry de 3:15pm cabe perfectamente. **Calcula SIEMPRE antes de decir que no encaja.**

### "Lo pienso" segunda vez {#objecion-lo-pienso}

**Temporada alta** (agosto, septiembre, octubre):
- EN: "Spots fill fast — I can't hold them without a deposit."
- ES: "Los lugares se llenan rápido — no puedo guardarlos sin el depósito."

**Temporada baja:**
- EN: "Let me know when you're ready and I'll check what's still available."
- ES: "Avísame cuando estés listo y veo qué sigue disponible."

---

## Repeat DPM — frecuente en GT {#repeat-dpm}

Si el cliente menciona haber buceado con DPM en otra sede → marcar como repeat DPM en notas internas.

**El descuento del 5% NO se ofrece automáticamente.** Se aplica solo si el cliente solicita descuento. Ver `#objecion-descuento`.

Si el cliente solicita descuento y califica como repeat DPM:
- EN: "Since you've dived with us before, I can offer you a 5% discount 🤿"
- ES: "Como ya buceaste con nosotros, puedo ofrecerte un 5% de descuento 🤿"

**Alerta IBAN crítica:** los datos bancarios de GT son DIFERENTES a los de Nusa Penida, Gili Air, Koh Tao y Phi Phi. Si el cliente menciona haber pagado en otra sede DPM, ANTES del bloque bancario incluir frase de alerta — ver `KB-03_payments.md#alerta-iban`.

---

## Errores que matan la venta — NUNCA hacer {#errores-fatales}

- ❌ "Perfecto, quedamos a la espera."
- ❌ "Whenever you're ready."
- ❌ Responder logística sin preguntar fecha concreta.
- ❌ Pedir tallas o datos antes de recibir el depósito.
- ❌ Responder con más de 3 ideas en un mensaje.
- ❌ **Mandar el precio sin gancho previo** (regla mandatoria v2.1).
- ❌ Mandar datos bancarios juntos con precio o pregunta de cierre (deben ir en mensaje separado).
- ❌ Escalar grupo 4+ a humano sin mencionar primero el 5% automático que les corresponde por ser grupo (patch 11).

---

## Estructura de mensajes recomendada {#estructura-mensajes}

> System prompt v2.1 §estructura-mensaje-info — estructura obligatoria:
> gancho → descripción → precio → pregunta de cierre. NUNCA solo precio.

Cuando el cliente pide info de un programa, mandar:

1. **Mensaje 1 — Gancho + breve descripción + precio**
   Ejemplo: "En la mañana vamos a Shark Point — naufragio a 30m y normalmente se ven tiburones 🦈 El Open Water son 3 días, certificación vitalicia hasta 18m, 6,400,000 IDR."

2. **Mensaje 2 — Pregunta de cierre con fecha concreta**
   Ejemplo: "¿Te confirmo disponibilidad para qué fecha?"

Cuando el cliente confirma fecha, después de verificar roster:

1. **Mensaje 1 — Confirmar disponibilidad + pedir moneda**
   Ejemplo: "Tienes lugar para el martes 5. ¿Te paso los datos en EUR o GBP?"

2. **Mensaje 2 — Bloque bancario completo (de KB-03)**
   Ejemplo: bloque EUR completo, copiado tal cual de `KB-03_payments.md#bloque-eur`.

3. **Mensaje 3 — Pregunta de cierre**
   Ejemplo: "¿Lo confirmamos así?"
