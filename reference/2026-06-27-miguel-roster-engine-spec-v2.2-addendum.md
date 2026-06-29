# DPM DIVING — Roster Engine — Addendum a la Spec Funcional v2.1

**Para:** Steve (Dev)
**De:** Papu (Miguel)
**Fecha:** 27/06/2026
**Versión:** 2.2 (addendum)
**Estado:** recibido, pendiente de incorporar a v2.2

---

## 0. Contexto

Revisé el avance del roster engine en el Comando Central — la página de Instructores (plantel, idiomas, activo/inactivo, la grilla de disponibilidad de 30 días con AM/PM/POOL/NIGHT) y la página de Roster (engine) (vista por instructor por día, formulario de walk-in con Slot / Nivel / Activity / acepta capar). La estructura va exactamente para donde la describe la spec, y el footer del gate ("si no hay instructores… las ventas van a quedar bloqueadas") ya es el comportamiento correcto.

Pensando cómo corre esto en la operación real del día a día, encontré una serie de faltantes. Ninguno cambia la dirección del motor — cierran huecos que recién aparecen cuando el staff carga y edita buceadores día tras día. Los listo abajo como requisitos concretos, cada uno atado al modelo de la v2.1 para que encajen en lo que ya estás construyendo.

*Un principio transversal atraviesa casi todo esto (ver §6): toda acción que toque un buceador, un instructor o un grupo tiene que volver a correr la validación. Ningún cambio de estado en silencio.*

---

## 1. Divemaster como rol distinto (no solo otro nombre en la lista)

La spec v2.1 trata a "instructores disponibles" como una bolsa única e indiferenciada. En la realidad hay dos roles con permisos distintos, y el motor tiene que distinguirlos:

- *Instructor* — puede llevar cualquier cosa: cursos (BD / OW1 / OW2 / OW3 / AA / AA2 / ADV / SP / RES) *y* fun dives (FD / REF-fase-2).
- *Divemaster (DM)* — puede guiar *solo fun dives* (cualquier buceador certificado: FD, y REF en fase 2). Un DM *no puede* dictar ningún curso.

Esto cambia la matemática de capacidad. El matching grupo → recurso tiene que ser consciente del rol:

| Tipo de grupo | Lo puede cubrir |
|---|---|
| Cualquier grupo de curso (pool_inicial, mar_12m, ow_18m, profunda, dedicado_sp, dedicado_res) | *Solo instructor* |
| Grupo de fun dive (fundive_<prof>, incluyendo REF fase 2) | *Instructor O Divemaster* |

*El orden de asignación importa:* cuando el motor asigna recursos a un slot, debería llenar los grupos de fun dive con *DMs primero*, para reservar instructores para los grupos de curso. Si no, un DM se "gasta" en un curso que el motor no debería haber permitido, o un instructor se quema en un fun dive cuando había un DM libre.

*Por qué esto es un requisito de seguridad, no solo optimización:* si el DM se agrega como un nombre genérico en la lista de instructores, el motor va a gatear felizmente la venta de un curso contra un DM. Ese es el mismo tipo de error que ofrecer un buceo a un no certificado — deja que un recurso no calificado libere una venta que debería bloquear. El rol tiene que ser una restricción dura en la lógica de matching.

*Una decisión que necesito definir antes de que construyas:* REF fase 1 (repaso de skills en pileta) — ¿solo instructor, o lo puede correr un DM? Default a *solo instructor* salvo que diga lo contrario.

Datos: el registro del instructor (ya está en la página de Instructores) necesita un *campo de rol* (instructor / divemaster). La grilla de disponibilidad queda igual; solo se agrega el tag de rol.

---

## 2. Asignar instructor/DM en la carga del walk-in — y descontar ambos recursos

El formulario de walk-in ya captura Slot / Nivel / Activity / acepta capar. Agregar la capacidad de *asignar el instructor o DM en el momento de cargar el walk-in*, para que el guardado descuente inmediatamente ambos:

- *el lugar del instructor/DM* (recurso primario), y
- *el lugar del barco/sitio* (recurso secundario).

La lógica del descuento doble ya existe en el motor (v2.1 §6 valida instructor primario, barco/sitio secundario) — esto es cablearla en el camino de carga manual, para que un walk-in consuma capacidad exactamente igual que una venta de la IA.

*El filtro por rol también aplica acá (se conecta con §1):* el desplegable de instructor/DM en el formulario de walk-in tiene que estar *filtrado por el tipo de grupo*, o rechazarse al guardar. No puede dejar al staff poner un DM en un grupo de curso. Si no lo forzamos acá, reabrimos el hueco del §1 por la puerta manual.

