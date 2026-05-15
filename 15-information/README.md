# COLOMBA — Paquete de migración Gili Air a Vercel + Anthropic

**Versión:** v1.9 (final para entrega inicial)
**Fecha:** 2026-05-15
**Sede:** Gili Air (DPM Diving)
**Stack destino:** Vercel + Anthropic (DPM Command Center) — adaptado del proyecto John (Gili Trawangan)

---

## TL;DR para Steve

Colomba es el agente IA de DPM Gili Air. Hoy vive nativo en Respond.io. Este paquete contiene todo lo necesario para migrarla al stack Vercel + Anthropic con cache, JSON estructurado, tools, y versionado.

**Lo que tenés que cablear:**

1. Cargar el system prompt + 8 KBs + KB-07 catalog en el contexto de cada llamada
2. Implementar 2 tools: `send_product_card` y `consultar_disponibilidad`
3. Conectar al endpoint Apps Script del roster (URL en el spec)
4. Replicar el flujo Respond.io → Vercel → Anthropic → Respond.io que ya usás para John
5. Adaptar workflow post-pago "DPM GT - Onboarding Piloto" para Gili Air (cambios mínimos de sede)

**Lo que está pendiente de DPM:**

- 7 IDs de tarjetas Meta sin identificar (de los 19 totales del catálogo, 12 ya mapeados a productos GA)
- Actualizar tarjeta Meta Advanced para incluir nocturno como opción de swap oficial
- Corregir Branch Code Scuba Diver GA EN (actualmente dice "GTEN", debería ser "GAEN")
- Agregar precio embebido a tarjetas Refresh ES y Nitrox EN
- Cuenta USD KT cableada en el server (silenciosa)

---

## Estructura del paquete

```
package_steve/
├── README.md (este archivo)
├── prompt/
│   └── COLOMBA_SYSTEM_PROMPT.md         (v1.9 — ~75KB, ~1600 líneas)
├── kbs/
│   ├── KB-01_programas_precios.md       (programas, precios, horarios, equivalencias)
│   ├── KB-02_pagos_cuentas.md           (cuentas bancarias EUR/GBP/AUD/USD/IDR)
│   ├── KB-03_calificacion_ventas.md     (preguntas qualifier, árbol decisión, upsells)
│   ├── KB-04_sitios_buceo.md            (Shark Point, Bounty, Han's Reef, etc.)
│   ├── KB-05_politicas_reglas.md        (edad, refresh, médico, cancelación)
│   ├── KB-06_ubicacion_transporte.md    (mapa, ferries, alojamiento, restaurantes)
│   ├── KB-07_catalogo_meta.md           (v1.1 — 19 tarjetas catálogo Meta + reglas envío)
│   └── KB-08_casos_especiales.md        (edge cases conversacionales)
├── specs/
│   ├── SPEC_send_product_card.md        (v1.1 — tool para enviar cards Meta)
│   └── SPEC_consultar_disponibilidad.md (v1.3 — tool para chequear roster)
├── fewshots/
│   └── FEW_SHOTS_50_conversations.md    (50 conversaciones reales anonimizadas para testing)
└── docs/
    └── IMPLEMENTATION_NOTES.md           (notas de implementación, pending, gotchas)
```

---

## Cómo construir el contexto de cada llamada

### Cache estático (cargar una vez, reutilizar)

Bloque cacheable (~150-180K tokens, cache hit ~50%):

1. `prompt/COLOMBA_SYSTEM_PROMPT.md`
2. Todos los archivos de `kbs/` concatenados en orden KB-01 → KB-08
3. Ambos specs de `specs/`

### Dinámico por conversación

- Historial de mensajes del cliente
- Bloque de datos dinámicos del contacto Respond.io (nombre, teléfono, idioma detectado, etapa lifecycle, tags activos, prefijo telefónico para sugerir moneda)
- Resultados de tool calls previas (LAST_TOOL_RESULTS) si las hubo

### Configuración recomendada Anthropic API

```javascript
{
  model: "claude-sonnet-4-20250514",
  max_tokens: 1500,
  temperature: 0.3,
  system: [...cacheable_blocks_with_cache_control],
  messages: [...conversation_history],
  tools: [send_product_card_definition, consultar_disponibilidad_definition]
}
```

---

## Diferencias entre Colomba (GA) y John (GT)

Steve, esto es lo que cambia respecto al setup de John:

| Aspecto | John (GT) | Colomba (GA) |
|---------|-----------|--------------|
| Sede | Gili Trawangan | Gili Air |
| Centro SSI # | (el de GT) | 741453 |
| Teléfono oficina | (el de GT) | +6282266153697 |
| Buceo nocturno | No regular | **SÍ — diferenciador clave** |
| Programa más vendido | (similar) | Try Scuba + OW30 |
| Snippets Respond.io | GTEN* / GTES* | GAEN* / GAES* |
| Cuenta IDR | (la de GT) | Mandiri 161001392624-6 |
| Distancia al puerto | (variable) | 300m (cliente camina) |
| Idiomas oficiales | (verificar con Steve) | EN, ES |
| Catálogo Meta | (el de GT) | 12 cards identificados, 7 pending |

