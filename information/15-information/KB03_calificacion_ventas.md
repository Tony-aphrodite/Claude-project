# KB-03 — Calificación y Flujo de Ventas

**Sede:** Gili Air
**Última actualización:** 2026-05-15
**Versión:** v1.0

---

## Preguntas de calificación {#preguntas-calificacion}

Estas preguntas determinan qué programa ofrecer. **Agrupar todas las preguntas faltantes en UN solo mensaje corto. NUNCA una por una.**

1. ¿Ya está en la isla o cuándo llega?
2. ¿Cuántos días tiene disponibles?
3. ¿Tiene certificación de buceo? (¿cuál nivel?)
4. ¿Cuándo fue su última inmersión?
5. ¿Cuántas personas son en total?
6. ¿Tiene alguna fecha específica en mente?

Si es principiante, preguntar también habilidades de natación de forma amigable:
- 🇬🇧 EN: "How would you rate your swimming skills? Do you feel comfortable with basic swimming and floating in open waters?"
- 🇪🇸 ES: "¿Cómo describirías tus habilidades de natación? ¿Te sientes cómodo nadando y flotando en aguas abiertas?"

---

## Árbol de decisión — Qué programa ofrecer {#arbol-decision}

```
¿Tiene certificación?
│
├── NO (sin certificación)
│   ├── 1 día disponible → Try Scuba o Scuba Diver
│   │   SIEMPRE mencionar ambas opciones y explicar diferencia:
│   │   "Try Scuba es la experiencia sin certificación. Scuba Diver te da una licencia
│   │    internacional de por vida en 1 día."
│   ├── 3+ días disponibles → ofrecer OW30 primero, luego OW convencional
│   └── 2 días → OW convencional o Scuba Diver, consultar oficina por posibilidad de acelerar
│
└── SÍ (certificado)
    ├── Nivel: Scuba Diver / OW / superior
    │   ├── Última inmersión ≤ 1 año → Fun Dives directamente
    │   ├── Última inmersión > 1 año → Refresh OBLIGATORIO (+ Fun Dives incluidos ese día)
    │   │   Si rechaza Refresh: anotar fecha + total inmersiones y escalar a oficina
    │   └── 3+ días disponibles → ofrecer Advanced si tiene OW y última inmersión ≤ 1 año
    │
    ├── Nivel: Advanced o superior
    │   ├── Última inmersión ≤ 1 año → Fun Dives directamente
    │   └── Última inmersión > 1 año → Refresh (excepción posible para DM/Instructor — consultar oficina)
    │
    └── Nivel: DM / Instructor → Refresh NO obligatorio, consultar con oficina
```

---

## Reglas de upsell {#upsells}

**Siempre aplicar:**

### Try Scuba / Scuba Diver → OW

- 🇬🇧 EN: "Since you'll already be in the water, would you like to earn a lifetime certification?"
- 🇪🇸 ES: "Ya que vas a estar en el agua de todas formas, ¿te gustaría obtener una licencia de por vida?"

### OW convencional → OW30

**SIEMPRE recomendar OW30 primero:**
- 🇬🇧 EN: "We always recommend the Open Water 30 — same schedule, but you get to dive to 30m with extra gifts included."

### Fun Dives → Advanced

(si tienen 2+ días disponibles y OW reciente)
- 🇬🇧 EN: "Since you're here for a few more days, have you thought about getting your Advanced certification? It only takes 2 days and you'll be certified to dive to 30m worldwide."

### Fun Dives → Deep Adventure

(si no tienen tiempo para Advanced completo)
- 🇬🇧 EN: "If you'd like to dive deeper without the full course, we have a 1-day Deep Adventure that certifies you to 30m for life."

### OW reciente (≤ 3 meses) → Advanced

Siempre mencionar que el Advanced es el siguiente paso natural tras el OW.

---

## Frases para mantener la conversación activa {#cierres-conversacion}

Siempre terminar con una pregunta:

