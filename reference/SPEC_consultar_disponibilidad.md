# Tool Spec — `consultar_disponibilidad`

**Para:** Steve (DPM Command Center, Vercel)
**De:** Colomba — Gili Air
**Versión:** v1.3
**Fecha:** 2026-05-15

## Changelog v1.3

- Agregada lógica de la "regla de las 10 AM" para Try Scuba, Scuba Diver y Refresh: si el cliente puede estar en el centro antes de las 10 AM, modo STANDARD (1 día, piscina AM + barco PM, chequear `turno_tarde`). Si llega después, modo SPLIT (2 días, piscina PM día 1 + barco AM día 2, chequear `turno_manana` del día siguiente).
- Actualizado el mapeo de programas a turnos para reflejar los dos modos.
- Actualizado el Patrón 4 (cliente quiere arrancar hoy) con la lógica completa.

## Changelog v1.2

- Clarificación crítica del modelo del roster: el endpoint reporta capacidad **solo de barco** (turnos mañana, tarde) y **shore nocturno**. La piscina/teoría siempre tienen lugar — no se consulta. Esto cambia la lógica: Colomba mapea cada programa a sus días con barco antes de consultar, y solo verifica los turnos relevantes.
- Reescrita la sección "Mapeo de turnos a programas" con la matriz completa día-por-día.
- Sin impacto en el contrato del server: este es trabajo lógico de Colomba en el prompt, el server sigue siendo un thin wrapper sobre el endpoint Apps Script.

## Changelog v1.1

- Resueltas las 2 preguntas abiertas críticas:
  - **+30 días en el futuro**: el roster tiene el año completo cargado, no hay problema. La spec ahora no impone tope artificial al param `dias`.
  - **Distinción piscina vs barco**: aclarado en v1.2.

---

## Resumen

`consultar_disponibilidad` permite a Colomba consultar el roster en
tiempo real de Gili Air para responder preguntas sobre fechas, cupos
y turnos disponibles. Es una tool de **lectura** (no toma acción
visible para el cliente, solo agrega info al contexto de Colomba
para el próximo turno).

El roster vive en una Google Sheet expuesta vía Apps Script. La
sede de Gili Air tiene 3 turnos diarios (mañana, tarde, nocturno)
— a diferencia de Gili Trawangan que solo tiene 2.

---

## Endpoint

**URL:** `https://script.google.com/macros/s/AKfycby5DCwi-X_Gcx-VX7bYKeLQ5I7uotSADINxIO4BAkU/exec`

**Method:** GET

**Auth:** Ninguna (Apps Script web app público).

**Query params:**

| Param | Tipo | Required | Default | Descripción |
|-------|------|----------|---------|-------------|
| `date` | string YYYY-MM-DD | Sí | — | Fecha de inicio de consulta |
| `days` | int | No | 7 | Cantidad de días a consultar desde `date` (inclusive) |

**Timezone:** El roster vive en hora Asia/Makassar (WITA, UTC+8).
El campo `hora_actual_wita` en la respuesta es la referencia. Si
Colomba consulta sin filtrar por hora, considera el día completo.

---

## Contrato — JSON de Colomba

Colomba incluye en su JSON de respuesta:

```json
{
  "respuesta": "Let me check what we have available for those dates 🤿",
  "consultar_disponibilidad": {
    "fecha": "2026-05-20",
    "dias": 7
  },
  "fuentes": ["tool:consultar_disponibilidad"]
}
```

### Campos del objeto `consultar_disponibilidad`

| Campo | Tipo | Required | Default | Reglas |
|-------|------|----------|---------|--------|
| `fecha` | string YYYY-MM-DD | Sí | — | Fecha de inicio. Si el cliente dice "next week", "el lunes", "Friday", Colomba la traduce a YYYY-MM-DD usando hoy + Asia/Makassar. |
| `dias` | int 1-14 | No | 7 | Si el cliente da rango largo ("I'm here for 2 weeks"), Colomba pasa 14. Si pregunta solo por una fecha puntual, pasa 1 o 2. |

Si Colomba omite el objeto entero (no incluye `consultar_disponibilidad` en el JSON), el server no llama al endpoint.

---

## Server orchestration

Cuando Colomba devuelve un JSON con `consultar_disponibilidad`:

```
[Vercel server]
  1. Lee el objeto consultar_disponibilidad del JSON de Colomba
  2. Construye URL: <ENDPOINT>?date=<fecha>&days=<dias>
  3. Verifica cache local (TTL recomendado: 5 min por par fecha+días)
     - Si HIT: usa la respuesta cacheada
     - Si MISS: GET al endpoint
  4. Parsea la respuesta JSON
  5. Inyecta el resultado en el LAST_TOOL_RESULTS del próximo turno
     de Colomba (ver formato abajo)
  6. Envía el respuesta.text de este turno al cliente (NO bloquea
     mientras espera el roster — el cliente ve la frase tipo "let
     me check..." mientras se hace la consulta)
  7. Espera respuesta del cliente o trigger del próximo turno

[Colomba turno N+1]
  - Lee LAST_TOOL_RESULTS
  - Interpreta los datos
  - Responde al cliente con info real de disponibilidad
```

### Caching

5 minutos de TTL es razonable porque:
- El roster cambia con bookings entrantes, pero no minuto a minuto
- 5 min asegura que dos consultas seguidas del mismo cliente no
  golpeen Apps Script innecesariamente (Apps Script tiene quota)
- Si el cliente está negociando en tiempo real una fecha, 5 min de
  staleness es invisible

Si el cliente confirma reserva y el server necesita verificar
disponibilidad antes de "lockear", forzar bypass del cache.

### Error handling

| Caso | Server response a Colomba |
|------|--------------------------|
| Endpoint timeout (>10s) | `tool:consultar_disponibilidad:error=timeout` |
| HTTP 500 / 503 | `tool:consultar_disponibilidad:error=server_error` |
| Respuesta no JSON | `tool:consultar_disponibilidad:error=parse_error` |
| `date` con formato inválido | Validar ANTES de llamar, devolver `tool:consultar_disponibilidad:error=bad_date_format` |
| `days` fuera de rango (>14 o <1) | Clip a 1-14 silenciosamente, no devolver error |

Cuando Colomba recibe un error, fallback: "let me check directly
with the office and get back to you in a few minutes 🙏" + escala
con `escalation_reason: out_of_scope`.

---

## Sample response del endpoint (real, capturada 2026-05-15)

Para consulta `date=2026-05-20&days=7`:

```json
{
  "hora_actual_wita": "16:41",
  "fecha_consultada": "2026-05-20",
  "disponible": true,
  "primer_dia_disponible": "2026-05-20",
  "resumen": "Disponibilidad confirmada para 2026-05-20: tarde (19 espacios), nocturno (20 espacios). Puedes confirmar la reserva.",
  "detalle": [
    {
      "fecha": "2026-05-20",
      "disponible": true,
      "turno_manana": { "disponible": false, "espacios": 0, "capacidad": 0 },
      "turno_tarde":  { "disponible": true,  "espacios": 19, "capacidad": 19 },
      "turno_nocturno": { "disponible": true, "espacios": 20, "capacidad": 20 }
    },
    {
      "fecha": "2026-05-21",
      "disponible": true,
      "turno_manana": { "disponible": true, "espacios": 20, "capacidad": 20 },
      "turno_tarde":  { "disponible": true, "espacios": 20, "capacidad": 20 },
      "turno_nocturno": { "disponible": true, "espacios": 20, "capacidad": 20 }
    },
    // ... 5 días más
  ]
}
```

---

## Field-by-field decoding

| Campo | Significado | Cómo lo usa Colomba |
|-------|-------------|---------------------|
| `hora_actual_wita` | Hora WITA en el momento de la consulta, formato HH:mm | Para saber si ya pasó el turno mañana del día actual. Si son 16:41 y el cliente pregunta por hoy, el turno mañana ya está fuera. |
| `fecha_consultada` | El `date` que pasamos como param, echo | Verificación. Si no coincide con lo que mandó Colomba, hay bug. |
| `disponible` | Bool top-level — true si hay AL MENOS UN espacio en el rango consultado | Quick check para "¿hay algo?". Para detalle por día, usar `detalle[]`. |
| `primer_dia_disponible` | YYYY-MM-DD del primer día con al menos un turno disponible en el rango | Útil para "¿cuándo es lo más pronto?" El cliente preguntó por una fecha que no anda, Colomba propone esta. |
| `resumen` | Texto en español describiendo el día consultado | NO usar directamente. Colomba construye su propio resumen en el idioma del cliente. |
| `detalle[]` | Array de 7 días (o `days`) con los 3 turnos cada uno | La fuente de verdad para responder. |