*Al guardar, volver a correr la validación* (ver §6): cargar un walk-in tiene que pasar los mismos chequeos de grupo/ratio/profundidad/instructor que una venta de la IA. Si el walk-in no entra (sin instructor, ratio lleno, sitio lleno), el formulario bloquea y dice por qué.

---

## 3. Botón de borrar para errores de carga

El staff va a cargar buceadores mal (slot equivocado, actividad equivocada, duplicado). Tiene que haber una *acción de borrar* sobre un buceador cargado. Dos requisitos:

- *Al borrar, recalcular la capacidad* — liberar el lugar de barco/sitio y el lugar de instructor/DM que el buceador estaba consumiendo, para que la capacidad liberada vuelva a ser vendible. (Es el principio de revalidación del §6 aplicado a la eliminación.)
- *Dejar rastro* — preferir un soft-delete o un registro en log antes que un borrado total, para que un buceador eliminado se pueda auditar después si los números no cierran. Un buceador que desaparece sin registro es peor que el error original.

---

## 4. Cambiar el instructor asignado — por parte del programa o todo el programa

El staff necesita reasignar instructores después de cargar (motivo más común: idioma — un grupo de hispanohablantes necesita un instructor que hable español). Hay *dos operaciones distintas acá, y no son lo mismo* — esta distinción es crítica para la implementación:

*A) Cambiar el líder de un grupo entero (instructor A → instructor B).*
Es un swap de nombre. Mismo grupo, mismo ratio, misma capacidad — el motor *no* recalcula el agrupamiento. Es el caso del cambio por idioma. Igual debería verificar que el instructor/DM entrante tenga el *rol correcto* para ese grupo (§1) y esté disponible ese día, pero no re-agrupa nada.

*B) Mover a un buceador a otro instructor/grupo.*
Esto es re-agrupar. Puede romper el ratio, la capacidad o el rol del grupo destino. Esto *tiene que revalidar* el grupo destino — no es un swap libre.

Y la dimensión que quiero explícita, en ambos casos:

- *"Todo el programa"* = cascada del cambio sobre *todos los días* que ocupa el programa de ese buceador (un OW = OW1 + OW2 + OW3 en días distintos). El instructor/DM destino tiene que estar disponible y ser válido en *cada uno de esos días*, o el cambio se rechaza.
- *"Una parte del programa"* = un solo día.

Así que la UI de reasignación necesita dejar elegir al staff: este día, o todo el programa. La operación A (swap de líder de grupo entero) es la segura. La operación B (mover un buceador) tiene que correr validación. No tratar a las dos como un swap simple — B sin revalidación es donde se cuelan la sobreventa y los ratios rotos.

---

## 5. Consolidar la operación del día en una sola vista (pero mantener la config aparte)

Hacer que la *operación del día* sea cohesiva en una sola pantalla, para que se lea como el Sheet:

- roster agrupado por instructor (por slot),
- carga de walk-in *inline* en la misma pantalla,
- una tira compacta de *quién está disponible hoy* (instructores + DMs, con el rol visible).

*Mantener aparte* las cosas que son configuración, no operación diaria: la *grilla de disponibilidad de 30 días* y las *capacidades por defecto* (la página de capacidad del Roster). Eso son pantallas de set-up, no la vista operativa. Plegar todo en una sola página hace la pantalla diaria ruidosa e invita a errores. El objetivo es una pantalla operativa limpia desde la que trabaja un dive manager, con la config a un click — no una sola página con todo apilado.

---

## 6. Transversal: revalidar en cada acción que cambie estado

Esta es la regla que ata el §2–§4 y la que más quiero que se haga cumplir. *Cualquier acción que cambie quién bucea, qué hace, o quién lo lleva tiene que volver a correr la validación del motor* (grupo / ratio / profundidad / rol / disponibilidad de instructor / capacidad del sitio). Ninguna acción debería mutar estado en silencio y dejar el roster en una configuración que el motor habría rechazado.

Concretamente, la validación tiene que dispararse en:

- cargar un walk-in (§2),
- borrar un buceador (§3) — recalcular la capacidad liberada,
- mover un buceador entre grupos (§4-B),
- agregar o quitar un instructor/DM del día (ya en v2.1 — cambia la capacidad),
- asignar o cambiar un líder (§4-A) — verificar rol + disponibilidad.

La única acción que *no* re-agrupa es el swap de líder de grupo entero (§4-A): mismo grupo, misma matemática, solo verificar el rol y la disponibilidad del recurso entrante.

