# Mensajes de Miguel fuera del alcance Pieza 1

> Conversaciones que NO son parte del piloto Gili Trawangan (Pieza 1).
> Se guardan acá para no contaminar `chatting.md` que es el log del
> contrato vigente.

---

## 1. Demo "DPM Cloud" en kimi.page — 2026-05-06

> Miguel mandó un link a un mock interactivo del DPM Cloud (Pieza 2).
> NO está pidiendo que lo construyamos todavía — solo está
> compartiendo su visión para que Steve la entienda y eventualmente
> pueda cotizar.

### Mensaje original

```
https://hc7yu44tmhdzs.kimi.page?sharetype=link

Check this demo is not finished but is the idea to clone bubble
into a bubble cloud.
```

### Análisis del URL

- **Dominio**: `kimi.page` — plataforma de previsualización de
  Moonshot AI (asistente Kimi, el ChatGPT de China). Cuando le
  pedís a Kimi que genere una app, te devuelve un URL público de
  ese tipo. Cualquiera con el link puede ver la demo.
- **Subdominio**: `hc7yu44tmhdzs` — hash anónimo que identifica
  esta generación específica.
- **HTTP 200, ~86 KB de HTML**. Todo el demo es un único
  `index.html` con Tailwind CDN + Leaflet + QRCode.js + Lucide
  icons. Sin backend, datos en memoria (mock JS).

### Qué hay en la demo (concretamente)

**Título**: "DPM Cloud - Demo Interactivo"

**Modelo multi-tenant — 5 sedes con datos de banco distintos**:

| Sede | País | Moneda | Banco | Cuenta |
|------|------|--------|-------|--------|
| DPM Diving Koh Tao | Tailandia | THB | Bangkok Bank | THB-9988776655 |
| DPM Diving Phi Phi | Tailandia | THB | Krungthai Bank | THB-1122334455 |
| DPM Diving Nusa Penida | Indonesia | IDR | BCA | IDR-5566778899 |
| DPM Diving Gili T | Indonesia | IDR | Mandiri | IDR-2233445566 |
| DPM Diving Gili Air | Indonesia | IDR | BRI | IDR-3344556677 |

> Esto da una pista importante: en el modelo de Miguel **cada sede
> tiene su propia cuenta bancaria** y posiblemente una entidad
> legal distinta ("DPM Diving Co. Ltd" vs "DPM Diving Phi Phi Co."
> vs "DPM Diving Indonesia"). Para Pieza 1 el depósito Wise puede
> ser de una sola cuenta (la de Gili Trawangan = Mandiri), pero
> para Pieza 2 hay que respetar el split por sede.

**4 roles con menús diferentes**:

```
owner     → Dashboard, Alumnos, Instructores, Pagos, Reportes, Config
manager   → Dashboard, Alumnos, Instructores, Pagos Pendientes, Horarios y Barcos, Mapa
instructor → Mis Alumnos, Mis Comisiones, Pagos de Mis Alumnos, Mi Disponibilidad, Mapa
student   → Mi Curso, Mis Pagos, Mi Diploma, Mapa
```

> El rol `student` es un kiosk/portal autoservicio que entra con
> un **código** (no email/password). Coincide con la línea de la
> propuesta original de Miguel: "Public kiosk flow for customer
> self-registration from their phone".

**Catálogo de cursos (en THB, sede Koh Tao)**:

| Code | Curso | Precio THB |
|------|-------|------------|
| OWD | Open Water Diver | 11,500 |
| AOW | Advanced Open Water | 10,500 |
| RESCUE | Rescue Diver | 12,500 |
| DM | Divemaster | 45,000 |
| NITROX | Enriched Air Nitrox | 6,500 |
| TRY | Try Scuba | 3,500 |

**Etapas del curso (state machine de alumno)**:

```
theory1 (video) → theory2 (examen) → confined (piscina) →
  ow12 (mar 1-2) → ow34 (mar 3-4) → finalpay (pago oficina) →
  certready (listo para certificar)
```

> **Hallazgo importante**: la demo marca cada etapa con
> `needsBoat: true/false`. Las etapas `ow12` y `ow34` necesitan
> barco; las demás no. **Esto coincide exactamente con lo que ya
> implementamos en `program-schedule.ts`** para Pieza 1: distinguir
> qué días/turnos consumen capacidad de barco. La lógica de Miguel
> es consistente entre las dos piezas.

**Funcionalidades visibles en el demo**:

- Login con selector de rol (sin password real — es mock)
- Dashboard con métricas (cursos activos, ingresos, pagos
  pendientes, salidas de hoy)
- Listado / detalle de alumnos con QR de identificación
- Listado de instructores con perfil y comisiones
- Pagos: pendientes de confirmación, historial, ingresos por sede
- Reportes
- Configuración del sistema
- Horarios y barcos (manager)
- Mapa de sitios de buceo (Leaflet — todas las sedes geo-pinneadas)
- Calendario mensual ("Mayo 2026")
- Disponibilidad propia del instructor
- Diploma digital del alumno con QR
- Pago al alumno con QR de Wise

### Qué significa "clone bubble into a bubble cloud"

- **"Bubble"** = `BubbleManager_be.accdb`, la base Microsoft Access
  on-premise que Miguel usa hoy en las 5 sedes (la mencionó el
  2026-05-06 cuando propuso DPM Cloud / Pieza 2). El nombre interno
  del sistema actual es "BubbleManager".
- **"Bubble cloud"** = la versión cloud, multi-tenant, web+mobile
  del mismo sistema. Lo que esta demo prototipa.

Traducción literal del pedido: "queremos clonar el BubbleManager
(Access) en una versión cloud equivalente, accesible desde
cualquier dispositivo".

### Implicancias para nuestro trabajo

**Pieza 1 (alcance actual, deadline 2026-05-11)**: ❌ ningún cambio.
La demo no afecta el piloto AI de Gili Trawangan. Seguimos con
el plan de cerrar contenido + lanzamiento.

**Pieza 2 (DPM Cloud, sin contrato firmado todavía)**:
- Confirma alcance: 4 roles, 5 sedes, módulos identificados.
- Stack visible (Tailwind, mapas, QR, mobile-first responsive)
  da idea de lo que Miguel espera estéticamente.
- Refuerza dos decisiones que ya teníamos:
  1. **contact_id como clave única** (memoria existente) — encaja
     con que el alumno entra con código, no con email/password.
  2. **Per-sede config** — cuenta bancaria, moneda, color de marca
     son atributos por sede, no globales.
- Lo que la demo NO muestra (y que va a ser caro implementar):
  payroll/comisiones reales con co-teaching splits, integración
  Wise Business para confirmación automática de pagos, integración
  Respond.io para WhatsApp, kiosk de self-registration en mobile.

### Acción recomendada

- **Responder a Miguel** con un acuse de recibo corto (no
  comprometerse a nada de Pieza 2 hasta que se cierre Pieza 1 y se
  firme contrato separado para DPM Cloud).
- **No tocar el repo** por este mensaje — ningún archivo de código
  cambia.
- **Guardar la demo** offline (`/tmp/kimi_demo.html` ya tiene una
  copia descargada, pero conviene moverla a `docs/` si va a
  servir como input de cotización).

Sugerencia de respuesta breve para Miguel:

```
Got it — I downloaded the demo to study it. Looks like a clean
mock of the BubbleManager-as-cloud vision (4 roles, 5 sedes,
student kiosk with code login, per-sede banking). I'll factor
this into the Pieza 2 quote once we close Pieza 1 next Monday.
For now I'm fully focused on Gili Trawangan AI launch.
```

### Aclaración posterior de Miguel (mismo día, 2026-05-06)

> "Is not to do it in Kimi I'm just used to do the demo is easy"

Traducción: "no es que quiera que lo construyas en Kimi — solo
usé Kimi para armar la demo rápido, porque ahí es fácil
prototipar".

Miguel se adelantó a una posible mala interpretación de nuestra
parte: Kimi es solo la herramienta con la que hizo el mock-up,
**NO es la plataforma sobre la que quiere correr DPM Cloud**.
La elección de stack queda abierta — su pedido original ya
incluía "Tech stack you'd recommend (and why)". La demo solo
sirve como referencia visual de funcionalidad / UX, no de
arquitectura.

**Cómo aplicar** cuando llegue el momento de cotizar Pieza 2:
- Recomendar stack libremente (lo natural sería extender el
  monorepo actual: Fastify + Next.js + Supabase ya está rodando
  y comparte tipos con Pieza 1).
- Citar la demo como "visión del cliente para roles, modulos y
  flujos", no como restricción técnica.

---

## 2. Miguel — sube `BubbleManager_be.accdb` — 2026-05-06

> Miguel adjuntó la base de datos Access que opera HOY las 5
> sedes, con un mensaje corto:

```
So today I was send the bubble the I have in access, is what we
use now for registration but I will like change into this new
one
```

Traducción: "Hoy te mando el Bubble que tengo en Access — es lo
que usamos ahora para registración, pero quiero migrar al nuevo
[refiere a la demo kimi.page del DPM Cloud]".

### Archivo recibido

- **Path**: `information/BubbleManager_be.accdb`
- **Tamaño**: 786,432 bytes (768 KB)
- **Tipo**: Microsoft Access Database (ACE format)
- **Versión**: ACE v3 (header `Standard ACE DB`, version byte `0x03`
  = Access 2007+)
- **Sufijo `_be`**: significa **back-end** (split database, solo
  datos — los formularios, queries y módulos VBA viven en el
  archivo `_fe.accdb` complementario que NO recibimos).

### Qué pude extraer

**Header binario (offsets 0x00-0x18):**

```
00000000: 0001 0000 5374 616e 6461 7264 2041 4345  ....Standard ACE
00000010: 2044 4200 0300 0000                       DB......
```

**Bytes 0x18-0x68: clave de cifrado RC4 / página 0 mask**.
El área de la clave NO está vacía (valores como `b56e 0362 6009
c255 e9a9 ...`) lo que indica que **el archivo está cifrado a
nivel de página** con la encriptación por defecto de Office para
ACCDB. Esto explica por qué los parsers JS estándar (mdb-reader
2.x y 3.x) fallan con `Wrong page type. Expected 1 but received
0` — están intentando leer páginas todavía cifradas.

