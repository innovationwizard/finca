# Plan — Import de Planilla desde Workbook .xlsx

**Estado:** Propuesta para aprobación · **Fecha:** 2026-06-08
**Autor:** Claude (bajo `docs/_THE_RULES.MD` + Dirty George Principle + ETL wisdom)
**Módulo:** Planilla → `/(authenticated)/planilla/nueva` (pestaña "Planilla Semanal")

---

## 1. Objetivo

Permitir que el usuario suba un **libro de Excel (`.xlsx`)** con los registros
de actividades de la semana y que la app extraiga, valide y guarde esos
registros — **reutilizando exactamente el mismo flujo de revisión** que ya existe
para la foto de la planilla. El usuario **no** elige "foto" vs "Excel": el mismo
control acepta ambos y la app detecta el tipo de archivo automáticamente.

### Decisiones confirmadas por Jorge (2026-06-08)

| # | Tema | Decisión |
|---|------|----------|
| 1 | **Formato del archivo** | Los humanos **siempre** modifican el formato. Prohibido leer por posición. Prohibido depender de encabezados estáticos. El parser debe **detectar** la estructura, **reportar si el formato cambió**, y **nunca fallar — ni en silencio ni en ruido. NINGÚN dato se descarta, se salta ni se deja atrás.** |
| 2 | **Precio** | Usar el **precio por defecto de la base de datos** (igual que el flujo de foto). El precio/total del archivo se conserva solo como evidencia y para marcar discrepancias. |
| 3 | **UX** | **No** reemplazar la foto. El **mismo** control "Planilla Semanal" acepta foto **o** `.xlsx`, sin trabajo extra para el usuario. |
| 4 | **Match de trabajadores** | Match por **nombre** (fuzzy existente) + resolución manual existente. **El DPI NO se usa** (ver §3, es poco confiable en la fuente). |

---

## 2. Lo que inspeccioné en datos reales (no supuestos)

Archivo: `Planilla_marzo_abril.xlsx` (43 KB, en la raíz del repo). 5 hojas:
`Registro_Actividades`, `Control_Actividades`, `Resumen_Semanal`,
`RESUMEN PERSONAL`, `Resumen_Lotes`.

### Hoja canónica: `Registro_Actividades` (271 filas de datos)

Encabezados observados (fila 1):
`Fecha | Semana | Nombre Trabajador | DPI | Actividad | Lote | Unidad | Cantidad | Precio Unitario | Total Devengado`

**Valores crudos (no formateados) ya son limpios** — por eso leeré la celda
cruda, NO el string formateado:

| Columna | Celda formateada | Celda **cruda** (lo que usaré) |
|---|---|---|
| Fecha | `"3/30/26"` | `Date` real (`2026-03-30T06:00:04Z`, GT = UTC-6) |
| Precio Unitario | `" Q130.00 "` | número `130` |
| Cantidad | `"1"` | número `1` |

Valores distintos hallados:
- **Fechas:** 9 fechas, `3/30/26`–`4/11/26` → cruza **2 períodos** (semanas 14 y 15).
- **Actividades:** `Corte de Café`, `Poda`, `Beneficio`, `beneficio`,
  `Mantenimiento General`, `mantenimiento general`, `encargado de beneficio`,
  `Encargado de beneficio` → **misma actividad escrita de varias formas**.
- **Lotes:** `corona`, `cañada`, `Beneficio`, `leña` (`Beneficio` y `leña` **no
  son lotes** reales).
- **Unidades:** `Dia`, `dia`, `Quintal`, `Manzana` (mayúsculas inconsistentes).

### Suciedad real detectada (Dirty George) — ninguna se descarta

1. **2 filas con trabajador + actividad pero Cantidad en blanco** (`Q-`):
   `JORGE MARROQUIN` (3/30) y `NOHEMI ALVAREZ` (3/31). → Se **marcan** para
   revisión humana, **no** se eliminan.
