# Plan — Página de captura de planilla (emular PLANILLAFINCA.xlsx)

**Estado:** Manifiesto completo + plan pendiente de 4 decisiones · **Fecha:** 2026-06-08
**Fuente:** `format/PLANILLAFINCA.xlsx` (785 KB, 5 hojas) — formato nuevo de los de campo.
**Bajo:** `docs/_THE_RULES.MD` + Dirty George (inspección real antes de planear).

> Objetivo (intención del usuario, verbatim): los de campo *"están dispuestos a
> darle una oportunidad"* a capturar datos **directo en la app**, saltándose el
> paso de teclear en xlsx, pero requieren una página que **"se vea y funcione
> exactamente como su formato xlsx"**.

---

## 1. Manifiesto del workbook (inspección real, no supuestos)

El workbook es un **pipeline manual de planilla completo**: captura → desglose →
costeo → pago. Cinco hojas:

### Hoja 0 — `DATA MANUEL FLORES` (CAPTURA) · `A1:W214` · 32 celdas combinadas · sin fórmulas
La hoja de **entrada manual**. Cuadrícula semanal:

- **Estructura por bloque de semana** (se apilan verticalmente):
  - Fila encabezado: `# | FECHA | <fecha por día>` — cada fecha combinada sobre 3
    columnas (ej. `C2:E2` = lunes). Días de lunes a sábado/domingo.
  - Fila sub-encabezado: `# | Trabajador | Lote | Actividad | Unidades` repetido
    por cada día.
  - Filas de datos: una por trabajador. Col `A` = # (1–39), col `B` = nombre,
    luego por día **3 columnas: Lote, Actividad, Unidades**.
- **5 bloques de semana detectados** (encabezados en filas 2, 45, 88, 131, 174):
  | Bloque | Semana | Días |
  |---|---|---|
  | 1 | Lun 13/04 – Sáb 18/04/2026 | 6 (L–S) |
  | 2 | Lun 20/04 – **Dom 26/04**/2026 | **7 (L–D)** |
  | 3 | Lun 27/04 – Sáb 02/05/2026 | 6 |
  | 4 | Lun 04/05 – Sáb 09/05/2026 | 6 |
  | 5 | Lun 11/05 – Mié 13/05/2026 | 3 (parcial) |
- Los días por semana **varían (6, 7 o parcial)**. El **7º día = domingo =
  "séptimo"** (código `SP`).
- ~**39 trabajadores** por bloque, en orden fijo (mismo roster cada semana).
- **NO hay validaciones de datos / listas desplegables en el xlsx** (0
  `dataValidation` en el XML). Lote y Actividad se **teclean a mano** como
  códigos (`CP`, `BE`, `MG`, `LL`, `RP`, `CASA`, `CANOA`, `CAÑADA`, `SAN
  EMILIANO`, `ARENERA`, `CRUZ 1`, `HACIENDA`…). **Esta es la raíz de la suciedad
  de datos.**

### Hoja 2 — `ACTIVIDADES` (CATÁLOGO) · `A1:D116` (17 filas con datos)
Mapa código → nombre → unidad → precio. **Fuente de verdad de los códigos del
finquero.** Las 17 entradas reales:

| Código | Nombre | Unidad | Precio (Q) |
|---|---|---|---|
| BE | BENEFICIO | DÍA | 75.00 |
| BN | BENEFICIO | DÍA | 75.00 |
| CA | CARBON | DÍA | 75.00 |
| CP | CAPORAL | DÍA | 100.00 |
| FE | FERTILIZACION | DÍA | 17.50 |
| FERIADO | FERIADO | DÍA | 75.00 |
| FG | APLICACION DE FUNGICIDA | DÍA | 75.00 |
| LL | LIMPIA LOTE | DÍA | 75.00 |
| MG | MANTENIMIENTO GENERAL | DÍA | 75.00 |
| HA | HACIENDA | DIA | 65.00 |
| MS | MANEJO DE SOMBRA | DÍA | 75.00 |
| SP | SEPTIMO | DIA | 75.00 |
| AH | AHOYADO | TAREA | 1.50 |
| RP | REPASO SOMBRA | DÍA | 75.00 |
| HERIDO | HERIDO | DÍA | 0.00 |
| DESCONOCIDA | DESCONOCIDA | DÍA | 0.00 |
| TZ | TRAZADO PARA SIEMBRA | DÍA | 75.00 |

