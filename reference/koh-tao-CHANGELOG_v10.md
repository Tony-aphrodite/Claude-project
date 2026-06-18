# 📦 PAQUETE FINAL — EMMA KOH TAO
## Versión 1.0 — 16 mayo 2026

---

## 🎯 PARA STEVE

Subir los siguientes archivos al sistema de Emma de Koh Tao en el panel `claude-project-panel.vercel.app`:

### Prompt
- `EMMA_PROMPT_NEW.txt` → System Prompt (versión activa)

### Knowledge Base (KBs)
| Archivo | Estado | Versión |
|---|---|---|
| `KB-01_PROGRAMS_AND_PRICES.txt` | ✅ Actualizado | 5%→10% Advanced si DPM-fiel |
| `KB-02_SCHEDULES_AND_LOGISTICS.txt` | ✓ Sin cambios |  |
| `KB-03_ACCOMMODATION.txt` | ✓ Sin cambios |  |
| `KB-04_DIVE_SITES.txt` | ✓ Sin cambios |  |
| `KB-05_SALES_AND_CUSTOMER_SERVICE.txt` | ✅ Actualizado | Upsells obligatorios + 10% |
| `KB-06_PAYMENTS_AND_DEPOSITS.txt` | ✅ Actualizado | Screenshot OK + fallback oficina |
| `KB-07_FAQS_AND_SPECIAL_CASES.txt` | ✅ Actualizado | Cert acompaña sin-cert en Try Scuba |
| `KB-08_QUICK_REPLIES.txt` | ✓ Sin cambios |  |
| `KB-09_PROGRAM_DESCRIPTIONS.txt` | ✅ Actualizado | 5%→10% Advanced |
| `KB-10_INTELLIGENT_SALES_MANUAL.txt` | ✅ Actualizado | Upsell post-OW + grupo mixto ampliado |
| `KB-11_PATRONES_VENTAS_REALES.md` | ✅ Actualizado | Nueva sección 12 grupo mixto (12 conv analizadas) |
| `KB-12_OFERTAS_ESTACIONALES.md` | ✓ Activo | OFERTA-001 mayo-junio 2026 |

---

## 🔄 CHANGELOG — Qué cambió en esta versión

### 1. Upsells obligatorios cuando cliente tiene OW
**Aplicado a:** KB-05, KB-10, EMMA_PROMPT_NEW

Antes: Emma cotizaba Fun Dives cuando el cliente pedía fun dives.
Ahora: Emma SIEMPRE ofrece alternativa de upsell además de los fun dives:
- Si cliente tiene 2+ días → Advanced (10.000 THB, 2 días)
- Si solo 1 día → Deep Adventure + Fun Dive (3.900 THB, tarjeta lifetime 30m)

### 2. Refresh + Deep Adventure como combo estándar
**Aplicado a:** KB-05, KB-10, EMMA_PROMPT_NEW, KB-11 sección 12.6

Antes: cliente con OW + última inmersión >6 meses → Refresh (2.600 THB)
Ahora: ofrecer Refresh + Deep Adventure como combo (~6.500 THB). Solo si objeta precio, fallback a Refresh solo. Le da la tarjeta SSI Deep Adventurer de por vida.

### 3. Grupo mixto: opción "cert acompaña sin-cert con mismo guía"
**Aplicado a:** KB-07, KB-10 sección 8.2, KB-11 sección 12.4 Opción B, EMMA_PROMPT_NEW

Antes: Emma decía solo "mismo barco diferentes grupos".
Ahora: si la pareja/amigo quiere bucear DE VERDAD juntos, ofrecer que el cert se sume al Try Scuba del sin-cert con un solo guía, limitándose a 12m de profundidad. Cert paga tarifa Fun Dive (2.100 THB), no Try Scuba completo.

### 4. Comprobante de pago: screenshot aceptable
**Aplicado a:** KB-06, KB-10 regla 4, EMMA_PROMPT_NEW

Antes: PDF obligatorio, screenshot rechazado.
Ahora: PDF preferido, pero screenshot aceptable si visualmente se confirman 4 datos (monto, fecha, beneficiario, estado completado). La oficina rechequea en su lado. Si depósito no llega en 24h, oficina contacta al cliente.

