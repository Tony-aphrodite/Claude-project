# Guía operativa del prompt — Roster, lógica horaria, programas

> Mensaje recibido de Miguel el 2026-05-06 en respuesta a la solicitud de
> Apps Script URL + sample payload. Documenta el contrato exacto que el
> servidor debe cumplir antes de abrir tráfico real con Gili Trawangan.

---

## 1. Apps Script URL — Gili Trawangan (verificada por Miguel)

```
https://script.google.com/macros/s/AKfycbzmSetuWdCOEIIbO8T7YS6ZP9kHCO9YI0ZT-QfF_rqQqZzf9RrNiZt6qhX81e5SmdEcJg/exec
```

- Method: `GET`
- Parameters: `date` (YYYY-MM-DD) y `days` (integer)
- Ejemplo: `?date=2026-05-14&days=1`
- Verificada contra 3 fechas distintas con Sheets reales — los números
  coinciden. Live data, real-time.

### Sample response

```json
{
  "hora_actual_wita": "22:13",
  "fecha_consultada": "2026-05-14",
  "disponible": true,
  "primer_dia_disponible": "2026-05-14",
  "resumen": "Disponibilidad confirmada para 2026-05-14: mañana (20 espacios), tarde (20 espacios), nocturno (20 espacios). Puedes confirmar la reserva.",
  "detalle": [
    {
      "fecha": "2026-05-14",
      "disponible": true,
      "turno_manana": { "disponible": true, "espacios": 20, "capacidad": 20 },
      "turno_tarde": { "disponible": true, "espacios": 20, "capacidad": 20 },
      "turno_nocturno": { "disponible": true, "espacios": 20, "capacidad": 20 }
    }
  ]
}
```

### Reglas críticas para el AI

- Usar SOLO `turno_manana` y `turno_tarde` para reservas reales.
- Las inmersiones nocturnas (`turno_nocturno`) **no** son regulares en
  Gili Trawangan — el system prompt v1 ya enruta esa pregunta a humano.
- ⚠️ `hora_actual_wita` viene fresco en cada request — **no cachear**.
  La lógica horaria del prompt depende de que ese campo sea preciso al
  minuto.

---

## 2. Lógica horaria — `Lógica horaria` del system prompt v1

Reglas estrictas para mismo-día (today bookings). El campo
`hora_actual_wita` del Apps Script es la fuente de verdad para
"¿el barco todavía es reservable hoy?":

| Hora WITA actual | Slots reservables hoy |
|---|---|
| Antes de 07:15 | AM y PM mismo día |
| 07:15 – 12:30 | AM ya zarpó → solo PM hoy o AM mañana |
| 12:30 – 17:00 | PM en curso → solo mañana AM o PM |
| Después de 17:00 | Todo cerrado hoy → solo mañana |

⚠️ Crítico: Sheets puede mostrar disponibilidad sobre un slot cuyo
barco ya zarpó. El AI **debe** respetar `hora_actual_wita` y nunca
ofrecer un slot pasado, aunque la celda muestre "espacios".

---

## 3. Regla crítica — días que ocupan barco por programa

No todos los días de un programa consumen capacidad de barco. Hay días
de piscina (pool) que no necesitan slot. El AI debe pedir
disponibilidad SOLO para los días de buceo reales.

### Tabla de slots requeridos (extraída del system prompt v1)

| Programa             | Día 1                          | Día 2                            | Día 3       | Slots de barco a chequear         |
|----------------------|--------------------------------|----------------------------------|-------------|-----------------------------------|
| Try Scuba            | Pool + Boat PM (mismo día)     | —                                | —           | PM día 1                          |
| Scuba Diver (1 día)  | Pool morning + Boat PM (mismo día) | —                            | —           | PM día 1                          |
| Open Water           | Pool only                      | Pool morning + Boat PM           | Boat AM     | PM día 2 + AM día 3               |
| Advanced             | Boat PM                        | Boat AM + Boat PM (until 14:30)  | —           | PM día 1 + AM día 2 + PM día 2    |
| Refresh              | Pool morning + Boat PM (mismo día) | —                            | —           | PM día 1                          |
| Refresh + Advanced   | Boat PM                        | Boat AM + Boat PM                | —           | PM día 1 + AM día 2 + PM día 2    |
| Fun Dive             | Boat AM o Boat PM (cliente elige) | —                             | —           | AM o PM (según el slot elegido)   |
| Deep Adventure + FD  | Boat AM o Boat PM (cliente elige) | —                             | —           | AM o PM (según el slot elegido)   |

### Implementación esperada del servidor

Cuando el AI llama `consultar_disponibilidad(start_date, programa)`:

1. Calcular qué días/slots específicos necesitan capacidad de barco.
2. Consultar el Apps Script para esos días.
3. Devolver respuesta clara: "disponible — slots reservados" o
   "Día X lleno en slot Y, sugerir alternativa".

Así el AI nunca confirma una fecha basándose en un día que no usa el
barco (falso positivo).

---

## 4. Validación gate antes de tráfico real

Miguel pide review programa-por-programa antes de retirar el tag-gate
`ai-test`. Es el "Día 4" del plan de 5 días: 8-10 conversaciones de
prueba, una por programa, con Miguel validando edge cases (start times,
pool vs boat sequence, qué slot consume, cuándo same-day es posible).

Solo después de eso → quitar tag-gate → tráfico real.

---

## 5. SQL para activar la URL en la tabla sedes

```sql
UPDATE sedes
SET roster_source = 'apps_script_url',
    roster_config = jsonb_build_object(
      'url', 'https://script.google.com/macros/s/AKfycbzmSetuWdCOEIIbO8T7YS6ZP9kHCO9YI0ZT-QfF_rqQqZzf9RrNiZt6qhX81e5SmdEcJg/exec'
    )
WHERE nombre = 'Gili Trawangan';
```