El failure mode contra el que me estoy protegiendo: una edición manual que deje un grupo sobre ratio, un curso gateado por un DM, o un lugar vendido sin instructor válido — nada de lo cual el motor produciría jamás por sí solo, pero una edición a mano sí puede. Revalidar en cada acción cierra ese hueco.

---

## 7. Control de concurrencia en la validación de venta (la carrera de ventas simultáneas)

Esta es la que más quiero que se confirme explícito. El escenario: dos ventas validan contra el *último lugar libre del mismo instructor en el mismo instante*. Las dos leen "queda 1", las dos cierran, y sobrevendimos — un cliente aparece y no hay instructor. Como la IA cierra ventas sola por WhatsApp a cualquier hora, no hay un humano mirando una pantalla en ese instante, así que una alerta o pop-up de UI no puede atrapar esta carrera — para cuando alguien lo ve, las dos ventas ya cerraron. El arreglo tiene que vivir en la lógica del server, no en la UI.

*Requisito:* la validación de cupo/instructor tiene que ser *atómica* — un lock o una transacción serializada para que dos validaciones simultáneas no puedan reclamar las dos el mismo lugar. La primera venta toma el lugar dentro de la transacción; la segunda recién lee después de que la primera comitea, ve que no queda lugar, y bloquea. El chequear-y-reclamar tiene que ser una sola operación atómica, no un leer-después-escribir con un hueco en el medio.

Esto aplica a todo camino que reclame un lugar — venta de la IA y walk-in manual por igual. Ambos consumen la misma capacidad, así que ambos tienen que pasar por el mismo reclamo atómico.

*Pregunta a confirmar:* ¿la validación de cupo ya usa un lock / transacción atómica para que dos ventas concurrentes no puedan tomar el mismo lugar? Si sí, esta sección es solo confirmación. Si hoy es leer-después-escribir, este es el hueco a cerrar antes de ir en vivo, porque ninguna alerta ni colchón aguas abajo puede arreglar una carrera de tiempo — solo la atomicidad la previene.

Dos capas operativas se apoyan encima de esto, pero son mitigaciones, no el arreglo — el reclamo atómico es lo único que previene la carrera:

- *Alerta de capacidad baja* (preventiva): avisar al staff cuando un slot queda con su último instructor del día, para que metan un freelance antes de que se llene. Útil en sí misma, sin relación con la carrera.
- *Recurso de reserva / Freelance1-3* (colchón): si una sobreventa llega a colarse, un freelance guardado significa que nadie queda en tierra. Ya está en la spec.

Las dos valen la pena, pero ninguna reemplaza el reclamo atómico. Orden de capas: el lock atómico previene la carrera → la alerta de capacidad baja previene quedarse corto → la reserva de freelance absorbe lo que igual se cuele.

---

## 8. Cómo mapea esto contra la v2.1

| Ítem del addendum | Ancla en v2.1 |
|---|---|
| §1 rol DM | extiende §5 "instructores disponibles por día" + §4.1 reglas de ratio |
| §2 asignar en walk-in + descuento doble | extiende §6.2 walk-in + §6 validación primaria/secundaria |
| §3 borrar | nuevo — necesidad operativa |
| §4 reasignar por parte/todo | extiende §6.3 (distinción swap vs. cambio de capacidad) a multi-día + movimiento de buceador |
| §5 vista operativa única | refina §8 Fase 4 UI |
| §6 revalidar en cada acción | endurece §6.1 validación en tiempo real en todos los caminos manuales |
| §7 concurrencia / reclamo atómico | endurece §6.1 contra ventas simultáneas compitiendo por el mismo lugar |

Ninguno de estos reabre la dirección del motor — cierran los huecos que aparecen una vez que el staff carga y edita buceadores a mano, día tras día.

---

## Notas de procesamiento (Steve, 2026-06-29)

Acción inmediata mientras no se planifica v2.2:

- **§7 (atomic claim)** es el único punto que requiere respuesta urgente — confirmar si el código actual de validación de cupo es read-then-write o transactional. Si es lo primero, es bug de producción crítico.
- **§1 (DM rol)** requiere migración de schema (`instructors.role: 'instructor' | 'divemaster'`) + branching en matching logic. Planificar como tarea aparte.
- §2–§6: incorporar a v2.2 spec definitiva antes de seguir construyendo la UI operativa.

No bloquea trabajo actual de Pieza 3 (AI/Respond.io) — afecta solo a roster engine UI + validación.