- **No hay catálogo de Lotes** — los lotes se teclean libres (incluye no-lotes
  como `CASA`, `HACIENDA`, y hasta `MG`).
- ⚠ **Discrepancia con el catálogo de la DB de la app** (ej.: la app tiene
  `Repaso Poda`, aquí `RP = REPASO SOMBRA`; `BE = Beneficio Q75` aquí vs Q100 en
  la app; `MG = Mantenimiento General Q75` aquí vs Q0; `HA = Hacienda Q65` que la
  app no tiene). Requiere reconciliación (decisión §3 abajo).

### Hoja 1 — `DATA ORIGINAL` (DESGLOSE) · `A1:G1093` · 1092 fórmulas
La cuadrícula **des-pivoteada** a forma larga:
`FECHA | No. ASIGNADO | TRABAJADOR | LOTE | ACTIVIDAD | UNIDADES | NOMBRE ACTIVIDAD`.
Cols A–F son valores (copiados a mano del grid), col G = `VLOOKUP(código →
nombre)`. **Es exactamente la forma de nuestro `ActivityRecord`.** ~1092 filas
(~39 trabajadores × ~28 días).

### Hoja 3 — `PLANILLA` (COSTEO) · `A1:I653` · 1954 fórmulas
Líneas costeadas: `…NOMBRE ACTIVIDAD | CANTIDAD | COSTO POR UNIDAD | COSTO TOTAL`.
`NOMBRE = VLOOKUP(código, ACTIVIDADES, 2)`, `COSTO/UNIDAD = VLOOKUP(código, …, 4)`,
`COSTO TOTAL = cantidad × precio`. **Esto ya lo produce la app** (ActivityRecord +
precios con vigencia).

### Hoja 4 — `PAGOS` (PAGO) · `A1:H44` · 126 fórmulas
Nómina por trabajador: `TRABAJADOR | TOTAL | SEPTIMOS | DESCUENTOS | TOTAL A PAGAR
| BANCO | NUMERO DE CUENTA`.
`TOTAL = SUMIF(PLANILLA por trabajador, COSTO TOTAL)`, `SEPTIMOS = 75*2` (bono del
séptimo día), `TOTAL A PAGAR = TOTAL + SEPTIMOS − DESCUENTOS`. **Esto ya lo
produce la app** (PayrollEntry). El "séptimo" como bono de día de descanso aplica
cuando se trabaja el domingo (`SP`).

### Flujo del workbook
```
DATA MANUEL FLORES (captura grid)
  → DATA ORIGINAL (des-pivoteo a líneas)
  → PLANILLA (costeo vía ACTIVIDADES)
  → PAGOS (suma por trabajador + séptimos − descuentos)
```
**La app ya cubre DATA ORIGINAL→PLANILLA→PAGOS** (ActivityRecord, precios con
vigencia, PayrollEntry). Lo que falta es la **captura tipo grid** que reemplace
`DATA MANUEL FLORES` y escriba `ActivityRecord`s.

---

## 2. Encuadre del problema

La página a construir = **emular la hoja de captura `DATA MANUEL FLORES`**: una
cuadrícula semanal donde, por trabajador y por día, se captura **Lote · Actividad
· Unidades**. Al guardar, cada celda llena se des-pivotea a un `ActivityRecord`
(reutilizando lo ya construido: resolución de código→actividad, precio por fecha
de trabajo, dedup, árbol de resolución para códigos nuevos). Es, en esencia, **el
inverso del import .xlsx**: en vez de subir el archivo, llenan el grid en la app.

> Tensión clave a resolver (preguntas abajo): "que se vea y funcione **exactamente**
> como el xlsx" vs. (a) usabilidad en celular, (b) reemplazar el tecleo libre de
> códigos por desplegables que evitan la suciedad — que es justamente el objetivo
> de salir del xlsx.

---

## 3. Decisiones confirmadas (Jorge, 2026-06-08)

| # | Tema | Decisión |
|---|------|----------|
| 1 | Dispositivo | **Escritorio/laptop** → cuadrícula semanal ancha y fiel (filas = trabajadores, columnas = días × Lote/Actividad/Unidades). |
| 2 | Inputs | **Desplegables / autocompletar** para Lote y Actividad (código + nombre); códigos desconocidos → árbol de resolución. (No tecleo libre — se evita la suciedad.) |
| 3 | Catálogo | **`ACTIVIDADES` es la fuente de verdad** de códigos y precios. Reconciliar el catálogo de la app con un reporte de diferencias para revisión **antes** de cambiar nada. |
| 4 | Roster | **Precargar trabajadores activos** como filas, editable por semana (agregar/quitar/reordenar; recuerda el roster anterior). |

