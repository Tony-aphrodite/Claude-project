# Tool Spec — `send_product_card`

**Para:** Steve (DPM Command Center, Vercel)
**De:** Colomba — Gili Air
**Versión:** v1.1
**Fecha:** 2026-05-15

## Changelog v1.1

- Los 2 IDs de Advanced Adventurer (`9296zkgo1w` EN y `mvse75migl` ES) ahora están permitidos en ALLOWED_PRODUCT_IDS_GA. El prompt v1.3 instruye a Colomba a enviarlos con un puente textual sobre el nocturno (ver §catalogo-meta-advanced del prompt).
- Total IDs permitidos: 12 (era 10 en v1.0).

---

## Resumen

`send_product_card` permite a Colomba invocar el envío de una tarjeta interactiva del catálogo Meta de WhatsApp Business a través de Respond.io. Es la herramienta que reemplaza al patrón actual de "agente humano elige una tarjeta y la dispara manualmente desde el catálogo Meta".

Es la primera herramienta de salida (output tool) de Colomba — distinto a las herramientas de consulta (`consultar_disponibilidad`) que devuelven datos sin tomar acción visible.

---

## Contrato — JSON de Colomba

Colomba incluye en su JSON de respuesta:

```json
{
  "respuesta": "Here you go 🤿 — solo or with someone?",
  "send_product_card": "eb8phdq04n",
  "fuentes": ["kb:catalogo-meta-1.1", "tool:send_product_card"],
  "escalation_reason": null,
  "close_reason": null,
  "descuento": null
}
```

### Posibles valores de `send_product_card`

| Valor | Significado |
|-------|-------------|
| `null` o ausente | No invocar ninguna tarjeta este turno |
| `"<product_id>"` (string) | Enviar UNA tarjeta |
| `["<id_a>", "<id_b>"]` (array de 2) | Enviar DOS tarjetas (programas comparables) |
| `["<a>", "<b>", "<c>"]` (3+) | ⛔ El server debe rechazar: máximo 2 tarjetas por turno |

---

## Lista cerrada de `product_id` válidos para Gili Air

El server debe validar contra esta lista exacta y rechazar cualquier ID que no esté:

```
ALLOWED_PRODUCT_IDS_GA = {
  "eb8phdq04n",  // Try Scuba Diving EN
  "jvp0z08jy7",  // Bautizo de Buceo ES
  "dh8865lxuc",  // Refresh + 2 Dives EN
  "hppagembqp",  // Refresh + 2 inmersiones ES
  "v50zmrpgyy",  // Open Water 30 EN
  "v1u97orycb",  // Open Water 30 ES
  "9296zkgo1w",  // Advanced Adventurer EN  ← v1.0→v1.1: ahora permitido,
                 //                            ver §catalogo-meta-advanced
                 //                            del prompt para el puente textual
  "mvse75migl",  // Curso Avanzado ES        ← idem
  "uqgwx0sd9n",  // Deep Adventure + Fun Dive ES
  "sij8s9jaot",  // Fun Dives 2 Dives EN
  "qhra0pdpvr",  // Fun Dives 2 Inmersiones ES
  "bvsdwsstj7"   // Nitrox Specialty EN
}
```

Cuando DPM confirme los 7 IDs faltantes de los top-sellers GA, se
agregan a esta lista sin cambiar el contrato. Bumpear versión del
prompt cuando ocurra para forzar regresión.

El prompt instruye a Colomba que esos dos IDs de Advanced NO se usen, pero como defensa en profundidad, el server también los bloquea.

---

## Flujo end-to-end

```
[Cliente]
    ↓ mensaje WhatsApp
[Respond.io]
    ↓ webhook a Vercel
[Vercel: dpm-command-center]
    ↓ Colomba (Anthropic API)
[Colomba devuelve JSON]
    ↓ con "send_product_card": "eb8phdq04n"
[Vercel server]
    1. Valida product_id contra ALLOWED_PRODUCT_IDS_GA
    2. POST a Respond.io API:
       POST /v2/contact/{contact_id}/message
       {
         "channelId": "274637",  // canal WAP EN main
         "message": {
           "type": "interactive_catalog_item",
           "content": {
             "catalogId": "<DPM_META_CATALOG_ID>",
             "productRetailerId": "eb8phdq04n"
           }
         }
       }
    3. Espera respuesta de Respond
    4. Envía respuesta.text como segundo mensaje
       POST /v2/contact/{contact_id}/message
       {
         "channelId": "274637",
         "message": {
           "type": "text",
           "text": "Here you go 🤿 — solo or with someone?"
         }
       }
    5. Loguea ambos sends en Google Sheets / panel
[Cliente]
    ↓ recibe primero la tarjeta, después el texto
```

**Orden de envío:** SIEMPRE tarjeta primero, luego texto. Esto es porque la tarjeta ocupa toda la atención visual del cliente y el texto la complementa con la pregunta de calibración. Si se envía al revés, el texto queda visualmente disociado.

