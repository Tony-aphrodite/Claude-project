# DPM Diving × Claude — Runbook operativo (Pieza 1, Gili Trawangan)

Documento para Miguel y el equipo de la sede. Cubre la configuración que el
servidor no puede hacer por sí solo y los procedimientos operativos diarios.

Última actualización: 2026-05-04 (post-deploy `fda67757`).

---

## 1. Configuración pendiente del lado de Miguel

### 1.1 Respond.io — workflow de ruteo

El servidor solo procesa mensajes con `Branch = Gili Trawangan`. Hoy el
workflow `Mensaje Bienvenida - Asigna Sede` asigna la conversación a un
agente humano (Grecia) sin enviar nada al webhook, así que las pruebas
reales no llegan al AI.

**Cambio mínimo necesario para activar el piloto en tráfico controlado:**

1. Editar el workflow `Mensaje Bienvenida - Asigna Sede`.
2. Tras el paso que setea `Branch`, agregar una rama condicional:
   - **Si `Branch == "Gili Trawangan"`** → bloque **Send Webhook**:
     - URL: `https://dpmserver-production.up.railway.app/webhook/respond-io`
     - Método: `POST`
     - Header: `x-respond-signature` con la firma HMAC-SHA256 del body
       (Respond.io lo agrega automáticamente cuando el secret de webhook
       está configurado en el espacio).
     - **No** asignar a humano en esta rama. El AI escala por su cuenta
       cuando corresponde (handoff post-pago + lost en intent negativo).
   - **Else** (cualquier otro Branch) → mantener "Assign To" a humano
     como ya estaba. No tocar el flujo de las otras 4 sedes.

### 1.2 Respond.io — workflow de espía (agentes humanos)

Para que el panel registre los mensajes de Patrick / Giovanni / Grecia, hay
que disparar otro webhook en cada respuesta humana. Esto alimenta el espía
de monitoreo y mantiene el timeline completo en el panel.

1. Crear un nuevo workflow con trigger `Outgoing Message`.
2. Filtrar `Sent By type == "User"` (excluye bot/sistema).
3. Acción **Send Webhook**:
   - Misma URL: `https://dpmserver-production.up.railway.app/webhook/respond-io`
   - Body debe incluir `direction: "outgoing"` y `message.sentBy.type: "user"`
     con el nombre del agente. Respond.io lo agrega por defecto.
4. **No** filtrar por sede en este workflow — el servidor aplica el filtro
   `Branch=Gili Trawangan` en su lado y descarta el resto.

> Nota: el servidor ignora con seguridad los mensajes de tipo `bot_outbound`
> (sus propias respuestas eco) para evitar duplicados.

### 1.3 Apps Script — URL del roster por sede

Cada sede tiene su `roster_config.url` en la tabla `sedes` actualmente en
NULL. Sin la URL, el AI no puede llamar a `consultar_disponibilidad`
y la herramienta devuelve "no roster configurado". El AI igual contesta,
pero no podrá afirmar disponibilidad concreta.

Para activar el roster para Gili Trawangan, ejecutar este SQL en Supabase
(SQL Editor) cuando tengas la URL del Apps Script publicado:

```sql
UPDATE sedes
SET roster_config = jsonb_build_object(
  'url', 'https://script.google.com/macros/s/XXXXXXXX/exec'
)
WHERE nombre = 'Gili Trawangan';
```

El endpoint debe devolver JSON con la forma:

```json
{
  "generatedAt": "2026-05-05T00:00:00Z",
  "days": [
    { "date": "2026-05-12", "weekday": "lun",
      "courses": [{
        "code": "OW",
        "am": { "capacity": 6, "booked": 4 },
        "pm": null,
        "night": null
      }]
    }
  ]
}
```

Política de timeout: el servidor aborta a los 2 segundos y sigue sin roster.
Resultado en cache durante 10 minutos por sede.

### 1.4 Pasarelas de pago — Stripe queda fuera del piloto

Por scope (chatting.txt 2026-04-30, quinto mensaje), Gili Trawangan opera con:

- **Wise** (cuenta multi-divisa, EUR/GBP/AUD/USD)
- **Revolut** (mismas divisas)
- **Cuenta bancaria indonesia** (transferencia IDR)

Stripe está descartado para Gili Trawangan porque **Stripe no opera en
Indonesia**. Por eso `requires_human_verification` se setea siempre `true`
para esta sede y la confirmación pasa por el panel (sección 2.2).

Si en el futuro se incorpora Koh Tao / Phi Phi (Tailandia), Stripe sí está
disponible y el flujo de webhook automático se podrá activar entonces. La
arquitectura del servidor ya soporta el campo `requires_human_verification`
por sede, así que sumarlo es config, no refactor.

---

## 2. Procedimientos operativos diarios

### 2.1 Tablero del panel — qué mirar cada turno

Panel: `https://[panel-url-vercel]` (pendiente deploy de Tony — sección 4).

- **Dashboard / 24h**: P95 < 3000 ms, error rate < 1%, cache hit > 60%.
  Si P95 > 3500 ms, revisar Apps Script o Anthropic — usualmente latencia
  externa, no propia.
- **Pipeline**: kanban por `lead_stage`. Atender:
  - `deposit_pending` con > 24h sin movimiento (color rojo) — decidir si
    confirmar pago manual, escalar al cliente o marcar como `lost`.
  - `handed_off` reciente — confirmar que el equipo de la sede tomó la
    conversación.
- **Depósitos pendientes** (`/payments`): es la lista de leads esperando
  que confirmes que el dinero llegó (sección 2.2).
- **Errores 24h**: si aparecen >5 del mismo `errorType` en una hora,
  avisarme (puede ser que Anthropic, Supabase o Respond.io estén caídos).