---

## 4. Plan de emulación

### 4.1 Prerrequisito — reconciliar el catálogo con `ACTIVIDADES`

El finquero piensa en **códigos** (`CP`, `BE`, `MG`, `RP`…). La app no tiene un
campo de código en `Activity`. Para que el desplegable muestre "código + nombre"
y el guardado resuelva por código de forma determinística:

- **Migración:** agregar `Activity.code String?` (nullable, indexado). Aditiva,
  reversible.
- **Script de reconciliación** `scripts/reconcile-activities-from-xlsx.ts`
  (dry-run → `--commit`, idempotente):
  - Lee las 17 filas de `ACTIVIDADES`.
  - Por cada código: si existe una actividad equivalente en la app (por nombre/
    alias/token-set), le **asigna el `code`** y, si el precio difiere, **crea una
    vigencia de precio** = el de `ACTIVIDADES` (no retroactivo — usa el sistema de
    precios con vigencia ya construido [[plan-precios-por-vigencia]]).
  - Si no existe, **crea la actividad** (nombre, unidad, precio, code).
  - **`BE` y `BN` → "Beneficio"** (dos códigos, una actividad): `code="BE"` en la
    actividad y `BN` como alias en `NotebookDictionary` (categoría abreviatura).
  - Emite un **reporte de diferencias** (código, nombre, unidad, precio: xlsx vs
    app) y **NO aplica nada sin revisión de Jorge** (Regla 1). Conflictos
    marcados.
- **Lotes:** `ACTIVIDADES` no tiene catálogo de lotes. El desplegable de Lote usa
  los **lotes de la DB** + "sin lote"; lotes nuevos válidos se crean por el árbol
  de resolución. Valores que no son lotes en el xlsx (`CASA`, `HACIENDA`, `MG` en
  la columna de lote) **dejan de ocurrir** porque el desplegable solo ofrece lotes
  reales — la fuente principal de esa suciedad desaparece.

### 4.2 La página de captura — `/(authenticated)/planilla/captura`

Página dedicada (no una pestaña), escritorio-first, que **replica la hoja
`DATA MANUEL FLORES`**:

- **Selector de semana**: elige la semana (lun–dom); por defecto la actual.
  Determina las **columnas de día** (6 o 7; domingo/séptimo conmutable) y el
  **período de pago** (reusa el wizard de período si falta).
- **Roster**: precarga trabajadores activos como filas (col `#`, col Trabajador).
  Editable: agregar (buscar), quitar, reordenar; recuerda el roster de la semana
  anterior. (Nota: habrá duplicados hasta correr `/admin/trabajadores-duplicados`.)
- **Cuadrícula** (el corazón, idéntica al xlsx): por trabajador × día, **3 inputs:
  Lote (desplegable) · Actividad (desplegable código+nombre) · Unidades (número,
  default 1)**. Encabezados de fecha por día, igual que el xlsx.
- **Atajos de productividad** (el xlsx se llena por copia — `CP CP 1` en todos los
  días, `CANOA LL 1`): **"rellenar a lo ancho"** (copiar un día a toda la semana),
  **"rellenar hacia abajo"** (aplicar a todos los trabajadores), default unidades=1.
  Hace la captura tan rápida como copiar/pegar en Excel.
- **Vista previa de costeo** (como `PLANILLA`/`PAGOS`): muestra costo por fila
  (cantidad × precio **por fecha de trabajo**) y **total por trabajador + séptimo**,
  para que vean los mismos totales que su PAGOS — solo lectura.
- **Guardar**: cada celda llena (trabajador, día, lote, actividad, unidades) →
  un `ActivityRecord`. **Reutiliza todo lo construido**: resolución actividad por
  `code`, precio por fecha de trabajo (vigencias), dedup `(fecha, trabajador,
  actividad, lote)`, asignación de período, guardado por lote. **Offline-aware**
  (PWA) como la entrada manual (IndexedDB + outbox si no hay red).

### 4.3 Reutilización (no se reinventa nada)

