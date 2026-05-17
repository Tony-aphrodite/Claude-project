# Notas de implementación — Colomba GA

Notas técnicas adicionales que no entraron al README, agrupadas por tema. Para resolver dudas o gotchas durante el wire-up.

---

## 1. Formato de salida JSON esperado

Colomba devuelve un JSON en cada turno con esta forma:

```json
{
  "respuesta": "Texto que se envía al cliente (WhatsApp).",
  "send_product_card": "<card_id|null|omit>",
  "consultar_disponibilidad": { "fecha": "YYYY-MM-DD", "dias": 7 } | null | omit,
  "fuentes": ["kb:KB-XX-anchor", "tool:...", "snippet:GAEN..."],
  "escalation_reason": "<código|null|omit>",
  "close_reason": "<código|null|omit>",
  "descuento": "<Sin descuento | 5% | 10% | omit>",
  "notes": "<texto libre para el contacto de Respond.io | omit>"
}
```

Campos que el server debe procesar:

- `respuesta` → enviar como mensaje a Respond.io
- `send_product_card` → si está presente, hacer call a Respond.io API para enviar la card
- `consultar_disponibilidad` → si está presente, llamar al endpoint Apps Script y devolver resultado a Colomba en el próximo turno como `LAST_TOOL_RESULTS`
- `fuentes` → no se envía al cliente, queda en logs para debugging
- `escalation_reason` → si está presente, aplicar tag `ai_escalation` + el código específico, y disparar handoff round-robin (excepto `instructor_request` que es async)
- `close_reason` → si está presente, aplicar tag `venta_incompleta` y mover a lifecycle `LOST LEAD`
- `descuento` → guardar en campo de contacto `descuento_aplicado`
- `notes` → agregar a las notas del contacto en Respond.io (útil sobre todo para `instructor_request`)

---

## 2. Códigos de escalation_reason válidos (9)

1. `medical` — condición médica
2. `discount_over_10` — pide > 10% (o > 5% en grupos 1-3)
3. `instructor_request` — async, requiere recolección nombre+email+WA primero
4. `human_requested` — cliente pide hablar con humano
5. `language_not_supported` — idioma ≠ EN/ES, enrutar a cualquier agente online
6. `payment_issue` — problema con depósito o pago
7. `complaint` — queja o conflicto
8. `prohibited_topic` — uno de los 15 temas prohibidos
9. `out_of_scope` — fuera del alcance del agente (otra sede DPM, programa no GA, etc.)

---

## 3. Códigos de close_reason válidos (10)

Matchean la taxonomía oficial de DPM Closing Notes:

1. `Just_Asking_for_Info`
2. `No_Specific_Date`
3. `Too_Expensive`
4. `Bad_Weather`
5. `Health_Issue`
6. `Booked_Elsewhere`
7. `Changed_Plans`
8. `No_Response_After_FollowUps`
9. `Wrong_Contact`
10. `Spam`

---

## 4. Cache strategy recomendada

```javascript
system: [
  {
    type: "text",
    text: SYSTEM_PROMPT,
    cache_control: { type: "ephemeral" }
  },
  {
    type: "text",
    text: KB_01 + KB_02 + KB_03 + KB_04 + KB_05 + KB_06 + KB_07 + KB_08,
    cache_control: { type: "ephemeral" }
  },
  {
    type: "text",
    text: TOOL_SPECS_INLINE_OR_REFERENCED,
    cache_control: { type: "ephemeral" }
  }
]
```

El prompt + KBs totales son ~180K tokens. Con 50% cache hit rate y precio de cache hits ~10x más barato que reads frescos, el coste promedio por turno baja significativamente.

---

## 5. Bloque dinámico por conversación

Recomendado prepend al primer mensaje user (o como system message dinámico):

```
DATOS DINÁMICOS DE LA CONVERSACIÓN
- Nombre del contacto: {{contact.first_name}} {{contact.last_name}}
- Idioma detectado: {{contact.language}}
- Teléfono: {{contact.phone}}
- Prefijo telefónico: {{contact.phone_prefix}}
- MONEDA SUGERIDA POR PREFIJO: {{currency_hint}} (solo hint, confirmar con cliente)
- Etapa lifecycle Respond.io: {{contact.lifecycle_stage}}
- Tags activos: {{contact.tags | join(", ")}}
- Fecha/hora actual WITA (UTC+8): {{datetime_wita}}
- Días desde primer contacto: {{days_since_first_contact}}
- Cantidad de mensajes intercambiados: {{message_count}}

ÚLTIMO RESULTADO DE TOOL (si corresponde):
{{last_tool_result_json}}
```

---

## 6. Validación de seguridad de `send_product_card`

El server DEBE validar:

```javascript
const ALLOWED_PRODUCT_IDS_GA = [
  // EN cards
  "eb8phdq04n",  // Try Scuba EN
  "dh8865lxuc",  // Refresh + 2 Dives EN
  "v50zmrpgyy",  // Open Water 30 EN
  "9296zkgo1w",  // Advanced EN
  "sij8s9jaot",  // Fun Dives EN
  "bvsdwsstj7",  // Nitrox EN
  // ES cards
  "jvp0z08jy7",  // Try Scuba ES
  "hppagembqp",  // Refresh + 2 Dives ES
  "v1u97orycb",  // Open Water 30 ES
  "mvse75migl",  // Advanced ES
  "qhra0pdpvr",  // Fun Dives ES
  "uqgwx0sd9n",  // Deep Adventure + FD ES
];

if (!ALLOWED_PRODUCT_IDS_GA.includes(card_id)) {
  // Reject — log incident, don't send
  return { error: "card_id not in allowlist" };
}
```

