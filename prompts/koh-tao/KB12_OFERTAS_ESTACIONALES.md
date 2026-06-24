# KB-12 — OFERTAS ESTACIONALES (KOH TAO)

> **Propósito:** archivo dinámico de ofertas con vigencia limitada. La AI consulta este archivo antes de cotizar para chequear si hay alguna oferta activa que aplique al cliente.
>
> **Cómo se mantiene:** cuando una oferta se vence, NO hay que tocar el system prompt. Solo cambiar el status de la oferta en este archivo (de `ACTIVA` a `EXPIRADA`) y la AI deja de mencionarla automáticamente.
>
> **Última actualización:** 2026-05-16

---

## 🔧 CÓMO USA LA AI ESTE ARCHIVO

**Reglas operativas:**

1. **En cada nueva conversación**, la AI revisa este archivo y arma su lista de "ofertas vigentes".
2. **Antes de cotizar** cualquier programa, chequea si hay una oferta vigente que aplique al programa solicitado.
3. **Si aplica una oferta**, la AI la menciona con prioridad sobre el precio regular.
4. **Si la oferta se vence durante la conversación**, mantener el precio acordado para esa conversación (no cambiar precios a mitad de chat).
5. **Criterio de aplicación**: cada oferta indica si se evalúa según fecha de actividad o fecha de pago. Ver campo `aplica_segun` de cada oferta.

**Tensiones con otros KBs:**
Cuando hay oferta activa que contradice una regla estándar (ej. "OW30 first" del KB-01), la AI debe seguir la **estrategia específica de la oferta** definida en este archivo.

---

## 🟢 OFERTAS ACTIVAS

### OFERTA-001 — OW Conv + 3 noches dorm 4 (Mayo-Junio 2026)

| Campo | Valor |
|---|---|
| **ID interno** | `ow_conv_mayo_junio` |
| **Programa** | Open Water Conventional únicamente (NO aplica a OW30) |
| **Precio oferta** | **9.900 THB** total (curso + 3 noches dorm de 4 personas) |
| **Precio regular** | 12.000 THB (OW Conv 11.000 + 3 noches paquete 1.000) |
| **Ahorro cliente** | 2.100 THB (~17,5%) |
| **Vigencia** | 2026-05-01 → 2026-06-30 |
| **Alojamiento incluido** | Solo dorm de 4 personas (NO dorm de 12, NO privado) |
| **Status** | ✅ ACTIVA |
| **Aplica según** | ✅ Fecha de actividad (si el OW se realiza en mayo o junio, aplica oferta) |
| **Combinable con descuentos** | ✅ Sí, combinable con el **5% de cliente fiel DPM** (que aplica al Advanced en upsell — Miguel 2026-06-23 corregido de 10%) |

**Frase sugerida en ES:**
> *"Te cuento que tenemos una oferta de temporada vigente hasta fin de junio: el Open Water Conventional + 3 noches de alojamiento en habitación compartida de 4 personas te queda en 9.900 THB en total (en lugar de 12.000) 🤿 ¿Te interesa?"*

**Frase sugerida en EN:**
> *"By the way, we have a seasonal offer running until end of June: the Open Water Conventional + 3 nights in our 4-person shared dorm = 9,900 THB total (regular price 12,000) 🤿 Want me to lock it in?"*

---

## 🎯 ESTRATEGIA RECOMENDADA — LÓGICA DE PITCH DURANTE LA OFERTA

> **Para revisar y aprobar por el equipo antes de aplicar en producción.**

Durante la vigencia de OFERTA-001 (mayo-junio 2026), la regla estándar **"OW30 always first"** del KB-01 se sustituye por esta lógica condicional:

### Pitch según días disponibles del cliente

```
SI cliente declara 5+ días en la isla:
  → Pitch principal: OW Conv (oferta) + Advanced (combo)
  → Mencionar OW30 como alternativa al final, no como recomendación primaria

SI cliente declara 3-4 días en la isla:
  → Pitch principal: OW30 (regla del KB-01 se mantiene)
  → Mencionar OW Conv (oferta) si el cliente objeta precio o pide opción más económica

SI cliente declara menos de 3 días:
  → Aplica regla estándar — Try Scuba o Scuba Diver
  → La oferta NO aplica (requiere 3 noches)
```

### Matemática del combo para 5+ días (referencia)