2. **1 fila "totales"** sin nombre, con `Q15,657.50` en la última columna. → Es
   un pie de página; se **clasifica como ignorada con motivo visible**, no se
   borra en silencio.
3. **Variación ortográfica de actividades** (`encargado de beneficio` vs DB
   `Encargado Beneficio`): un `normalize()` simple **no** las une (difieren por
   `de`). → Requiere alias + resolución manual en la tabla de revisión.
4. **"Lotes" que no son lotes** (`Beneficio`, `leña`): se insertan **sin lote**
   (comportamiento ya existente) y se listan en `unresolvedLotes`.

### Corrección honesta sobre el DPI (Regla 1: no mentir)

En mi pregunta inicial afirmé que `RESUMEN PERSONAL` "lista el DPI de cada
trabajador" dando un match "determinístico". **Eso fue una sobre-afirmación.**
La evidencia real de esa hoja:

- DPIs válidos de 13 dígitos en algunas filas, **pero también**: `"N/A"`,
  `"SE DEPOSITA A TONO"`, celdas vacías, y un valor de 14 dígitos.
- La hoja de líneas (`Registro_Actividades`) tiene la columna **DPI vacía**.

Conclusión: **el DPI de este libro NO es una llave confiable** y **no se usará**
para match. Se documenta aquí para que la decisión quede trazable.

---

## 3. Arquitectura: reutilizar todo el downstream, cambiar solo la extracción

El flujo actual de "Planilla Semanal" ya tiene **toda la tubería posterior**,
agnóstica al formato de origen:

```
[extracción] → match trabajadores → resolución manual → wizard de período
            → tabla de revisión → dedup → guardado por lote (/api/planilla/batch)
```

El contrato de extracción que el downstream consume es:

```ts
rows: { workerName: string; entries: {
  date: string;      // ISO "YYYY-MM-DD"
  lote: string;      // texto crudo
  activity: string;  // texto crudo
  units: number;
}[] }[]
+ dateRange: { start, end }, confidence, notes
```

**Estrategia:** el `.xlsx` produce **exactamente** ese mismo shape. Cero cambios
en `worker-resolution.tsx`, `review-table.tsx`, `create-pay-period-wizard.tsx`,
`/api/planilla/batch`, ni en `upload-planilla.tsx` salvo (a) aceptar el archivo y
(b) ramificar por tipo. Esto respeta Regla 5 (cada bloque sirve la función
central sin reinventar) y minimiza superficie de error.

`/api/planilla/process-planilla` **ramifica por `contentType`**:
- imagen → `extractPlanillaData()` (Claude Vision, ya existe).
- spreadsheet → `extractPlanillaFromXlsx()` (**nuevo**).

Ambas ramas siguen al **mismo** código de enriquecimiento (match, resolución de
actividad/lote, dedup, períodos, CSV de auditoría, respuesta). Un solo contrato.

---

## 4. El parser resiliente (el corazón) — `src/lib/xlsx/parse-planilla.ts`

Cumple el mandato literal: **"primero ver si el formato cambió… correr y nunca
fallar, ni en silencio ni en ruido. NINGÚN dato descartado, saltado ni dejado
atrás."**

### 4.1 Detección semántica de columnas (no por posición, no por header exacto)

Para cada columna se calcula un **rol** combinando dos señales, sin depender de
texto exacto ni de orden:

1. **Sinónimos de encabezado** (tolerante a acentos/mayúsculas/variantes):
   - `fecha` ⊇ {fecha, día, date}
   - `worker` ⊇ {nombre trabajador, trabajador, nombre, colaborador, empleado}
   - `activity` ⊇ {actividad, labor, tarea}
   - `lote` ⊇ {lote, parcela, finca}
   - `quantity` ⊇ {cantidad, unidades, qq, cant}
   - `unit` ⊇ {unidad, medida}
   - `price` ⊇ {precio, precio unitario, valor}
   - `total` ⊇ {total, total devengado, devengado, monto}
   - `dpi` ⊇ {dpi, cui}, `week` ⊇ {semana, week, no.}
