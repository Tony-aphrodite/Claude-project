# KB-05 — Reglas Operativas — Gili Trawangan

> Fuente: `DPM_AI_LAUNCH_GT_DOCUMENTO_COMPLETO4.md` §1.5 + §1.6 + §2.3
> (2026-05-07).

**Sede:** Gili Trawangan
**Hora local:** WITA (UTC+8)
**Última actualización:** 2026-05-07

---

## Horarios {#horarios}

### Centro (oficina)
- **Apertura:** 8:00 AM
- **Cierre:** 6:00 PM
- **Días:** todos los días, todo el año (excepto fuerza mayor)

### Barcos
- **Barco mañana (AM):** salida **7:15 AM** — regreso ~11:00 AM (2 buceos)
- **Barco tarde (PM):** salida **12:15 PM** — regreso ~4:00 PM (2 buceos)
- **NO hay buceo nocturno en Gili Trawangan.** Si el cliente lo pide,
  derivar a Gili Air (Colomba).

### Hora de llegada del cliente al centro
- **Salidas AM (7:15):** llegar 6:45 AM
- **Salidas PM (12:15):** llegar 12:00 PM
- **Cursos con teoría matutina:** llegar 15 min antes del horario indicado

### Duración de la piscina
~2 horas para todos los programas con piscina (Try Scuba, Scuba
Diver, Open Water, Refresh).

---

## Lógica horaria — qué puede ofrecer John según la hora actual {#logica-horaria}

El campo `hora_actual_wita` del Apps Script es la fuente de verdad
para esta lógica. Si está ausente (otra sede en el futuro), default
a "solo PM" para no oversell el barco AM.

| Hora actual WITA | Qué puede ofrecer hoy |
|------------------|----------------------|
| Antes de 7:15 | Mañana (AM) o tarde (PM) |
| 7:15 — 12:15 | Solo tarde (PM) — el barco AM ya zarpó |
| 12:15 — 17:00 | NO hay barco hoy. Pero **sí puede empezar curso con teoría + piscina hoy** y dejar los buceos para mañana en programas que lo permiten (ver abajo) |
| Después de 17:00 | Día siguiente directamente |

### Programas que admiten "empezar hoy con teoría + piscina"

- **Try Scuba** (teoría + piscina hoy → buceos mañana)
- **Refresh** (teoría + piscina hoy → buceos mañana)
- **Open Water** (Día 1 = teoría + piscina hoy → Día 2 buceos mañana)
- **Open Water 30** (igual que OW estándar)

### Programas que NO admiten esto (arrancan directo con buceos)

- Advanced Adventurer
- Fun Dive
- Deep Adventure + Fun Dive
- Deep Specialty
- Rescue Diver
- Nitrox Specialty

---

## Requisitos {#requisitos}

### Edad
- **Mínima general:** 10 años
- **8-9 años:** Try Scuba con profundidad máx 5 m (consultar oficina)
- **Menores de 15:** Junior OW (máx 12 m hasta los 15, después
  upgrade automático a 18 m)
- **Mayor de 45 años:** completar formulario médico al llegar

### Saber nadar
- **Open Water y cursos de certificación:** sí, requisito básico
  (poder flotar, sostenerse en el agua)
- **Try Scuba / Scuba Diver:** NO obligatorio nadador experto. El
  programa está diseñado para personas que no saben nadar bien.
- Para Try Scuba o si el cliente menciona miedo, preguntar si se
  siente cómodo en el agua.

---

## Condiciones médicas {#condiciones-medicas}

### Regla general
**DPM nunca pregunta sobre condiciones médicas proactivamente.**

Si el cliente menciona alguna condición → **escalar a humano** + decir:
- 🇪🇸 ES: "Te pedimos que completes el formulario médico al llegar al centro"
- 🇬🇧 EN: "We'll ask you to fill out a medical form when you arrive"

### Condiciones que requieren consulta médica antes de bucear

- Cardíaca (cualquier tipo)
- Diabetes (especialmente insulino-dependiente)
- Asma (incluso ocasional)
- Cirugía reciente (últimos 6 meses)
- Hipertensión no controlada
- Problemas de oído crónicos (perforación timpánica, cirugía oído reciente)
- Trastornos psiquiátricos en tratamiento

### Condiciones que NO permiten bucear con DPM (regla estricta) {#condiciones-no-permitidas}

- **Epilepsia:** NO se puede bucear con DPM, aunque el cliente
  tenga certificado médico. Es una condición impredecible y la
  seguridad va primero. **Regla estricta DPM, sin excepciones.**
- **Embarazo** (cualquier trimestre)
- **Resfriado fuerte / sinusitis activa con congestión**
- **Fiebre alta o diarrea intensa** el día del dive

### Condiciones que NO impiden bucear

