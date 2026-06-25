# DPM Diving — Post-Payment Sequence (5 sedes · EN + ES)

**Source:** Miguel
**Date received:** 2026-06-25
**Status:** canonical spec for the 5-message post-payment onboarding flow
**Future note:** "esto va a cambiar cuando ya tengamos nuestro sistema de
registro online funcionando" — Miguel will swap Message 1 for an online
form once that's built. Until then, this is what the AI sends.

## What this is

The 5 messages the AI sends **after the customer pays and the booking
is confirmed** (OCR auto-confirm verdict = ok + validated). Sent as 5
SEPARATE messages in this order. Do NOT concatenate.

```
1. Data request           (same for all 5 sedes)
2. Booking confirmation   (per-sede — office hours differ)
3. SSI App                (per-sede — training center number differs)
4. Ferry / Transport      (per-sede — KT has local center, others use 12go.asia)
5. Location               (per-sede — Google Maps link)
```

## Per-sede operational data (quick lookup)

| Sede | Office hours | SSI training centre | Transport |
|---|---|---|---|
| Koh Tao | 8am–8pm | 766502 / DPM Diving | Koh Tao Booking center +66844236278 |
| Koh Phi Phi | 10am–8pm | 766698 / DPM Diving Phi Phi | 12go.asia |
| Nusa Penida | **7am–7pm** (corrected from 6pm) | 741448 / DPM Diving Nusa Penida | 12go.asia |
| Gili Trawangan | 8am–6pm | 741421 / DPM Gili Trawangan | 12go.asia |
| Gili Air | 8am–6pm | 741453 / DPM Gili Air | 12go.asia |

## MESSAGE 1 — Data request (identical for all 5 sedes)

### EN

> Thank you so much for choosing DPM Diving! The following info will help us provide a better service and have everything organized before you arrive 🙂
>
> If you're in a hurry or don't have access to the requested info right now, please just share full names and DOB — you can send the rest later. Kindly remember to include all divers 👇🏻
>
> Full Name:
> Date of birth (DD/MM/YYYY):
> Passport #:
> Have diving certification?:
> Amount of dives:
> Date of your last dive:
> 🪪 A picture or screenshot of your certification (both sides):
>
> Sizes (diving gear) 🤿🩳👙
> T-Shirt:
> Shoes:
>
> Looking forward to your answer in order to proceed with your booking 🙂👌🏻

### ES

> ¡Muchas gracias por elegir DPM Diving! La siguiente información nos ayuda a brindarte un mejor servicio y tener todo organizado antes de tu llegada 🙂
>
> Si estás apurado o no tenés acceso a los datos ahora mismo, mandanos solo el nombre completo y la fecha de nacimiento — el resto lo podés enviar después. Acordate de incluir a todos los buceadores 👇🏻
>
> Nombre completo:
> Fecha de nacimiento (DD/MM/AAAA):
> N° de pasaporte:
> ¿Tenés certificación de buceo?:
> Cantidad de inmersiones:
> Fecha de tu última inmersión:
> 🪪 Una foto o captura de tu certificación (ambos lados):
>
> Tallas (equipo de buceo) 🤿🩳👙
> Remera:
> Zapato:
>
> Quedamos atentos a tu respuesta para continuar con tu reserva 🙂👌🏻

---

## KOH TAO

### EN — Message 2 (Confirmation)

> All set for your (INSERT DETAILS OF THE BOOKING SUCH AS ACTIVITY, DATE, TIME, NUMBER OF CX)! 😃
> Next step is to swing by the dive shop the day before you start your activity, so we can get you registered and verify your dive gear sizes.
> Kindly remember that our office hours are from 8am to 8pm 👩‍💼🏢
> Looking forward to seeing you around!

### EN — Message 3 (SSI App)