2. **Patrón de los valores de la columna** (huella de datos), que **gana** si el
   encabezado cambió o falta:
   - fechas reales / strings tipo `M/D/YY` → rol `fecha`.
   - mayoría numérica 0–10 con decimales → candidato `quantity`.
   - strings con `Q`/moneda o numérico grande → candidato `price`/`total`.
   - texto que **coincide con vocabulario conocido** (catálogo de actividades de
     la DB, catálogo de lotes de la DB) → `activity` / `lote`.
   - texto de 2–5 palabras en MAYÚSCULAS sin dígitos → `worker`.

Se elige el rol por puntaje (header + valores). Resultado: un **mapa de roles**
robusto ante reordenamiento, renombrado y columnas extra.

### 4.2 Selección de hoja

No se asume `Registro_Actividades` por nombre. Se **puntea cada hoja**: la hoja
de detalle es la que maximiza columnas-rol detectadas **y** densidad de filas con
(fecha + nombre + actividad). Se reporta cuál se eligió y por qué.

### 4.3 Reporte de drift (formato cambiado)

El parser emite un **`FormatReport`**:
```ts
{
  sheetChosen, sheetScores,
  columnRoles: { role -> {colIndex, header, via: "header"|"values", confidence} },
  missingRoles: Role[],        // roles esperados no encontrados
  unknownColumns: {index, header, sample}[],  // columnas que no supo clasificar
  driftDetected: boolean,      // difiere del layout de referencia conocido
}
```
Esto se incrusta en `notes`/`confidence` y se muestra en la pantalla de revisión.
**Ver el formato cambiar es información, no un fallo.**

### 4.4 Garantía de "ningún dato atrás" — clasificación de TODA fila

Cada fila con **cualquier** contenido cae en exactamente una categoría, y **todas
son visibles** en la salida (ninguna desaparece):

| Categoría | Criterio | Destino |
|---|---|---|
| `entry` | tiene fecha + trabajador + actividad + cantidad>0 | fila normal en revisión |
| `flagged` | tiene trabajador/actividad pero **falta** cantidad/fecha/actividad | fila en revisión **marcada** (ámbar) para que el humano complete |
| `ignored` | fila de totales/encabezado repetido/vacía-con-residuo | listada en un panel "Filas ignoradas" **con el motivo** y su contenido crudo |
| `unparseable` | tiene datos pero no se pudo asignar rol | listada en "Requiere atención" con la fila cruda completa |

