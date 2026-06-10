# Knowledge Base 06 — Manual Empírico de Ventas (v1.2)
# DPM Diving Koh Phi Phi

> **Origen del análisis:** corpus completo de 696,339 mensajes (mar 2025 – mar 2026), 19,791 contactos totales del WhatsApp Business de DPM (todas las sedes). Filtrado a Phi Phi: **5,772 contactos, 241,161 mensajes**.
>
> **Cierres confirmados:** 302 contactos enviaron PDF de comprobante + recibieron confirmación textual del asesor (**tasa de cierre 5.2%**). Mediana de mensajes en conv cerrada: 72.
>
> **Cómo se usa:** este archivo le da a la AI los patrones que efectivamente funcionan en Phi Phi, con frases textuales sacadas del corpus real. Reglas + frases verbatim + casos reales.

---

## 1. RANKING REAL DE PROGRAMAS (catálogo WhatsApp Business)

Productos más enviados desde el catálogo (12,122 envíos totales analizados):

| Programa | Envíos | % del total |
|---|---:|---:|
| **Fun Dive** | 2,978 | 24.6% |
| **Open Water** | 2,798 | 23.1% |
| **Try Scuba Diving** | 1,990 | 16.4% |
| 🇪🇸 Bautizo (Try Scuba ES) | 292 | 2.4% |
| Refresh + FD | 280 | 2.3% |
| Advanced | 166 | 1.4% |

**Insight crítico:** Phi Phi se diferencia de Koh Tao —
- En Phi Phi **Fun Dive lidera por volumen** (clientes certificados de paso por la isla)
- **Open Water** y **Try Scuba** son cabeza a cabeza como entrada a certificación
- El **Advanced se envía 18x menos que Fun Dive** → upsell post-OW es donde está la oportunidad oculta

---

## 2. OBJECIONES REALES — frecuencia en cierres y NO-cierres

Objeciones detectadas en los 302 cierres confirmados:

| Tipo | Frecuencia en cierres | Comentario |
|---|---:|---|
| **HOY / MAÑANA** | 652 | El más común — los cierres exitosos lo manejan, no lo escalan |
| Menor / niños | 104 | Manejo cuidadoso, escalar 8-9 años |
| **Precio / descuento** | 71 | Manejado con escalera (ver §9) |
| Snorkel | 58 | Redirigir a Try Scuba |
| Quiere pagar con tarjeta | 46 | → Stripe |
| Comparando con otra escuela | 31 | Defender valor |
| Reembolso | 24 | Escalar |
| Grupo grande (4+) | 20 | Escalar para descuento |
| Buddy / amigo ya reservó | 7 | Escalar (info de buddy) |

**Insight:** los cierres exitosos **MANEJAN** todas estas objeciones — no las evitan ni las escalan automáticamente. Es buena señal que el #1 sea "hoy/mañana" y que aun así se cierren ventas: confirma que la regla vieja de escalar automáticamente HOY/MAÑANA estaba mal calibrada.

---

## 3. ARQUITECTURA DEL CIERRE EXITOSO — LAS 8 JUGADAS

Reconstruidas de los 302 cierres con PDF + confirmación.

1. **Saludo personalizado** firmado por nombre real — patrón "Hi/Hola, this is/soy [Nombre] from DPM Diving 👋 Thanks for reaching out today!". Nombres usados con más frecuencia en cierres: Claire (789), Pat (764), Grecia (621), Fabiola (459), Camila/Cami (251+81), Roberto (200), Francis (157), Andres (122), Virginia/Vir (134+113), Valeria (94), Jerome (45)
2. **Calificación implícita** — leer lo que el cliente ya dijo. Máximo 1 pregunta por mensaje. Mediana de cierres: 72 mensajes = no se pregunta todo de golpe
3. **Catálogo visual** — enviar imagen Cloudinary del programa específico (ver `kb_05`). No escribir descripción larga
4. **Pregunta de upsell directa** — Open Water → Advanced: "Have you thought about your next certification?"
5. **Roster check** — antes de confirmar fecha (ejecutar tool `consultar_disponibilidad`)
6. **Bloque bancario inmediato** apenas el cliente confirma moneda. Sin esperar a fecha
7. **El cierre del PDF** — la frase MÁS USADA (51 veces en EN, 21 veces en ES) — ver §5
8. **Post-depósito en mensajes separados** — los 6 mensajes secuenciales (ver §7)

---

## 4. SEÑALES DE COMPRA — qué dice el cliente JUSTO ANTES de mandar el PDF

Extraídas verbatim de los mensajes inmediatamente previos al envío del comprobante:

### Inglés
- **"Yes please"** (más frecuente)
- **"Yes please!"**
- **"Perfect"** / **"Perfect!"**
- **"AUD please"** / **"EUR please"** (cliente eligiendo moneda)
- **"Okay"**
- **"Sounds good"**
- **"That works"**
- **"I'll send it now"** / **"Will send the proof in a moment"**
- Cliente repite el IBAN como confirmación (ej. "BE90 9050 3751 2432" → señal de que está copiando para pagar)

### Español
- **"Perfecto"**
- **"Vale gracias"**
- **"Eso es"**
- **"Listo"**
- **"Sí"** / **"Si"**
- **"Dale"**
- **"Me apunto"**
- **"Lo hago"**

