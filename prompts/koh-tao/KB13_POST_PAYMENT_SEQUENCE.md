# KB-13 | POST-PAYMENT SEQUENCE — DPM DIVING KOH TAO

**Source spec:** `reference/post-payment-sequence-2026-06-25.md` (Miguel)
**Status:** canonical 5-message flow sent AFTER deposit confirmation
**Future:** Message 1 will be replaced by an online registration form
once Miguel's portal is live. Until then, send Message 1 verbatim.

---

## TRIGGER

The AI sends this 5-message sequence after one of:
- OCR auto-confirm verdict = `ok` AND `validated` → deposit_paid stage
- Manual confirmation from the panel → deposit_paid stage

Sent as **5 SEPARATE messages** in this order. Do NOT concatenate.
~2-3 second gap between messages is fine; the WhatsApp client will
render them as a natural conversation.

---

## MESSAGE 1 — Data request (identical across all 5 DPM sedes)

### EN

```
Thank you so much for choosing DPM Diving! The following info will help us provide a better service and have everything organized before you arrive 🙂

If you're in a hurry or don't have access to the requested info right now, please just share full names and DOB — you can send the rest later. Kindly remember to include all divers 👇🏻

Full Name:
Date of birth (DD/MM/YYYY):
Passport #:
Have diving certification?:
Amount of dives:
Date of your last dive:
🪪 A picture or screenshot of your certification (both sides):

Sizes (diving gear) 🤿🩳👙
T-Shirt:
Shoes:

Looking forward to your answer in order to proceed with your booking 🙂👌🏻
```

### ES

```
¡Muchas gracias por elegir DPM Diving! La siguiente información nos ayuda a brindarte un mejor servicio y tener todo organizado antes de tu llegada 🙂

Si estás apurado o no tenés acceso a los datos ahora mismo, mandanos solo el nombre completo y la fecha de nacimiento — el resto lo podés enviar después. Acordate de incluir a todos los buceadores 👇🏻

Nombre completo:
Fecha de nacimiento (DD/MM/AAAA):
N° de pasaporte:
¿Tenés certificación de buceo?:
Cantidad de inmersiones:
Fecha de tu última inmersión:
🪪 Una foto o captura de tu certificación (ambos lados):

Tallas (equipo de buceo) 🤿🩳👙
Remera:
Zapato:

Quedamos atentos a tu respuesta para continuar con tu reserva 🙂👌🏻
```

---

## MESSAGE 2 — Booking confirmation (KT)

> KT office hours: **8am to 8pm**.

### EN

```
All set for your (INSERT DETAILS OF THE BOOKING SUCH AS ACTIVITY, DATE, TIME, NUMBER OF CX)! 😃
Next step is to swing by the dive shop the day before you start your activity, so we can get you registered and verify your dive gear sizes.
Kindly remember that our office hours are from 8am to 8pm 👩‍💼🏢
Looking forward to seeing you around!
```

### ES

```
¡Todo listo para tu (INSERTAR DETALLES DE LA RESERVA: ACTIVIDAD, FECHA, HORA, CANTIDAD DE PERSONAS)! 😃
El siguiente paso es pasar por el dive center el día anterior a tu actividad, para registrarte y verificar las tallas del equipo de buceo.
Recordá que nuestro horario de oficina es de 8am a 8pm 👩‍💼🏢
¡Nos vemos pronto!
```

> When filling in `INSERT DETAILS`, use the customer's actual program +
> date + slot + pax from the conversation context. Example:
> "your Open Water course starting Aug 18, AM boat, 2 people".

---

## MESSAGE 3 — SSI App (KT)

> KT training centre number: **766502 / DPM Diving**.

### EN

```
My SSI app 😎🤿
In order to speed things up, we ask you to kindly download according to your OS and create an account. (You'll need to enter your email twice for verification, training centre number is 766502 / DPM Diving) 🙂
ANDROID 🖥️
https://play.google.com/store/apps/details?id=com.divessi.ssi
IOS - IPhone 🖥️
https://apps.apple.com/us/app/myssi-3-0/id1249389209
Let us know if you have any questions 😁🙏🏻
```

### ES

```
Mi SSI App 😎🤿
Para agilizar los trámites, descargá la app según tu sistema operativo y creá una cuenta. (Vas a tener que ingresar tu email dos veces para la verificación, el número de centro de formación es 766502 / DPM Diving) 🙂
ANDROID 🖥️
https://play.google.com/store/apps/details?id=com.divessi.ssi
iOS - iPhone 🖥️
https://apps.apple.com/us/app/myssi-3-0/id1249389209
Cualquier duda, avisanos 😁🙏🏻
```

---

## MESSAGE 4 — Transport (KT-specific — local booking center)

> KT uses its own local transportation office (not 12go.asia like the
> Indo sedes).

### EN

```
Trusted transportation office
Get info and assistance for ferry, train, bus, and plane tickets. They can also assist you with scooter/moped rentals as well 🛵
Koh Tao Booking center ⛴️🚂🚌✈️
+66844236278 (WhatsApp)
https://maps.app.goo.gl/QyF5fqWJwVFFGDV96
```

### ES

```
Oficina de transporte de confianza
Información y asistencia para tickets de ferry, tren, bus y avión. También te ayudan con alquiler de scooter/moto 🛵
Koh Tao Booking center ⛴️🚂🚌✈️
+66844236278 (WhatsApp)
https://maps.app.goo.gl/QyF5fqWJwVFFGDV96
```

---

## MESSAGE 5 — Location (KT)

### EN

```
DPM Diving Location (Google Maps) 👇
https://maps.app.goo.gl/XqpNsnq75f4CptVh6
```

### ES

```
Ubicación de DPM Diving (Google Maps) 👇
https://maps.app.goo.gl/XqpNsnq75f4CptVh6
```

---

## Quick-reply codes mapping (for the Respond.io snippet system)

| Step | EN snippet code | ES snippet code |
|---|---|---|
| 1 — Data request | GENENSizes (legacy partial) / new | GENESSizes (legacy partial) / new |
| 2 — Confirmation | KTENpaperworkregist | KTESPaperworkRegist |
| 3 — SSI App | KTENSSIApp | KTESSSIApp |
| 4 — Transport | KTENTransportBookingCenter | KTESTransportBookingCenter |
| 5 — Location | KTLOCATION | KTLOCATION |

If the AI is asked to "send paperwork info" / "send onboarding", emit
the full 5-message sequence above (not just one snippet).