### Estructura de cada día en `detalle[]`

```
{
  "fecha": "2026-05-20",
  "disponible": true,                                       // ¿el día completo tiene algún espacio?
  "turno_manana":   { "disponible": bool, "espacios": int, "capacidad": int },
  "turno_tarde":    { "disponible": bool, "espacios": int, "capacidad": int },
  "turno_nocturno": { "disponible": bool, "espacios": int, "capacidad": int }
}
```

- `espacios` — cantidad de buceadores que pueden sumarse a ese turno.
- `capacidad` — capacidad máxima del turno hoy.
- `disponible` por turno = (`espacios` > 0).

**Observación importante del sample real:** cuando un turno está
"cerrado" (ej. mañana del día actual a las 16:41 ya pasó), aparece
con `espacios: 0, capacidad: 0, disponible: false`. Eso significa
"no se puede operar este turno hoy", no necesariamente "el barco
está lleno". Colomba debe diferenciar en su respuesta — si tarde y
nocturno están disponibles pero mañana no, NO decir "mañana está
lleno", decir "mañana del barco ya salió hoy" o simplemente no
mencionar mañana y ofrecer tarde/nocturno.

### Mapeo de programa a turnos del roster (qué consultar)

**El endpoint reporta:** capacidad de barco (turnos mañana y tarde)
+ shore nocturno. **No reporta capacidad de piscina/teoría —
asumir siempre disponible.**

Por eso Colomba mapea cada programa a sus días, identifica cuáles
días usan barco vs piscina, y consulta el roster solo para los
días de barco. Esta lógica vive en el prompt de Colomba
(§mapeo-programa-roster), no en el server. Para referencia rápida:

| Programa | Duración | Turnos a chequear (día_N indexado desde 0) |
|----------|----------|--------------------------------------------|
| Try Scuba (STANDARD, llegada ≤10 AM) | 1 día | día_0.turno_tarde |
| Try Scuba (SPLIT, llegada >10 AM) | 2 días | día_1.turno_manana |
| Scuba Diver (STANDARD) | 1 día | día_0.turno_tarde |
| Scuba Diver (SPLIT) | 2 días | día_1.turno_manana |
| Refresh (STANDARD) | 1 día | día_0.turno_tarde |
| Refresh (SPLIT) | 2 días | día_1.turno_manana |
| Open Water | 3 días | día_1.turno_tarde + día_2.turno_manana |
| Open Water 30 | 3 días | día_1.turno_tarde + día_2.turno_manana + día_2.turno_tarde |
| Advanced sin nocturno | 2 días | día_0.turno_tarde + día_1.turno_manana |
| Advanced con nocturno | 2 días | día_0.turno_tarde + día_1.turno_manana + día_1.turno_nocturno |
| Refresh + Advanced | 2 días | día_0.turno_tarde + día_1.turno_manana (+ día_1.turno_nocturno si swap) |
| Fun Dive | medio día | día_0.turno_manana OR día_0.turno_tarde (cliente elige) |
| Deep Adventure + FD | medio día | día_0.turno_manana OR día_0.turno_tarde |
| Night Adventure / Night FD | medio día | día_0.turno_nocturno |

**Regla operativa importante (Try Scuba / Scuba Diver / Refresh):**
si `hora_actual_wita > 10:00` o el cliente confirma que llega al
centro después de las 10 AM ese día, NO se puede correr el
programa en un solo día (la piscina dura >1 hora y el barco PM
sale puntual a las 12:30). Colomba ofrece modo SPLIT: piscina PM
hoy + barco AM mañana. Ver §regla-10am del prompt para el detalle
del flujo conversacional.

**Implicación operativa:** el server no necesita saber esto. Solo
pasa `fecha` y `dias` al endpoint y devuelve la respuesta cruda. La
lógica de "qué turno de qué día verificar" la aplica Colomba al
leer el resultado, basándose en el programa elegido por el cliente.

---

## Cómo se entrega el resultado a Colomba

En el contexto del próximo turno, el server inyecta:

```
LAST_TOOL_RESULTS:
  tool: consultar_disponibilidad
  fecha_consultada: "2026-05-20"
  dias: 7
  status: success
  hora_actual_wita: "16:41"
  disponible_global: true
  primer_dia_disponible: "2026-05-20"
  detalle:
    - 2026-05-20: mañana=cerrado, tarde=19, nocturno=20
    - 2026-05-21: mañana=20, tarde=20, nocturno=20
    - 2026-05-22: mañana=20, tarde=17, nocturno=20
    - 2026-05-23: mañana=17, tarde=19, nocturno=20
    - 2026-05-24: mañana=19, tarde=18, nocturno=20
    - 2026-05-25: mañana=20, tarde=20, nocturno=20
    - 2026-05-26: mañana=20, tarde=19, nocturno=20
```

Formato compacto en YAML/texto plano es preferible a inyectar el
JSON crudo: ahorra tokens y es más fácil de leer para Colomba.

---

## Patrones de uso de Colomba

### Patrón 1 — Cliente pregunta por una fecha específica (curso multi-día)

Cliente: "Can I do my Open Water starting May 22?"
→ Colomba sabe: OW es 3 días, día 1 piscina, día 2 barco PM, día 3 barco AM
→ Acción: `"consultar_disponibilidad": { "fecha": "2026-05-22", "dias": 4 }`
   (4 días para tener un día de buffer)
→ Espera próximo turno con LAST_TOOL_RESULTS
→ Verifica: `detalle[1].turno_tarde.espacios > 0` Y `detalle[2].turno_manana.espacios > 0`
→ Si ambos OK: "Yes, all good for May 22 🤿 day 1 we do pool and theory, day 2 we hit the boat for 2 dives, day 3 morning we close it out with 2 more dives + your knowledge review. Want me to lock it in?"
→ Si uno falla: "May 23 afternoon boat is fully booked, but if we kick off the 23rd instead (so day 2 lands on the 24th PM), all slots are open. Works?"

### Patrón 2 — Cliente flexible, busca "lo más pronto"

Cliente: "I'm here for 10 days, any time works for the advanced"
→ Acción: `"consultar_disponibilidad": { "fecha": "<fecha_de_llegada>", "dias": 10 }`
→ Colomba busca un par de días consecutivos (i, i+1) tal que:
  `detalle[i].turno_tarde.espacios > 0` Y `detalle[i+1].turno_manana.espacios > 0`
→ Propone fecha concreta: "Perfect, we can start your Advanced on May 22 — afternoon boat day 1, morning boat day 2 🤿 If you want to swap one dive for night, day 2 evening is open too."

### Patrón 3 — Cliente menciona dos opciones

Cliente: "I want to do a fun dive either May 23 or 24, morning if possible"
→ Acción: `"consultar_disponibilidad": { "fecha": "2026-05-23", "dias": 2 }`
→ Compara turno_manana del 23 y del 24
→ Responde con la opción donde haya más espacios o ambas si ambas tienen

### Patrón 4 — Cliente quiere arrancar HOY

Cliente: "Can I dive today?" (o "Hoy mismo se puede?")
→ Acción con `fecha = hoy`, `dias = 2`
→ Colomba mira `hora_actual_wita` del resultado para decidir:

**Para Try Scuba / Scuba Diver / Refresh:**
- Si `hora_actual_wita` < 10:00 → modo STANDARD: confirma para HOY, chequea `detalle[0].turno_tarde.espacios > 0`. Mensaje: "Yes, we can start today 🤿 pool session at 9, boat at 12:30 — done by 4."
- Si `hora_actual_wita` entre 10:00 y 17:30 → modo SPLIT: ofrece piscina PM hoy + barco AM mañana. Chequea `detalle[1].turno_manana.espacios > 0`. Mensaje: "Today's a bit late to do it in one go, but we can still start — pool this afternoon, boat tomorrow morning, done by noon 🤿 sounds good?"
- Si `hora_actual_wita` > 17:30 → ofrece arrancar mañana en STANDARD.

**Para Fun Dive / Deep Adventure + FD:**
- Si `hora_actual_wita` < 6:30 → puede AM (chequea `detalle[0].turno_manana`)
- Si entre 6:30 y 12:30 → solo PM (chequea `detalle[0].turno_tarde`)
- Si > 12:30 → ofrece mañana