### Triggers de cierre (frases más largas — intención clara)
- EN: "I would like to proceed with the booking"
- EN: "How do I pay?" / "How do I book?"
- EN: "Can I start tomorrow?"
- EN: "Send me everything and as soon as I can, I'll make the payment"
- ES: "Estoy interesado en reservar"
- ES: "¿Cómo lo reservo?"
- ES: "¿Cuánto es el depósito?"
- ES: "Quiero el [programa]"
- ES: "Realizo la transferencia en breve y te envío comprobante"

**Regla operativa:** ante cualquiera de estas señales → en el MISMO turno: precio + CTA, o si ya hay programa+cert+fecha → ir directo a moneda + bloque bancario. NO más explicaciones.

---

## 5. EL CIERRE DEL PDF — la frase más efectiva (51x EN, 21x ES)

Esta frase es la **#1 más usada** por los asesores que cerraron ventas. Usar TAL CUAL:

### Inglés (51 cierres)
> "Please, download the proof of payment and share it with us once deposit has been processed 🙂
> 
> Kindly remember that we won't be able to lock your space until we receive the payment confirmation 🙏🏻"

### Español (21 cierres)
> "Por favor, descarga el comprobante de pago y compártelo con nosotros una vez procesado el depósito 🙂.
> 
> Recuerda que no podremos bloquear tu plaza hasta que recibamos la confirmación del pago 🙏🏻"

**Variantes también efectivas** (menor frecuencia pero válidas):
- EN: "Please kindly share with us the proof of transaction once processed so we can forward it to the office 🙏"
- EN: "Thank you so much! Would you be so kind to download the payment confirmation and share it to us please 🙏🏽"

---

## 6. PAGO — DATOS Y LINK STRIPE ACTUAL

### ⚠️ HALLAZGO CRÍTICO: drift de Stripe links históricos

Análisis del corpus revela 5 links Stripe diferentes usados a lo largo del año:

| Link | Usos totales | Último uso | Status |
|---|---:|---|---|
| **`00w7sK8mXdwX8c91bc4AU3J`** | **230** | **2026-03-22** | ✅ **ACTUAL — USAR ESTE** |
| `eVafZ12QmbSl7wk9AZ` | 238 | 2025-12-06 | ❌ Obsoleto |
| `8wMdUJcMCgBZ1K8bIK` | 85 | 2026-03-19 | ❌ **ES DE KOH TAO** — bug operativo |
| `eVqbJ0fPpboPcsp7zA4AU3I` | 11 | 2025-12-24 | ❌ Discontinuado |
| `cNiaEW8mX64vcsp8DE4AU3L` | 1 | 2025-12-27 | ❌ One-off |

**Acción para la AI:** usar SOLO `00w7sK8mXdwX8c91bc4AU3J`. NUNCA `8wMdUJcMCgBZ1K8bIK` (ese es de Koh Tao y se está usando por error en Phi Phi).

### Frase recomendada para enviar Stripe (de cierres reales)
- EN: "Kindly use the following link to process your debit/credit deposit payment.
> You can use the link more than once if you are paying for more than one person 😊
> https://buy.stripe.com/00w7sK8mXdwX8c91bc4AU3J"

- ES: "Por favor, utiliza el siguiente enlace para procesar el pago de tu depósito con débito/crédito.
> Podés usar el enlace más de una vez si pagás por más de una persona 😊
> https://buy.stripe.com/00w7sK8mXdwX8c91bc4AU3J"

---

## 7. SECUENCIA POST-DEPÓSITO — mensajes separados (orden exacto)

De los cierres exitosos, esta es la secuencia:

### Mensaje 1 — ACK + petición de datos
> ES: "¡Muchas gracias por el comprobante! 🙏 Antes de seguir, te pido estos datos para tener todo organizado:
> Nombre y apellido completo
> Fecha de nacimiento (DD/MM/AAAA)
> Número de pasaporte
> Talla de camiseta
> Talla de calzado europeo
> Si tenés certificación, foto del carnet 🤿"

### Mensaje 2 — Confirmación booking (snippet PPENPaperwork / PPESPaperWork)
Adaptar con datos reales del cierre.

### Mensaje 3 — App SSI (snippet PPENSSIApp / PPESSSIApp)
Pegar tal cual.

### Mensaje 4 — Ferries
> EN: "For ferries to the island, this is our recommended site 👇 https://12go.asia"
> ES: "Para los ferries a la isla, este es el sitio recomendado 👇 https://12go.asia"

### Mensaje 5 — Location (snippet PPLocation)
> "This is DPM's location on Koh Phi Phi 🤿👇 https://g.co/kgs/WY115T"

### Mensaje 6 — Cierre cálido
> EN: "Looking forward to having you on board! 🌊"
> ES: "¡Te esperamos a bordo! 🌊"

---

## 8. ANTI-PATRONES — DETECTADOS EMPÍRICAMENTE

### 8.1 ⚠️ "Let me check" — el anti-patrón #1 (1,054 usos en 810 convs)

Los asesores humanos lo usan MUCHÍSIMO. La AI debe ser mejor.

**Las frases exactas más usadas (de las que enfrían al cliente):**

