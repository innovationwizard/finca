# Plan de Mejoras — Módulo de Plan vs. Ejecución

**Fecha:** 2026-05-18  
**Basado en:** `docs/plan-execution-gaps-research.md`  
**Principio rector:** Las desviaciones detectadas en la semana son accionables. Las detectadas al cierre del mes son costos hundidos.

---

## Arquitectura de cambios

El módulo `/plan` tiene tres superficies de información:

1. **`/plan`** (vista general) — Grid editable de 48 semanas. Hoy solo muestra plan.
2. **`/plan/[loteSlug]`** (vista por lote) — Tabla resumen + grid detallado. La tabla resumen tiene plan/real/diferencia pero sin % cumplimiento ni barras.
3. **`plan-grid.tsx`** (componente compartido) — Motor visual del grid. El corazón del problema.

Las mejoras se agrupan en **tres fases** ordenadas por impacto / riesgo / dependencias.

---

## Fase 1 — Visibilidad de ejecución (crítico, sin cambios de esquema)

**Objetivo:** Que los usuarios puedan ver los números de ejecución sin hover, sin navegar a sub-páginas, sin suposiciones.

**Todas las mejoras de esta fase son no-destructivas: solo agregan información. No modifican el esquema de base de datos ni la lógica de guardado.**

---

### 1.1 Doble valor en celdas del grid (plan + real)

**Problema:** `plan-grid.tsx:243–258` — el valor real solo aparece en el atributo `title` (tooltip). En mobile es inaccesible.

**Solución:** Mostrar dos líneas dentro de cada celda cuando la celda tiene datos (plan > 0 o actual > 0).

**Diseño de celda:**
```
┌─────────┐
│  12     │  ← plan (tamaño normal, color finca)
│   9 ✓   │  ← real (tamaño más pequeño, verde/rojo según semáforo)
└─────────┘
```

**Reglas de visualización por celda:**
- Si `planned = 0` y `actual = 0`: celda vacía (sin cambio).
- Si `planned > 0` y `actual = 0`: muestra plan en gris claro (sin datos de ejecución aún — puede ser semana futura).
- Si `planned > 0` y `actual > 0`: muestra plan arriba en color normal, real abajo en color semáforo.
- Si `planned = 0` y `actual > 0`: muestra "—" arriba (sin plan), real abajo en ámbar (ejecución sin planificar).

**Archivos a modificar:**
- `src/app/(authenticated)/plan/plan-grid.tsx`

**Cambios específicos:**
1. En el bloque de celda de solo lectura (líneas 251–258), reemplazar el `<span>` único por una estructura de dos líneas.
2. El semáforo de fondo de celda se mantiene para contexto visual rápido.
3. El color del número real usa la misma lógica del semáforo pero aplicada al texto, no al fondo (mejor legibilidad).

**Estimación:** 2–3 horas de desarrollo.

---

### 1.2 Columna de % cumplimiento en la tabla resumen

**Problema:** `[loteSlug]/page.tsx:169–263` — la tabla tiene Plan | Real | Diferencia | Estado, pero no calcula ni muestra el % de cumplimiento.

**Solución:** Agregar columna `% Cumpl.` entre Diferencia y Estado.

**Cálculo:**
```
% Cumplimiento = (Real / Plan) × 100
- Si Plan = 0 y Real > 0: mostrar "Sin plan" (ámbar)
- Si Plan = 0 y Real = 0: no mostrar fila (ya existe este comportamiento)
- Si Plan > 0: calcular y colorear
```

**Colores de la columna % Cumpl.:**
- ≥ 95%: verde (`text-green-700 bg-green-50`)
- 75–94%: ámbar (`text-yellow-700 bg-yellow-50`)
- < 75%: rojo (`text-red-700 bg-red-50`)
- > 120%: ámbar (sobre-ejecución)

**Nota sobre colores:** La sobre-ejecución (> 100%) es ámbar, no verde, porque en jornales puede significar costos no planificados o re-trabajo, no necesariamente algo positivo.

**Archivos a modificar:**
- `src/app/(authenticated)/plan/[loteSlug]/page.tsx`

**Estimación:** 1 hora de desarrollo.

---

### 1.3 Tarjetas KPI en la cabecera de `/plan`

**Problema:** La página `/plan` no tiene ningún indicador de resumen. El gerente no puede saber de un vistazo si la finca va al día.

