# Knowledge Base 07 — Ofertas Estacionales
# DPM Diving Koh Phi Phi

> **Propósito:** archivo dinámico de ofertas con vigencia limitada. La AI consulta este archivo antes de cotizar para chequear si hay alguna oferta activa que aplique al cliente.
>
> **Cómo se mantiene:** cuando una oferta se vence, NO hay que tocar el system prompt. Solo cambiar el status de la oferta acá (de `ACTIVA` a `EXPIRADA`) y la AI deja de mencionarla automáticamente.
>
> **Última actualización:** 2026-05-17 (template inicial — pendiente llenar con ofertas reales de Phi Phi)

---

## 🔧 CÓMO USA LA AI ESTE ARCHIVO

**Reglas operativas:**

1. **En cada nueva conversación**, la AI revisa este archivo y arma su lista de "ofertas vigentes".
2. **Antes de cotizar** cualquier programa, chequea si hay una oferta vigente que aplique al programa solicitado.
3. **Si aplica una oferta**, la AI la menciona con prioridad sobre el precio regular.
4. **Si la oferta se vence durante la conversación**, mantener el precio acordado para esa conversación (no cambiar precios a mitad de chat).
5. **Criterio de aplicación**: cada oferta indica si se evalúa según fecha de actividad o fecha de pago. Ver campo `aplica_segun` de cada oferta.

**Tensiones con otros KBs:**
Cuando hay oferta activa que contradice una regla estándar (ej. precio base del `kb_01_programas_y_precios.md`), la AI debe seguir la **estrategia específica de la oferta** definida acá.

---

## 🟢 OFERTAS ACTIVAS

_(vacío por ahora — pendiente que el equipo de Phi Phi informe las ofertas vigentes)_

**Candidatos a documentar** (mencionados en distintos archivos del proyecto, pendientes de confirmar con la oficina):

- **Discount Try Scuba grupos 4+** → 3,400 THB p/p (vs 3,600 regular) → ya está en `kb_01_programas_y_precios.md` como regla permanente, no oferta estacional
- **DPM repeat 5%** → cliente que ya buceó con DPM en otra sede recibe 5% off → mencionado en handoff antiguo, **pendiente confirmar si sigue vigente y si es 5% o 10%**
- **OW30 + 50% off Fun Dive en otras sedes** → ya está en `kb_01_programas_y_precios.md` como inclusión permanente del OW30
- **Otras ofertas de temporada** → preguntar a oficina

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

**Frase sugerida ES:** *"Te cuento que tenemos una oferta de temporada vigente hasta [fecha]: [descripción + precio] 🤿 ¿Te interesa?"*

**Frase sugerida EN:** *"By the way, we have a seasonal offer running until [date]: [description + price] 🤿 Want me to lock it in?"*

**Estrategia / tensiones con otros KBs:** [describir si rompe alguna regla estándar y cómo manejar]
```

---

## 🗓 HISTORIAL DE OFERTAS EXPIRADAS

> Mantener registro para análisis de qué funcionó en temporadas pasadas.

_(vacío por ahora — se irá llenando a medida que las ofertas se venzan)_

---

## ⚠️ COSAS PENDIENTES DE CONFIRMAR CON LA OFICINA DE PHI PHI

1. ¿Existe alguna oferta de temporada actualmente activa para Phi Phi (mayo-junio 2026)?
2. ¿Cuál es el porcentaje exacto del descuento "DPM repeat" para clientes que ya buceron con DPM en otra sede? ¿5% o 10%? ¿Aplica a qué programas?
3. ¿Hay ofertas recurrentes que se reactivan cada año en ciertos meses (low season, monsoon, etc.)?
4. ¿Existen paquetes especiales tipo "OW + Advanced combo" con descuento en Phi Phi?
5. ¿Existe algún equivalente al "OW + accommodation package" de Koh Tao en Phi Phi (que DPM Phi Phi no tiene alojamiento propio)?
6. ¿Existe el equivalente al pitch defensivo de "70 schools" para Koh Tao en Phi Phi? (Ej. "Phi Phi National Park", "la única escuela que ofrece X")