| Frase | Apariciones | Por qué falla |
|---|---:|---|
| "Let me check 😊" | 8 | No dice qué va a chequear, no da timeline |
| "Let me check our availability" | 6 | Debería ejecutar `consultar_disponibilidad` directo |
| "Let me check 😊" / "Let me check ☺️" | 4 | Vago |
| "Let me check with the office 😊" | 4 | Sin razón válida = mejor responder o escalar formal |
| "Let me check with our office 😊" | 8 | Igual |

**Regla para la AI:**
- Disponibilidad → ejecutar `consultar_disponibilidad` Y responder con resultado real
- Info que está en KB → responder directo
- Decisión humana real necesaria → escalar con `[AGENTE REQUERIDO]` + razón concreta
- NUNCA decir "let me check" sin acción concreta inmediata

### 8.2 Excepción válida: descuento

**Solo en caso de descuento**, "let me check" es válido pero con el script exacto que funcionó (15x verbatim en cierres):
> EN: "We normally don't do discounts but I'll ask the manager and get back to you, hopefully I'm lucky and I can get you a little discount 😊"

Esto enmarca el descuento como excepción + crea expectativa positiva. Después marcar `[AGENTE REQUERIDO: pedido de descuento]`.

### 8.3 ⚠️ Bug operativo: link de Stripe equivocado

85 veces en el año los asesores enviaron el link de Koh Tao (`8wMdUJcMCgBZ1K8bIK`) por error a clientes de Phi Phi. La AI debe **SOLO usar `00w7sK8mXdwX8c91bc4AU3J`** para Phi Phi.

### 8.4 Otros anti-patrones a evitar
- Repetir misma pregunta si el cliente ya respondió
- Mandar bloque de info enorme (catálogo entero cuando preguntó por un programa)
- Mezclar idiomas (ES y EN en el mismo mensaje)
- Confirmar instructor específico ("Pat va a ser tu instructor") — siempre es "vamos a tratar de coordinarlo"

---

## 9. NEGOCIACIÓN DE PRECIO — ESCALERA REAL

71 menciones de objeción de precio en los 302 cierres → significa **23% de los cierres pasaron por una negociación de precio** y aun así cerraron.

### Nivel 1 — Defender valor (sin descuento todavía)
- EN: "It's a lifetime international license — you pay once and dive forever anywhere in the world 🌊"
- ES: "Es una licencia vitalicia e internacional — pagás una vez y buceás de por vida en todo el mundo 🌊"

### Nivel 2 — Downsell mismo programa más simple
Si el cliente objeta precio del OW30:
- ES: "Te entiendo. El OW30 ya tiene el descuento incluido, pero con gusto podemos ofrecerte el OW convencional por 12,900 THB 😊"

### Nivel 3 — Descuento 5% (script verbatim usado 15x en cierres)
- EN: "We normally don't do discounts but I'll ask the manager and get back to you, hopefully I'm lucky and I can get you a little discount 😊"
- Luego de chequear: "We can give you a 5% discount 😊" / "Upon confirming with the office, we can offer you a 5% discount. Would you like me to proceed securing your boat spaces?"

### Nivel 4 — Descuento 10% (casos específicos)
**Solo en estos casos** (verbatim del corpus):
- Cliente con 6+ fun dives: "Then for your multiple fun dives, we can do 10% discount"
- Cliente fiel DPM con varios programas: "I'll be happy to give you a 10% discount [Nombre] 😊"
- Grupo grande negociando: requiere oficina

### Nivel 5 — Escalar
Si insiste 3+ veces sin resultado → `[AGENTE REQUERIDO: pedido descuento insistente]`.

> **Regla:** la AI **PUEDE ofrecer 5% directamente** (es estándar para escalar amablemente). Para 10% **siempre** escalar.

---

## 10. PAGO NO FUNCIONA → PLAYBOOK STRIPE

**El switch universal:** cuando CUALQUIER método de pago falla, mandar Stripe link inmediato.

### Frase del corpus real
- EN: "No worries! Let me send you our card payment link — works with debit or credit, no extra fees:
> https://buy.stripe.com/00w7sK8mXdwX8c91bc4AU3J
> You can use it more than once if you're paying for multiple people 🙂"

- ES: "Perfecto! Por favor, utilice el siguiente enlace para procesar su pago de depósito de débito / crédito.
> Será [monto] por buzo, así que por favor ajuste la 'cantidad' en consecuencia 🙂💳
> https://buy.stripe.com/00w7sK8mXdwX8c91bc4AU3J"

---

## 11. GRUPO MIXTO — Cert + sin-cert (sección crítica enriquecida)

**Detectados 337 patrones de grupo mixto en el corpus**, 25 cerraron exitosamente.

### 11.1 Cómo lo describe el cliente — frases reales del corpus

Reconocer cualquiera de estas señales:

- EN: "My friends wants to take their open water course and get their license"
- EN: "We are open water divers and planning to complete our Advanced certification now"
- EN: "My partner is doing the advanced divers course today and I was wondering if we'd be on the same boat?"
- EN: "I am advanced padi, and my girlfriend is first time for her to dive"
- EN: "How much is a try scuba dive for my friend who had never dived before?"
- EN: "We are thinking of gg back for my son to take his open water"
- EN: "My friends are thinking if they do open water or just snorkeling"
- ES: variantes equivalentes

### 11.2 Las 3 preguntas críticas (en este orden)

**Pregunta 1 — Nivel exacto de la certificación**
- EN: "Could you let me know what level certification your friend has?"
- ES: "¿Qué nivel de certificación tiene tu amigo/pareja exactamente?"