> My SSI app 😎🤿
> In order to speed things up, we ask you to kindly download according to your OS and create an account. (You'll need to enter your email twice for verification, training centre number is 766502 / DPM Diving) 🙂
> ANDROID 🖥️
> https://play.google.com/store/apps/details?id=com.divessi.ssi
> IOS - IPhone 🖥️
> https://apps.apple.com/us/app/myssi-3-0/id1249389209
> Let us know if you have any questions 😁🙏🏻

### EN — Message 4 (Transport)

> Trusted transportation office
> Get info and assistance for ferry, train, bus, and plane tickets. They can also assist you with scooter/moped rentals as well 🛵
> Koh Tao Booking center ⛴️🚂🚌✈️
> +66844236278 (WhatsApp)
> https://maps.app.goo.gl/QyF5fqWJwVFFGDV96

### EN — Message 5 (Location)

> DPM Diving Location (Google Maps) 👇
> https://maps.app.goo.gl/XqpNsnq75f4CptVh6

### ES — Message 2 (Confirmation)

> ¡Todo listo para tu (INSERTAR DETALLES DE LA RESERVA: ACTIVIDAD, FECHA, HORA, CANTIDAD DE PERSONAS)! 😃
> El siguiente paso es pasar por el dive center el día anterior a tu actividad, para registrarte y verificar las tallas del equipo de buceo.
> Recordá que nuestro horario de oficina es de 8am a 8pm 👩‍💼🏢
> ¡Nos vemos pronto!

### ES — Message 3 (SSI App)

> Mi SSI App 😎🤿
> Para agilizar los trámites, descargá la app según tu sistema operativo y creá una cuenta. (Vas a tener que ingresar tu email dos veces para la verificación, el número de centro de formación es 766502 / DPM Diving) 🙂
> ANDROID 🖥️
> https://play.google.com/store/apps/details?id=com.divessi.ssi
> iOS - iPhone 🖥️
> https://apps.apple.com/us/app/myssi-3-0/id1249389209
> Cualquier duda, avisanos 😁🙏🏻

### ES — Message 4 (Transport)

> Oficina de transporte de confianza
> Información y asistencia para tickets de ferry, tren, bus y avión. También te ayudan con alquiler de scooter/moto 🛵
> Koh Tao Booking center ⛴️🚂🚌✈️
> +66844236278 (WhatsApp)
> https://maps.app.goo.gl/QyF5fqWJwVFFGDV96

### ES — Message 5 (Location)

> Ubicación de DPM Diving (Google Maps) 👇
> https://maps.app.goo.gl/XqpNsnq75f4CptVh6

---

## KOH PHI PHI

### EN — Message 2 (Confirmation)

> All set for your (INSERT DETAILS OF THE BOOKING SUCH AS ACTIVITY, DATE, TIME, NUMBER OF CX)! 😃
> Next step is to swing by the dive shop the day before you start your activity, so we can get you registered and verify your dive gear sizes.
> Kindly remember that our office hours are from 10am to 8pm 👩‍💼🏢
> Looking forward to seeing you around!

### EN — Message 3 (SSI App)

> My SSI app 😎🤿
> In order to speed things up, we ask you to kindly download according to your OS and create an account. (You'll need to enter your email twice for verification, training centre number is 766698 / DPM Diving Phi Phi) 🙂
> ANDROID 🖥️
> https://play.google.com/store/apps/details?id=com.divessi.ssi
> IOS - IPhone 🖥️
> https://apps.apple.com/us/app/myssi-3-0/id1249389209
> Let us know if you have any questions 😁🙏🏻

### EN — Message 4 (Ferry)

> Here is our recommended website where you can buy your ferry tickets 👇🏽🎫🎟️
> https://12go.asia
> Whether you're traveling from Krabi to Phi Phi, or Phuket to Phi Phi. Easier and convenient as ferry timings and prices are listed on the site🚢

### EN — Message 5 (Location)

> This is DPM's location on Koh Phi Phi 🤿👇
> https://g.co/kgs/WY115T

### ES — Message 2 (Confirmation)

> ¡Todo listo para tu (INSERTAR DETALLES DE LA RESERVA: ACTIVIDAD, FECHA, HORA, CANTIDAD DE PERSONAS)! 😃
> El siguiente paso es pasar por el dive center el día anterior a tu actividad, para registrarte y verificar las tallas del equipo de buceo.
> Recordá que nuestro horario de oficina es de 10am a 8pm 👩‍💼🏢
> ¡Nos vemos pronto!

### ES — Message 3 (SSI App)

> Mi SSI App 😎🤿
> Para agilizar los trámites, descargá la app según tu sistema operativo y creá una cuenta. (Vas a tener que ingresar tu email dos veces para la verificación, el número de centro de formación es 766698 / DPM Diving Phi Phi) 🙂
> ANDROID 🖥️
> https://play.google.com/store/apps/details?id=com.divessi.ssi
> iOS - iPhone 🖥️
> https://apps.apple.com/us/app/myssi-3-0/id1249389209
> Cualquier duda, avisanos 😁🙏🏻

### ES — Message 4 (Ferry)

> Esta es la web que recomendamos para comprar tus tickets de ferry 👇🏽🎫🎟️
> https://12go.asia
> Ya sea que viajes desde Krabi a Phi Phi, o desde Phuket a Phi Phi. Es fácil y cómodo: los horarios y precios de los ferries están listados en el sitio 🚢

### ES — Message 5 (Location)

> Esta es la ubicación de DPM en Koh Phi Phi 🤿👇
> https://g.co/kgs/WY115T

---

## NUSA PENIDA

> ⚠️ Office hours corrected to 7am–7pm (previously said 6pm — now
> matches the KB). All references updated.

### EN — Message 2 (Confirmation)

> All set for your (INSERT DETAILS OF THE BOOKING SUCH AS ACTIVITY, DATE, TIME, NUMBER OF CX)! 😃
> Next step is to swing by the dive shop the day before you start your activity, so we can get you registered and verify your dive gear sizes.
> Kindly remember that our office hours are from 7am to 7pm 👩‍💼🏢
> Looking forward to seeing you around!

### EN — Message 3 (SSI App)

> My SSI app 😎🤿
> In order to speed things up, we ask you to kindly download according to your OS and create an account. (You'll need to enter your email twice for verification, training centre number is 741448 / DPM Diving Nusa Penida) 🙂
> ANDROID 🖥️
> https://play.google.com/store/apps/details?id=com.divessi.ssi
> IOS - IPhone 🖥️
> https://apps.apple.com/us/app/myssi-3-0/id1249389209
> Let us know if you have any questions 😁🙏🏻

### EN — Message 4 (Ferry)

> Here is the best website to buy your inter-island ferry tickets 👇🏽🎫🎟️
> https://12go.asia
> Whether you're traveling from Bali to Nusa Penida, Gili Trawangan or even Lombok. Easier and convenient as ferry timings and prices are listed on the site🚢

### EN — Message 5 (Location)

> Here's our dive center's location on Nusa Penida 👇🤿
> https://maps.app.goo.gl/mTz76DVBofj5FRLb6

### ES — Message 2 (Confirmation)

> ¡Todo listo para tu (INSERTAR DETALLES DE LA RESERVA: ACTIVIDAD, FECHA, HORA, CANTIDAD DE PERSONAS)! 😃
> El siguiente paso es pasar por el dive center el día anterior a tu actividad, para registrarte y verificar las tallas del equipo de buceo.
> Recordá que nuestro horario de oficina es de 7am a 7pm 👩‍💼🏢
> ¡Nos vemos pronto!

### ES — Message 3 (SSI App)

> Mi SSI App 😎🤿
> Para agilizar los trámites, descargá la app según tu sistema operativo y creá una cuenta. (Vas a tener que ingresar tu email dos veces para la verificación, el número de centro de formación es 741448 / DPM Diving Nusa Penida) 🙂
> ANDROID 🖥️
> https://play.google.com/store/apps/details?id=com.divessi.ssi
> iOS - iPhone 🖥️
> https://apps.apple.com/us/app/myssi-3-0/id1249389209
> Cualquier duda, avisanos 😁🙏🏻

### ES — Message 4 (Ferry)

> Esta es la mejor web para comprar tus tickets de ferry entre islas 👇🏽🎫🎟️
> https://12go.asia
> Ya sea que viajes desde Bali a Nusa Penida, Gili Trawangan o incluso Lombok. Es fácil y cómodo: los horarios y precios de los ferries están listados en el sitio 🚢

### ES — Message 5 (Location)

> Esta es la ubicación de nuestro dive center en Nusa Penida 👇🤿
> https://maps.app.goo.gl/mTz76DVBofj5FRLb6

---

## GILI TRAWANGAN

### EN — Message 2 (Confirmation)

> All set for your (INSERT DETAILS OF THE BOOKING SUCH AS ACTIVITY, DATE, TIME, NUMBER OF CX)! 😃
> Next step is to swing by the dive shop the day before you start your activity, so we can get you registered and verify your dive gear sizes.
> Kindly remember that our office hours are from 8am to 6pm 👩‍💼🏢
> Looking forward to seeing you around!

### EN — Message 3 (SSI App)

> My SSI app 😎🤿
> In order to speed things up, we ask you to kindly download according to your OS and create an account. You'll need to enter your email twice for verification. Our training centre number is 741421 / DPM Gili Trawangan 🙂
> ANDROID 🖥️
> https://play.google.com/store/apps/details?id=com.divessi.ssi
> IOS - iPhone 🖥️
> https://apps.apple.com/us/app/myssi-3-0/id1249389209
> Let us know if you have any questions 😁🙏

### EN — Message 4 (Ferry)

> Here is the best website to buy your inter-island ferry tickets 👇🏽🎫🎟️
> https://12go.asia
> Whether you're traveling from Bali to Nusa Penida, Gili Trawangan or even Lombok. Easier and convenient as ferry timings and prices are listed on the site🚢

### EN — Message 5 (Location)

> This is DPM's location on Gili Trawangan 🤿👇
> https://maps.app.goo.gl/6LrWiUj7vAp3EQ9m8

### ES — Message 2 (Confirmation)

> ¡Todo listo para tu (INSERTAR DETALLES DE LA RESERVA: ACTIVIDAD, FECHA, HORA, CANTIDAD DE PERSONAS)! 😃
> El siguiente paso es pasar por el dive center el día anterior a tu actividad, para registrarte y verificar las tallas del equipo de buceo.
> Recordá que nuestro horario de oficina es de 8am a 6pm 👩‍💼🏢
> ¡Nos vemos pronto!

### ES — Message 3 (SSI App)

> Mi SSI App 😎🤿
> Para agilizar los trámites, descargá la app según tu sistema operativo y creá una cuenta. Vas a tener que ingresar tu email dos veces para la verificación. Nuestro número de centro de formación es 741421 / DPM Gili Trawangan 🙂
> ANDROID 🖥️
> https://play.google.com/store/apps/details?id=com.divessi.ssi
> iOS - iPhone 🖥️
> https://apps.apple.com/us/app/myssi-3-0/id1249389209
> Cualquier duda, avisanos 😁🙏

### ES — Message 4 (Ferry)

> Esta es la mejor web para comprar tus tickets de ferry entre islas 👇🏽🎫🎟️
> https://12go.asia
> Ya sea que viajes desde Bali a Nusa Penida, Gili Trawangan o incluso Lombok. Es fácil y cómodo: los horarios y precios de los ferries están listados en el sitio 🚢

### ES — Message 5 (Location)

> Esta es la ubicación de DPM en Gili Trawangan 🤿👇
> https://maps.app.goo.gl/6LrWiUj7vAp3EQ9m8

---

## GILI AIR

### EN — Message 2 (Confirmation)

> All set for your (INSERT DETAILS OF THE BOOKING SUCH AS ACTIVITY, DATE, TIME, NUMBER OF CX)! 😃
> Next step is to swing by the dive shop the day before you start your activity, so we can get you registered and verify your dive gear sizes.
> Kindly remember that our office hours are from 8am to 6pm 👩‍💼🏢
> Looking forward to seeing you around!

### EN — Message 3 (SSI App)

> My SSI app 😎🤿
> In order to speed things up, we ask you to kindly download according to your OS and create an account. (You'll need to enter your email twice for verification, training centre number is 741453 / DPM Gili Air) 🙂
> ANDROID 🖥️
> https://play.google.com/store/apps/details?id=com.divessi.ssi
> IOS - IPhone 🖥️
> https://apps.apple.com/us/app/myssi-3-0/id1249389209
> Let us know if you have any questions 😁🙏🏻

### EN — Message 4 (Ferry)

> Here is the best website to buy your inter-island ferry tickets 👇🏽🎫🎟️
> https://12go.asia
> Whether you're traveling from Bali to Nusa Penida, Gili Trawangan or even Lombok. Easier and convenient as ferry timings and prices are listed on the site🚢

### EN — Message 5 (Location)

> This is the location of our dive center in Gili Air 👇🏻🤿
> https://www.google.com/maps/search/DPM%20Diving%20Gili%20Air/@-8.3641,116.0811,17z?hl=es

### ES — Message 2 (Confirmation)

> ¡Todo listo para tu (INSERTAR DETALLES DE LA RESERVA: ACTIVIDAD, FECHA, HORA, CANTIDAD DE PERSONAS)! 😃
> El siguiente paso es pasar por el dive center el día anterior a tu actividad, para registrarte y verificar las tallas del equipo de buceo.
> Recordá que nuestro horario de oficina es de 8am a 6pm 👩‍💼🏢
> ¡Nos vemos pronto!

### ES — Message 3 (SSI App)

> Mi SSI App 😎🤿
> Para agilizar los trámites, descargá la app según tu sistema operativo y creá una cuenta. (Vas a tener que ingresar tu email dos veces para la verificación, el número de centro de formación es 741453 / DPM Gili Air) 🙂
> ANDROID 🖥️
> https://play.google.com/store/apps/details?id=com.divessi.ssi
> iOS - iPhone 🖥️
> https://apps.apple.com/us/app/myssi-3-0/id1249389209
> Cualquier duda, avisanos 😁🙏🏻

### ES — Message 4 (Ferry)

> Esta es la mejor web para comprar tus tickets de ferry entre islas 👇🏽🎫🎟️
> https://12go.asia
> Ya sea que viajes desde Bali a Nusa Penida, Gili Trawangan o incluso Lombok. Es fácil y cómodo: los horarios y precios de los ferries están listados en el sitio 🚢

### ES — Message 5 (Location)

> Esta es la ubicación de nuestro dive center en Gili Air 👇🏻🤿
> https://www.google.com/maps/search/DPM%20Diving%20Gili%20Air/@-8.3641,116.0811,17z?hl=es

---

## Sequencing rules

- 5 messages are SEPARATE — sent in order 1 → 2 → 3 → 4 → 5.
- Do NOT concatenate.
- Trigger: deposit confirmed (OCR auto-confirm verdict = ok+validated)
  OR manual confirmation from the panel.
- Today: the existing Respond.io "DPM GT - Onboarding Piloto" workflow
  fires when `deposit_paid` tag is added. Same trigger applies for all
  5 sedes once their workflow mirrors GT's pattern. The AI's role is to
  emit the messages (or trigger the workflow that emits them) — not to
  send them all in a single concatenated bubble.
- Message 1 will be REPLACED by an online registration form once
  Miguel's portal is live. Until then, the AI sends Message 1 verbatim.