### 5. Cliente no puede pagar depósito en advance: fallback oficina
**Aplicado a:** KB-06, EMMA_PROMPT_NEW

Antes: regla rígida "no boat space without deposit, escalar".
Ahora: ofrecer pasar por oficina sin garantía de espacio + dar teléfono oficina +66636575799 para coordinación directa.

### 6. Patrón grupo mixto completo (KB-11 sección 12)
**Nueva sección** basada en análisis de 12 conversaciones top del corpus (133 detectadas, 33 cerradas):
- 12.1 Frecuencia y peso
- 12.2 Apertura — 3 preguntas críticas
- 12.3 Mismo barco ≠ mismo grupo (frases textuales reales)
- 12.4 Manejo del "queremos bucear juntos" (3 opciones)
- 12.5 Refresh — frase ganadora
- 12.6 ⭐ Upsell en cadena Deep Adventure (patrón nuevo)
- 12.7 Riesgos del patrón nuevo
- 12.8 Diccionario de frases EN/ES
- 12.9 Caso de referencia conv 354513688 (219 msgs)

### 7. Today/tomorrow: Emma maneja sin escalar (ya estaba pero confirmado)
**Reafirmado en:** EMMA_PROMPT_NEW

Esto era workaround de respond.io. En la AI propia Emma consulta roster con corte por hora y decide. Solo escala si todo lleno + cliente urgente.

### 8. OFERTA-001 activa
**KB-12**

OW Conv + 3 noches dorm 4 personas = 9.900 THB
Vigencia: 1 mayo - 30 junio 2026 (según fecha de actividad, no fecha de booking)
Sale más barato CON alojamiento que el curso solo (11.000). Aplicar de oficio si el cliente cae en el rango de fecha.

---

## 🧪 TEST DE REGRESIÓN

Subir como benchmark `EMMA_TEST_50_PREGUNTAS.md` (50 preguntas + respuestas esperadas).

Recomendación: cada vez que se toque el prompt o algún KB, correr las 50 preguntas en el simulador y verificar que:
- ✓ Las 18 reglas activas marcadas en la tabla final se siguen cumpliendo
- ✓ Las 10 cosas que Emma NUNCA hace siguen sin aparecer
- ✓ Promedio de tasa de cierre estimada no baja

---

## 📊 IMPACTO ESPERADO

Con las nuevas reglas, las simulaciones sugieren:

| Métrica | Antes | Después |
|---|---|---|
| Ticket promedio grupo mixto | 14.000-16.000 THB | 22.000-25.000 THB (+8.400 si aplica Refresh+DA) |
| Tasa de cierre con objeción precio | Variable | Mejor con OFERTA-001 + screenshot fallback |
| Conversión "pareja quiere bucear junta" | Variable | Mejor con opción del cert acompañando |
| Leads perdidos por "no puedo depositar" | Alto | Bajo (fallback oficina) |

⚠️ **Estos son estimados basados en patrones. Validar con datos reales después de 30 días de producción.**

---

## 🔍 NOTAS PARA STEVE

1. **El KB-11 secciones 1-11** sigue siendo el análisis empírico de las 40 conversaciones curadas. La sección 12 (grupo mixto) viene del análisis ampliado al corpus completo.

2. **EMMA_PROMPT_NEW** está optimizado en tokens (vs el anterior que tenía hints de respond.io). Si necesitás más compresión, comprimir desde la sección de SNIPPETS hacia abajo (es referencia, no instrucción activa).

3. **El roster URL** sigue siendo el Google Apps Script:
   - Prod: `https://script.google.com/macros/s/AKfycbxygnv93Ve_1jirG7A9eFLg4b3NEPaZSwfz_eNGiEmraXK4v5fvSvBW7oNs8XnJ9DJV/exec`
   - Test/dev: `.../AKfycbxjl7Kwwn1oBnNiXn36Zdea-7WibDgX_CKG8bJgwQg/dev`

4. **OFERTA-001** vence 30 junio 2026 — recordatorio para extender o reemplazar antes de esa fecha.

5. **Caso de prueba inicial recomendado:** Q16 y Q17 del test de regresión (grupo mixto). Si esos dos casos pasan, el resto debería pasar también.