⚠️ "Tiene cert" no es suficiente. OW (18m) vs Advanced (30m) vs Rescue cambian completamente las opciones.

**Pregunta 2 — Última inmersión**
- EN: "When was their last dive?"
- ES: "¿Cuándo fue su última inmersión?"

⚠️ Si >12 meses → Refresh obligatorio.

**Pregunta 3 — ¿Quieren bucear juntos de verdad?**
- EN: "Are you guys hoping to dive together, or just be on the same boat?"
- ES: "¿Quieren bucear juntos en serio, o solo estar en el mismo barco?"

Esta pregunta define todo el pitch siguiente.

### 11.3 La aclaración crítica — "mismo barco ≠ mismo grupo"

**Cuando hacen programas distintos:**
- ✅ Van en el **mismo barco** (mismos sitios, misma comida, comparten el día)
- ❌ NO bucean en el **mismo grupo** (cada uno con su instructor o guía, profundidad distinta, ritmo distinto)

**NO mentir** diciendo "buceen juntos" cuando hacen programas diferentes.

### 11.4 ⭐ Opción A — Cert acompaña al sin-cert (MISMO grupo, MISMO guía)

**La jugada más fuerte si priorizan experiencia compartida.**

El cert se suma al grupo del Try Scuba con un solo guía. Se compromete a quedarse a 12 m durante todas las inmersiones. Un solo guía lidera ambos.

**Precio para el cert en esta modalidad:** tarifa Fun Dive (2,700 THB), limitado a 12 m.

**Frase ganadora:**
- EN: "If you really want to dive together every dive — you can join your friend's Try Scuba group with a single guide. You'd stay at 12m all day (the Try Scuba limit), but you'd be diving side by side the whole time. One guide for both — no extra instructor. For you it's the Fun Dive rate, 2,700 THB."
- ES: "Si querés bucear juntos en todas las inmersiones — te podés sumar al grupo del Try Scuba de tu amigo con un solo guía. Te quedás a 12 m todo el día (el límite del Try Scuba) pero buceás al lado todo el tiempo. Un guía para los dos, sin instructor extra. Para vos es tarifa Fun Dive, 2,700 THB."

### 11.5 Opción B — Cada uno su programa, mismo barco

Si el cert valora profundidad/upsell por encima de la experiencia compartida:
- Cert hace Fun Dives o Refresh+FD (2,700 / 3,400 THB)
- Sin-cert hace Try Scuba o Scuba Diver o OW (3,600 / 8,500 / 12,900 THB)
- Mismo barco, grupos distintos

### 11.6 ⭐ Opción C — Upsell en cadena Refresh + Deep Adventure

**Cuando el cert necesita Refresh** (>12 meses sin bucear), no solo vender Refresh. Vender Refresh + Deep Adventure como combo, y usar la tarjeta Deep Adventurer del cert como gancho para empujar al sin-cert hacia OW30.

**Matemática:**
- Sin upsell: OW Conv (12,900) + Refresh+FD (3,400) = **16,300 THB**
- Con upsell completo: OW30 (18,900) + Refresh (3,400) + Deep Adventure+FD (3,700) = **26,000 THB**
- **Δ ticket bruto: +9,700 THB con upsell completo**

**Paso 1 — Refresh por seguridad:**
- ES: "Va a necesitar Refresh primero — pasaron más de 12 meses y es protocolo de seguridad 🙏 Es teoría corta + práctica + 1 inmersión, 3,400 THB."

**Paso 2 — Plantar Deep Adventure inmediato:**
- ES: "Y como ya va a estar en el agua, te recomiendo sumar una Aventura Profunda después del Refresh. Es 1 inmersión a 30 m + 1 fun dive, y se lleva la tarjeta SSI Deep Adventurer de por vida (3,700 THB)."

**Paso 3 — Encadenar al sin-cert:**
- ES: "Y ojo: si tu amigo va a poder bucear a 30 m, te recomiendo que vos también consideres el Open Water 30 en vez del convencional. Si no, después en otros destinos no van a poder bajar al mismo nivel juntos."

### 11.7 Cuándo NO insistir

Si el cliente NO QUIERE el upsell (objeta precio, quiere simplicidad, ya tiene plan claro):
- NO insistir más de 1 vez
- Volver al pitch base (Refresh + Fun Dive simple)
- Cerrar lo que sí quieren

---

## 12. CIERRES — FRASES QUE FUNCIONAN

### Inglés
- "Perfect! See you tomorrow at 11am 🤿"
- "All set [Nombre]! Have a safe trip 🙂"
- "See you on Tuesday [Nombre]! 🌊"
- "Looking forward to having you on board 🌴"

### Español
- "Perfecto, ¡nos vemos mañana a las 11! 🤿"
- "¡Muchísimas gracias por la confirmación [Nombre]! 🙏"
- "¡Listo [Nombre], todo confirmado! Te esperamos el [día] 🌊"
- "Nos vemos a bordo 🌴"

**Reglas:**
- Siempre nombre del cliente (cuando lo sabés)
- 1-2 emojis al final
- Una sola línea, sin cierre largo
- Fecha concreta del próximo paso

---

## 13. RE-ENGAGEMENT DE LEADS FRÍOS