**Para OW / OW30:**
- Si `hora_actual_wita` < 13:00 → puede arrancar HOY con la sesión de piscina PM (Día 1). Chequea `detalle[1].turno_tarde` (Día 2 PM) y `detalle[2].turno_manana` (Día 3 AM) para confirmar que los días siguientes funcionan.
- Si > 13:00 → ofrece arrancar mañana.

**Para Advanced (sin Refresh previo):**
- Si `hora_actual_wita` < 12:00 → puede arrancar HOY con barco PM día 1. Chequea `detalle[0].turno_tarde` Y `detalle[1].turno_manana`.
- Si > 12:00 → ofrece arrancar mañana.

**Para Night Adventure / Night FD:**
- Si `hora_actual_wita` < 17:00 → puede HOY. Chequea `detalle[0].turno_nocturno`.
- Si > 17:00 → ofrece mañana.

### Patrón 5 — Anticipación de feriados / cierre

El centro solo cierra 25/12 y 01/01. Si Colomba pregunta por esas
fechas, los días aparecen sin disponibilidad. La respuesta debe
mencionar el cierre, no inventar otra razón.

---

## Reglas para Colomba — cuándo SÍ usar la tool

- Cliente da fechas concretas y pregunta si hay cupo
- Cliente flexible pregunta cuándo es lo más pronto
- Cliente quiere verificar antes del depósito
- Cliente reagenda y pregunta otras fechas

## Reglas para Colomba — cuándo NO usar la tool

- Cliente está explorando general ("how does this work?", "what
  programs do you have?") → no necesita disponibilidad, todavía
- Cliente pregunta por precio o info de un programa → eso va por
  `send_product_card` o snippets
- Cliente ya pagó el depósito y consulta detalles operativos → la
  disponibilidad ya está lockeada, escalar para que humanos manejen
- Cliente pregunta por fechas a más de 6 meses → consultar
  igualmente (el roster tiene todo el año cargado). Si la respuesta
  llega vacía o con disponibilidad anormalmente baja, Colomba
  responde "para esa fecha lejos chequeamos directamente con la
  oficina por las dudas, te confirmo en breve" y escala con
  `out_of_scope` para que un humano confirme.

---

## Open questions para Steve / DPM

Las 2 preguntas críticas (full year cargado + piscina vs barco) ya
están resueltas (ver Changelog v1.1). Quedan estas pendientes, no
bloquean producción:

1. **[MEDIA]** ¿La interpretación de "espacios: 0, capacidad: 0"
   como "turno cerrado por horario pasado" es correcta? ¿O hay otra
   razón por la que aparece 0/0 (ej. capacidad temporalmente cero
   por mantenimiento de barco, instructor de baja, condición
   meteorológica registrada en el roster)? Si hay distinción, vale
   tener un campo `motivo: "horario_pasado" | "no_operativo"` para
   que Colomba sepa qué decirle al cliente.

2. **[MEDIA]** ¿Hay rate limit del lado de Apps Script? Si Colomba
   está hablando con 20 clientes en paralelo y todos preguntan
   disponibilidad, ¿el endpoint aguanta? Apps Script tiene quotas
   diarias de ejecuciones — vale agregar telemetría desde Vercel.

3. **[BAJA]** ¿El campo `resumen` está pensado para ser usado por
   alguien en particular (humano en panel, otro sistema)? Si solo
   es interno y Colomba lo ignora, no hace falta mantenerlo
   perfecto. Si lo usa un panel humano, dejarlo como está.

4. **[BAJA]** ¿Hay un endpoint hermano para Gili Trawangan o Nusa
   Penida? Útil si en algún momento Colomba tiene que escalar a
   "esa fecha no la tenemos en GA pero sí en GT, ¿te interesa?"

---

## TODO antes de promover a producción

1. Wirear el endpoint en el server de Vercel con cache de 5 min
2. Probar todos los patrones de uso (1-5) en simulador con
   conversaciones sintéticas
3. Decidir el formato de inyección del resultado (YAML vs JSON
   compacto vs texto narrativo) — recomiendo YAML por compacidad
4. Loguear cada llamada al endpoint en Google Sheets / panel
   Vercel para análisis
5. Resolver las preguntas [ALTA] de arriba antes de habilitar la
   tool a Colomba

---

**Fin de la spec.**
