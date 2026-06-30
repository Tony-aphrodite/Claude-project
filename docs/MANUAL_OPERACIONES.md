# Manual de Operaciones — Sistema AI DPM Diving

**Para:** Personal de oficina y call center de DPM Diving (las 5 sedes)
**Versión:** v1.0
**Última actualización:** 2026-06-17
**Idioma:** Español

---

## Índice

1. [Introducción](#1-introduccion)
2. [Acceso al panel](#2-acceso-al-panel)
3. [Roles y permisos](#3-roles-y-permisos)
4. [Qué hay en el panel](#4-que-hay-en-el-panel)
5. [Rutina diaria — 10 minutos](#5-rutina-diaria)
6. [Cuándo flagear un depósito](#6-cuando-flagear-un-deposito)
7. [Tomar control de una conversación](#7-tomar-control)
8. [Devolver una conversación a la AI](#8-devolver-a-la-ai)
9. [Casos especiales](#9-casos-especiales)
10. [Glosario](#10-glosario)
11. [Escalation — a quién contactar](#11-escalation)
12. [Apéndice — URLs y contactos](#12-apendice)

---

## 1. Introducción {#1-introduccion}

DPM Diving usa un asistente AI en WhatsApp para cada una de las 5 sedes. Cada sede tiene su propio "agente digital" con personalidad propia:

| Sede | Nombre del agente AI |
|---|---|
| Koh Phi Phi | **Francisco Emilio** |
| Gili Trawangan | **John** |
| Gili Air | **Colomba** |
| Koh Tao | **Emma** |
| Nusa Penida | **David** |

Estos agentes:
- Reciben los mensajes nuevos en WhatsApp 24/7
- **Esperan ~5 segundos** después de cada mensaje del cliente antes de responder. Esto es a propósito: si el cliente manda varios mensajes seguidos rápidos, el AI los junta y contesta UNA sola vez en vez de soltar 3 burbujas seguidas — más parecido a un humano.
- Califican al cliente (qué curso quiere, cuántas personas, qué fechas)
- Mandan catálogos visuales con precios
- Consultan disponibilidad en el roster
- Generan el depósito (datos bancarios + código de referencia)
- Validan el comprobante PDF que sube el cliente (OCR)
- Confirman la reserva automáticamente
- Reservan el cupo en el barco

**Lo que NO hacen los AI** (responsabilidad del equipo humano):
- Cerrar el cierre presencial el día de llegada
- Confirmar realmente que el dinero llegó al banco
- Refunds
- Decisiones excepcionales (cliente VIP, problema operativo, etc.)
- Atender quejas que requieren juicio humano

**Tu rol como personal de oficina o call center:**
- Cross-check diario de los pagos auto-confirmados contra los emails reales del banco
- Tomar control de las conversaciones cuando la AI se equivoca o el cliente pide algo fuera de protocolo
- Coordinar con el cliente el día previo al curso (paperwork, tallas, llegada)

---

## 2. Acceso al panel {#2-acceso-al-panel}

### URL del panel

```
https://pdm-diving.vercel.app/
```

> En el futuro Miguel quiere apuntar un dominio propio (por ejemplo `panel.dpmdiving.com`) a este panel, pero por ahora usás directamente la URL de Vercel.

### Primer inicio de sesión

1. Tu administrador (Miguel o Steve) te crea la cuenta con tu email + una contraseña temporal.
2. Vas al panel, ingresás email + contraseña.
3. **Cambiá la contraseña inmediatamente** desde el menú "Mi cuenta" → "Cambiar contraseña".
4. Elegí una contraseña fuerte (mínimo 12 caracteres, mezclá letras, números y símbolos).

### Olvidé mi contraseña

1. En la pantalla de login, click en "¿Olvidaste tu contraseña?"
2. Te llega un email con un link para resetear.
3. Si el email no llega en 5 min: revisá spam. Si sigue sin llegar, contactá a tu administrador.

### Política de uso

- **No compartas tu contraseña con nadie.** Cada persona tiene su propia cuenta para que las acciones queden auditadas.
- Cerrá sesión cuando termines tu turno, sobre todo en computadoras compartidas.
- Si sospechás que alguien usó tu cuenta, avisá inmediatamente a Miguel o Steve.

---

## 3. Roles y permisos {#3-roles-y-permisos}

Existen dos roles en el panel:

### Rol `admin`

- Quién: Miguel (dueño), Steve (desarrollador principal)
- Qué ve: TODO de las 5 sedes
- Qué puede hacer:
  - Ver y modificar prompts de los AI
  - Editar la base de conocimiento (KB) de cada sede
  - Correr la suite de regresión
  - Usar el simulador
  - Crear / borrar / modificar usuarios
  - Ver depósitos y conversaciones de cualquier sede

### Rol `office`

- Quién: equipo de cada sede + call center
- Qué ve: SOLO los datos de SU sede (sede-scoped)
- Qué puede hacer:
  - Ver las conversaciones de su sede
  - Ver los pagos manuales recibidos
  - Ver los depósitos auto-confirmados (`/depositos-auto`)
  - Flagear depósitos sospechosos
  - Ver el roster (calendario de barcos / cupos)
  - Acceder al sandbox para probar escenarios sin afectar producción

### Qué NO puede hacer el rol `office`

- Modificar prompts del AI
- Editar la KB
- Crear / borrar usuarios
- Ver datos de otras sedes
- Acceso al simulador o regresión

Si necesitás algo que tu rol no permite, contactá a Miguel o Steve.

---

## 4. Qué hay en el panel {#4-que-hay-en-el-panel}

### Páginas principales (rol `office`)

| Página | URL | Para qué sirve |
|---|---|---|
| **Conversations** | `/conversations` | Lista de todos los threads de WhatsApp de tu sede. Click en cualquier conversación abre el detalle con mensajes + acciones |
| **Payments** | `/payments` | Pagos confirmados manualmente. Útil para reportes |
| **Depósitos auto** | `/depositos-auto` | **El más importante.** Lista de depósitos que el AI auto-confirmó por OCR. Es donde hacés el cross-check matinal |
| **Roster** | `/roster` | Calendario visual del barco — cuántos lugares ocupados por turno (AM / PM / Nocturno / Confinadas) |
| **Pipeline** | `/pipeline` | Vista de embudo — leads en cada etapa (qualified, proposed, deposit_pending, deposit_paid) |
| **Follow-ups** | `/follow-ups` | Follow-ups automáticos pendientes (recordatorios que el AI manda al cliente) |
| **Sandbox** | `/sandbox` | Roster de pruebas — simulá ocupaciones para testear escenarios sin tocar producción |

### Páginas admin-only (no aparecen para `office`)

- `/admin/users` — gestión de usuarios
- `/prompts` — prompts de los AI
- `/kb` — base de conocimiento por sede
- `/simulator` — replay de conversaciones
- `/regression` — suite de tests

---

## 5. Rutina diaria — 10 minutos {#5-rutina-diaria}

La operación normal del sistema es 99% automática. Tu trabajo diario es el **1% de control de calidad**.

### Cada mañana (recomendado: 9 AM, antes del primer barco)

#### Paso 1 — Abrir `/depositos-auto`

Vas a ver una tabla con todos los depósitos que el AI auto-confirmó. Por default muestra los de **hoy**; podés cambiar a "7 días" o "Todos" con los tabs superiores.

Columnas importantes:
- **Cliente** — nombre + número de WhatsApp
- **Sede** — tu sede (filtrado automáticamente)
- **Monto + Moneda** — lo que el cliente dijo que pagó
- **Ref code** — código DPM-XX-MMDD-XXXXXX único de ese cliente
- **Auto-confirmado a las** — timestamp
- **Estado** — "OK" o "🚩 Flag" si alguien ya lo marcó

#### Paso 2 — Cruzar con el email del banco

Abrí tu email de operaciones (`gilit@dpmdiving.com` o el que use tu sede). Buscá los emails de hoy de:
- **Wise** (para transferencias EUR / GBP / AUD / USD)
- **Bank Mandiri / BCA** (para transferencias IDR locales)

Cada email del banco lista los pagos recibidos en las últimas horas con monto + nombre del remitente.

**Para cada fila de `/depositos-auto`**:
1. Buscá en los emails del banco un pago con el mismo monto + moneda + cliente (aprox).
2. ¿Aparece? ✅ Todo OK, no hacés nada.
3. ¿NO aparece? 🚩 Click en "Flag para revisar" en esa fila.

#### Paso 3 — Revisar conversaciones flagged

Después de flagear, click en la conversación del cliente sospechoso. Mirá el comprobante PDF que subió. Posibles causas de que no aparezca en el banco:

| Causa | Qué hacer |
|---|---|
| El cliente subió un PDF de otra transferencia previa | Mandar mensaje pidiendo el PDF correcto |
| El cliente subió un PDF de otra sede DPM | Contactar a la sede correspondiente para verificar |
| Transferencia en tránsito (todavía no llegó al banco — Wise puede tardar 1-2 hs) | Esperar y verificar al final del día |
| Intento de fraude (PDF falso o reusado) | Contactar a Miguel inmediatamente |

#### Paso 4 — Resolver flag

Si después de la revisión todo está OK (ej: la transferencia entró al final del día), click en "Resolver flag" para sacar el 🚩.

Si confirmás que hay un problema, dejá el flag activo y escalalo a Miguel.

### Cuánto tiempo toma esta rutina

- Operación normal: 5-10 min para 5-15 depósitos diarios.
- Días pico (vacaciones, temporada alta): puede llegar a 15-20 min con 30+ depósitos.

### Por qué este cross-check es crucial

El AI valida el PDF por **OCR** (lectura visual): chequea moneda + monto. Pero NO verifica si la cuenta de destino en el PDF es realmente la de tu sede, ni si el dinero llegó al banco. Eso lo hacés vos cruzando los emails reales del banco.

**Sin tu cross-check, alguien podría usar un PDF viejo o de otra sede y reservar cupos sin pagar.**

---

## 6. Cuándo flagear un depósito {#6-cuando-flagear-un-deposito}

### Checklist de señales rojas

Marcá 🚩 "Flag para revisar" si:

- ❌ **El pago NO aparece en los emails del banco** (Wise / Mandiri / BCA) después de 4 horas del depósito auto-confirmado.
- ❌ **El monto en el banco es distinto** al del comprobante (diferencia mayor al 5%).
- ❌ **El nombre del remitente** en el banco no coincide con el nombre del cliente en WhatsApp.
- ❌ **El PDF parece sospechoso** (calidad de imagen rara, fuente diferente al de tu banco habitual, fecha del transfer muy vieja).
- ❌ **El cliente está reusando un PDF previo** (mismo nombre + monto que un cliente anterior ya confirmado).
- ❌ **El IBAN o número de cuenta en el PDF no es de tu sede** (cada sede tiene su propia cuenta — ver Apéndice).
- ❌ **El comprobante es un screenshot, no un PDF** (para transferencias en moneda extranjera, exigimos PDF descargado del banco).
- ❌ **Cualquier intuición operativa** — si algo te parece raro, flag y revisamos juntos.

### Qué NO es razón para flagear

- ✅ El cliente tardó en mandar el PDF (puede ser timezone, vacaciones, etc.).
- ✅ El cliente preguntó muchas veces antes de pagar.
- ✅ El monto exacto difiere por 1-2 EUR (puede ser comisión de Wise o redondeo).
- ✅ El ref code del PDF no coincide con el del sistema (muchos clientes no lo escriben — Miguel lo configuró así a propósito).

### Después de flagear

El sistema:
1. Stampa `flagged_at` en la conversación
2. Notifica a Miguel y Steve por email
3. Mantiene el lead en estado "deposit_paid" pero marcado para revisión
4. NO libera el slot del roster automáticamente (Miguel decide caso por caso)

---

## 7. Tomar control de una conversación {#7-tomar-control}

### Cuándo es necesario

Tomá control humano cuando:

- 💬 El cliente pide algo que el AI no puede resolver (caso excepcional)
- 💬 El AI dijo algo equivocado y querés corregirlo
- 💬 El cliente está molesto / pidiendo refund
- 💬 Hay un problema operativo que requiere coordinación (cambio de fecha por mar agitado, etc.)
- 💬 El cliente es VIP y necesita atención personalizada
- 💬 La conversación pasa a temas no relacionados con la reserva (recomendaciones de la isla, transporte, etc. — el AI puede manejar lo básico pero el humano da mejor experiencia)

### Cómo tomar control en Respond.io

1. Abrí Respond.io y buscá la conversación del cliente.
2. En la barra superior derecha de la conversación, click en **"Reasignar"**.
3. Seleccioná tu nombre (o el del agente que va a manejar la conversación).
4. **A partir de ese momento, la AI queda silenciada DEFINITIVAMENTE** para esa conversación, mientras el assignee sea humano.
5. Respondele al cliente normalmente desde Respond.io.

### Qué pasa con la AI cuando tomás control

- La AI deja de responder a ese cliente.
- Los mensajes del cliente siguen llegando pero la AI NO los procesa.
- El sistema marca la conversación con `human_takeover = true`.
- Si el cliente cambia totalmente de tema (ej: te escribe meses después preguntando por otro curso), un detector automático puede reactivar el AI — pero solo si la conversación cambia significativamente de tema.

### Importante

- **No conviene tomar control "por las dudas".** Si el AI está manejando bien la conversación, dejala.
- Tomar control para 1 sola respuesta y luego devolverla a la AI es válido — ver sección 8.

---

## 8. Devolver una conversación a la AI {#8-devolver-a-la-ai}

### Cuándo conviene

- Resolviste un caso puntual y querés que el AI siga con la operación normal (paperwork, recordatorios, follow-ups).
- Confirmaste un cambio de fecha manualmente y querés que el AI maneje el resto del flujo.
- El cliente quedó tranquilo después de tu intervención y vuelve a pedir info de un curso nuevo.

### Cómo devolver el control

1. En Respond.io, reasigná la conversación al AI bot de tu sede:
   - Phi Phi → Francisco Emilio
   - Gili Trawangan → John
   - Gili Air → Colomba
   - Koh Tao → Emma
   - Nusa Penida → David
2. El sistema detecta el cambio de assignee y **resume la AI completamente** — limpia el flag `human_takeover` y resetea el estado de la conversación si estaba en `handed_off`.
3. La AI procesa el próximo mensaje del cliente como si nada hubiera pasado, con todo el contexto previo.

### Importante

- La AI mantiene la memoria completa de la conversación (todos los mensajes previos, el depósito si lo había, el roster reservado, etc.).
- No hace falta "explicarle" al AI lo que pasó — lee la historia.
- Si dejaste mensajes manuales que cambiaron datos importantes (ej: cambiaste la fecha de inicio), el AI los va a usar como contexto.

---

## 9. Casos especiales {#9-casos-especiales}

### 9.1 Cliente pide refund

- **Antes del depósito:** No hay nada que devolver. Decile que el cupo no estaba reservado todavía.
- **Después del depósito, antes del curso:** Política DPM (Miguel define): generalmente NO se devuelve el depósito una vez confirmado, pero se puede reprogramar a otra fecha. Confirmá con Miguel antes de comprometer cualquier devolución.
- **Después del curso:** No se devuelven cursos completados.

### 9.2 Cliente quiere cambiar fecha / programa / pax

- **Cambio de fecha:** Tomá control, verificá disponibilidad en el roster, actualizá manualmente la reserva. Devolvé control al AI.
- **Cambio de programa (ej: de Try Scuba a Open Water):** Tomá control, el cambio implica diferencia de precio → el AI no maneja esto automáticamente. Explicale el nuevo monto al cliente, recibí la diferencia, confirmá manualmente.
- **Cambio de pax (más / menos personas):** El AI puede manejar pax change si re-invoca el tool de depósito. Si ves que el AI NO está re-invocando (te das cuenta porque el monto en `lead_metadata` quedó stale), tomá control, calculá la diferencia, confirmá.

### 9.3 Cliente que ya buceó en otra sede DPM

- El AI lo detecta automáticamente y aplica una "alerta de IBAN" — le dice al cliente que la cuenta bancaria de esta sede es DIFERENTE a la de la sede anterior, y le manda los datos correctos.
- Si el cliente igual transfiere a la cuenta de la sede anterior, los emails del banco te lo van a mostrar — flagealo y contactá a la sede destino para reconciliar.

### 9.4 Cliente repeat (cliente que vuelve después de mucho tiempo)

- El AI mantiene historial completo de las conversaciones.
- Si el cliente vuelve después de meses, el AI:
  - Reconoce que ya hubo conversación previa
  - Aplica reglas de upsell para clientes repeat (ej: Refresh + Deep Adventure, descuentos de fidelidad)
  - Generalmente NO le pide datos personales que ya tiene
- Si notás que el AI le pidió datos que ya tenía (regresión), tomá control y disculpate breve.

### 9.5 Idioma no soportado

- Los AI soportan oficialmente EN y ES (Phi Phi, Gili Air, Koh Tao, Nusa Penida) o EN/ES/IT/FR/DE (Gili Trawangan).
- Si el cliente escribe en un idioma no soportado (japonés, ruso, etc.), el AI escala automáticamente al equipo humano de cualquier sede online.
- Si nadie está disponible, el cliente queda en cola. Cuando un humano abre la conversación, podés respondele directamente en ese idioma si lo manejás, o usar traductor.

### 9.6 PDF de pago duplicado entre sedes

- Riesgo conocido: el AI actualmente NO verifica el IBAN del PDF, solo monto + moneda. Esto significa que un cliente podría usar el mismo PDF en 2 sedes.
- Tu cross-check matinal contra los emails del banco es la red de seguridad.
- Si ves que el mismo nombre + monto aparece auto-confirmado en 2 sedes el mismo día — flagealo en ambas y avisame a Miguel para reconciliar.

### 9.7 Cliente molesto / queja seria

- Tomá control inmediatamente.
- Pedile disculpas, escuchá la queja completa.
- No prometas refund o compensación sin confirmar con Miguel.
- Si la queja es sobre el AI (cliente se dio cuenta que era bot y está molesto): "Soy [tu nombre] del equipo de DPM. Te paso a atención humana." Nunca confirmes ni niegues que era AI.

---

## 10. Glosario {#10-glosario}

| Término | Qué significa |
|---|---|
| **AI / Bot** | El agente digital (Francisco / John / Colomba / Emma / David). Procesa WhatsApp automáticamente. |
| **Lead** | Un cliente potencial. Una conversación en WhatsApp = un lead. |
| **Lead stage** | Etapa del lead. Valores: `new`, `qualified`, `proposed`, `deposit_pending`, `deposit_paid`, `handed_off`, `closed`, `lost`. |
| **Ref code** | Código único de reserva. Formato: `DPM-XX-MMDD-XXXXXX` (XX = sede: PP/GT/GA/KT/NP). Lo genera el AI cuando solicita el depósito. |
| **OCR** | Optical Character Recognition. Es lo que usa el AI para "leer" el PDF del comprobante (extrae monto, moneda, fecha, código de referencia). |
| **Roster** | Calendario de cupos del barco por turno (AM / PM / Nocturno / Confinadas) y por programa. |
| **Roster booking** | Una reserva confirmada en el roster — bloquea uno o varios slots. |
| **Pending hold** | Reserva temporal del cupo mientras esperamos el comprobante. Dura 4 horas; si el cliente no manda PDF, se libera automáticamente. |
| **Auto-confirm** | Cuando el AI valida el PDF y confirma el depósito sin intervención humana. Es el 99% de los casos. |
| **Flag para revisar** | Botón en `/depositos-auto` que marca un depósito como sospechoso, requiere review humana. |
| **Handed off** | Estado donde el AI quedó silenciado porque ya no aplica (cliente pagó hace tiempo, o humano tomó control). |
| **Pipeline** | Vista de embudo del panel. Muestra cuántos leads hay en cada etapa. |
| **Branch** | Campo en Respond.io que identifica la sede de un contacto. Setear `Branch = Gili Air` rutea esa conversación a Colomba (la AI de GA). |
| **Tag** | Etiqueta en Respond.io. Ejemplos: `deposit_paid` (cliente pagó), `pilot_ai_test` (cliente del piloto). |
| **Lifecycle** | Estado del contacto en Respond.io: `New Lead`, `In process`, `Payment`, `Customer`, `Lost Lead`. Se actualiza automáticamente desde el server cuando el lead_stage cambia. |

---

## 11. Escalation — a quién contactar {#11-escalation}

### Miguel (dueño / decisiones de negocio)

Contactalo si:
- Hay un fraude confirmado (PDF falso, intento de booking sin pago real)
- Cliente pide refund y necesitás autorización
- Hay un problema operativo que afecta múltiples reservas (ej: barco cancelado por clima)
- Querés cambiar el precio de un curso para un cliente específico
- Hay una queja seria que puede afectar reputación
- Necesitás cuentas nuevas en el panel para staff nuevo
- Tenés dudas sobre las cuentas bancarias

**Canal:** WhatsApp directo a Miguel.

### Steve (developer / problemas técnicos)

Contactalo si:
- El panel no responde / no carga
- Un AI está dando respuestas claramente equivocadas y se repite
- El email del banco no llega
- Los emails de notificación de "Flag" no llegan
- Necesitás crear un usuario nuevo y Miguel está ocupado
- Tenés error técnico que no podés resolver

**Canal:** WhatsApp directo a Steve, o si es urgente y no responde, escribile a Miguel.

### Equipo de tu sede

Contactalos si:
- Llega un cliente al centro y la AI no está respondiendo bien (toman control)
- Hay un cambio operativo (tu equipo cambia el roster, ajustan instructores, etc.)
- Coordinación normal del día a día

### Otra sede DPM

Contactalos si:
- Un cliente quiere bucear en tu sede pero ya tiene reserva en otra
- Necesitás reconciliar un pago duplicado entre sedes

---

## 12. Apéndice — URLs y contactos {#12-apendice}

### URLs del sistema

| Recurso | URL |
|---|---|
| **Panel principal** | `https://pdm-diving.vercel.app/` |
| **Depósitos auto-confirmados** | `https://pdm-diving.vercel.app/depositos-auto` |
| **Conversaciones** | `https://pdm-diving.vercel.app/conversations` |
| **Roster** | `https://pdm-diving.vercel.app/roster` |
| **Respond.io** | `https://app.respond.io` |
| **Email operativo** | `gilit@dpmdiving.com` (Wise + Mandiri + BCA llegan acá) |

### Cuentas bancarias por sede (referencia para verificar PDFs)

#### Gili Trawangan
- **EUR:** Beneficiary `DPM Diving Gili T LLC` / IBAN `BE93 9050 6891 4867`
- **GBP:** Account `55834953` / Sort code `23-08-01`
- **AUD:** Account `222625669` / BSB `774-001`
- **USD:** Account `496290465973320` / Routing `084009519`
- **IDR:** `PT DALAM PROFESIONAL MENYELAM` / Mandiri / Account `1610010570609`

#### Gili Air
- **EUR:** Beneficiary `DPM Diving Gili Air LLC` / IBAN `BE26 9050 6838 7229`
- **GBP:** Account `59488146` / Sort code `23-08-01`
- **AUD:** Account `222597691` / BSB `774-001`
- **USD:** (compartida con Koh Tao — CFSB)
- **IDR:** `PT DALAM PROFESSIONAL MENYELAM` / Mandiri / Account `161001392624-6`

#### Nusa Penida
- **EUR:** Beneficiary `DPM Diving Nusa Penida LLC` / IBAN `BE57 9050 6281 0335`
- **GBP:** Account `83574365` / Sort code `23-08-01`
- **AUD:** (verificar en `deposit-instructions.ts`)
- **USD:** NO acepta — si un PDF de USD aparece como NP, es error
- **IDR:** (verificar con Miguel)

#### Koh Phi Phi
- (Datos en `deposit-instructions.ts`)

#### Koh Tao
- (Datos en `deposit-instructions.ts`)
- **USD:** Cuenta CFSB compartida con Gili Air

> Si necesitás los datos de PP o KT, pedile a Miguel o a Steve.

### Contactos

| Persona | Rol | Cómo contactar |
|---|---|---|
| Miguel | Dueño DPM Diving | WhatsApp directo |
| Steve | Developer principal | WhatsApp directo |
| (Tu manager de sede) | Operación diaria | Coordinación interna |

### Cheatsheet rápido — qué hacer en cada situación

| Situación | Acción |
|---|---|
| Llegué a la oficina, primera tarea del día | Abrir `/depositos-auto` y cruzar con emails del banco |
| Veo un depósito sin match en el banco | Click "Flag para revisar" |
| Cliente molesto / queja | Tomar control en Respond.io, disculparme, no prometer nada sin Miguel |
| Cliente VIP necesita atención especial | Tomar control y manejarlo manualmente |
| AI dijo algo equivocado | Tomar control, corregir, devolver a AI cuando termine |
| Cliente pide refund | NO prometo nada, escalar a Miguel |
| Cliente quiere cambiar fecha | Verificar roster, hacer cambio manual, devolver a AI |
| PDF duplicado entre sedes | Flagear en ambas, avisar a Miguel |
| Panel no carga / error técnico | Contactar a Steve |
| Cliente escribe en idioma raro | AI escala automáticamente — si lo manejás, respondé directo |

---

**Fin del manual.**

Para sugerencias o correcciones de este documento, contactá a Miguel o a Steve.