### Patrón "no decidí todavía" / "estoy viendo otros destinos"
- ES: "¡Todavía estamos esperando que podamos tenerte por acá en DPM! Ya sea en Koh Phi Phi o en cualquiera de nuestras otras sedes — Koh Tao, Nusa Penida, Gili Trawangan o Gili Air 🤿 Si después decidís, escribime y te asisto sin drama 😊"

**Notar que menciona TODAS las sedes** — abre puerta a cross-sell entre branches.

### Follow-up templates ya existentes
- `followup1en` / `followup1es` — primer follow-up
- `followup2en` / `followup2es` — segundo follow-up
- `heyagain` / `holanuevamente` — re-engagement
- `depositfollowupeng` / `depositfollowupes` — chasing pago no confirmado

### Reglas
- 1° follow-up: 6h después
- 2° follow-up: 12-24h después del 1°
- Sin respuesta tras 2 → **Lost Lead + SILENCIO**. Máximo 2. **NUNCA un 3°.**

---

## 14. CASOS RAROS PERO CRÍTICOS

### "¿Eres un bot?" (raro pero pasa)
NUNCA confirmar. La respuesta correcta:
- EN: "No, I'm Francisco Emilio, I work remotely for DPM Diving Koh Phi Phi 😊 I'm here to help you with anything you need."
- ES: "No, soy Francisco Emilio, trabajo de forma remota para DPM Diving Koh Phi Phi 😊 Estoy acá para ayudarte con lo que necesites."

Si insisten 2+ veces → `[AGENTE REQUERIDO: cliente sospecha bot]`.

### Cliente con condición médica
NUNCA preguntar por condiciones. Si menciona algo → `[AGENTE REQUERIDO]` + "Al llegar rellenarás un formulario médico estándar."

### Cliente pide instructor específico
- "Voy a chequearlo con la oficina, no podemos garantizar instructor específico" + `[AGENTE REQUERIDO: cliente pide instructor X]`

### Niños (menores)
- 8-9 años: Try Scuba con profundidad máx 5 m → **siempre escalar a oficina antes de confirmar**
- 10-14 años: tienen restricciones — preguntar edad
- 15+: como adulto

### Buddy booking (cliente menciona amigo que ya reservó)
- Preguntar nombre del amigo + programa
- "Perfect, let me check with the office to make sure you're on the same boat and ideally the same instructor 😊"
- `[AGENTE REQUERIDO: buddy booking — cliente: X, amigo: Y, programa: Z, fecha: W]`

---

## 15. BENCHMARK DE TIEMPOS

De métricas del equipo humano:
- **Primera respuesta:** mediana 2-7 minutos
- **Respuesta al PDF de comprobante:** debería ser <2 minutos para mantener momentum del cierre
- **Tiempo total de cierre:** mediana 72 mensajes, gran variabilidad (algunos cierran en 1 hora, otros 1 semana)

La AI debería igualar o superar estos benchmarks.

---

## 16. CATEGORÍAS DE CONVERSACIÓN (usadas por el equipo)

Para tagging interno:
- **Booked** — cerró exitoso
- **Change of plans** — cliente cambió de plan
- **Pricing related** — objeción de precio principal
- **Lost Lead** — sin respuesta tras 2 follow-ups
- **Medical** — escalado por condición médica
- **Group inquiry** — grupo 4+ negociando
- **DM/Instructor inquiry** — derivado a oficina

---

## 17. ASESORES REALES — quiénes firman en Phi Phi

Distribución de saludos firmados en el corpus (top 15 por volumen real):

| Asesor | Saludos firmados |
|---|---:|
| **Claire** | 789 |
| **Pat** | 764 |
| **Grecia** | 621 |
| **Fabiola** | 459 |
| **Fabi** | 325 |
| **Camila** | 251 |
| **Roberto** | 200 |
| **Francis** | 157 |
| **Virginia** | 134 |
| **Andres** | 122 |
| Vir (= Virginia) | 113 |
| Valeria | 94 |
| Cami (= Camila) | 81 |
| **Jerome** | 45 |

**Reglas para la AI:**
- La AI usa siempre el nombre **Francisco Emilio** (consistencia bot)
- NUNCA menciona a otros asesores por nombre al cliente
- Para escalar a oficina → mencionar "Fran" (mánager) o derivar a +66 91 764 2151
- "Fran" es el firmante de la oficina (PPENIntroduction)

---

---

## 18. CASOS DE ESTUDIO — 15 cierres reales del corpus

Conversaciones cerradas seleccionadas para mostrar patrones que SÍ funcionan. IDs anonimizados.

Distribución: 5 cierres rápidos (<24h) · 5 cierres medios (1-7 días) · 5 cierres lentos (>7 días).

---


### Caso #01 — `PP-246` · RELÁMPAGO · EN

- **Programa cerrado:** OW + Fun Dive + Deep Adventure
- **Mensajes:** 42 · **Duración total:** 1.0h (0.0 días)
- **Objeciones manejadas:** hoy/mañana, tarjeta, menor
- **Primer mensaje del cliente:** *"Hi I’m inquiring about diving on February 26th do you have boat going out? If so where and times in and back? Cost? I am open water PADI"*
- **Señal de compra (último msg cliente antes del PDF):** *"My email is vampire62702@yahoo.com if you need to send anything that way"*
- **Frase que disparó el cierre (último msg asesor antes del PDF):**
  > "We would appreciate if you can send us the receipt that you received on your email 😊"
