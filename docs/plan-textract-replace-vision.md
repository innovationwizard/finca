# Plan — Reemplazar Claude Vision por AWS Textract

**Estado:** Propuesta para aprobación · **Fecha:** 2026-06-08
**Autor:** Claude (bajo `docs/_THE_RULES.MD` + Dirty George + ETL wisdom)
**Módulos afectados:** Planilla → foto de planilla semanal (impresa) y foto de
cuaderno (manuscrita).

---

## 1. Objetivo y motivo

> "Using Claude Vision to ETL four images … containing 39 rows each … took us
> FOUR HOURS due to increasing entropy of Claude Vision hallucinations. …
> HARD DECISION: REPLACE CLAUDE VISION WITH AWS TEXTRACT ASAP."
> — `docs/claude-vision-etl-lesson.md`

Eliminar Claude Vision de los flujos de OCR y reemplazarlo por **AWS Textract**,
que devuelve una **cuadrícula determinística** (celdas con texto + confianza +
geometría) en lugar de una interpretación generada por un LLM. La semántica
(qué columna es qué fecha, agrupar tríos por día, etc.) la hace **código
determinístico nuestro**, no un modelo que puede alucinar.

### Decisiones confirmadas por Jorge (2026-06-08)

| # | Tema | Decisión |
|---|------|----------|
| 1 | Alcance | **TODOS** los flujos: foto de planilla (impresa) **y** cuaderno (manuscrito). |
| 2 | AWS | **No hay AWS aún** → el plan inicia con la especificación de aprovisionamiento. |
| 3 | Corte | **Reemplazo duro**: quitar Claude Vision del camino (sin fallback). |

### Nota honesta de calibración (Dirty George)

El desastre del lesson fue con **capturas impresas** (sin manuscritura) — el caso
donde Textract **claramente gana**. El **cuaderno es manuscrito**, un caso más
difícil para *cualquier* OCR. Textract NO va a **alucinar** filas/valores como
Vision (devuelve lo que ve, con un puntaje de confianza por celda), pero sí puede
**leer mal** una celda manuscrita borrosa. Mitigación estructural: **no se
descarta ninguna celda**; las de baja confianza se **marcan** en la tabla de
revisión para corrección humana. Por eso el plan exige un **spike contra las
imágenes reales antes de escribir cualquier intérprete** (§5).

---

## 2. Estado actual (evidencia, no supuesto)

Dos únicos consumidores de Vision (al quitarlos, desaparece todo uso de Anthropic):

| Flujo | Vision | Ruta API | UI | Contrato de salida |
|---|---|---|---|---|
| **Planilla semanal (impresa)** | `src/lib/ai/extract-planilla.ts` | `api/planilla/process-planilla` (rama imagen) | pestaña "Planilla Semanal" | `rows:[{workerName, entries:[{date,lote,activity,units}]}], dateRange, confidence, notes` |
| **Cuaderno (manuscrito)** | `src/lib/ai/extract-notebook.ts` | `api/planilla/process-foto` | pestaña "Cuaderno" | `rows:[{workerName, entries:[{day,quantity,unit,activityOverride}]}], month, year, confidence, notes` |

- La planilla impresa es **ancha/pivoteada**: encabezado con fechas por columna
  (ej. "lunes, 13 de abril de 2026") y bajo cada fecha tres sub-columnas
  Lote | Actividad | Unidades; cada fila es un trabajador.
- El cuaderno es una **matriz**: trabajadores (filas) × días (columnas), con
  cantidades en celdas (enteros = libras; decimales = quintales; "X" = ausente;
  "B" = Beneficio). Usa un **diccionario aprendido** (`notebook-dictionary`) para
  corregir nombres y abreviaturas.
- Imágenes reales en disco para el spike: `cuaderno1.jpeg`, `cuaderno2.jpeg`
  (manuscritas), `WhatsApp Image 2026-04-10 *.jpeg`, `docs/imagesofnewformat/*.JPG`
  (impresas), `docs/mayo*/`.

