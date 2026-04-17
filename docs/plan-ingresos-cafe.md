# Plan: Reemplazar Excel de Ingresos de Café

## Estado Actual

El workbook `_Ingresos.xlsx` tiene 8 hojas. 3 están vacías/stub. Las 5 con datos son:

| Hoja | Propósito | Filas de datos |
|------|-----------|----------------|
| `5. INGRESOS DE CAFE` | Log principal: cada ingreso de cereza del campo | 188 registros |
| `6. INGRESO DE COMPRA DE CAFE` | Compras de café a terceros | 5 registros |
| `Resumen` | Dashboard: cosecha por lote, rendimientos por grado, despachos | Calculado |
| `RI` | Plantilla de impresión: Recibo de Ingreso | 1 registro (template) |
| `DATOS` | Listas de referencia (lotes, tipos, unidades) | Lookups |

La app ya tiene el módulo `ingreso-café` con modelo `CoffeeIntake`, formulario de creación, listado con filtros, vista de detalle con pipeline de estados, y API completa. **La mayoría del flujo de datos ya está cubierto.** Lo que falta son features de agregación y visualización que hoy viven en la hoja `Resumen`.

---

## Gap Analysis: Excel vs. App

### ✅ Ya cubierto por la app

| Función del Excel | Feature en la app |
|---|---|
| Fecha de ingreso | `CoffeeIntake.date` |
| Tipo de café (Cereza/Pergamino/Oro) | `CoffeeIntake.coffeeType` enum |
| Código de ingreso (IC-2526-NNN) | `CoffeeIntake.code` auto-generado |
| Cantidad de bultos | `CoffeeIntake.bultos` |
| Peso neto en quintales | `CoffeeIntake.pesoNetoQq` |
| Peso pergamino | `CoffeeIntake.pesoPergaminoQq` |
| Rendimiento (cereza/pergamino) | `CoffeeIntake.rendimiento` calculado |
| Lote (pante) | `CoffeeIntake.loteId` → Lote |
| Notas/observaciones | `CoffeeIntake.notes` |
| Compras: proveedor, procedencia, cuenta bancaria | Campos en CoffeeIntake |
| Compras: precio por qq | `CoffeeIntake.pricePerQq` |
| Compras: estado de pago | `CoffeeIntake.paymentStatus` |
| Pipeline de procesamiento | `CoffeeIntake.status` (6 estados) |
| Despacho (código, fecha) | `CoffeeIntake.dispatchCode/Date` |

### ✅ Gap 1: Verde — COMPLETADO (2026-04-17)
Campo `pesoVerdeQq` agregado al modelo `CoffeeIntake`. 96 registros importados con datos de verde. Formulario de nuevo ingreso incluye campo "Peso Verde (qq)" opcional para COSECHA. KPIs muestran: Maduro, Verde, Total Cosecha, Pergamino, # Ingresos.

### ✅ Gap 2: Acumulado — COMPLETADO (2026-04-17)
Columna "Acumulado" calculada dinámicamente en el listado (running total por fecha, sin almacenar). Footer muestra total de verde.

### ✅ Gap 3: Resumen por Lote — COMPLETADO (2026-04-17)
Tabla "Cosecha por Lote" al final de la página de ingreso-café. Columnas: Lote, Cereza (qq), %, Verde (qq), Días de Corte. Calculado server-side sin queries adicionales.

### ❌ Gaps pendientes

#### Gap 4: Rendimientos por Grado — Sección 2 de hoja Resumen
**Qué es:** Breakdown del pergamino producido por calidad (Primera, Bolita, Natas, Flote, Escogida, etc.) con rendimiento cereza→pergamino y pergamino→oro por grado.
**Grados:** Pergamino Primera, Pergamino Finca, Pergamino en proceso, Escogida, Pergamino de Verde, Bolita, Natas, Flote.

**Solución propuesta:** Esto requiere un nuevo concepto que hoy no existe: **grados de pergamino con sus pesos**. Opciones:
- **Opción A:** Agregar campo `coffeeGrade` enum al modelo CoffeeIntake para registros tipo PERGAMINO.
- **Opción B:** Crear modelo separado `ParchmentOutput` que vincule un CoffeeIntake (cereza) con sus salidas de pergamino por grado.

La Opción B es más fiel al proceso real: de un ingreso de cereza salen múltiples grados de pergamino.

#### Gap 5: Log de Despachos a Beneficio Externo — Sección 3 de hoja Resumen
**Qué es:** Registro de cada envío de café (pergamino, natas, etc.) a beneficios externos (La Joya, Coyote) con fecha, qq, calidad, rendimiento, y qq oro resultantes.
**Para qué sirve:** Tracking de qué se mandó a procesar afuera, cuánto oro se obtuvo, y rendimiento por beneficio.

**Solución propuesta:** La app ya tiene `dispatchCode` y `dispatchDate` en CoffeeIntake, pero no captura: destino, calidad enviada, ni rendimiento a oro. Opciones:
- **Opción A:** Agregar campos al modelo existente: `dispatchDestination`, `dispatchQuality`, `qqOro`.
- **Opción B:** Crear modelo `CoffeeShipment` separado que agrupe múltiples CoffeeIntakes en un envío con destino, rendimiento a oro, etc.

La Opción B es más limpia — un despacho puede incluir café de múltiples ingresos.

#### Gap 6: Recibo de Ingreso (RI) — Hoja RI
**Qué es:** Plantilla imprimible para generar un recibo físico cuando llega café.

**Solución propuesta:** Generar PDF desde la vista de detalle del ingreso. Botón "Imprimir Recibo" que renderiza el formato del RI con los datos del registro.

---

## Plan de Implementación

