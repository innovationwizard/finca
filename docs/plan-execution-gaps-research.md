# Plan vs. Ejecución — Brechas actuales y benchmarks mundiales

**Fecha:** 2026-05-18  
**Contexto:** Análisis del módulo `/plan` de Finca Danilandia comparado con las mejores prácticas globales en software de gestión agrícola y operaciones.

---

## 1. Estado actual del módulo `/plan`

### 1.1 Qué funciona correctamente

- **Planificación editable** — El grid de 48 semanas (12 meses × 4 semanas) permite editar jornales planificados por actividad, célula a célula.
- **Datos de ejecución existen en el backend** — `activityRecord` alimenta `/api/plan/actual` con jornales reales agregados por actividad/mes/semana.
- **Semáforo de desviación** — Las celdas se colorean (verde/amarillo/rojo) según la desviación entre plan y ejecución.
- **Tabla resumen por lote** — En `/plan/[loteSlug]` existe una tabla con columnas Plan | Real | Diferencia | Estado por actividad.
- **Filtros por año agrícola y lote** — Funcionales y correctos.

### 1.2 Brechas críticas (lo que los usuarios NO pueden ver)

#### Brecha 1 — Números de ejecución invisibles en el grid principal

**Archivo:** `src/app/(authenticated)/plan/plan-grid.tsx`, líneas 243–258.

En modo solo-lectura (GENERAL o sin permiso de edición), cada celda muestra únicamente el valor planificado:

```tsx
<span
  className="inline-block min-w-[2rem] tabular-nums"
  title={`Plan: ${planned} | Real: ${actual}`}  // ← solo en tooltip hover
>
  {planned > 0 ? planned : ""}  // ← solo muestra plan, nunca actual
</span>
```

El número real (`actual`) solo aparece si el usuario hace hover sobre la celda. En mobile, el hover no existe. **El dato de ejecución es efectivamente invisible para el usuario.**

#### Brecha 2 — En modo edición tampoco se ve la ejecución

En modo edición (`canEdit && loteId`), el componente `EditableCell` solo muestra y edita el valor planificado. No hay ninguna referencia visual a cuánto se ejecutó realmente en esa semana.

```tsx
<EditableCell
  value={planned}  // ← solo plan
  isSaving={isSaving}
  onSave={(val) => saveCell(act.id, m.agMonth, w, val)}
/>
```

#### Brecha 3 — Sin KPI de resumen en la cabecera

La página `/plan` no tiene ninguna tarjeta ni indicador que muestre el estado agregado del año: cuántos jornales se han planificado vs. cuántos se han ejecutado hasta la fecha. El usuario no tiene un "número de portada" que le diga de un vistazo si la finca está al día.

#### Brecha 4 — Tabla resumen solo en sub-página de lote

La tabla con columnas Plan | Real | Diferencia existe en `/plan/[loteSlug]`, pero no en `/plan` (vista general). La vista general solo tiene el grid sin números de ejecución visibles.

#### Brecha 5 — Sin porcentaje de cumplimiento

Ninguna vista calcula ni muestra `% Cumplimiento = (Ejecutado / Planificado) × 100`. Este es el KPI operativo más importante en gestión de operaciones agrícolas.

#### Brecha 6 — Sin visibilidad del período actual

No hay ninguna vista que responda: "¿Cómo vamos esta semana?" o "¿Cómo va este mes?" El único corte temporal disponible es el año agrícola completo. No hay un "semana en curso" ni un resumen del mes activo.

#### Brecha 7 — Sin barras de progreso ni visualización de avance

El grid muestra números absolutos (jornales planeados), pero no visualiza el avance relativo (cuánto del plan se ha completado). No hay un elemento visual que comunique "80% completado" en el contexto de un período.

#### Brecha 8 — Sin indicador jornales/manzana

No se muestra la eficiencia normalizada (jornales por manzana), que es la métrica que permite comparar actividades entre lotes de diferente tamaño, y entre años agrícolas.

#### Brecha 9 — Sin comparativa interanual

No hay ninguna forma de ver cómo se compara el año actual con el año anterior. Este benchmark es estándar en todas las plataformas líderes.

---

## 2. Benchmarks mundiales

### 2.1 Granular (Corteva Agriscience)

**Patrón aplicable:** Dashboard "Analizar" que muestra plan vs. ejecutado a nivel de campo y actividad en tiempo casi real. Separa tres capas de datos: **Presupuesto (Plan) → Pronóstico (Forecast) → Real (Actual)**. Jornales y costos laborales se acumulan contra el presupuesto apenas se registra la actividad.

**Diferenciador:** El enfoque no es solo cumplimiento de tareas sino varianza de costo (`$` sobre plan vs. `$` ejecutado). Para Danilandia, la versión equivalente es jornales-sobre-plan por actividad.

**Mobile:** Operadores reciben órdenes de trabajo en móvil y confirman ejecución; los datos fluyen al dashboard automáticamente.

### 2.2 Cropwise Operations (Syngenta)

**Patrón aplicable:** Separación explícita de objetos de datos: **Work Order (plan)** vs. **Work Record (ejecución)**. Ciclo de vida de estado: `PLANIFICADO → EN PROGRESO → COMPLETADO → ARCHIVADO`. Reportes "plan vs. actual" detallados son una funcionalidad nombrada explícitamente en su marketing.