---

## 3. Arquitectura: Textract → cuadrícula → intérprete determinístico → mismo contrato

```
imagen (Supabase Storage)
  → Textract AnalyzeDocument(FEATURE_TYPES=["TABLES"])
  → cuadrícula normalizada { rows, cols, cells:[{row,col,rowSpan,colSpan,text,confidence}] }
  → intérprete determinístico por formato (NUESTRO código)
  → MISMO contrato de extracción que hoy
  → pipeline de revisión existente (match trabajadores, períodos, dedup, batch)
```

- **Cero alucinación**: Textract solo reconoce caracteres por celda y entrega
  confianza + geometría. La interpretación es código, no un LLM.
- **Sinergia con el parser .xlsx ya construido** (`src/lib/xlsx/parse-planilla.ts`):
  reutilizamos los principios y helpers (detección semántica de roles, parseo de
  fechas en español, clasificación con balance "ninguna fila atrás", marcado de
  anomalías). La cuadrícula de Textract es análoga a la del .xlsx.
- **Mismo contrato → downstream intacto**: ninguna pantalla de revisión, resolución
  de trabajadores, wizard de período o `batch` cambia.

---

## 4. Aprovisionamiento AWS (decisión #2 — primero esto)

1. **Cuenta AWS** (o sub-cuenta del Holding). Servicio: **Amazon Textract**.
2. **Región:** elegir la que coincida con la **región de las funciones de Vercel**
   (por defecto `iad1` = `us-east-1`) para minimizar latencia imagen→Textract.
   Recomendado: **`us-east-1`** (confirmar región de Vercel del proyecto).
   Textract está disponible en us-east-1, us-west-2, etc.
3. **Usuario IAM** dedicado (solo programático) con política de mínimo privilegio:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       { "Effect": "Allow",
         "Action": ["textract:AnalyzeDocument"],
         "Resource": "*" }
     ]
   }
   ```
   (Solo `AnalyzeDocument` síncrono; no se requieren permisos de S3 ni async para
   imágenes de una página — ver §6.)
4. **Credenciales por entorno** (Regla 11 — sin hardcodear): variables
   `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (o prefijo
   `TEXTRACT_*` propio para aislarlas del resto). En local en `.env.local`; en
   producción como **env vars cifradas de Vercel**. Nunca en el repo.
5. **Costo:** AnalyzeDocument (Tables) ≈ US$0.015 por página → volumen de la finca
   es trivial. Sin compromisos mensuales.
6. **SDK:** `@aws-sdk/client-textract` (v3, modular). Agregar como dependencia.

> Entregable de esta fase: credenciales en `.env.local` + doc de la política IAM.
> Sin esto, nada de lo demás corre.

---

## 5. Spike obligatorio antes de codificar intérpretes (Dirty George)

`scripts/textract-spike.ts` (dry-run, no escribe nada): por cada imagen real de
`§2`, llama a Textract y **vuelca la cuadrícula cruda** (tabla reconstruida con
texto y confianza por celda) + el JSON de Blocks. **Revisión humana de Jorge**
sobre esa salida para confirmar:
- Que la estructura de tabla se detecta bien (impresa: sí casi seguro; cuaderno:
  *a confirmar*).
- Calidad del OCR manuscrito real y qué celdas caen en baja confianza.
- Cómo Textract maneja los encabezados de fecha y las celdas combinadas.

**Solo después** de esta revisión se diseñan los intérpretes de §7–§8. Si el
cuaderno manuscrito resulta inutilizable, se reporta a Jorge con evidencia (no se
asume ni se fuerza).

---

## 6. Cliente Textract compartido — `src/lib/textract/client.ts`

- `analyzeTables(bytes: Buffer): Promise<TextractGrid[]>` usando
  `AnalyzeDocumentCommand({ Document: { Bytes }, FeatureTypes: ["TABLES"] })`.