`flagged`, `ignored` y `unparseable` se **cuentan y se muestran**; el total de
filas de entrada **siempre cuadra**: `entry + flagged + ignored + unparseable ==
filas con contenido`. Esto es la prueba de "nada se dejó atrás" y se afirma en la
UI (p. ej. "271 filas leídas = 267 registros + 2 marcadas + 1 ignorada (totales) +
1 requiere atención").

### 4.5 Salida del parser

```ts
type ParsedPlanilla = {
  rows: { workerName: string; entries: ParsedEntry[] }[]; // = contrato downstream
  formatReport: FormatReport;
  anomalies: { flagged: RawRow[]; ignored: {row: RawRow; reason: string}[];
               unparseable: RawRow[] };
  provenance: { sheet: string; rowCounts: {...} };
  dateRange: { start: string; end: string };
};
```

`extractPlanillaFromXlsx()` envuelve al parser y entrega `rows`, `dateRange`,
`confidence` (derivada de drift/anomalías), y `notes` (resumen legible del
`formatReport` + conteos), para que el route no distinga el origen.

---

## 5. Mapeo de datos (reglas explícitas)

- **Fecha:** tomar la fecha **como calendario local de Guatemala** (UTC-6) para
  evitar corrimiento de día; si la celda es string `M/D/YY`, parsear por
  componentes (no `new Date(str)`). Salida ISO `YYYY-MM-DD`. Año de 2 dígitos
  `26` → `2026`.
- **Actividad → Activity.id:** `normalize()` + **diccionario de alias**
  (`encargado de beneficio`/`Encargado de beneficio` → `Encargado Beneficio`,
  etc.) + match por conjunto de tokens. Si no resuelve → `unresolvedActivities`
  (ya se muestra y se corrige en la tabla; **no** se descarta).
- **Lote → Lote.id:** reutilizar el `loteByKey` existente (nombre/slug/variantes).
  No-lotes (`Beneficio`, `leña`) → sin lote + `unresolvedLotes`.
- **Precio (decisión #2):** `unitPrice = Activity.defaultPrice` de la **DB**.
  El precio/total del archivo se guardan en el **CSV de auditoría** y, si difieren
  del cálculo DB, se **marca** la fila (informativo). El monto guardado es
  `quantity × defaultPrice`.
- **Cantidad:** celda cruda numérica. Blanco → fila `flagged` (no `entry`).
- **Trabajador (decisión #4):** `matchAllWorkers()` por nombre + pantalla de
  resolución manual existente. **DPI ignorado.**

---

## 6. Almacenamiento y provenance (Regla 8 / ETL)

- Subir el `.xlsx` **original** a Supabase Storage (bucket `notebook-photos`,
  prefijo `planilla/<agYear>/<ts>.xlsx`) vía URL firmada — **se conserva el
  archivo fuente** para trazabilidad/auditoría, igual que la foto.
- `signed-upload-url`: agregar a `allowedTypes` los MIME de Excel
  (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` y, si se
  decide aceptar `.xls`, `application/vnd.ms-excel`) y derivar `ext`.
- `process-planilla`: descargar, ramificar por `contentType`, parsear en el
  **servidor** (un solo parser confiable; `xlsx` ya es dependencia). Se mantiene
  el **CSV de auditoría** existente, extendido con columnas de origen
  (precio_archivo, total_archivo, motivo_anomalía).

---

## 7. UX — un solo control, detección automática (decisión #3)

`upload-planilla.tsx` (sin nueva pestaña, sin toggle):

- `input accept` añade los MIME de `.xlsx`.
- Al seleccionar archivo, **detectar tipo**: imagen → vista previa de imagen;
  spreadsheet → **chip de archivo** (ícono + nombre + tamaño), sin intentar
  previsualizar como imagen.
- `handleUpload`: derivar `ext`/`contentType` reales del archivo y enviarlos; el
  resto del flujo (processing → resolución → período → revisión → guardar) es
  **idéntico**.
- En la pantalla de revisión, mostrar el **`FormatReport`** y los paneles de
  anomalías (`flagged` / `ignored` / `unparseable`) con conteos que cuadran.
- Texto Latam-Spanish; campos sensibles no aplican aquí.

---

## 8. Archivos

**Nuevos**
- `src/lib/xlsx/parse-planilla.ts` — parser resiliente (§4) + detección semántica.
- `src/lib/xlsx/activity-aliases.ts` — alias de actividades (compartible).
- `src/lib/ai/extract-planilla-xlsx.ts` — `extractPlanillaFromXlsx()` (envoltura
  al contrato del downstream). *(o `src/lib/xlsx/extract.ts`)*

**Modificados (cambios mínimos y quirúrgicos)**
- `src/app/api/planilla/signed-upload-url/route.ts` — aceptar MIME/ext de Excel.
- `src/app/api/planilla/process-planilla/route.ts` — ramificar por `contentType`;
  pasar `formatReport`/`anomalies` en la respuesta.
- `src/app/(authenticated)/planilla/nueva/upload-planilla.tsx` — `accept`,
  detección de tipo, chip de archivo, render de `formatReport`/anomalías.
- `src/app/(authenticated)/planilla/nueva/page.tsx` — copy del subtítulo
  ("foto **o** Excel").
- `review-table.tsx` — estilo "marcada" (ámbar) para filas `flagged` (si aún no
  existe un estado equivalente).

**Sin cambios:** `worker-resolution.tsx`, `create-pay-period-wizard.tsx`,
`/api/planilla/batch`, `match-workers.ts`.

---

## 9. Matriz de pruebas (contra el archivo real, no inventado)

Probar con `Planilla_marzo_abril.xlsx` y variantes derivadas de él:

1. **Happy path:** 271 filas → conteos que cuadran; 2 períodos detectados (sem
   14 y 15); dedup contra registros ya importados.
2. **Cantidad en blanco** (`JORGE MARROQUIN`, `NOHEMI ALVAREZ`) → `flagged`, no
   descartadas, visibles y editables.
3. **Fila de totales** (`Q15,657.50`) → `ignored` con motivo, no insertada.
4. **Variación de actividad** (`encargado de beneficio`) → resuelta por alias o
   listada en `unresolvedActivities`.
5. **No-lotes** (`Beneficio`, `leña`) → insertadas sin lote + `unresolvedLotes`.
6. **Drift de formato (simulado):** reordenar columnas / renombrar
   `"Nombre Trabajador"`→`"Colaborador"` / insertar columna extra → el parser
   **sigue** clasificando por valores y **reporta** el drift; conteos cuadran.
7. **Hoja extra/orden distinto:** elige `Registro_Actividades` por puntaje.
8. **Archivo no-planilla** (ej. `_Ingresos.xlsx`): `missingRoles` alto,
   `confidence` baja, **mensaje claro** ("no parece una planilla de
   actividades"), **sin** insertar nada — falla *informando*, no en silencio.
9. **Trabajador desconocido** → pantalla de resolución manual existente.
10. **Re-subida del mismo archivo** → todo `skipped` por dedup `(fecha|workerId)`.

---

## 10. Criterios de aceptación

- [ ] El mismo control "Planilla Semanal" acepta foto **y** `.xlsx` sin pasos
      extra; detecta el tipo solo.
- [ ] Con el archivo real, **toda** fila con contenido aparece en exactamente una
      categoría y la suma cuadra (prueba de "nada atrás"); se muestra en la UI.
- [ ] Ninguna fila se descarta en silencio; anomalías visibles con su fila cruda
      y motivo.
- [ ] Cambiar orden/nombre de columnas **no rompe** la extracción y **reporta**
      el cambio.
- [ ] `unitPrice` = precio por defecto de la DB; precio/total del archivo en
      auditoría; discrepancias marcadas.
- [ ] DPI **no** se usa para match; match por nombre + resolución manual.
- [ ] Cero datos mock; archivo original conservado en Storage; CSV de auditoría.
- [ ] `next lint` sin supresiones; tipado estricto; copy Latam-Spanish.

---

## 11. Riesgos y no-objetivos

- **Riesgo:** un formato suficientemente distinto podría confundir la detección
  por valores. **Mitigación:** `FormatReport` + revisión humana obligatoria antes
  de guardar (nunca auto-commit); umbral de confianza que bloquea inserción y
  pide confirmación.
- **No-objetivo (por ahora):** importar las hojas de resumen/pago
  (`RESUMEN PERSONAL`, `Resumen_Semanal`) — el módulo de pagos ya las deriva de
  los `ActivityRecord`. Este import alimenta `Registro_Actividades` (líneas).
- **No-objetivo:** `.xls` legacy y Google Sheets, salvo que se confirme demanda.
- **Decisión abierta menor:** ¿aceptar también `.xls`? (default: solo `.xlsx`).

---

## 12. Secuencia de implementación

1. `parse-planilla.ts` + tests contra `Planilla_marzo_abril.xlsx` (detección,
   clasificación, conteos que cuadran, drift simulado).
2. `activity-aliases.ts` + `extract-planilla-xlsx.ts`.
3. `signed-upload-url` (MIME Excel) → `process-planilla` (rama + respuesta).
4. `upload-planilla.tsx` (accept, detección, chip, render de reporte/anomalías).
5. Pruebas end-to-end con el archivo real (dry-run visual antes de commit).
6. Revisión humana de Jorge sobre datos extraídos **antes** de habilitar guardado.

> Nota de proceso: Jorge maneja git. Yo preparo lista de archivos y texto de
> commit en el chat; no ejecuto `git add/commit/push`.

---

## 13. Estado de implementación (2026-06-08)

**Implementado y verificado contra el archivo real `Planilla_marzo_abril.xlsx`.**
`tsc --noEmit` y `next lint` en verde; sin supresiones.

### Archivos creados
- `src/lib/xlsx/parse-planilla.ts` — parser resiliente (detección semántica de
  columnas, reporte de drift, clasificación con balance).
- `src/lib/xlsx/activity-aliases.ts` — `buildActivityResolver` (exacto →
  token-set sin stop-words → alias).
- `src/lib/xlsx/extract-planilla-xlsx.ts` — adaptador al contrato del downstream.
- `scripts/verify-xlsx-parse.ts` — dry-run de verificación (no escribe nada).

### Archivos modificados
- `src/app/api/planilla/signed-upload-url/route.ts` — acepta MIME `.xlsx`.
- `src/app/api/planilla/process-planilla/route.ts` — ramifica por `contentType`;
  resolución de actividad mejorada (token-set, beneficia también la foto);
  sidecar JSON de auditoría; `formatReport`/`anomalies`/`counts` en la respuesta.
- `src/app/(authenticated)/planilla/nueva/upload-planilla.tsx` — mismo control
  acepta foto o `.xlsx` (auto-detección), chip de archivo, panel de
  reporte/anomalías, guarda explícito de "0 registros".
- `src/app/(authenticated)/planilla/nueva/page.tsx` — copy "foto o Excel".

### Resultados de verificación
- **Happy path:** 271 filas → **270 registros + 1 ignorada (totales) = 271
  (balance ✓)**; 2 períodos (sem 14–15); fechas UTC-safe; sin drift.
- **Hallazgo (anomalía real):** **11** filas con cantidad vacía/cero — no 2 como
  estimé a ojo (el parser leyó celdas con `0` literal además de las vacías).
  Todas marcadas, no descartadas.
- **`"Poda"` no resuelve:** la DB activa tiene `Repaso Poda`, no `Poda`. **No se
  asume** equivalencia; se marca para mapeo manual en revisión. ← decisión
  pendiente de Jorge: confirmar el mapeo `Poda → Repaso Poda` (o crear actividad
  `Poda`).
- **Drift (reordenar + renombrar `Nombre Trabajador`→`Colaborador` + columna
  extra):** todos los roles core recuperados por contenido; balance ✓; drift
  reportado.
- **Drift duro (encabezados de Actividad/Cantidad/Precio/Total en blanco +
  reorden + columna extra de texto):** core recuperado por valores; la columna
  extra de texto queda "sin clasificar" (no se confunde con cantidad); balance ✓.
- **Archivo no-planilla (`_Ingresos.xlsx`):** `missingRoles=[activity]`,
  0 registros, confianza baja, mensaje claro; no inserta nada; no crashea.

### Residual documentado (honesto)
Si se blanquean **todos** los encabezados de columnas numéricas **y** se
reordenan físicamente, distinguir `price` vs `total` solo por valores es ambiguo
(ambos numéricos; en cosecha el total puede ser menor que el precio). Mitigantes:
(a) por **decisión #2 el monto guardado usa el precio de la DB**, no el del
archivo — un cruce price/total solo afecta campos de *provenance*, nunca el dato
guardado; (b) el drift se reporta y la revisión humana es obligatoria. Se optó por
**no** agregar una heurística frágil (regla anti-sobreingeniería).

### Pendiente antes de habilitar en producción
- `npm run build` completo y prueba end-to-end subiendo el `.xlsx` por el
  navegador (revisión humana de los datos extraídos **antes** de guardar).
- Confirmar con Jorge el mapeo de `Poda`.