**Diferenciador:** El área planificada vs. el área ejecutada se compara en tiempo real; los gerentes ven trabajo en progreso en todos los lotes sin esperar reportes manuales.

**Mobile:** Capacidad offline completa; sincroniza al recuperar conectividad.

### 2.3 AGRIVI

**Patrón aplicable (más relevante para Danilandia):** Dashboard semanal en vivo con comparación presupuesto vs. real **a nivel de campo individual**, no solo agregado. Varianzas superficiales **dentro de la semana en que ocurren**, no al cierre del mes. Mapa de calor por campo: rojo (alta carga de horas), amarillo (media), verde (baja).

**KPIs documentados:**
- Horas-hombre por actividad por campo vs. planificado
- Costo por manzana vs. plan
- Uso de insumos: cantidad aplicada vs. cantidad planificada, por campo

**Principio de diseño:** Las desviaciones detectadas en la semana 4 son accionables. En la semana 12 son costos hundidos. El sistema se diseñó para detectar desviaciones temprano.

### 2.4 John Deere Operations Center

**Patrón aplicable:** El avance se muestra como **acres restantes** (inversión del progreso: comienza desde el total y cuenta hacia abajo). Tarjetas de estado por máquina en tiempo real.

**Para Danilandia (sin maquinaria):** El equivalente es "jornales restantes para completar el plan" — el complemento de lo ejecutado hasta hoy.

### 2.5 Innov8.ag HarvestReplay (2026)

**Patrón más avanzado:** "Ritmo vs. objetivo" en tiempo real. Los gerentes detectan desviaciones a las 10am, no al día siguiente. Alertas para: congestión de cuadrilla, ralentización de ritmo, costos-por-unidad fuera de rango.

**Principio:** La corrección dentro del mismo turno/jornada es el objetivo de diseño. No existe actualmente en Danilandia ni en ninguna herramienta regional.

### 2.6 Estándares ERP (SAP / Oracle)

**Estructura IBCS para tablas de plan vs. real:**

| Actividad | PL (jornales) | AC (jornales) | ΔJornales | Δ% |
|---|---|---|---|---|
| Fertilización | 80 | 74 | +6 | +7.5% |
| Chapeo | 40 | 47 | −7 | −17.5% |

**Convenciones de color SAP:**
- Verde (bueno): desviación ≤ umbral positivo
- Ámbar (crítico): desviación en zona de alerta
- Rojo (error): desviación > umbral negativo
- Los umbrales son **configurables por métrica** — una actividad con tolerancia climática puede tener rangos más amplios que una actividad de timing crítico (fertilización)

**Oracle Project Cost Variance Dashboard:**
Columnas estándar: Tarea | Planificado | Real | Varianza | Varianza% — exactamente el patrón que falta en Danilandia.

### 2.7 Bullet Charts (Stephen Few)

El bullet chart es la visualización canónica para plan vs. real en espacio compacto:
- Banda de fondo (3 tonos): zona pobre / satisfactoria / buena
- Barra gruesa horizontal: valor actual (real)
- Línea vertical delgada: objetivo (plan)

**Para Danilandia:** En vista desktop, una lista de bullet charts por actividad permite comparar la ejecución de todas las actividades del año en un solo panel. En mobile, la barra de progreso es el equivalente apropiado (el bullet chart requiere ancho horizontal).

### 2.8 Patrón de doble valor en celda (más común en agro mobile)

El patrón más prevalente en herramientas móviles de gestión agrícola para comunicar plan vs. real en grids densos:

```
+------------------+
| PLAN / REAL      |
| 12   / 9  (75%)  |
+------------------+
```

Cada celda muestra el valor planificado arriba y el real abajo, con el % de cumplimiento como tercer elemento. El color de fondo refleja el RAG.

---

## 3. Resumen de brechas por severidad

| # | Brecha | Impacto | Esfuerzo de cierre |
|---|--------|---------|-------------------|
| 1 | Números de ejecución invisibles en el grid | **CRÍTICO** | Medio |
| 2 | Sin % cumplimiento por actividad | **CRÍTICO** | Bajo |
| 3 | Sin KPI de resumen en cabecera | **ALTO** | Bajo |
| 4 | Sin vista de período actual (semana/mes) | **ALTO** | Medio |
| 5 | Tabla plan/real solo en sub-página, no en GENERAL | **ALTO** | Bajo |
| 6 | Sin barras de progreso visual | **MEDIO** | Bajo |
| 7 | Sin jornales/manzana normalizado | **MEDIO** | Medio |
| 8 | Sin comparativa interanual | **BAJO** | Alto |
| 9 | Sin alertas automáticas de desviación | **MEDIO** | Alto |

---

## 4. Principio de diseño para Danilandia

El principio operativo más valioso identificado en la investigación (AGRIVI, Innov8.ag):

> **Las desviaciones detectadas en la semana son accionables. Las detectadas al cierre del mes son costos hundidos.**

El módulo de plan debe hacer visibles las desviaciones **dentro de la semana en que ocurren**, no solo como colores de fondo sin números, sino como datos explícitos que el administrador puede leer sin hacer hover ni navegar a sub-páginas.