Si Colomba pasa 2 product_ids (array), enviarlos en orden: `[0]` primero, luego `[1]`, luego el texto. Esperar ~500ms entre cada envío para evitar que Meta los una en un solo mensaje raro.

---

## Respuesta del server al próximo turno de Colomba

En el siguiente turno, el server incluye en el contexto de Colomba:

**Caso éxito:**
```
LAST_TOOL_RESULTS:
  tool: send_product_card
  product_id: "eb8phdq04n"
  delivered_at: "2026-05-15T08:42:13Z"
  status: success
```

**Caso fallo (validation):**
```
LAST_TOOL_RESULTS:
  tool: send_product_card
  product_id: "invalid_id"
  status: failed
  error: "product_id 'invalid_id' is not in the allowed list for sede=Gili Air"
```

**Caso fallo (API Respond/Meta):**
```
LAST_TOOL_RESULTS:
  tool: send_product_card
  product_id: "eb8phdq04n"
  status: failed
  error: "respond_io_api_timeout" | "meta_catalog_unavailable" | "channel_not_supported"
```

Colomba lee estos `LAST_TOOL_RESULTS` y decide en el siguiente turno si reintentar, fallback a texto, o escalar (ver §catalogo-meta-fallback del prompt).

---

## Validaciones del server

1. **product_id en lista válida** — rechazar si no, sin llamar a Respond.
2. **Máximo 2 IDs por turno** — si Colomba manda 3+, rechazar el call entero, devolver error `"too_many_cards"`.
3. **No duplicar tarjeta** — si el mismo `product_id` ya se envió en esta conversación (mirar las últimas 50 acciones del log), loguear warning pero permitir (el cliente puede haberlo pedido de nuevo).
4. **Sede correcta** — verificar que el contacto tiene `sede=Gili Air` en sus campos Respond. Si no, rechazar con `"wrong_sede"`.

---

## Logging requerido

Para análisis post-mortem y mejora del prompt:

```
{
  "timestamp": "2026-05-15T08:42:13Z",
  "contact_id": "...",
  "conversation_id": "...",
  "action": "send_product_card",
  "product_id": "eb8phdq04n",
  "language_detected": "en",
  "preceded_by_text": false,
  "client_message_count": 4,
  "status": "success",
  "respond_response_ms": 234,
  "colomba_text_followup": "Here you go 🤿 — solo or with someone?"
}
```

Esto permite responder preguntas como: "¿Qué tarjeta tiene mejor conversion-to-deposit?", "¿Qué tarjetas se envían sin texto de seguimiento?", "¿Hay product_ids que rara vez se invocan?".

---

## Métrica de salud sugerida

En el panel de Vercel, agregar gráfico:

- **Cards-to-deposit conversion rate por product_id** — % de conversaciones donde se envió la tarjeta X y terminaron con `deposit_paid`. Esto valida que las tarjetas funcionan como herramienta de cierre.
- **Cards-rejected-by-validation por día** — debería ser 0 o muy cercano. Si Colomba intenta enviar IDs inválidos, hay un bug en el prompt.
- **Avg ms de envío Respond API** — para detectar degradación.

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Cliente ve la tarjeta de Advanced y se confunde porque le dijeron que GA tiene nocturno | El prompt instruye a Colomba a SIEMPRE acompañar el envío de Advanced con el puente textual ("you can also pick night dive and swap it for one of the 5 listed"). El server puede agregar un log warning si detecta envío de Advanced sin texto que mencione "night"/"nocturno" en el respuesta. |
| Catalog ID de DPM en Meta cambia | Hardcode el catalog_id en config del Vercel, alertar si Respond devuelve 404. |
| Cliente está en canal que no soporta interactive cards | Respond debería devolver error tipo `"channel_not_supported"`. Colomba fallback a texto vía KB-07. |
| Respond API rate limit | Configurar retry con backoff (3 intentos, 1s/3s/8s) antes de devolver error a Colomba. |
| Tarjeta llega pero texto no | Server reintenta el envío de texto 1 vez. Si falla, loguea inconsistencia y deja que el próximo turno de Colomba lo retome. |
| Colomba envía 2 tarjetas que ya estaban listadas como inválidas o duplicadas | Server valida cada elemento del array por separado y rechaza la transacción entera si alguno es inválido (no envía ninguna). |

---

## TODO antes de promover a producción

1. Confirmar el `catalog_id` de DPM en Meta Business Manager
2. Confirmar el `channelId` correcto (274637 según captura — WAP EN main)
3. Probar el endpoint POST de Respond con un mensaje real (sandbox first)
4. Validar que las tarjetas se renderizan bien en iOS, Android, y WhatsApp Web del lado del cliente
5. Decidir si el server o el prompt lleva la lista ALLOWED_PRODUCT_IDS_GA como fuente de verdad (recomiendo el server — más fácil de actualizar sin re-deployear prompt + cache invalidation)
6. Agregar los 7 IDs que faltan identificar a la lista cuando DPM confirme qué productos son
7. Versionar la lista junto al prompt — si se agrega/saca un producto, bumpea la versión del prompt para forzar regresión ≥95% antes de promover

---

**Fin de la spec.**