**Solución:** Agregar 4 tarjetas KPI entre los filtros y el grid.

**Tarjetas propuestas:**

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Plan YTD        │  │  Ejecutado YTD   │  │  % Cumplimiento  │  │  Δ Jornales      │
│  1,240 jornales  │  │  987 jornales    │  │  79.6%           │  │  −253            │
│  Año agrícola    │  │  Hasta hoy       │  │  ◉ Alerta        │  │  bajo plan       │
└──────────────────┘  └──────────────────┘  └──────────────────┘  └──────────────────┘
```

**Definiciones:**
- **Plan YTD:** Suma de todos los `plannedJornales` para semanas cuya fecha de inicio ya pasó (no el total del año, sino el acumulado esperado hasta hoy).
- **Ejecutado YTD:** Suma de todos los `actualJornales` registrados hasta hoy en el año agrícola.
- **% Cumplimiento:** `(Ejecutado YTD / Plan YTD) × 100`
- **Δ Jornales:** `Ejecutado - Plan YTD` (negativo = bajo plan, positivo = sobre plan)

**Cálculo de Plan YTD:** Requiere filtrar las `planEntries` cuyas semanas agrícolas ya han comenzado. La función `getAgriculturalYearStart` + fecha actual permiten calcular el mes y semana actuales, filtrando solo celdas `(month, week)` ≤ hoy.

**Archivos a modificar:**
- `src/app/(authenticated)/plan/page.tsx` (cálculos del lado servidor)
- Nuevo componente: `src/app/(authenticated)/plan/plan-kpi-cards.tsx` (puede ser server component, no necesita ser client)

**Estimación:** 3–4 horas de desarrollo.

---

### 1.4 Tabla resumen en vista GENERAL `/plan`

**Problema:** La tabla Plan | Real | Diferencia | Estado solo existe en `/plan/[loteSlug]`, no en la vista general `/plan`.

**Solución:** Agregar la misma tabla resumen (agregada sobre todos los lotes o sobre el lote seleccionado en el filtro) a la vista `/plan`, encima del grid detallado.

**Comportamiento:**
- Si no hay lote seleccionado (GENERAL): agregado sobre todos los lotes activos.
- Si hay lote seleccionado: idéntico a la vista de `/plan/[loteSlug]`.

**El código de la tabla resumen ya existe en `[loteSlug]/page.tsx:118–263`** — extraer a un componente server compartido `PlanSummaryTable` para reutilizarlo.

**Archivos a modificar:**
- `src/app/(authenticated)/plan/[loteSlug]/page.tsx` (extraer componente)
- `src/app/(authenticated)/plan/page.tsx` (usar componente)
- Nuevo componente: `src/app/(authenticated)/plan/plan-summary-table.tsx`

**Estimación:** 2 horas de desarrollo.

---

## Fase 2 — Visión de período y barras de progreso

**Objetivo:** Darle al gerente visibilidad del período actual (semana/mes en curso) y comunicar visualmente el avance relativo con barras de progreso.

---

### 2.1 Panel "Semana en curso"

**Descripción:** Una sección colapsable (abierta por defecto) en `/plan` y `/plan/[loteSlug]` que muestra solo las actividades de la semana agrícola actual con su plan y ejecución.

**Contenido del panel:**

```
═══ Semana en curso: S3 de Mayo 2026 ════════════════════════════════
 Actividad        Plan  Ejecutado  Avance         % Cumpl.
 ─────────────────────────────────────────────────────────
 Fertilización     12        9     [██████░░░░]    75%  ⚠
 Chapeo            20       20     [██████████]   100%  ✓
 Recolección       40       31     [███████░░░]    78%  ⚠
 ─────────────────────────────────────────────────────────
 TOTAL             72       60     [████████░░]    83%