**Importante:** El catálogo Meta es por sede. Los IDs en KB-07 son específicos de GA — no se pueden reusar los de GT.

---

## Las 2 tools — resumen rápido

### `send_product_card`

Envía una tarjeta de WhatsApp Business al cliente (catálogo Meta). Colomba pasa solo el `card_id`, el server hace el send vía API de Respond.io.

- **Spec completa:** `specs/SPEC_send_product_card.md`
- **Catálogo de IDs:** `kbs/KB-07_catalogo_meta.md` (12 confirmados, 7 pending)
- **Allowlist de seguridad:** server debe validar que `card_id` está en `ALLOWED_PRODUCT_IDS_GA`

### `consultar_disponibilidad`

Chequea el roster de Gili Air (endpoint Apps Script existente) para confirmar espacios en barco mañana, tarde o nocturno shore.

- **Spec completa:** `specs/SPEC_consultar_disponibilidad.md`
- **Endpoint:** `https://script.google.com/macros/s/AKfycby5DCwi-X_Gcx-VX7bYKeLQ5I7uotSADINxIO4BAkU/exec`
- **Params:** `fecha` (YYYY-MM-DD) + `dias` (default 7)
- **Modelo crítico:** el roster reporta SOLO barco (mañana/tarde) + nocturno shore. **Piscina/teoría siempre tienen lugar, no se consulta.** Colomba sabe qué días de cada programa requieren barco (ver `prompt §mapeo-programa-roster`).

### Tool no implementado (pending)

`solicitar_deposito` — actualmente Colomba escribe el bloque bancario en texto directamente desde KB-02. Si querés migrarlo a tool más adelante, ver `docs/IMPLEMENTATION_NOTES.md`. Decisión actual: mantener "opción B" (texto), revisar cuando se vea cómo lo maneja John.

---

## Workflow post-pago (Respond.io)

El workflow "DPM GT - Onboarding Piloto" que ya tenés funcionando se adapta para GA con estos cambios:

1. Cambiar trigger condition para tag `deposit_paid_GA` (o similar, si filtrás por sede)
2. Cambiar referencias a snippets: `GTEN*` → `GAEN*`, `GTES*` → `GAES*`
3. Cambiar training center number en el mensaje SSI App: del de GT al `741453`
4. Cambiar WA oficina si aparece: al `+6282266153697`
5. Cambiar nombre de sitios de buceo si aparecen: Shark Point, Bounty, Turtle Heaven, Han's Reef

La secuencia de mensajes se mantiene igual: PaperWork → Sizes → SSI App → Medical → checkin info.

---

## Testing — Few-shots

`fewshots/FEW_SHOTS_50_conversations.md` contiene 50 conversaciones reales (anonimizadas) extraídas del corpus de Respond.io. Sirven para:

1. **Regresión:** correr Colomba sobre estas conversaciones y comparar output con respuestas reales
2. **Eval de calidad:** medir cobertura de patrones (programas, descuentos, edge cases, idiomas)
3. **Smoke test:** validación rápida que los cambios no rompen comportamiento esperado

Target sugerido: ≥95% de las conversaciones deben producir output funcionalmente equivalente al humano.

---

## Próximos pasos sugeridos

1. **Wire básico (Steve):** cargar prompt + KBs en una llamada de prueba sin tools. Validar que responde en EN/ES correctamente.
2. **Implementar `send_product_card`** primero (más simple) y testear con 1-2 IDs reales.
3. **Implementar `consultar_disponibilidad`** y validar contra el endpoint en vivo.
4. **Wire workflow Respond.io** (adaptar el de John).
5. **Correr los 50 few-shots** y medir cobertura.
6. **Producción piloto:** activar Colomba para un % bajo del tráfico GA (10-20%) y monitorear panel.
7. **Identificar los 7 IDs Meta pending** (depende de DPM, no de Steve).

---

## Contactos / Source of truth

- **Equipo DPM (decisiones de producto):** Jorge, Gerva, equipo Gili Air
- **Sistema Respond.io existente:** ya en producción para John (GT), Colomba (GA actual nativa), y otras sedes
- **Tool de roster:** Apps Script ya en producción, usado por el equipo GA manualmente
- **Tarjetas Meta:** ya creadas en WhatsApp Business Catalog de DPM, asignadas a sede GA

---

## Estado del paquete

✅ Prompt v1.9 (75KB, 1600 líneas) — completo
✅ 8 KBs estructurados con anchors — completo
✅ 2 tool specs detalladas — completo
✅ 50 few-shots anonimizados — completo
⏳ Identificación de 7 IDs Meta restantes — pending DPM
⏳ Workflow GA en Respond.io — pending adaptación de GT
⏳ Cuenta USD KT en server — pending Steve