| Necesidad | Ya existe |
|---|---|
| Costeo (PLANILLA) | `ActivityRecord` + precios con vigencia (`resolve-price`) |
| Pago (PAGOS) | `PayrollEntry` + módulo de pagos |
| Resolver código nuevo | árbol de resolución `code-resolution` + `resolve-code` (aprende) |
| Dedup | clave `(fecha, trabajador, actividad, lote)` |
| Guardado offline | `sync-engine` + outbox IndexedDB |
| Desplegable de actividades/lotes | `/api/activities`, `/api/lotes` (con `code` nuevo) |

### 4.4 Séptimo / domingo (a confirmar en implementación)

El 7º día (domingo) se captura con actividad `SP` (Séptimo). En `PAGOS` el bono de
séptimo es `75*2`. La captura escribe los `ActivityRecord` de `SP` normalmente; el
**cálculo del bono de séptimo es una regla de nómina** (cuándo aplica, monto) que
debe confirmarse contra el módulo de pagos actual. **Marcado como riesgo** — no se
asume la fórmula `75*2`.

---

## 5. Archivos (propuesta)

**Nuevos**
- `prisma/migrations/<ts>_add_activity_code/` + `Activity.code` en el esquema.
- `scripts/reconcile-activities-from-xlsx.ts` — reconciliación (dry-run/commit).
- `src/app/(authenticated)/planilla/captura/page.tsx` — carga semana + roster.
- `src/app/(authenticated)/planilla/captura/grid-client.tsx` — la cuadrícula.
- `src/app/api/planilla/grid/route.ts` *(o reusar `/api/planilla/batch`)*.

**Modificados**
- `prisma/schema.prisma` — `Activity.code`.
- `src/app/api/activities/route.ts` y `/api/admin/activities` — incluir `code`.
- Catálogo admin (`activities-manager.tsx`) — editar `code`.
- Sidebar / planilla — enlace a "Captura Semanal".

**Reutilizados sin cambios:** `resolve-price`, `code-resolution`, `resolve-code`,
`sync-engine`, dedup, pay-period wizard.

---

## 6. Verificación (contra el archivo real)

1. **Reconciliación:** el reporte de diferencias xlsx↔app es correcto; tras
   `--commit`, cada código de `ACTIVIDADES` resuelve a una actividad con su precio.
2. **Fidelidad de captura:** replicar el bloque de la **semana 1** (13–18/04) en la
   cuadrícula → los `ActivityRecord` generados coinciden 1:1 con `DATA ORIGINAL`
   (mismas líneas) y los costos con `PLANILLA` (misma cantidad × precio).
3. **Totales:** el total por trabajador coincide con `PAGOS` (± regla de séptimo a
   confirmar).
4. **Dedup:** re-guardar la misma semana → 0 nuevos (todo ya existe).
5. **Offline:** capturar sin red → guarda en outbox → sincroniza al reconectar.
6. `tsc` + `next lint` en verde; textos Latam-Spanish; sin datos mock.

---

## 7. Riesgos / no-objetivos

- **Regla del séptimo** (§4.4): confirmar contra el módulo de pagos; no se asume.
- **Duplicados de trabajador**: el roster tendrá duplicados hasta correr el
  merge en `/admin/trabajadores-duplicados`; recomendable limpiar antes de uso
  intensivo (no bloquea la entrega).
- **`BE`/`BN`**: dos códigos → una actividad (manejado vía alias).
- **No-objetivo:** re-implementar PLANILLA/PAGOS (la app ya los produce); la
  página solo **captura** y escribe `ActivityRecord`.
- **No-objetivo:** import del xlsx viejo (ya existe en `/planilla/nueva`); esta
  página es **entrada directa** que reemplaza el tecleo en Excel.

---

## 8. Secuencia de implementación (tras aprobación)

1. Migración `Activity.code` + reconciliación (dry-run → revisión Jorge → commit).
2. APIs de catálogo con `code`; desplegables.
3. Página de captura: semana + roster + cuadrícula + atajos.
4. Vista previa de costeo + guardado (reusa dedup/precio/offline).
5. Verificación contra `PLANILLAFINCA.xlsx` (semana 1 = DATA ORIGINAL/PLANILLA).
6. Confirmar regla del séptimo con módulo de pagos.

> Jorge maneja git y aprueba la migración/reconciliación. Yo preparo archivos y
> texto de commit; no ejecuto `git add/commit/push` ni `prisma migrate` sin visto
> bueno. El xlsx `format/PLANILLAFINCA.xlsx` contiene PII — no se commitea.
