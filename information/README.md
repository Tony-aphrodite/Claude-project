# DPM Diving — Knowledge Base de Gili Trawangan — Paquete v1

> **Note for Steve (in English):** The KB content is written in Spanish because the agent's reasoning works equally well in any language, and the source material is in Spanish. **All customer-facing phrases inside the KB are bilingual (EN/ES blocks)** — the agent picks the right language based on the client's last message. The structure, IDs, cross-references, and technical rules are language-agnostic. If you need any specific section translated to English, let me know.

---

**Sede:** Gili Trawangan (única sede del piloto Pieza 1)
**Idioma base:** español, con frases para cliente en EN/ES bilingüe
**Sistema de citaciones:** headings con IDs estables tipo `## Heading {#ejemplo-id}` — los IDs los consume el sistema de auditoría del AI

---

## Contenido del paquete

| Archivo | Contenido | Notas |
|---|---|---|
| `00_SYSTEM_PROMPT.md` | System prompt v1 final del agente "John" | Prompt principal — referencia los KBs |
| `KB-01_programas_precios.md` | Programas, precios, horarios, upgrades, extras | 18 programas + extras |
| `KB-02_dive_sites.md` | Sitios de buceo, ganchos por turno | Shark Point AM + Turtle Heaven PM |
| `KB-03_payments.md` | Política de depósitos, cuentas bancarias, bloques listos para copiar | EUR / GBP / AUD / USD / IDR |
| `KB-04_sales_patterns.md` | Ganchos, frases de cierre, manejo de objeciones, errores fatales | |
| `KB-05_operational_rules.md` | Reglas operativas: ferries, equipamiento, grupos, menores, upselling | |
| `KB-06_roster_integration.md` | Documentación técnica de integración con Apps Script de roster | Tiene items pendientes que Miguel debe completar |

---

## Sistema de IDs estables

Cada heading principal y subsección tiene un ID en formato `{#id-estable}`. Estos IDs son **inmutables** y forman la base del sistema de citaciones del AI.

Ejemplos de citaciones que el AI emitiría:

- Cliente pregunta por OW → AI cita `kb-01#ow-course`
- AI envía bloque EUR → cita `kb-03#bloque-eur`
- AI usa gancho de Shark Point → cita `kb-04#gancho-shark-point`

**Regla:** los IDs no se renombran. Si hay que cambiar contenido, se actualiza el contenido pero el ID se mantiene. Si una sección se elimina o se reemplaza, el ID se deprecia con un comentario, no se reusa.

---

## Cross-references entre archivos

Los KBs se referencian entre sí con la sintaxis `KB-XX_nombre.md#id`. Ejemplo:

- `00_SYSTEM_PROMPT.md` apunta a `KB-04_sales_patterns.md` para frases de cierre
- `KB-01_programas_precios.md#refresh-course` apunta a `KB-04_sales_patterns.md#gancho-tortugas`
- `KB-03_payments.md#alerta-iban` referencia las sedes Nusa Penida y Gili Air (que no están en este paquete porque son fuera de scope del piloto)

---

## Flujo del AI — visión general

1. **Primer mensaje** del cliente → `00_SYSTEM_PROMPT.md#primer-mensaje`
2. **Calificación** (cantidad personas, fecha, certificación) → `00_SYSTEM_PROMPT.md#calificacion`
3. **Detección de moneda** por prefijo telefónico → `KB-03_payments.md#deteccion-moneda`
4. **Información del programa** (gancho + precio) → `KB-04_sales_patterns.md#ganchos` + `KB-01_programas_precios.md`
5. **Verificación de roster** (solo si hay fecha confirmada) → `KB-06_roster_integration.md`
6. **Cierre + depósito** (bloque bancario aislado) → `KB-03_payments.md#bloques-pago`
7. **Confirmación de comprobante** → `00_SYSTEM_PROMPT.md#proceso-reserva`
8. **Handoff humano** → al equipo de la sede

---

## Reglas críticas transversales

- Nunca confirmar que es IA
- Nunca mencionar Respond.io, Claude, OpenAI ni ningún software
- Máximo 3 ideas por mensaje
- Máximo 1 emoji por mensaje
- Sin asteriscos ni markdown en mensajes al cliente
- Datos bancarios SIEMPRE en mensaje separado
- Terminar SIEMPRE con pregunta concreta de cierre
- Nunca pedir tallas o datos personales antes de recibir el comprobante de depósito

---

## Items pendientes — Miguel debe completar

Estos items NO están en el paquete v1 y son necesarios para que el sistema funcione end-to-end:

1. **URL exacta del Apps Script de roster Gili Trawangan + JSON de ejemplo de respuesta real** → ver `KB-06_roster_integration.md#pendientes`
2. **Confirmación del tag exacto en Respond.io** para identificar a un contacto como Gili Trawangan (¿`sede:gili_trawangan`? ¿quién aplica el tag y cuándo?)
3. **5–10 conversaciones reales ejemplares** seleccionadas por Miguel / Patrick / Giovanni, para usar como few-shots inline en el prompt
4. **Templates de WhatsApp de seguimiento aprobados por Meta** (en proceso con Carlos / SEO Wolf):
   - `dpm_followup_48h_es`, `dpm_followup_48h_en`
   - `dpm_followup_7d_es`, `dpm_followup_7d_en`
   - `dpm_followup_30d_es`, `dpm_followup_30d_en`
5. **Accesos guest a:** Anthropic Console (Tier 2 listo), Supabase, Respond.io, Vercel, Railway

---

## Decisiones operativas confirmadas

- **(i) Stripe en Koh Tao:** NO activar en el día uno. Esperar al ramp-up post-piloto. (Koh Tao no es la sede del piloto.)
- **(ii) Alerta de `deposit_pending`:** 24h
- **(iii) Alerta de `handed_off` sin actividad humana:** 30 minutos (más estricto que las 2h sugeridas, porque el equipo opera 24/7 vía Respond.io)

---

## Versión y cambios

- **v1 (mayo 2026):** primera versión consolidada y limpia para entrega a Steve. Eliminadas inconsistencias previas (cuenta USD aclarada como cuenta de Koh Tao prestada, monto IDR confirmado en 700,000, archivos de Gili Air descartados, manual de partnership descartado).