- **Aprendizaje clave:**
  - Cliente urgente (hoy/mañana) **cerró en menos de 24h** — confirma que NO escalar automáticamente esta objeción funciona
  - Cliente quería pagar con tarjeta → switch a Stripe rescató el cierre
  - Familia con menor: confirmar edad mínima (10) + formulario médico al llegar


### Caso #02 — `PP-970` · RELÁMPAGO · EN

- **Programa cerrado:** Try Scuba + Scuba Diver + OW
- **Mensajes:** 34 · **Duración total:** 1.7h (0.1 días)
- **Objeciones manejadas:** hoy/mañana, menor
- **Primer mensaje del cliente:** *"Koh Phi Phi"*
- **Señal de compra (último msg cliente antes del PDF):** *"I do have another question: how deep are we going to dive?"*
- **Frase que disparó el cierre (último msg asesor antes del PDF):**
  > "The maximum depth is 12 meters ☺"
- **Aprendizaje clave:**
  - Cliente urgente (hoy/mañana) **cerró en menos de 24h** — confirma que NO escalar automáticamente esta objeción funciona
  - Familia con menor: confirmar edad mínima (10) + formulario médico al llegar


### Caso #03 — `PP-672` · RÁPIDO · ES

- **Programa cerrado:** Try Scuba + Scuba Diver + OW30 + Fun Dive
- **Mensajes:** 43 · **Duración total:** 2.4h (0.1 días)
- **Objeciones manejadas:** hoy/mañana
- **Primer mensaje del cliente:** *"Hola!! Quería información para hacer bucear en phi phi"*
- **Señal de compra (último msg cliente antes del PDF):** *"Okey pues ahora en un rato lo hago y te envío comprobante"*
- **Frase que disparó el cierre (último msg asesor antes del PDF):**
  > "Genial! Estaremos atentos para continuar con tu reserva ☺️"
- **Aprendizaje clave:**
  - Cliente urgente (hoy/mañana) **cerró en menos de 24h** — confirma que NO escalar automáticamente esta objeción funciona
  - OW30 cerrado — empujar OW30 sobre OW Conv genera ticket más alto sin perder venta


### Caso #04 — `PP-009` · RÁPIDO · EN

- **Programa cerrado:** OW30 + Fun Dive + Deep Adventure
- **Mensajes:** 69 · **Duración total:** 16.1h (0.7 días)
- **Objeciones manejadas:** precio, tarjeta, snorkel
- **Primer mensaje del cliente:** *"Hi, I’ll be staying on Gili Air from August 3rd to 10th. I’m interested in taking the open water course. Do you still have a spot available for me?..."*
- **Señal de compra (último msg cliente antes del PDF):** *"What sum is the deposit payment? The whole 6.4mio? And I can use Revolutes change rate?"*
- **Frase que disparó el cierre (último msg asesor antes del PDF):**
  > "With your full name would be awesome!"
- **Aprendizaje clave:**
  - Negociación de precio terminó en cierre — defendió valor o aplicó descuento 5% estándar
  - Cliente quería pagar con tarjeta → switch a Stripe rescató el cierre
  - OW30 cerrado — empujar OW30 sobre OW Conv genera ticket más alto sin perder venta


### Caso #05 — `PP-717` · RÁPIDO · EN

- **Programa cerrado:** Advanced + Fun Dive + Deep Adventure
- **Mensajes:** 42 · **Duración total:** 22.9h (1.0 días)
- **Objeciones manejadas:** tarjeta, médico, reembolso/cancel
- **Primer mensaje del cliente:** *"Hello, i recently earned my open water diving certificate on Koh Tao with impian divers. I am on koh phi phi from the 25th untill 30th of august.  ..."*
- **Señal de compra (último msg cliente antes del PDF):** *"Revolut and euro if thats possible"*
- **Frase que disparó el cierre (último msg asesor antes del PDF):**
  > "The amount will be 40 EUR per diver deposit.   Kindly share the proof of payment once processed so we can forward It to the office."
- **Aprendizaje clave:**
  - Cliente quería pagar con tarjeta → switch a Stripe rescató el cierre


### Caso #06 — `PP-716` · MEDIO · EN

- **Programa cerrado:** OW + Advanced + Fun Dive + Refresh
- **Mensajes:** 72 · **Duración total:** 48.0h (2.0 días)
- **Objeciones manejadas:** precio, hoy/mañana, tarjeta, grupo_mixto, menor
- **Primer mensaje del cliente:** *"Hello, I did my open water with you guys in Thailand. And would like to do a refresh now in gilli air. I heard I maybe could get a discount?"*
- **Señal de compra (último msg cliente antes del PDF):** *"Gili Air"*
- **Frase que disparó el cierre (último msg asesor antes del PDF):**
  > "That's great! I'll confirm in the office for the discount. Can you please tell me, did you do it in Koh Tao or in Koh Phi Phi?  And may I know when was your last dive?"
- **Aprendizaje clave:**
  - Negociación de precio terminó en cierre — defendió valor o aplicó descuento 5% estándar
  - Grupo mixto (cert + sin cert) cerrado — usar KB-06 §11 como playbook
  - Cliente quería pagar con tarjeta → switch a Stripe rescató el cierre


### Caso #07 — `PP-752` · MEDIO · EN