**Strings extraíbles (`strings` Unix):** 407 cadenas, la mayoría
**ofuscadas con un cifrado de transposición posicional** que usa
Access internamente para nombres de objetos en el catálogo. No es
RC4 pero requiere implementar la decodificación de tabla del
catálogo (no trivial sin la spec privada). De las cadenas
"limpias" que se asoman puedo intuir nombres de tablas con
sentido de negocio:

  • Customer (`Mokmd`Qi`)        • Course (`MdoikQ`)
  • CourseType (`MdoikQmvfQ`)    • Business (`LokYbQkk`)
  • BusinessPayable + Payment    • Boat / BoatList / BoatTime
  • CashFloat / CashTill         • Country
  • Equipment / Instructor       • Stages / Reports / Scripts

Esto es CONSISTENTE con la demo de DPM Cloud que mandó horas
antes (mismas entidades: Customer, Course, Instructor, Boat,
Payments). Confirma que la demo es una proyección directa de
este schema legacy.

### Qué NO pude extraer

- **Schema completo** (tipos, longitudes, FKs, índices)
- **Datos de filas** (registros reales)
- **Módulos VBA** — están en el `_fe.accdb` que no tenemos
- **Forms / Queries** — idem `_fe`

### Para hacer un análisis completo necesito UNO de:

1. **El password** del archivo (si lo tiene) → mdb-reader o
   Java/jackcess pueden leer páginas cifradas con la clave.
2. **Un export sin cifrado**: Miguel abre el .accdb en Access,
   "Database → Compact and Repair → Save As" desactivando
   el cifrado, y nos manda esa copia.
3. **CSV por tabla**: solución más simple — Miguel hace
   "External Data → Export → Text File" para cada tabla
   relevante. Es lo más rápido para Pieza 2.
4. **Permitir descargar Java/jackcess** (la herramienta abierta
   estándar para leer .accdb desde Linux). Necesita aprobación
   explícita del usuario porque implica ejecutar JAR externo.

### Re-análisis 2026-05-06 — Miguel confirma que NO puso password

Con esa nueva info volví a auditar el archivo y descubrí lo
siguiente:

**El archivo NO está cifrado.** Lo que parecían "bytes de clave
RC4" en 0x18-0x68 son metadatos del header de ACE en plano. La
prueba: las páginas siguientes (0x1000, 0x2000, 0x4000…) tienen
**page-type bytes legibles** (0x01 = data page, 0x02 = global
page) — si estuviera cifrado, ese byte sería aleatorio.

Lo que rompe a `mdb-reader` es la **ofuscación del catálogo
MSysObjects** de Access (los nombres de tablas), no encriptación.
Es una sustitución posicional que Microsoft documenta en
[MS-ACCDB] pero que mdb-reader 2.x y 3.x no implementan
correctamente para esta versión específica del schema.

**Recovery por inspección manual del cipher.** Comparando
patrones obvios (sufijos como `Type`, `Payment`, etc.) pude
decodificar la mayoría de los nombres de tabla. Resultado:

#### Tablas detectadas (por dominio de negocio)

**Clientes y cursos**

| Tabla | Función probable |
|-------|------------------|
| Customer | Maestra de clientes/alumnos (nombre, contacto, país, idioma, prefijo telefónico) |
| Course | Inscripción de un alumno a un curso específico |
| CourseType | Catálogo de tipos de curso (OW, AOW, Rescue, DM, etc.) |
| CourseTimeline | Etapas/cronograma de un curso (theory, confined, ow12, ow34) |
| CourseTypeActivity | Mapping de qué actividades incluye cada curso |
| RaidCourses | Cursos de la agencia RAID (alternativa a PADI/SSI) |
| StudentStatus | Estado del alumno (active, completed, lost, etc.) |
| State | Status enums |
| Stages | Etapas del cronograma de curso |

**Negocios financieros (cuentas por cobrar/pagar)**

| Tabla | Función probable |
|-------|------------------|
| Business | Empresas (proveedores / clientes corporativos) |
| BusinessPayable | Cuentas a pagar a empresas |
| BusinessPayablePayment | Pagos hechos contra esas cuentas |
| BusinessReceivable | Cuentas a cobrar de empresas |
| BusinessReceivablePayment | Pagos recibidos contra esas cuentas |
| Payment | Transacciones de pago (alumno) |
| PaymentType | Catálogo (efectivo, Wise, transferencia, tarjeta…) |
| OutPayment | Pagos salientes (a instructores, proveedores) |
| OutPaymentSubtype, OutPaymentType | Sub-clasificación |
| WalkInPayment | Pagos de cliente walk-in (sin reserva previa) |
| Refund | Reembolsos |
| Advances | Adelantos a empleados |
| BankDeposit, BankWithdrawal | Caja contra banco |
| CashFloat | Fondo fijo de caja |
| CashTill | Operación diaria de caja |

**Operación de la sede**

| Tabla | Función probable |
|-------|------------------|
| Boat, BoatList, BoatTime | Flota + horarios de salida |
| DiveSite, DiveLevel, DiveOrg | Sitios de buceo, niveles, organizaciones (PADI/SSI/RAID) |
| Session | Sesión de buceo/teoría |
| Activity | Tipos de actividad (entrenamiento, fun dive, etc.) |
| Tour, TourType | Tours / paquetes |
| Country, QuickCountry | Catálogo ISO de países (200+ entradas, **plenamente legibles**) |
| Language | Idiomas hablados |
| HowHear | Origen del cliente (Google, friend, walk-in…) |
| WhereStay | Hotel / alojamiento del cliente |
| Room | Habitaciones (de la escuela?) |

**Equipamiento (gear catalog & inventory)**

| Familia | Tablas |
|---------|--------|
| Catálogo de estilos | StylesBCD, StylesBoot, StylesComputer, StylesFin, StylesMask, StylesRegulator, StylesWetsuit |
| Inventario por unidad | idsBag, idsBCD, idsBoots, idsComputer, idsFins, idsmask, idsregulator, idswetsuit |
| Otros | Equipment, TankPrice, TankType |

**Personal / staff**

| Tabla | Función probable |
|-------|------------------|
| EmployeeRole | Roles (instructor, manager, owner, reception) |
| Vendor | Proveedores |
| ShopDuty | Asignación de turnos del equipo |
| SystemShop | Configuración de la sede en sí |

**Certificación / agencias**

| Tabla | Función probable |
|-------|------------------|
| PadiCert | Certificados PADI emitidos |
| PadiCourseType | Mapeo curso ↔ tipo PADI |
| PadiManual | Material PADI |
| VerifiedCerts | Certificados verificados de cliente que llega ya certificado |

**Retail / shop**

| Tabla | Función probable |
|-------|------------------|
| RetailItem, RetailItemType, RetailSale | Tienda física (camisetas, gear nuevo) |
| TaxCompany, TaxInvoice, TaxInvoiceType | Facturación con IVA |

**UI / config**

| Tabla | Función probable |
|-------|------------------|
| GlobalSettings, LocalSettings | Configuración general y por sede |
| HideFields, HideTables | Visibility flags por rol |
| RegisterFormField, RegisterFormSection | Configuración del form de registro (kiosk del alumno) |
| QuickButton | Atajos UI |
| SignInFormColor | Branding del form de check-in |
| Feature | Feature flags |
| VersionInfo | Tracking de versión del schema |

**Calendario (dimension tables)**

| Tabla | Función probable |
|-------|------------------|
| tblDay, tblMonth, tblYear | Tablas de fecha pre-pobladas |
| Ampm | AM/PM enum |

**Sistema interno**

| Tabla | Función |
|-------|---------|
| DailyBackup | Job de respaldo (Access tradicional) |
| Data | Genérica |
| Query1, Query2, Query3 | Queries guardadas (Access "queries" persistentes) |
| MSys* | System tables de Access (catálogo interno) |

**Total decodificado**: ~70 tablas de usuario + ~10 tablas de
sistema. Comparado con la demo de DPM Cloud (que mostraba ~15
entidades), este schema legacy es **3-4x más detallado** —
incluye toda la operación de retail, IVA, gear inventory por
unidad, payroll de empleados, banca, etc.

#### Datos en plano que pude leer

Las strings al final del archivo NO están ofuscadas (son
contenido de filas, no nombres de objetos):

- **Country** (~200 filas): nombre + código ISO-3 ("Indonesia
  (IDN)", "Thailand (THA)", "Spain (ESP)"…)
- **Activity / DiveSite hints**: "Confined", "Snorkeling",
  "ECO Dive", "Sail Rock", "Night", "Afternoon", "Morning"
- **BookingType**: "Booking", "Walk-In"

> ⚠️ Nota: "Sail Rock" es un dive site icónico de **Koh Tao**,
> no de Gili Trawangan. Eso indica que **este archivo es la
> base de Koh Tao** (la sede más antigua y posiblemente la que
> originó el sistema), no de Gili Trawangan ni una unión de las
> 5 sedes. Útil para Pieza 2: probablemente cada sede corre su
> propio `_be.accdb` separado y "DPM Cloud" tiene que
> consolidar 5 schemas idénticos en uno multi-tenant.

#### Lo que sigue sin extraer

Aún sin tener el `.accdb` desencriptado / mdbtools / jackcess,
**no pude obtener**:

- Definición exacta de columnas (tipos, longitudes, default,
  NOT NULL)
- Foreign keys e índices
- Cantidad de filas por tabla
- Datos reales de Customer / Course / Payment (números, fechas)
- **Módulos VBA** — están en el archivo `_fe.accdb` complementario
  que NO recibimos (ahí vive payroll, comisiones de co-teaching,
  state machine del alumno — la lógica de negocio MÁS valiosa).

#### Para llegar al 100%

Sigue siendo necesario UNO de:

1. **`_fe.accdb` complementario** (frontend con queries, forms,
   módulos VBA) — pedir a Miguel.
2. **CSV export por tabla** (`External Data → Export → Text File`
   en Access) — 5 minutos para Miguel, da estructura + datos sin
   tocar archivo binario. **Recomendado para cotización Pieza 2**.
3. **Permitir descarga del JAR de jackcess** desde Maven (sandbox
   actualmente bloquea esto por seguridad — necesita autorización
   explícita del usuario).

Para fines de cotización Pieza 2, el inventario de tablas
extraído es **suficiente** para estimar alcance. Para
implementación fiel hace falta el `_fe.accdb` o CSVs.

### Implicancias para Pieza 1 (deadline 2026-05-11)

**Cero**. El archivo es exclusivamente input de Pieza 2. Para el
piloto Gili Trawangan ya tenemos toda la información que
necesitamos en `information/*.md` (ver sección 3 abajo).

### Implicancias para Pieza 2 (cotización pendiente)

- El schema legacy es la guía funcional, pero **no necesitamos
  migrar datos** (Miguel ya lo aclaró antes: "No data migration
  needed. Start clean from day 1 of launch").
- La estructura visible refuerza decisiones de modelo previo:
  Customer es entidad central, Course es state-machine con
  stages, Boat/BoatTime es agenda independiente, Payment se
  separa en cashfloat/till local + business payable global.
- Los módulos VBA (que el `_fe.accdb` contiene y no tenemos
  todavía) son la pieza más valiosa para cotización fiel —
  payroll, comisiones de co-teaching, retail commission.
  **Pedir el `_fe.accdb` en algún momento de la cotización**.

---

## 3. ⚠️ Hallazgo crítico — la KB de Pieza 1 ya estaba en `information/`

Mientras analizaba el `.accdb` descubrí que el directorio
`information/` contiene contenido subido por el cliente el
**2026-05-04** (hace dos días) que cubre **TODO** lo que en
mensajes anteriores le dije al usuario que faltaba pedirle a
Miguel. Esto es un error mío: nunca leí esos archivos.

| Archivo | Líneas | Cubre |
|---|---|---|
| `00_SYSTEM_PROMPT.md` v1.1 | 198 | System prompt completo del agente "John" — identidad, idioma, primer mensaje, calificación, lógica horaria, días que ocupan barco por programa, política de depósito, citaciones |
| `KB01_programas_precios.md` | – | 8 programas con IDs estables (try-scuba, scuba-diver, ow-course, ow30-course, advanced-course, refresh-course, refresh-advanced-combo, fun-dive) + horarios + precios + ganchos |
| `KB02_dive_sites.md` | – | Shark Point AM, Bounty Wreck, Turtle Heaven PM, Halik, night dive, lógica de selección |
| `KB03_payments.md` | – | **Política de depósito + cuentas bancarias EUR/GBP/AUD/USD/IDR + bloques listos para copiar + alerta IBAN + flujo de confirmación** |
| `KB04_sales_patterns.md` | – | Ganchos, frases de cierre, manejo de objeciones (SSI vs PADI, precio, refresh, no-reembolso, descuento, Bizum) |
| `KB05_operational_rules.md` | – | Horarios, grupo mixto, ferries, equipamiento, menores, certificaciones, condiciones médicas, clima |
| `KB06_roster_integration.md` | – | Spec técnica de integración con Apps Script (lo que ya implementamos) |
| `INSTRUCCIONES_PAGO_GiliTrawangansteve.md` | – | **Spec técnica del tool `solicitar_deposito`**: formato de código `DPM-XXXXXX`, OCR + validación humana, tabla de prefijos telefónicos, bloques bancarios, estados del lead, mensajes del AI, schema de DB sugerido |
| `FEW_SHOTS_GiliTrawangan.md` | – | 21 secciones / 8 conversaciones reales anonimizadas como few-shots aprobados |

**Estado de carga en producción**:
`packages/db/src/seed-content.ts` existe — es el seeder que lee
`information/*.md` y los upserta en:
- `prompts_versiones` (system prompt + few-shots concatenados)
- `kb_documents` + Supabase Storage (KB01..KB06 concatenados como
  blob KB activo de Gili Trawangan, path
  `gili-trawangan/v1/kb-bundle.md`)

**Pendiente verificar**: si este seeder se corrió contra la DB
de producción (Supabase). Si no se corrió, el AI en Railway está
operando con un system prompt y KB vacíos/placeholder y por eso
nuestras respuestas anteriores serían genéricas. **Esta es LA
tarea bloqueante para el lanzamiento del lunes**, no las
"informaciones que faltan pedirle a Miguel" como dije antes.

**Verificado el 2026-05-07**: el seeder corrió correctamente, KB
+ system prompt están cargados en prod (hashes f3f23cfc0cd6 y
c88ef9cbfc42).

---

## 4. Miguel — sube `BubbleManager_fe.accdb` — 2026-05-07

> Miguel mandó el front-end del split database — el archivo que
> contiene formularios, queries, reports y módulos VBA. Es la
> capa con la lógica de negocio operativa real.

### Archivo recibido

- **Path**: `information/BubbleManager_fe.accdb`
- **Tamaño**: 6,029,312 bytes (5.75 MB) — **8x el `_be`**
- **Tipo**: Microsoft Access ACE v3 (Access 2007+), no encriptado
- **Sufijo `_fe`**: front-end. Los módulos VBA, formularios y
  queries SQL viven todos acá.

### Strings extraídas

| Categoría | Cantidad | Notas |
|-----------|----------|-------|
| Strings totales | 49,667 | _be tenía 407 — diferencia de **120x** |
| Strings únicas a `_fe` | 21,424 | el resto coincide con tablas/columnas referenciadas |
| **Formularios** (`frm*`, `Form_*`) | **143 únicos** (~130 dedup case-insensitive) | toda la UI |
| **Botones** (`btn*`) | 174 | acciones discretas |
| **Labels** (`lbl*`) | 84 | campos visibles |
| **Reports** (`rpt*`) | 14+ | impresiones legales |
| **Queries SQL embebidas** (SELECT/UPDATE/INSERT/DELETE) | **521** | la mayoría de la lógica vive en SQL |

### Inventario de formularios por dominio (~130 pantallas)

**Clientes**
frmCustomer, frmCustomers, frmCustomerSimple, frmCustomersSub,
frmAddOnlineCustomers, frmFinishCustomers, frmAddBooking

**Cursos y certificación**
frmCourse, frmCourses, frmCourseSub, frmCourseType,
frmCourseTimeLine, frmCourseTimeLineSub, frmCourseTypeActivity,
frmReviewCourse, frmAddNewClass, frmDivePADI, frmDiveRAID,
frmDiveSSI, frmDiveLevelR, frmDiveSite, frmConEdMatch,
frmRAIDDisclaimer, frmMissingCert, frmSisterShopUpload

**Operación día a día**
frmEndOfDay, frmShopDuty, frmActivity, frmTours, frmTourTypes,
frmBoat, frmBoatList, frmBoatListSub, frmBoatTimer,
frmAccomodationReport, frmAccomodationSub

**Pagos / facturación**
frmPayment, frmPaymentType, frmPaysheet (payroll output!),
frmBank, frmBankDeposit, frmBankWithdrawal, frmRefund,
frmAdvances, frmAdvancesSub, frmWalkInPayment, frmRoctoInvoices,
frmTaxCompany, frmTaxCompanyR

**Cuentas con empresas**
frmBusinessBulkPay, frmBusinessPayableAdd,
frmBusinessReceivableAdd, frmEditBusiness, frmIncomeExpenseCategory

**Equipamiento (catálogo + inventario por unidad)**
frmStylesBCD, frmStylesBoot, frmStylesComputer, frmStylesFin,
frmStylesMask, frmStylesRegulator, frmStylesWetsuit,
frmIdsBag, frmIdsBCD, frmIdsBoots, frmIdsComputer, frmIdsFins,
frmIdsMask, frmIdsRegulator, frmIdsWetsuit, frmTankPrice,
frmTankTypes, frmRetailItem, frmRetailItemEditor,
frmRetailItemFinder, frmRetailItemType, frmRetailSale,
frmEquipmentSub

**Personal / agencias**
frmEmployeeRole, frmAgent, frmAgentReport, frmVendor

**Configuración / utilidades**
frmGlobalSettings, frmLocalSettings, frmSettings,
frmEmailSettings, frmRegisterFormSections, frmHowHear,
frmHowHearReport, frmPassword, frmTerms, frmThankYou,
frmCannotConnect, frmDatabaseTools, frmBackupManager,
frmQuickButton, frmQuickCountry, frmCountry, frmLanguage,
frmRoom, frmWhereStay, frmEditor, frmImageEditor,
frmEmailReport, frmSwitchboard (menú principal)

**Reports (impresiones legales y resúmenes)**
rptDailyReport, rptCustomerInvoice, rptPaymentReceipt,
rptPaymentLedger, rptPaymentsIn, rptBalanceReport,
rptBusinessReceivable, rptBreakdownReport, rptAgentReport,
rptAccomodationReport, rptHowHearReport, rptFullReport,
rptPhoenixCheckIn, rptRoctoInvoices

### Lógica de negocio descubierta (extraída de SQL embebido)

#### 1. Comisión de instructor con co-teaching split (la pieza más delicada)

Encontrada literalmente en una query interna:

```sql
IIF(InstructorID = AssignedInstructor2ID,
    InstWage * Inst2Percent,
    IIF(InstructorID = AssignedInstructor3ID,
        InstWage * Inst3Percent,
        InstWage * (1
                    - IIF(IsNull(Inst2Percent), 0, Inst2Percent)
                    - IIF(IsNull(Inst3Percent), 0, Inst3Percent))
    )
) AS myInstWage
```

Comportamiento:
- Cada curso permite **un instructor principal + hasta 2 co-teachers**
  (`AssignedInstructor2ID`, `AssignedInstructor3ID`).
- Inst 2 e Inst 3 reciben un porcentaje del salario base del curso
  (`Inst2Percent`, `Inst3Percent`).
- El instructor principal se queda con `1 - Inst2% - Inst3%`.
- Si solo hay 1 co-teacher, el resto va al principal automáticamente.
- NULLs en porcentajes se tratan como 0.

**Esta fórmula hay que clonarla EXACTAMENTE en DPM Cloud.**
Cualquier desviación se traduce en pago erróneo a personal.

#### 2. DMT (Divemaster Trainee) excluido de comisiones

```sql
WHERE DoNotCountToCommission = False AND IsDMTCourse = False
```

- `IsDMTCourse` por curso → si true, los co-teachers no
  generan comisión por ese alumno.
- `DoNotCountToCommission` flag adicional para casos especiales.
- Existe rol `EmployeeRole = 'Dmt Mentor'` con conteo separado.

#### 3. Retail commission por SKU

Cada `RetailItem` tiene su propio campo `Commission` y un
`SalesPersonID` (linkado a Instructor). La query inserta en
`Payment` con esa comisión calculada por venta. **No hay ratio
global** — es por SKU.

#### 4. State machine del alumno

Tabla `StudentStatus` mapea `StudentStatusID → studentstatus`
(string "Certified", "In Progress", etc.). El sentinel `-1` se
usa como "no asignado".

#### 5. Integración PADI Online (PIC Online) — área de riesgo

URLs hardcodeadas en el VBA:

```
https://apps.padi.com/Pros/PICOnline/Account/TempCardBatchQueue
https://apps.padi.com/Pros/PICOnline/POLCommon/GetPhotoByNBK?...
https://apps.padi.com/Pros/PICOnline/POLCommon/GetPhotoByIDView
https://apps.padi.com/.../pic-processing-report/Default.aspx
```

El último es **scraping con form-encoded POST** — PADI no tiene
API abierta, así que el sistema simula sesiones de browser. Esto
va a ser la pieza **más dolorosa de migrar** a la versión cloud
y depende del acceso PADI de DPM.

#### 6. Stack VBA / librerías importadas

- **VBA-JSON** (Tim Hall, github.com/VBA-tools/VBA-JSON)
- **VBA-UtcConverter** (Tim Hall) — manejo de timezone
- **MSXML / WinHTTP / Microsoft.XMLHTTP** — clientes HTTP
- **Allen Browne utility code** (allenbrowne.com)

### Mensajes de error / UI strings (sample)

```
"Already Certified! Continue with rest of class?"
"Already Registered"
"Cannot Assign Instructor!"
"Cannot connect to internet. Please check the internet connection."
"Could Not Upload Photo"
"Error. Database not backed up"
"BAD ID: <FirstName> <LastName>: <ascii>, <memberID>, <RAIDcode>"
```

UI principal está en inglés.

### Implicancias para la cotización Pieza 2

#### Estimación de alcance

- **130 formularios** → 130 vistas en DPM Cloud
- **174 botones** → ~50-80 server actions / mutations después de
  deduplicar
- **521 SQL queries** → ~200-300 endpoints/queries únicas en
  Drizzle/Postgres después de dedup
- **PADI integration**: módulo aparte, complejo
- **Comisiones (co-teaching + DMT)**: módulo crítico
- **Retail commission por SKU**: módulo aparte
- **Reports legales** (Rocto, comprobantes): mantener formato exacto

#### Áreas de riesgo identificadas

1. **PADI scraping**: pedir a Miguel las credenciales PADI bajo
   NDA cuando empiece la cotización.
2. **Comisiones**: la fórmula `IIF(...)` con NULLs implícitos —
   pedir a Miguel walkthrough de edge cases.
3. **Sister-shop sync** (`frmSisterShopUpload`): walkthrough
   con Miguel sobre datos cruzados (instructor que rota entre
   sedes).
4. **Inventario por unidad** (`idsBCD`, `idsRegulator`, etc.):
   confirmar con Miguel si lo quiere conservar item-level.

#### Estimación preliminar Pieza 2 (full-time dev)

| Bloque | Semanas |
|--------|---------|
| MVP funcional (cliente + curso + pago + barco + agenda) | 4-6 |
| Comisiones + payroll completo (co-teaching, DMT, retail) | 2-3 |
| PADI integration (depende del acceso) | 2-3 |
| Reports + facturación legal | 2-3 |
| Multi-sede + sister-shop sync | 1-2 |
| QA + paridad funcional vs Bubble | 3-4 |
| **Total preliminar** | **14-21** |

~3.5-5 meses full-time. **Pieza 2 es claramente un contrato
separado del actual de $4,800.**

### Lo que sigue sin extraer

- **Código VBA fuente completo**: Access compila a P-code; legible
  solo al abrir con Office (Windows) o usando `oletools` (Python).
  Para cotización lo extraído por strings es suficiente.
- **Estructura de relaciones** (FKs, ON DELETE, índices) — visible
  solo desde dentro de Access.
- **Form layouts / orden de campos** — útil para clonar UX, no
  crítico para cotización.
- **Reports template / paper layout** — relevante solo para
  reports legales (Rocto invoices, customer invoices).