- Mocos leves (si el cliente se siente bien en general)
- Migrañas leves controladas
- Edad avanzada (con formulario médico OK)
- Lentes de contacto (recomendar blandas)
- Necesidad de máscara con graduación (DPM tiene gratis disponibles)

---

## Equipamiento {#equipamiento}

### Incluido en todos los programas
- Equipo completo: traje neopreno 3mm corto, BCD, regulador, aletas,
  máscara, tanque 12L
- Instructor profesional certificado
- Seguro de buceo
- Snacks a bordo
- Toalla en el centro
- Certificación digital SSI (cuando aplique)
- Material teórico digital

### NO incluido (cargos separados)
- **Marine Park Fee:** 100.000 IDR por buceador, cash en oficina,
  válido 1 semana, cubre las 3 Gilis (Air, Trawangan, Meno).
  Mencionar SOLO al confirmar programa + fecha, NO al inicio de la
  conversación.
- **Computadora de buceo:** alquiler 150.000 IDR
- **GoPro:** no en el centro. Para principiantes NO se permite
  GoPro durante inmersiones (distracción de seguridad). Para
  certificados, pueden traer la suya propia.
- **Trajes 5 mm / 7 mm:** no necesarios (agua 26-29°C, 3 mm es
  suficiente)
- **Almuerzo:** NO incluido. Hay restaurantes cerca del centro.
- **Traslado al hotel:** NO incluido. La isla no tiene motos ni
  coches. Cliente viene caminando, en cidomo (coche caballo) o
  bicicleta.

### Disponible GRATIS en el centro
- **Máscaras con graduación:** disponibles SIEMPRE, gratis
- También se puede bucear con lentes de contacto blandas

---

## Acompañantes en el barco {#acompanantes}

NO se permiten acompañantes no buceadores en el barco (por seguro y
seguridad). Solo personas que participan activamente.

---

## Política de cancelación y reembolso {#cancelacion}

### Depósito
- **NO REEMBOLSABLE** bajo ninguna circunstancia
- **SÍ TRANSFERIBLE** a otra fecha o a otra sede DPM (Koh Tao, Phi
  Phi, Gili Air, Nusa Penida) sin cargo
- **Plazo de rebooking:** hasta 6 meses después de la fecha original
- **Mal clima:** se reprograma sin cargo

### Saldo restante (resto del pago en el centro)
- **Cliente cancela antes del primer dive:** se devuelve el saldo
  (NO el depósito)
- **No-show sin avisar:** pierde depósito + saldo no se cobra
- **Cliente abandona el curso a mitad por motivos personales:** no
  hay reembolso del saldo, pero puede continuar en otra fecha o
  sede DPM hasta 6 meses
- **DPM cancela por causa propia (instructor enfermo, etc.):**
  reembolso completo o reprogramación, a elección del cliente

---

## Descuentos {#descuentos}

### Descuentos automáticos
- **Grupo 2+ personas en Try Scuba, Open Water o Advanced:** 5 %
  automático

### Política general
- John **NO ofrece descuentos proactivamente**. Solo si el cliente
  pregunta.
- **Solo 1 descuento por reserva** (no acumulan)
- **Hasta 10 % es el límite duro del AI.** Si el cliente pide
  descuento mayor → escalar a humano. John NO tiene autoridad para
  aprobar > 10 %.

### Frase de John ante pedido de descuento
- 🇪🇸 ES: "Normalmente no hacemos descuentos — somos más de 1.000
  instructores de buceo, 13 años en el mercado. Vas a tener una
  experiencia increíble 🙂 Asegurá tu lugar ya."
- 🇬🇧 EN: "We usually don't do discounts — 1,000+ dive instructors,
  13 years. You'll have an amazing time 🙂 Lock it in now."

### Descuentos que NO existen
- NO hay descuentos de temporada baja activos
- NO hay descuentos por bookear 2+ programas combinados (excepto
  Refresh+Advanced que ya está armado como combo)
- NO hay descuentos por estadía larga
- Si el cliente persiste pidiendo → derivar a humano

---

## Ferries para llegar a Gili Trawangan {#ferries}

- **Desde Bali (Padangbai):** mínimo 2 hs de fast boat. Para
  Advanced Día 1 (12:15 PM) tiene que salir antes de las 10:00 AM.
- **Desde Lombok (Bangsal):** ~30 min. Más flexible.
- **Desde Nusa Penida:** mínimo 2 hs.

Para Día 1 con teoría a la tarde (1:30 PM), cliente que recién
llega a la isla ese día tiene que salir temprano del puerto de
origen.

---

## Clima y cancelaciones {#clima-cancelaciones}

- Si DPM cancela por mal clima → reprogramación sin cargo
- Si el cliente no quiere reprogramar y prefiere reembolso del
  saldo → derivar a humano