```

**La barra de progreso:** Barra CSS simple de 100px de ancho. El fill es proporcional a `min(actual/planned, 1)`. Si `actual > planned`, la barra llega al 100% y cambia color a ámbar.

**Datos requeridos:** Solo necesita filtrar las `planEntries` y `activityRecords` para `(month = currentMonth, week = currentWeek)`. Datos ya disponibles en el backend.

**Archivos nuevos:**
- `src/app/(authenticated)/plan/plan-current-week.tsx` (server component)

**Archivos a modificar:**
- `src/app/(authenticated)/plan/page.tsx`
- `src/app/(authenticated)/plan/[loteSlug]/page.tsx`

**Estimación:** 4 horas de desarrollo.

---

### 2.2 Barras de progreso en tabla resumen

**Descripción:** En la tabla resumen (Fase 1.4), reemplazar la columna "Diferencia" por una columna con barra de progreso + número de diferencia debajo.

**Diseño de celda de columna Avance:**
```
[████████░░]  80%
−10 jornales
```

**Reglas:**
- Barra de 80px, fill = `min(actual / planned, 1.05)` — ligero overflow visual si hay sobre-ejecución
- Si `actual > planned`: fill = 100% + color ámbar en lugar de verde
- El número debajo es la diferencia absoluta (ya existente en la tabla actual)

**Archivos a modificar:**
- `src/app/(authenticated)/plan/plan-summary-table.tsx` (creado en Fase 1.4)

**Estimación:** 2 horas de desarrollo.

---

### 2.3 Indicador de jornales/manzana en tabla resumen

**Descripción:** Para cada actividad, mostrar la intensidad de labor normalizada: `jornales / manzana`.

**Columnas adicionales en la tabla:**
```
| Plan j/mz | Real j/mz |
|    4.0    |    3.1    |
```

**Cálculo:** `jornales / lote.areaManzanas` — en la vista GENERAL, se usa el total de manzanas de todos los lotes activos.

**Valor:** Permite comparar entre lotes de diferente tamaño y entre años agrícolas. Es el benchmark operativo estándar en caficultura tecnificada.

**Archivos a modificar:**
- `src/app/(authenticated)/plan/plan-summary-table.tsx`
- `src/app/(authenticated)/plan/page.tsx` (agregar `areaManzanas` al query de lotes)
- `src/app/(authenticated)/plan/[loteSlug]/page.tsx` (ya tiene `areaManzanas`)

**Estimación:** 2 horas de desarrollo.

---

## Fase 3 — Insights y comparativa avanzada

**Objetivo:** Agregar contexto comparativo (histórico, benchmarks) e insights automáticos que orienten decisiones.

---

### 3.1 Alertas automáticas de desviación

**Descripción:** Generar un array de alertas textuales en el servidor que se muestra como lista de avisos en la parte superior de `/plan`.

**Lógica de alertas:**

```
Para cada actividad en el período actual:
  if (% cumplimiento < 75% AND semanas_restantes_en_mes < 2):
    → ALERTA ROJA: "Fertilización: 75% de cumplimiento, solo 1 semana restante en el mes."

  if (% cumplimiento < 90% AND tendencia_últimas_2_semanas es decreciente):
    → AVISO: "Chapeo: tendencia decreciente las últimas 2 semanas."

  if (actual > planned × 1.2):
    → AVISO: "Recolección: ejecución 20% sobre plan. Verificar si requiere ajuste de plan."