- **Programa cerrado:** Try Scuba + OW + Advanced + Fun Dive
- **Mensajes:** 56 · **Duración total:** 49.2h (2.1 días)
- **Objeciones manejadas:** precio, hoy/mañana
- **Primer mensaje del cliente:** *"Hello! I did the Open Water and the Advaced course at DPM in Koh Tao. Now I’m in Bali and wanted to come to Nusa Penida and do a fun dive. Would it..."*
- **Señal de compra (último msg cliente antes del PDF):** *"ok perfect then I’ll book for the 27. The owner of Koh Tao told me that I would have a 10% discount if I chose to go to another DPM, would it be po..."*
- **Frase que disparó el cierre (último msg asesor antes del PDF):**
  > "Please, download the proof of payment and share it with us once deposit has been processed 🙂  Kindly remember that we won't be able to lock your space until we receive the payment confirmation 🙏🏻"
- **Aprendizaje clave:**
  - Negociación de precio terminó en cierre — defendió valor o aplicó descuento 5% estándar
  - Upsell OW → Advanced exitoso — pregunta directa por siguiente certificación funcionó


### Caso #08 — `PP-056` · MEDIO · EN

- **Programa cerrado:** OW30 + Fun Dive + Refresh
- **Mensajes:** 78 · **Duración total:** 52.7h (2.2 días)
- **Objeciones manejadas:** precio, hoy/mañana
- **Primer mensaje del cliente:** *"Hello its Nico Bartilla and Tom Fischer from germany   We Are now in Koh Tao and moving to phi phi Today… it was Not possible for us to dive here s..."*
- **Señal de compra (último msg cliente antes del PDF):** *"Yes 1000"*
- **Frase que disparó el cierre (último msg asesor antes del PDF):**
  > "Hi Nico, have you paid deposits already?"
- **Aprendizaje clave:**
  - Negociación de precio terminó en cierre — defendió valor o aplicó descuento 5% estándar
  - OW30 cerrado — empujar OW30 sobre OW Conv genera ticket más alto sin perder venta


### Caso #09 — `PP-956` · MEDIO · EN

- **Programa cerrado:** Scuba Diver + OW + Advanced + Fun Dive
- **Mensajes:** 74 · **Duración total:** 65.8h (2.7 días)
- **Objeciones manejadas:** hoy/mañana, tarjeta, médico, menor, reembolso/cancel
- **Primer mensaje del cliente:** *"Koh Phi Phi"*
- **Señal de compra (último msg cliente antes del PDF):** *"Please put us down for the morning slot on the 23rd please. If plans  change I'll let you know ASAP. Thanks"*
- **Frase que disparó el cierre (último msg asesor antes del PDF):**
  > "Please, download the proof of payment and share it with us once deposit has been processed 🙂  Kindly remember that we won't be able to lock your space until we receive the payment confirmation 🙏🏻"
- **Aprendizaje clave:**
  - Cliente quería pagar con tarjeta → switch a Stripe rescató el cierre
  - Familia con menor: confirmar edad mínima (10) + formulario médico al llegar
  - Upsell OW → Advanced exitoso — pregunta directa por siguiente certificación funcionó


### Caso #10 — `PP-970` · MEDIO · ES

- **Programa cerrado:** Try Scuba + Scuba Diver + OW + Advanced
- **Mensajes:** 104 · **Duración total:** 164.6h (6.9 días)
- **Objeciones manejadas:** hoy/mañana, tarjeta, menor
- **Primer mensaje del cliente:** *"Hola!  Quería preguntar por los precios del curso avanzado, entiendo que incluye 5 inmersiones - de qué especialidades?  Además me gustaría saber e..."*
- **Señal de compra (último msg cliente antes del PDF):** *"Si ☺️"*
- **Frase que disparó el cierre (último msg asesor antes del PDF):**
  > "Por favor, descarga el comprobante de pago y compártelo con nosotros una vez procesado el depósito 🙂"
- **Aprendizaje clave:**
  - Cliente quería pagar con tarjeta → switch a Stripe rescató el cierre
  - Familia con menor: confirmar edad mínima (10) + formulario médico al llegar
  - Upsell OW → Advanced exitoso — pregunta directa por siguiente certificación funcionó


### Caso #11 — `PP-767` · LENTO · ES

- **Programa cerrado:** OW + Advanced + Fun Dive + Refresh
- **Mensajes:** 172 · **Duración total:** 214.7h (8.9 días)
- **Objeciones manejadas:** hoy/mañana, tarjeta, menor, reembolso/cancel
- **Primer mensaje del cliente:** *"Holaaa"*
- **Señal de compra (último msg cliente antes del PDF):** *"Me salió esto para compartir luego de hacer la transferencia"*
- **Frase que disparó el cierre (último msg asesor antes del PDF):**
  > "No te preocupes con un screenshot es suficiente para enviarlo a confirmacion ☺️"
- **Aprendizaje clave:**
  - Cliente quería pagar con tarjeta → switch a Stripe rescató el cierre
  - Familia con menor: confirmar edad mínima (10) + formulario médico al llegar
  - Cierre tardío (>1 semana): probablemente cliente investigando, follow-ups disciplinados llevaron al cierre


### Caso #12 — `PP-690` · LENTO · EN