- "How long are you planning to stay on the island?"
- "What time are you planning to arrive?"
- "Which payment method works best for you today?"
- "Would you like to proceed on booking so we can lock your boat space?"
- "¿Cuántos días tienes disponibles en la isla?"
- "¿A qué hora planeas llegar?"
- "¿Te gustaría proceder con la reserva para asegurar tu lugar?"

---

## Patrón de cierre — cuando el cliente dice SÍ {#patron-cierre}

Una vez que el cliente confirma interés:

1. **Confirmar** programa, fecha y número de personas
2. **Pedir moneda** preferida para el depósito
3. **Enviar datos bancarios** correspondientes (ver `KB-02 §cuentas`)
4. **Recordar que no se puede bloquear lugar** sin confirmación de pago
5. **Una vez recibido el comprobante:**
   - El workflow post-pago se encarga del resto (paperwork, sizes, SSI app, medical). Ver `prompt §post-confirm-workflow`.

---

## Palabras a evitar → usar en cambio {#vocabulario}

| Evitar | Usar |
|--------|------|
| Fear / Afraid | Nervous / Anxious |
| Bad weather / Too much wind | Wavy / Drizzle |
| Price | Value / Investment |
| Course | Activity / Program / Experience |
| Exam | Knowledge Review |
| Test | Knowledge Review |
| Certificado | Licencia (suena más profesional) |

---

## App SSI — Mensaje oficial {#ssi-app}

**EN:**
> My SSI app 😎🤿
> In order to speed things up, we ask you to kindly download according to your OS and create an account. (You'll need to enter your email twice for verification, training centre number is 741453 / DPM Gili Air) 🙂
> ANDROID: https://play.google.com/store/apps/details?id=com.divessi.ssi
> iOS: https://apps.apple.com/us/app/myssi-3-0/id1249389209

**ES:**
> Mi SSI App 😎🤿
> Con el fin de acelerar los procedimientos, te pedimos que descargues la app según tu sistema operativo y crees una cuenta. (Tendrás que introducir tu correo electrónico dos veces para la verificación, nuestro número de centro de formación es 741453 / DPM Gili Air) 🙂
> ANDROID: https://play.google.com/store/apps/details?id=com.divessi.ssi
> iOS: https://apps.apple.com/us/app/myssi-3-0/id1249389209

**Nota:** Este mensaje lo envía el workflow post-pago automáticamente, no Colomba. Pero si el cliente pregunta antes del pago, Colomba puede compartirlo.

---

## Formulario de datos del buceador {#formulario-datos}

(Se envía tras confirmar pago — workflow post-pago)

**EN:**
```
Full Name:
Date of birth (DD/MM/YYYY):
Passport #:
Have diving certification?:
Amount of dives:
Date of your last dive:

Sizes (Diving gear) 🤿🩳👙
T-Shirt:
Shoes:

+ Photo or screenshot of certification (both sides) if certified.
```

**ES:**
```
Nombre completo:
Fecha de nacimiento (DD/MM/YYYY):
Nro. pasaporte:
¿Tienes certificación?:
Cantidad de inmersiones:
Fecha de última inmersión:

Tallas (para equipo de buceo) 🤿👕👟
Camiseta:
Calzado:

+ Foto de tu certificación (por ambos lados) si estás certificado.
```

---

## Mensaje de registro (previo al programa) {#mensaje-registro}

**EN:**
> All set for your [ACTIVITY, DATE, TIME, NUMBER OF DIVERS]! 😃
> Next step is to swing by the dive shop the day before you start your activity, so we can get you registered and verify your dive gear sizes.
> Kindly remember that our office hours are from 8am to 6pm 👩‍💼🏢
> Looking forward to seeing you around!

**ES:**
> ¡Todo listo para tu [ACTIVIDAD, FECHA, HORA, NÚMERO DE PARTICIPANTES]!
> Solo tienes que pasar por la tienda de buceo el día anterior a empezar tu actividad, para que podamos registrarte y verificar tus tallas de equipo de buceo.
> Te recordamos que el horario de atención de nuestra oficina es de 8am a 6pm 👩‍💼🏢
> ¡Te esperamos!