- Normaliza los `Blocks` (TABLE → CELL → WORD/SELECTION) a:
  ```ts
  type TextractCell = { row: number; col: number; rowSpan: number; colSpan: number; text: string; confidence: number };
  type TextractGrid = { rows: number; cols: number; cells: TextractCell[] };
  ```
- **Síncrono, una página:** `AnalyzeDocument` con `Bytes` acepta JPEG/PNG ≤ **5 MB**.
  Las fotos del repo son ~80–340 KB. **Mitigación >5 MB:** redimensionar el lado
  largo a ~2500 px antes de enviar (las fotos de teléfono pueden exceder 5 MB).
  (PDF/multipágina exigiría async + S3 — fuera de alcance; las planillas son una
  imagen.)
- Devuelve también la confianza para que el downstream marque celdas dudosas.

---

## 7. Fase A — Planilla impresa (`src/lib/textract/extract-planilla-photo.ts`)

Intérprete del formato **ancho** → mismo `PlanillaExtractionResult`:
- Detectar las **columnas de encabezado de fecha** (parsear "lunes, 13 de abril de
  2026" → ISO, reutilizando el parser de fechas en español del trabajo .xlsx).
- Agrupar las sub-columnas en **tríos por día** (Lote | Actividad | Unidades) por
  geometría/orden de columnas.
- Por cada fila de trabajador, emitir `entries` por día con celda no vacía.
- **Clasificación con balance** (ninguna celda atrás) + **marcado de baja
  confianza** y celdas ambiguas → se muestran en la tabla de revisión.
- Reemplazar la llamada a `extractPlanillaData` en `process-planilla` (rama
  imagen) por este extractor. **Sin tocar** la resolución de actividad/lote/
  trabajador ni el resto del downstream (ya comparten contrato).

## 8. Fase B — Cuaderno manuscrito (`src/lib/textract/extract-notebook-photo.ts`)

Intérprete de **matriz** → mismo `ExtractionResult`:
- Identificar la columna de **nombres** (izquierda) y la(s) fila(s) de **días**
  (números) en el encabezado.
- **Des-pivotar**: por cada (trabajador, día) con celda no vacía → `entry`
  {day, quantity, unit}. Reglas actuales: entero ≥10 → "lb"; decimal → "qq";
  "X" → ausente (omitir); "B" → `activityOverride: "Beneficio"`; tachado/ilegible
  → marcar baja confianza (no inventar).
- **Mantener** `notebook-dictionary` para corrección de nombres/abreviaturas,
  aplicado **después** de Textract (igual que hoy).
- `month`/`year` provienen del **contexto que el usuario ya ingresa** en la UI
  (no dependemos de leer el encabezado manuscrito; opcionalmente se ofrece lo que
  Textract leyó como sugerencia).
- Reemplazar `extractNotebookData` en `process-foto`. Downstream intacto.

## 9. No-drop, confianza y provenance (ETL wisdom)

- Toda celda capturada; **nada se descarta en silencio**. Celdas de baja confianza
  o ambiguas → **marcadas** (ámbar) en la tabla de revisión, con su texto crudo.
- Guardar el **JSON crudo de Textract** como sidecar en Storage (igual que el
  reporte .xlsx) para auditoría/trazabilidad.
- `confidence` global del resultado derivada de la confianza media + nº de celdas
  marcadas.

## 10. Limpieza / remoción de Vision (decisión #3 — reemplazo duro)

- Eliminar `src/lib/ai/extract-planilla.ts` y `src/lib/ai/extract-notebook.ts`.
- Quitar la dependencia **`@anthropic-ai/sdk`** de `package.json` (era su único
  uso) y la env `ANTHROPIC_API_KEY` del flujo (confirmar que no se use en otro
  lado — el grep indica que no).
- Agregar `@aws-sdk/client-textract` y las env de AWS.

---

## 11. Archivos

**Nuevos**
- `src/lib/textract/client.ts` — cliente + normalización a cuadrícula.
- `src/lib/textract/extract-planilla-photo.ts` — intérprete planilla impresa.
- `src/lib/textract/extract-notebook-photo.ts` — intérprete cuaderno manuscrito.
- `scripts/textract-spike.ts` — volcado de cuadrícula cruda (revisión humana).
- `scripts/verify-textract-planilla.ts`, `scripts/verify-textract-notebook.ts` —
  dry-runs contra imágenes reales (estilo `verify-xlsx-parse.ts`).
- `docs/aws-textract-setup.md` — política IAM + env + región.

**Modificados**
- `src/app/api/planilla/process-planilla/route.ts` — rama imagen → Textract.
- `src/app/api/planilla/process-foto/route.ts` — → Textract.
- `package.json` — `+@aws-sdk/client-textract`, `-@anthropic-ai/sdk`.
- `.env.example` — variables AWS (sin valores reales).

**Eliminados**
- `src/lib/ai/extract-planilla.ts`, `src/lib/ai/extract-notebook.ts`.

---

## 12. Verificación (contra imágenes reales)

1. **Spike**: cuadrícula cruda legible para humano en las 6+ imágenes reales.
2. **Planilla impresa**: las 4 imágenes de `imagesofnewformat`/WhatsApp → fechas
   correctas, tríos por día bien agrupados, balance de celdas, marcado de dudosas.
3. **Cuaderno**: `cuaderno1/2.jpeg` → des-pivote correcto, lb/qq, "X"/"B",
   diccionario aplicado, celdas borrosas marcadas (no inventadas).
4. **Comparación A/B** (solo durante el desarrollo, no en prod): Textract vs la
   salida histórica de Vision para detectar regresiones.
5. **>5 MB**: foto grande → redimensionada y procesada sin error.
6. `tsc` + `next lint` en verde; textos Latam-Spanish; sin secretos en el repo.

## 13. Criterios de aceptación

- [ ] Ningún uso de Claude Vision en el código; `@anthropic-ai/sdk` removido.
- [ ] Ambos flujos extraen vía Textract y entregan el **mismo contrato** (revisión
      y guardado intactos).
- [ ] Ninguna celda se descarta; las dudosas se marcan en revisión con su texto.
- [ ] Credenciales solo por env (Regla 11); JSON crudo de Textract en auditoría.
- [ ] Verificado contra las imágenes reales del repo (revisión humana de Jorge).

## 14. Riesgos / no-objetivos

- **Manuscritura del cuaderno:** riesgo real de OCR; mitigado por no-drop + marcado
  + diccionario + revisión humana. Si el spike muestra calidad insuficiente, se
  reporta con evidencia antes de continuar la Fase B.
- **Sin fallback (reemplazo duro):** si Textract falla en runtime, el flujo de foto
  muestra error claro (no hay Vision de respaldo); el usuario puede usar entrada
  manual o el import .xlsx mientras tanto.
- **Latencia/región:** alinear región Textract con la de Vercel.
- **No-objetivo:** PDF/multipágina (async + S3); el import .xlsx ya cubre lo
  digital. No se toca la nómina ni los snapshots.

## 15. Secuencia de implementación

1. **Aprovisionar AWS** (cuenta, IAM, región, env) + `docs/aws-textract-setup.md`.
2. `@aws-sdk/client-textract` + `client.ts` + **spike** → revisión humana.
3. Fase A (planilla impresa) + verificación contra imágenes reales.
4. Fase B (cuaderno manuscrito) + verificación.
5. Remover Vision + `@anthropic-ai/sdk`; `tsc`/`lint`; revisión final.

> Jorge maneja git y provee credenciales AWS. Yo preparo archivos y texto de
> commit; no ejecuto `git add/commit/push`. Las llaves AWS nunca entran al repo.