```

**Diseño:** Panel colapsable en la cabecera de `/plan`, solo visible si hay alertas. Si todo está en rango, no aparece (sin ruido visual innecesario).

**Archivos nuevos:**
- `src/lib/utils/plan-alerts.ts` — función `generatePlanAlerts(planEntries, actualData, activities, currentDate)`
- `src/app/(authenticated)/plan/plan-alerts-panel.tsx`

**Archivos a modificar:**
- `src/app/(authenticated)/plan/page.tsx`

**Estimación:** 5–6 horas de desarrollo.

---

### 3.2 Comparativa año anterior

**Descripción:** En la tabla resumen, agregar columnas opcionales para el año anterior: `PL ant.` | `AC ant.` para comparar si este año se está planificando y ejecutando diferente.

**Lógica:** Calcular `previousYear` a partir de `selectedYear`, hacer una segunda query de `planEntries` y `activityRecords` para ese año, y mostrar como columnas adicionales.

**Archivos a modificar:**
- `src/app/(authenticated)/plan/plan-summary-table.tsx`
- `src/app/(authenticated)/plan/page.tsx`
- `src/app/(authenticated)/plan/[loteSlug]/page.tsx`

**Estimación:** 4 horas de desarrollo.

---

### 3.3 Vista mobile de ejecución optimizada

**Descripción:** El grid de 48 columnas es impracticable en pantallas < 768px. Crear una vista alternativa para mobile que muestre solo el mes/semana actual con un card por actividad.

**Diseño mobile (card por actividad):**

```
┌─────────────────────────────────────┐
│ Fertilización                  ⚠    │
│ Plan: 12 jornales                   │
│ Ejecutado: 9 jornales               │
│ [█████████░░░░░░░░░░] 75%           │
│ −3 jornales bajo plan               │
└─────────────────────────────────────┘
```

**Implementación:** CSS `@media (max-width: 768px)` — ocultar el grid de 48 columnas y mostrar la lista de cards. Sin JavaScript adicional, puro CSS responsive.

**Archivos nuevos:**
- `src/app/(authenticated)/plan/plan-mobile-view.tsx`

**Archivos a modificar:**
- `src/app/(authenticated)/plan/page.tsx`
- `src/app/(authenticated)/plan/[loteSlug]/page.tsx`

**Estimación:** 5–6 horas de desarrollo.

---

## Resumen por fases

### Fase 1 (impacto crítico, ~8–10 horas totales)

| Tarea | Archivos | Horas |
|-------|----------|-------|
| 1.1 Doble valor en celdas del grid | `plan-grid.tsx` | 2–3 |
| 1.2 % cumplimiento en tabla resumen | `[loteSlug]/page.tsx` | 1 |
| 1.3 Tarjetas KPI en cabecera | `page.tsx`, nuevo `plan-kpi-cards.tsx` | 3–4 |
| 1.4 Tabla resumen en vista GENERAL | `page.tsx`, nuevo `plan-summary-table.tsx` | 2 |
| **Total Fase 1** | | **8–10 h** |

### Fase 2 (impacto alto, ~8 horas totales)

| Tarea | Archivos | Horas |
|-------|----------|-------|
| 2.1 Panel semana en curso | nuevo `plan-current-week.tsx` | 4 |
| 2.2 Barras de progreso en tabla | `plan-summary-table.tsx` | 2 |
| 2.3 Jornales/manzana | `plan-summary-table.tsx`, páginas | 2 |
| **Total Fase 2** | | **8 h** |

### Fase 3 (impacto estratégico, ~15–16 horas totales)

| Tarea | Archivos | Horas |
|-------|----------|-------|
| 3.1 Alertas automáticas | nuevo `plan-alerts.ts`, `plan-alerts-panel.tsx` | 5–6 |
| 3.2 Comparativa año anterior | múltiples | 4 |
| 3.3 Vista mobile optimizada | nuevo `plan-mobile-view.tsx` | 5–6 |
| **Total Fase 3** | | **14–16 h** |

---

## Consideraciones de implementación

### Cambios de esquema de base de datos
**Ninguna de las tres fases requiere cambios al esquema Prisma.** Todos los datos necesarios (planEntries, activityRecords, lotes con areaManzanas) ya existen. Solo se trata de calcular y mostrar datos que ya están en el backend pero son invisibles en el frontend.

### Compatibilidad con el grid editable
Las modificaciones a `plan-grid.tsx` deben preservar el comportamiento de edición inline. Las celdas en modo edición (`canEdit && loteId`) solo muestran el valor planificado editable — agregar el real debajo en modo de lectura, pero en modo edición el foco debe ser el número editable sin distracción.

### Cálculo de "semana en curso"
El cálculo del período actual (mes agrícola y semana actual) ya existe en `src/lib/utils/agricultural-year.ts` con las funciones `getAgriculturalMonth(date)` y `getWeekInMonth(date)`. Se usa `new Date()` en el servidor para determinar el período actual.

### Performance
Las queries necesarias para los KPIs de Fase 1.3 son las mismas que ya se hacen en `page.tsx` (`planEntries` + `activityRecords`). No se agregan queries adicionales — solo se agregan cálculos sobre los datos ya obtenidos.

### Orden de implementación recomendado
1. Empezar por **Fase 1.1** (doble valor en celdas) — es el cambio de mayor impacto visual y más bajo riesgo.
2. Seguir con **Fase 1.2** (% cumplimiento) — una línea de cálculo y una columna nueva.
3. Luego **Fase 1.4** (extraer tabla resumen como componente compartido) — necesario antes de 1.3 y 2.x.
4. Terminar Fase 1 con **Fase 1.3** (KPI cards).
5. Fase 2 y 3 en orden de prioridad del propietario del producto.
