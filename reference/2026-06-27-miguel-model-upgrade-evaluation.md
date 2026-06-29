# Miguel 2026-06-27 — Evaluación de modelo más potente

**Fecha:** 2026-06-27
**De:** Miguel (Papu)
**Para:** Steve
**Estado:** consulta abierta — respondida con propuesta de pilot per-sede

---

## Mensaje original de Miguel

> consulta aparte de los errores. Estoy viendo que varios de los problemas de la AI no son de plomería sino de comprensión — se va de contexto, pierde el hilo, se enreda en preguntas razonables del cliente (tipo el caso de Martino con los buceos). Eso me cuesta ventas.
>
> Quiero evaluar usar un modelo más potente, aunque gaste más tokens. En un negocio de ticket alto como cursos, una sola venta recuperada paga muchísimas conversaciones más caras, así que el costo extra del modelo no me asusta si mejora el cierre.
>
> Para decidirlo con datos necesito que me pases:
>
> 1) ¿Qué modelo está usando hoy el server (cuál exacto)?
> 2) ¿Qué implicaría subir al mejor disponible — es cambiar un parámetro de config o hay trabajo de por medio?
> 3) Diferencia de costo aproximada por conversación entre el actual y el mejor.
> 4) ¿Podemos probarlo en UNA sola sede primero (ej. Nusa o Koh Tao) y comparar, en vez de cambiarlo en las 5 de una?

---

## Diagnóstico de Miguel

Los errores que ve no son bugs de implementación — son límites de comprensión del modelo. Tres síntomas que mencionó o se desprenden del histórico:

- "Se va de contexto" — el modelo pierde la línea narrativa en conversaciones largas con múltiples ramas.
- "Pierde el hilo" — preguntas naturales del cliente (¿cuánto cuesta?, ¿hay descuento?, ¿se ven mantas?) que ramifican la lógica, el modelo no las re-conecta al objetivo de venta.
- "Se enreda en preguntas razonables" — caso Martino: el cliente pregunta variaciones legítimas sobre número de buceos / fechas / certificación y el modelo no mantiene una propuesta coherente.

La hipótesis: Sonnet 4.6 (modelo balanceado) está topando contra su techo de inteligencia para esta conversación de ventas multi-variable. Un modelo más capaz mantendría mejor el hilo.

---

## Respuesta enviada por Steve (resumen técnico)

**1) Modelo actual:** Claude Sonnet 4.6 (`claude-sonnet-4-6`). Configurado vía `ANTHROPIC_MODEL_PRIMARY` en Railway.

**2) Costo de upgrade:**
- A Claude Opus 4.8: cambio de UN env var, sin tocar código (~10 min). API surface idéntica, verificado contra el código.
- A Claude Fable 5: cambio de env var + manejo de `stop_reason: "refusal"` (clasificadores de seguridad bio/cyber, irrelevante para diving pero hay que manejar el caso) (~30 min).

**3) Diferencia de costo por conversación** (5-15 turnos, prompt cacheado al 90%):

| Modelo | USD por conversación | vs actual |
|---|---|---|
| Sonnet 4.6 (actual) | 0.23 – 0.70 | — |
| Opus 4.8 | 0.39 – 1.16 | +0.16 – +0.46 (1.67×) |
| Fable 5 | 0.78 – 2.33 | +0.55 – +1.63 (3.33×) |

Una venta recuperada de OW (~USD 350) paga ~1500 conversaciones extra en Opus 4.8 o ~400 en Fable 5. La ecuación es positiva para el ticket de Miguel.

**4) Pilot per-sede: SÍ se puede.** El código tiene `callClaude({model: ...})` por-call. Lo que falta es leer `sedes.behavior_config.model_override` y usarlo si está seteado (~30 min de trabajo).

**Plan propuesto:**

1. Implementar override per-sede (sin tocar el modelo global).
2. Empezar por Nusa Penida — tráfico moderado + errores de comprensión documentados (Martino, Faiz cert gate, etc.).
3. Una semana en Opus 4.8 vs Sonnet 4.6, comparar: tasa de close, escalations a humano, errores reportados.
4. Si Opus 4.8 mejora → rollout a las otras 4 sedes. Si Miguel quiere ir más arriba → probar Fable 5 en KT o GT por una semana.

Esperando OK de Miguel para arrancar implementación del override per-sede.

---

## Decisiones técnicas verificadas

Durante el análisis se confirmó que el código actual NO usa parámetros que rompan en Opus 4.8 ni Fable 5:

- ✅ No usa `temperature`, `top_p`, `top_k` (todos retornan 400 en Opus 4.7+/Fable 5)
- ✅ No usa `budget_tokens` (deprecated en 4.6, 400 en 4.7+/Fable 5)
- ✅ No usa `thinking: {type: "enabled", ...}` (legacy thinking)
- ✅ No usa assistant-turn prefill (400 en 4.6+/Fable 5)

→ Migración API-clean. Único ajuste necesario (Fable 5): handler de `stop_reason: "refusal"` por los safety classifiers.

---

## Archivos relacionados

- [packages/shared/src/constants.ts](../packages/shared/src/constants.ts) — `ANTHROPIC_PRICING` (actualizar con Opus 4.8 / Fable 5 cuando se incorporen al pricing table).
- [apps/server/src/services/anthropic.ts:201](../apps/server/src/services/anthropic.ts) — `callClaude` lee `input.model ?? env.ANTHROPIC_MODEL_PRIMARY`.
- [apps/server/src/env.ts:17-19](../apps/server/src/env.ts) — env defaults.