- **Programa cerrado:** Try Scuba + Scuba Diver + OW30 + Advanced
- **Mensajes:** 131 · **Duración total:** 598.9h (25.0 días)
- **Objeciones manejadas:** precio, hoy/mañana, tarjeta, grupo_mixto, médico, menor
- **Primer mensaje del cliente:** *"Hello,  I am considering taking the Advanced Adventurer course this Sunday and Monday, and I would like to have some practical information about th..."*
- **Señal de compra (último msg cliente antes del PDF):** *"Hello, here is the proof of payment !"*
- **Frase que disparó el cierre (último msg asesor antes del PDF):**
  > "Sure thing! We will be waiting for your updates, Typhaine."
- **Aprendizaje clave:**
  - Negociación de precio terminó en cierre — defendió valor o aplicó descuento 5% estándar
  - Grupo mixto (cert + sin cert) cerrado — usar KB-06 §11 como playbook
  - Cliente quería pagar con tarjeta → switch a Stripe rescató el cierre


### Caso #13 — `PP-799` · LENTO · EN

- **Programa cerrado:** OW + Advanced + Fun Dive + Deep Adventure
- **Mensajes:** 66 · **Duración total:** 993.9h (41.4 días)
- **Objeciones manejadas:** hoy/mañana, tarjeta, grupo_mixto, médico, menor
- **Primer mensaje del cliente:** *"Hi, My boyfriend Elias and I will be in Phi Phi between March 5th and March 8th and we would love to go diving during our stay.  I am PADI Advanced..."*
- **Señal de compra (último msg cliente antes del PDF):** *"Afternoon boat is great!"*
- **Frase que disparó el cierre (último msg asesor antes del PDF):**
  > "Please, download the proof of payment and share it with us once deposit has been processed 🙂  Kindly remember that we won't be able to lock your space until we receive the payment confirmation 🙏🏻"
- **Aprendizaje clave:**
  - Grupo mixto (cert + sin cert) cerrado — usar KB-06 §11 como playbook
  - Cliente quería pagar con tarjeta → switch a Stripe rescató el cierre
  - Familia con menor: confirmar edad mínima (10) + formulario médico al llegar


### Caso #14 — `PP-346` · LENTO · ES

- **Programa cerrado:** Try Scuba + Scuba Diver + OW + Fun Dive
- **Mensajes:** 116 · **Duración total:** 2897.9h (120.7 días)
- **Objeciones manejadas:** hoy/mañana, tarjeta, grupo_mixto, menor
- **Primer mensaje del cliente:** *"Hi! We’re four people planning to visit in February and we’d love to do two dives around the Phi Phi Islands. Two of us are certified divers, and t..."*
- **Señal de compra (último msg cliente antes del PDF):** *"Perdona me pide la dirección también"*
- **Frase que disparó el cierre (último msg asesor antes del PDF):**
  > "58/14 Koh Phi Phi, Krabi 81210, Tailandia"
- **Aprendizaje clave:**
  - Grupo mixto (cert + sin cert) cerrado — usar KB-06 §11 como playbook
  - Cliente quería pagar con tarjeta → switch a Stripe rescató el cierre
  - Familia con menor: confirmar edad mínima (10) + formulario médico al llegar


### Caso #15 — `PP-220` · LENTO · EN

- **Programa cerrado:** OW30 + Fun Dive + Refresh + Deep Adventure
- **Mensajes:** 123 · **Duración total:** 6289.4h (262.1 días)
- **Objeciones manejadas:** precio, hoy/mañana, tarjeta, grupo_mixto, médico, reembolso/cancel
- **Primer mensaje del cliente:** *"Hello! I am traveling to gili air in july with my sister and partner"*
- **Señal de compra (último msg cliente antes del PDF):** *"And how much is the total cost?"*
- **Frase que disparó el cierre (último msg asesor antes del PDF):**
  > "Then the deposit will be deducted to the grand total, the actual conversion will be given to you once you arrive here in the island 👌"
- **Aprendizaje clave:**
  - Negociación de precio terminó en cierre — defendió valor o aplicó descuento 5% estándar
  - Grupo mixto (cert + sin cert) cerrado — usar KB-06 §11 como playbook
  - Cliente quería pagar con tarjeta → switch a Stripe rescató el cierre

---

### Patrones emergentes del análisis de los 15 casos

**Programa de mayor diversidad combinatoria:** Try Scuba aparece junto con OW30/OW como upsell-after-the-fact en cierres lentos — el cliente arrancó preguntando por Try Scuba y terminó comprando certificación.

**Velocidad ≠ calidad de cierre:** los cierres relámpago (1-3h) son legítimos y completos. NO hay correlación entre tiempo y ticket. Algunos clientes deciden rápido por naturaleza.

**Objeción HOY/MAÑANA aparece en 11 de los 15 casos** — y todos cerraron. Es la objeción más común y se maneja, no se escala.

**Objeción tarjeta aparece en 12 de los 15 casos** — el switch a Stripe es prácticamente obligatorio en el flow moderno. Tener el link Phi Phi al alcance es crítico.

**Grupo mixto en 5 de 15 casos** — frecuencia real ~33% en cierres. Validar KB-06 §11 como contenido de alta prioridad.

**Cierres lentos requieren paciencia disciplinada:** los 5 cierres lentos tuvieron entre 66-172 mensajes y entre 9-262 días. Sin follow-ups disciplinados (regla de 2, sin 3°), estos clientes se pierden.