| Escenario | Detalle | Total | Certificación final |
|---|---|---|---|
| **A — OW Conv + 3 noches (oferta sola)** | 9.900 | **9.900** | OW (18m) |
| **B — OW30 + 3 noches (regular)** | 17.900 + 1.000 paquete | **18.900** | OW30 (30m) + Deep Adventurer |
| **C — OW Conv (oferta) + Advanced + 2 noches extra** | 9.900 + 9.500 (Advanced 5% off cliente fiel) + 1.000 (2 noches × 500) | **20.400** | OW (18m) + Advanced (30m, Night/Wreck/Navigation/Buoyancy/Deep) |

> *Miguel 2026-06-23: el descuento Advanced cliente fiel se corrigió de 10% (9.000) a **5% (9.500)** — total combo C ajustado de 19.900 → 20.400.*

**Por qué el combo C le gana al B:**
- Solo 1.500 THB más que el OW30 + 3 noches
- Cliente obtiene DOS certificaciones en vez de una
- Incluye 5 inmersiones específicas extra (Night, Wreck, Buoyancy, Navigation, Deep)
- 2 días adicionales de buceo
- Misma profundidad final (30m)

**Frase sugerida para el upsell del combo (ES):**
> *"Si tenés 5-6 días en la isla, te recomiendo combinarlo con el Advanced — son solo 2 días más de buceo y obtenés la certificación a 30m + 5 inmersiones especiales (nocturno, pecio, navegación). Como hacés el OW con DPM, el Advanced te queda con 5% de descuento de cliente fiel: 9.500 THB. Total combo: 20.400 THB. Mismo nivel de certificación que el OW30, pero con muchas más inmersiones 🤿"*

**Frase sugerida para el upsell del combo (EN):**
> *"If you've got 5-6 days on the island, I'd recommend combining it with the Advanced — only 2 extra dive days and you get certified to 30m + 5 specialty dives (night, wreck, navigation). Since you're doing OW with DPM, the Advanced gets 5% off as a loyalty discount: 9,500 THB. Combo total: 20,400 THB. Same depth certification as OW30 but with way more diving 🤿"*

---

## ⚠️ COSAS PENDIENTES DE CONFIRMAR

1. **¿La oferta se repite anualmente?** Si es recurrente cada mayo-junio, simplemente extender vigencia. Si es ad-hoc 2026, en 2027 hay que volver a confirmar.
2. **¿Hay restricciones que no estén anotadas?** Ej.: ¿incluye t-shirt o eco bottle? ¿Mínimo de personas? ¿Aplica a OW Junior (menores)?
3. **¿La oferta es comunicable en redes/web?** ¿O es solo para clientes que pregunten precio?
4. **Otras ofertas estacionales** para otros meses o programas — pendiente que el equipo informe.
5. **Aprobar la estrategia condicional** "OW Conv + Advanced para 5+ días, OW30 para 3-4 días" antes de poner en producción.

---

## 🔮 OTRAS OFERTAS — TBD

Espacio reservado para futuras ofertas que el equipo informe:

- _OFERTA-002: pendiente_
- _OFERTA-003: pendiente_

---

## 📝 PLANTILLA PARA AGREGAR NUEVA OFERTA

```markdown
### OFERTA-XXX — [nombre corto]

| Campo | Valor |
|---|---|
| ID interno | snake_case_unico |
| Programa | a qué programa(s) aplica |
| Precio oferta | XXX THB |
| Precio regular | XXX THB |
| Ahorro cliente | XXX THB (XX%) |
| Vigencia | YYYY-MM-DD → YYYY-MM-DD |
| Inclusiones | qué incluye exactamente |
| Restricciones | qué NO incluye o condiciones |
| Status | ACTIVA / EXPIRADA / PROGRAMADA |
| Aplica según | fecha de actividad / fecha de reserva |
| Combinable con | qué otros descuentos se pueden sumar |

**Frase sugerida ES:** *"..."*
**Frase sugerida EN:** *"..."*

**Estrategia / tensiones con otros KBs:** [describir si rompe alguna regla estándar y cómo manejar]
```

---

## 🗓 HISTORIAL DE OFERTAS EXPIRADAS

> Mantener registro para análisis de qué funcionó/no funcionó en temporadas pasadas.

_(vacío por ahora — se irá llenando a medida que las ofertas se venzan)_
