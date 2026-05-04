# KB-06 — Integración con Apps Script de Roster — Gili Trawangan

**Sede:** Gili Trawangan
**Tipo:** documento técnico para integración (no es contenido para el AI)
**Audiencia:** desarrollador (Steve)

> Este KB es **técnico**. No describe contenido conversacional. Describe cómo el AI debe consultar el sistema de roster de Gili Trawangan para verificar disponibilidad antes de confirmar reservas.

---

## URL del Apps Script {#url-apps-script}

> **PENDIENTE:** Miguel debe confirmar la URL exacta del Apps Script desplegado para Gili Trawangan, junto con un JSON de ejemplo de respuesta. Hasta que se confirme, este KB queda incompleto.

URL tentativa (a confirmar):
```
https://script.google.com/macros/s/[GT_DEPLOYMENT_ID]/exec
```

---

## Comportamiento esperado {#comportamiento}

### Cuándo consultar el roster {#cuando-consultar}

El AI debe consultar el roster **antes de confirmar fechas o turnos** al cliente. Especificamente:

- Cliente confirma programa + fecha + número de personas
- AI llama a la tool `consultar_roster` con la fecha y turnos relevantes (según `KB-01` y `00_SYSTEM_PROMPT.md#dias-barco-programa`)
- AI recibe respuesta con disponibilidad
- AI ofrece turno disponible o alternativa

### Cuándo NO consultar el roster {#cuando-no-consultar}

- Programas que solo tienen piscina (Try Scuba día 1, Scuba Diver mañana, OW día 1, Refresh mañana) → no consultar para esos días
- Conversación de información general (precios, programas, sitios) → no consultar
- El cliente todavía no confirmó fecha → no consultar

---

## Lógica horaria sobre `hora_actual_wita` {#logica-hora-actual}

El roster devuelve `hora_actual_wita`. El AI usa este campo para decidir qué turnos puede ofrecer:

| `hora_actual_wita` | Turnos ofrecibles |
|---|---|
| Antes de 07:15 | AM y PM del día actual + cualquier día futuro |
| 07:15 a 12:30 | Solo PM del día actual + cualquier día futuro |
| 12:30 a 17:00 | Solo días futuros (mañana en adelante) |
| Después de 17:00 | Solo días futuros (mañana en adelante) |

Ver detalle completo en `00_SYSTEM_PROMPT.md#logica-horaria`.

---

## Reglas de disponibilidad {#reglas-disponibilidad}

- Turno lleno → ofrecer turno alternativo del mismo día
- Todos los turnos del día llenos → ofrecer día siguiente
- **Nunca mencionar el roster, capacidades, instructores asignados ni nada del backend al cliente**

---

## Formato esperado de respuesta {#formato-respuesta}

> **PENDIENTE:** confirmar con Miguel el formato exacto del JSON que devuelve el Apps Script.

Estructura tentativa esperada:

```json
{
  "hora_actual_wita": "2026-05-03T10:30:00+08:00",
  "fecha_consulta": "2026-05-05",
  "turnos": [
    {
      "turno": "AM",
      "horario": "07:15-11:00",
      "capacidad_total": 12,
      "ocupados": 8,
      "disponibles": 4
    },
    {
      "turno": "PM",
      "horario": "12:30-16:00",
      "capacidad_total": 12,
      "ocupados": 12,
      "disponibles": 0
    }
  ]
}
```

---

## Errores y fallback {#errores-fallback}

Si el roster no responde, devuelve error, o el JSON no se puede parsear:

- **No inventar disponibilidad.** Nunca decir "tenemos lugar" sin confirmación del roster.
- Frase de fallback al cliente:
  - EN: "Let me check that with the team and get back to you in a few minutes 🤿"
  - ES: "Déjame consultarlo con el equipo y te confirmo en unos minutos 🤿"
- Loggear el error para revisión humana desde el panel del espía.

---

## Items pendientes para Miguel {#pendientes}

Para que esta integración quede completa, Miguel debe entregar a Steve:

1. URL exacta del Apps Script deployado para Gili Trawangan
2. JSON de ejemplo de respuesta real (capturar una llamada real al Apps Script)
3. Confirmación de que el campo `hora_actual_wita` viene en formato ISO 8601 con offset
4. Capacidad por turno (¿es siempre 12? ¿varía por temporada?)