### 2.2 Confirmar un depósito recibido (Wise / Revolut / banco IDR)

1. Recibís el comprobante en Wise / Revolut / cuenta bancaria.
2. En `/payments`, buscar la fila con el `REF` que el cliente reportó
   (formato `DPM-XXXXXX`, generado por la AI cuando llamó la herramienta).
3. Click en **Confirmar**. El sistema hace cuatro cosas en cadena:
   1. Marca `lead_stage = deposit_paid`.
   2. Envía al cliente un mensaje "¡Pago recibido! Te paso al equipo de la
      sede" (en su idioma — ES/EN según detecte).
   3. Persiste ese mensaje como `mensajes.sender = ai` (synthetic) para que
      el timeline del panel y el prompt del AI lo reflejen.
   4. Marca `lead_stage = handed_off` — el AI deja de responder a ese
      thread, ahora el equipo humano lo atiende.

> Si el send a Respond.io falla (raro), el panel igual marca `deposit_paid`
> y registra el error en `errores`. Comunicar manualmente al cliente y
> resolver el thread por WhatsApp normal.

### 2.3 Marcar un lead como perdido

Mismo flujo desde `/payments` (botón "Perdido"), o desde la vista del
pipeline. Causa típica:

- Cliente nunca pagó tras > 48h en `deposit_pending`.
- Cliente respondió "no me interesa" / "ya reservé en otro lado". El AI
  detecta esto automáticamente vía `negative-intent.ts`, así que la mayoría
  de los `lost` se marcan solos. Lo manual es para casos ambiguos.

### 2.4 Forzar transición de etapa (override humano)

En la vista de conversación (`/conversations/[id]`), el panel ofrece un
selector para mover la etapa a cualquier estado. Esto se registra en el
audit trail de `lead_metadata.history` con `by: "human"`. Útil cuando:

- El AI clasificó mal (e.g. quedó en `qualified` cuando ya estaba `proposed`).
- El cliente pagó por otro canal (cash en mostrador) y querés saltar de
  `deposit_pending` directo a `handed_off` sin pasar por la confirmación
  estándar.

---

## 3. Follow-ups automáticos

El servidor ya corre un worker que escanea conversaciones dormidas cada
15 minutos y envía follow-ups según el cronograma:

- **Nivel 1**: 4h sin respuesta del cliente
- **Nivel 2**: 24h
- **Nivel 3**: 48h
- **Nivel 4**: 7 días
- **Nivel 5**: 30 días

Reglas:

- Si el cliente responde, se cancelan todos los follow-ups abiertos.
- Si un agente humano responde (vía espía), también se cancelan.
- Si el cliente expresa intent negativo ("no me interesa", "ya reservé"),
  se cancelan + marca `lost`.
- Cada follow-up se genera contextualmente con Claude (no es plantilla
  fija) tomando los últimos N mensajes como contexto.

Se puede desactivar todo el módulo poniendo `WORKERS=off` en Railway.

---

## 4. Pendientes externos a mí (Steve)

Los siguientes ítems requieren acción de Tony / Miguel y no los puedo
ejecutar autónomamente:

- [ ] **Vercel deploy del panel** — Tony tiene los accesos de Vercel; el
  panel está listo para deploy (typecheck OK, build OK, `pnpm build` pasa).
- [ ] **Modificación del workflow Respond.io** — sección 1.1 / 1.2 arriba.
- [ ] **URL de Apps Script de Gili Trawangan** — sección 1.3.
- [ ] **NDA ampliado para espía / contact_id** — Miguel pidió firmar antes
  de que toque material histórico (chatting.txt 2026-04-30 segundo mensaje).
  El código de espía actual es seguro de tocar porque sólo procesa mensajes
  futuros, no mina histórico.
- [ ] **Mystery shopping** — propuesto en chatting.txt línea 314, no
  ejecutado. Decidir si se mantiene en scope o se reemplaza con la primera
  semana de tráfico real espía-monitoreado.
- [ ] **100 conversaciones reales para regression suite** — el harness y
  las 8 cases starter ya están; faltan las 92 restantes. Miguel debe
  exportarlas de Respond.io post-NDA (formato JSON o markdown indicado en
  `fixtures/regression/cases/README.md`).

---

## 5. Smoke checks rápidos

```bash
# 1. Servidor vivo
curl -s https://dpmserver-production.up.railway.app/health
# {"status":"ok"}

curl -s https://dpmserver-production.up.railway.app/ready
# {"ready":true,...}

# 2. Webhook signature válida (test sintético end-to-end)
#    Usa scripts/probe-webhook.sh — emite firma HMAC base64 con el
#    RESPOND_IO_WEBHOOK_SECRET y dispara un payload de cliente principiante.

# 3. Regression suite (cuando tengas más cases o cambios de prompt)
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY DATABASE_URL=$DATABASE_URL \
  pnpm dpm-regression run \
  --version=active \
  --cases=fixtures/regression/cases \
  --kb-dir=fixtures/regression/kb
```

Exit code 0 = pass, 2 = pass-rate < 95% (regresión detectada),
1 = error de runtime.

---

## 6. Contacto / escalación

- Caída del servidor (`/ready` no responde): revisar Railway dashboard,
  logs `railway logs --deployment`. Si hay 5xx persistentes → avisar Steve.
- Anthropic over-limit: Tier 2 = 1000 RPM. Si llega a 80% → bajar
  temporalmente a Haiku 4.5 cambiando `ANTHROPIC_MODEL_PRIMARY` en Railway.
- Costo > USD 100/día: el proceso refusa llamadas a Anthropic
  (`ANTHROPIC_DAILY_SPEND_LIMIT_USD=100`). Subir el cap si crece tráfico
  legítimo, o investigar abuso si fue inesperado.