Esto previene que Colomba alucine IDs inválidos. Los 7 IDs pending se agregarán a la lista cuando se identifiquen.

---

## 7. Manejo del modo SPLIT (regla de las 10 AM)

Cuando Colomba recibe la respuesta de `consultar_disponibilidad` con `hora_actual_wita`, debe aplicar la lógica del prompt §regla-10am para decidir si ofrece modo STANDARD (1 día) o SPLIT (2 días) para Try Scuba, Scuba Diver o Refresh.

El server NO necesita implementar esta lógica — vive en el prompt. Solo necesita devolver `hora_actual_wita` y el detalle de turnos como viene del endpoint.

Sample respuesta del endpoint:
```json
{
  "fecha_consultada": "2026-05-15",
  "hora_actual_wita": "11:00",
  "detalle": [
    {
      "fecha": "2026-05-15",
      "turno_manana": { "espacios": 0, "disponible": false },
      "turno_tarde": { "espacios": 4, "disponible": true },
      "turno_nocturno": { "espacios": 8, "disponible": true }
    },
    ...
  ]
}
```

---

## 8. Flujo asíncrono para `instructor_request`

Diferente al resto de escalation_reasons. NO hacer handoff inmediato a humano. Pasos:

1. Colomba detecta intención → empieza recolección
2. Pide al cliente: nombre completo + email + WhatsApp
3. Cliente provee los 3 datos (puede ser 2-3 turnos)
4. Colomba escala con `escalation_reason: instructor_request` y `notes: "Solicitud profesional. Email: X. WA: Y. Motivo: [resumen]"`
5. Server aplica tag específico (ej: `ai_escalation_async_instructor`) en lugar del round-robin estándar
6. La parte profesional ve la cola de pendientes y contacta async (no necesariamente en este chat)
7. Mensaje de cierre de Colomba: "Listo, el responsable se va a poner en contacto por email o WhatsApp en las próximas horas 🤿"

---

## 9. Routing para `language_not_supported`

Cuando Colomba escala con este código, el server debe:

1. NO hacer round-robin solo entre agentes GA
2. Aplicar round-robin entre TODOS los agentes online en Respond.io de cualquier sede
3. Si no hay agentes online en ese momento, encolar (no marcar como "perdida") y notificar cuando un agente se conecte
4. El idioma del contacto queda registrado para que el agente sepa qué esperar

Colomba ya devuelve una línea de cortesía en el idioma del cliente antes de cerrar turno, así que el cliente sabe que está siendo atendido.

---

## 10. Validación de `consultar_disponibilidad`

El server debe validar antes de llamar al endpoint:

- `fecha` formato YYYY-MM-DD válido
- `fecha` no más vieja que hoy (no se chequea pasado)
- `dias` entero entre 1 y 60 (el roster tiene año completo cargado pero más de 60 días es probablemente bug)

Si el endpoint falla o timeout > 5s, devolver a Colomba un objeto error:
```json
{ "error": "roster_unavailable", "message": "..." }
```

Colomba entonces puede pedir al cliente "déjame confirmar con la oficina y te aviso en breve" + escalar con `out_of_scope`.

---

## 11. Lifecycle Respond.io — 6 etapas

| Etapa | Trigger | Cómo se setea |
|-------|---------|---------------|
| New Lead | Primer mensaje del contacto | automático |
| In process | Colomba compartió info de programa o calificó | server al aplicar tag `In process` |
| Payment | Bloque bancario enviado | server cuando Colomba menciona depósito en `respuesta` |
| On hold | Cliente respondió pero no avanza | server o humano (consulta médica, decisión pareja, etc.) |
| Customer | Comprobante validado | server al aplicar tag `deposit_paid` (OCR auto o manual) |
| LOST LEAD | Sin respuesta tras follow-ups | server al aplicar tag `venta_incompleta` |

---

## 12. Cuenta USD KT silenciosa

KB-02 menciona que se usa cuenta USD de Koh Tao. Steve necesita:

1. Pedir a Marina (Koh Tao) los datos completos de la cuenta USD KT
2. Cablearlos en el server como cuenta de respaldo para clientes que piden USD
3. Cuando Colomba menciona USD, server inyecta los datos de KT silenciosamente (sin que el cliente vea "Koh Tao" en ningún lado)
4. Si el cliente pregunta por qué la cuenta dice otra cosa, Colomba responde: "es nuestra cuenta corporativa para USD, todo va al mismo grupo"

---

## 13. Limitaciones conocidas

- **Tarjeta Meta Advanced no incluye nocturno** — Colomba aplica el "puente nocturno" textual en cada mensaje hasta que DPM actualice la card oficial
- **7 IDs Meta sin identificar** — Colomba puede mencionar productos sin enviar card hasta que se identifiquen
- **Branch Code "GTEN" en Scuba Diver GA EN** — error en el catálogo Meta, corregir cuando se pueda editar
- **Sin tool `solicitar_deposito`** — Colomba escribe bloque bancario en texto desde KB-02. Migrar a tool más adelante si necesario

---

## 14. Métricas a monitorear post-launch

Sugeridas para el panel:

- **Cache hit rate** (target: >40%)
- **Tool call rate** (cuántas conversaciones invocan tools por día)
- **Escalation rate** (por código, target <15% del total)
- **Close reason distribution** (taxonomía 10 categorías)
- **Mean conversation length** (mensajes hasta cierre o conversión)
- **Conversion rate** (% conversaciones que llegan a tag `deposit_paid`)
- **Hallucination rate** (% de respuestas con `card_id` rechazado por allowlist o JSON inválido)
- **Time to first response** (target <30s)