### ✅ Fase 1: Completar datos base — COMPLETADO (2026-04-17)
1. ~~Agregar campo `pesoVerdeQq` al modelo CoffeeIntake (migración).~~
2. ~~Importar los 179 registros de cosecha y 5 de compra, incluyendo verde (96 registros con verde).~~
3. ~~Actualizar formulario de nuevo ingreso para incluir campo "Peso Verde (qq)" opcional.~~
4. ~~Actualizar listado: 5 KPIs (Maduro, Verde, Total Cosecha, Pergamino, # Ingresos), columnas Verde QQ y Acumulado en tabla.~~

**Datos importados:**
- 179 registros cosecha propia (IC-2526-01 → IC-2526-179)
- 5 registros compra (ICC-2526-01 → ICC-2526-05)
- 96 registros con peso verde
- 114 registros con peso pergamino
- Pante "Vuelta Grande" → loteId null (no se puede determinar VG1 vs VG2)
- Pante "ROBUSTA" → loteId null, preservado en notes

### ✅ Fase 2: Resumen por Lote — COMPLETADO (2026-04-17)
5. ~~Tabla "Cosecha por Lote" al final de la página ingreso-café.~~
6. ~~Columnas: Lote, Cereza (qq), %, Verde (qq), Días de Corte. Footer con totales.~~

### Fase 3: Grados de Pergamino (mediano plazo)
7. **Diseñar modelo** para registrar producción de pergamino por grado.
8. **Crear UI** para registrar pesos de pergamino por grado cuando un ingreso avanza a estado PERGAMINO.
9. **Agregar vista resumen** de rendimientos por grado con cálculos cereza→pergamino y pergamino→oro.

### Fase 4: Despachos (mediano plazo)
10. **Diseñar modelo `CoffeeShipment`** para envíos a beneficios externos.
11. **Crear UI** para registrar despachos: seleccionar ingresos, destino, cantidad, calidad.
12. **Agregar vista resumen** de despachos con rendimiento a oro por beneficio.

### Fase 5: Recibo imprimible (opcional)
13. **Generar PDF** del recibo de ingreso desde la vista de detalle.

---

## Preguntas Clarificadoras

### Sobre Verde (Gap 1)
1. ¿El verde se pesa por separado en el momento del ingreso, o se determina después?
2. ¿El verde siempre viene del mismo lote que el maduro en el mismo ingreso?

### Sobre Rendimientos por Grado (Gap 4)
3. Los grados del Excel son: Pergamino Primera, Pergamino Finca, Pergamino en proceso, Escogida, Pergamino de Verde, Bolita, Natas, Flote. ¿Esta lista es fija o puede cambiar?
4. ¿Cada ingreso de cereza produce todos los grados, o varía?
5. ¿Los rendimientos cereza→pergamino se miden por lote, por ingreso, o por batch de procesamiento?
6. ¿El rendimiento pergamino→oro (columnas D y E de la sección 2 del Resumen) viene del beneficio externo, o se mide en finca?

### Sobre Despachos (Gap 5)
7. ¿El despacho siempre va a un beneficio externo, o a veces se procesa internamente hasta oro?
8. ¿Los beneficios destino (La Joya, Coyote) son fijos, o pueden variar por cosecha?
9. ¿El rendimiento a oro del despacho lo reporta el beneficio externo, o se calcula?
10. ¿Un despacho puede mezclar café de múltiples lotes?

### Sobre Entradas Duales (Split 50/50)
11. En el Excel hay filas donde el peso (col E) es una suma de dos valores (ej: `26.85+4.1`). Luis dice que se reparten "mita mita" entre cuadrilla y voluntarios. En la app, ¿deben ser registros separados o uno solo?
12. Cuando cuadrilla y voluntarios cortan en lotes diferentes el mismo día, ¿el peso se asigna 50/50 a cada lote, o se conoce el desglose exacto?

### Sobre el Recibo (Gap 6)
13. ¿Se sigue usando el recibo físico? ¿El formato del Excel RI es el correcto, o ha cambiado?

### Sobre Prioridades
14. ¿Cuál es el orden de prioridad? Sugerimos: Fase 1 (datos) → Fase 2 (resumen lotes) → Fase 3 (grados) → Fase 4 (despachos) → Fase 5 (recibo).
15. ¿Hay alguna función del Excel que no hayamos identificado y que sea crítica?

---

## Modelo de Datos Propuesto (Fase 3-4)

```
CoffeeIntake (existente)
  + pesoVerdeQq  Decimal?    -- Fase 1
  |
  |-- ParchmentOutput (nuevo, Fase 3)
  |     id, coffeeIntakeId, grade (enum), pesoQq, rendimiento
  |     Grados: PRIMERA, FINCA, EN_PROCESO, ESCOGIDA, VERDE, BOLITA, NATAS, FLOTE
  |
  |-- CoffeeShipment (nuevo, Fase 4)
        id, date, destination, quality, pesoQq, rendimientoOro, qqOro, notes
        Puede agrupar múltiples CoffeeIntakes via tabla puente
```

---

## Resultado Esperado

Al completar las 5 fases, la app reemplaza completamente el Excel:
- **Hoja 5 (Ingresos)** → Formulario + listado existente + verde + acumulado
- **Hoja 6 (Compras)** → Mismo formulario con source=COMPRA (ya existe)
- **Hoja Resumen sección 1** → Vista resumen por lote
- **Hoja Resumen sección 2** → Vista resumen por grado de pergamino
- **Hoja Resumen sección 3** → Vista de despachos a beneficios
- **Hoja RI** → PDF generado desde detalle
- **Hoja DATOS** → Tablas de referencia ya en DB (lotes, tipos, etc.)
