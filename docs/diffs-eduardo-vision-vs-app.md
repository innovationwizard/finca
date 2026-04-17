# Diffs: App Actual vs. Visión Eduardo — Análisis Detallado

> **Fecha**: 2026-04-17
> **Fuente**: Transcripción de reunión con Eduardo Sampaio (Brasil) + análisis de codebase + investigación de software de la industria
> **Contexto**: Eduardo Sampaio, consultor brasileño con experiencia en >500 fincas de café, delineó la visión completa del software para Finca Danilandia y Anexos durante reunión con Leonel, Jorge Luis, Luis Castellanos, Luis Arimany, Tono y Willy.

---

## Resumen Ejecutivo

La app actual cubre aproximadamente el **25-30%** del alcance completo descrito por Eduardo. Lo que existe es sólido y de calidad producción (offline-first, validación Zod, auditoría, RBAC). Pero la visión de Eduardo es un sistema integral que conecta **finca → beneficio → exportadora → cliente final**, con contabilidad, benchmarking, trazabilidad regulatoria (EUDR), y planificación financiera multi-año.

El gap no es de calidad — es de alcance.

---

## 1. Modelo de Costos: Despesa vs. Custo

### Lo que Eduardo describió

El modelo financiero brasileño de 3 capas:

1. **Despesa (Gasto)**: La compra cruda. "Compramos un nitrato" — es un gasto.
2. **Asignación a lote**: "Usamos parte de él en el lote, con transporte y con jornadas."
3. **Custo (Costo)**: El costo completo asignado al lote incluye: **mano de obra + insumo + transporte interno**.

Eduardo fue explícito: *"El software tiene que tener el costo de mano de obra, el costo de la adquisición del insumo, y el costo de transporte interno en la finca para la aplicación en el lote."*

Además, 3 dimensiones de costeo:
- **Mantenimiento** (costo operativo puro — para comparar fincas)
- **Mantenimiento + costo financiero** (incluye intereses)
- **Mantenimiento + costo financiero + depreciación** (para consejo/ejecutivos)

### Lo que la app tiene hoy

| Concepto | Estado | Detalle |
|---|---|---|
| Costo de mano de obra por lote | **Parcial** | `ActivityRecord.totalEarned` se suma por lote — pero solo cubre jornales, no el costo completo |
| Costo de insumos por lote | **No existe** | No hay modelo de insumos, compras, ni inventario |
| Costo de transporte interno | **No existe** | No hay modelo de transporte |
| Despesa → rateio → custo (3 capas) | **No existe** | Solo hay gasto directo de mano de obra |
| Dimensiones (mantenimiento / financiero / depreciación) | **No existe** | No hay separación de CAPEX vs OPEX |
| Costo por quintal (custo por saca) | **No existe** | KPI fundamental del benchmarking brasileño |

### Referencia industria

**MyFarm** (Brasil) es el líder en este modelo. Implementa el rateio completo: una compra de fertilizante se divide proporcionalmente entre lotes según área, uso, o reglas personalizadas. Calcula "custo por saca" (costo por quintal) como KPI principal. Separa CAPEX/OPEX y calcula depreciación de maquinaria, infraestructura, y de la plantación misma (lavoura en formación vs. en producción).

**SAP Agriculture** hace esto también, pero con costo de implementación de 6-18 meses y equipo IT dedicado.

### Gap: CRÍTICO

Este es el corazón del sistema que Eduardo describe. Sin este modelo, no se puede hacer benchmarking, ni análisis de rentabilidad por lote, ni presupuesto operativo real.

---

## 2. Presupuesto Anual por Lote y Finca

### Lo que Eduardo describió

*"Aquí planeamos un budget anual por lote y por la finca."*

- Presupuesto anual desglosado por lote
- Actividades con costos proyectados
- Plan de 4 años (2027, 2028, 2029, 2030)
- Planilla de inversiones separada (pulperos, oficina, nuevas plantaciones)
- Escenarios: más probable, optimista, pesimista
- Varianza: presupuesto vs. real (orcado vs. realizado)

### Lo que la app tiene hoy

| Concepto | Estado | Detalle |
|---|---|---|
| Plan anual de actividades | **Existe** | `PlanEntry` — jornales planeados por actividad/lote/mes/semana |
| Plan vs. Actual | **Existe** | Comparación visual plan vs. registros de actividad reales |
| Presupuesto monetario (GTQ) | **No existe** | El plan solo registra jornales, no costos proyectados |
| Presupuesto multi-año | **No existe** | Solo año agrícola actual ± 2 |
| Escenarios (optimista/pesimista) | **No existe** | |
| Varianza presupuesto vs. real | **Parcial** | Solo en jornales, no en GTQ |
| Inversiones separadas (CAPEX) | **No existe** | No hay modelo de inversiones |

### Referencia industria

**MyFarm** ofrece presupuesto por safra (cosecha) con comparación planeado vs. real (varianza). **Aegro** tiene presupuesto por talhão (lote) con proyección de cash flow. Ambos separan costos de mantenimiento de inversiones.

### Gap: ALTO

El plan actual mide jornales, no dinero. Para convertirlo en presupuesto financiero se necesita: multiplicar jornales × costo, agregar insumos planeados, y agregar costos indirectos.

---

## 3. Inventario de Insumos (Kardex)

### Lo que Eduardo describió

*"Compramos un nitrato, es despesa. Después usamos parte de él en el lote."*

- Catálogo de productos (fertilizantes, herbicidas, diésel, etc.)
- Compras con precios, proveedores, cantidades
- Uso por lote (cuánto de cada insumo se aplicó en cada lote)
- Stock remanente
- Catálogo de proveedores

### Lo que la app tiene hoy

| Concepto | Estado | Detalle |
|---|---|---|
| Catálogo de insumos | **No existe** | Mencionado como FUTURO en schema (`FUTURE: INSUMOS KARDEX`) |
| Registro de compras (insumos) | **No existe** | Solo existen compras de café (`CoffeeIntake` con source=COMPRA) |
| Aplicación de insumos por lote | **No existe** | |
| Stock / inventario | **No existe** | |
| Catálogo de proveedores | **No existe** | Solo `supplierName` como texto libre en compras de café |

### Referencia industria

**Aegro** tiene gestión completa de insumos: warehouse management (estoque de insumos), compras, consumo por lote, y stock remanente. **Cropwise** lo maneja desde el ángulo de protección de cultivos (qué agroquímico se aplicó, dónde, cuándo). **SAP** es el más completo con procurement-to-payment.

### Gap: ALTO

El scaffold ya prevé este módulo (comentario `FUTURE: INSUMOS KARDEX`). Es prerequisito del modelo de costos completo.

---

## 4. Trazabilidad Completa (Lote → Exportadora → Cliente Final)

### Lo que Eduardo describió

*"Sacamos X quintales uva de un lote en un determinado día, que va al despulpador, que tiene un rendimiento X. Tenemos tantos quintales pergamino. Este va a la guardiola. Y de la guardiola puede ser mezclado con otros lotes."*

*"Si el cliente final quiere hacer un test de residuos de agroquímicos, glifosato, y hay un problema, se puede trasear all the way back hasta el origen."*

Trazabilidad completa:
1. **Lote de origen** (quién cortó, cuándo, de qué lote)
2. **Despulpado** (rendimiento cereza → pergamino)
3. **Secado** (guardiola, patio, tiempo)
4. **Pergamino** (grado, clasificación)
5. **Mezcla** (qué lotes se combinaron)
6. **Envío a beneficio externo** (destino, cantidad, calidad)
7. **Resultado de oro** (rendimiento pergamino → oro)
8. **Exportación** (exportadora, contrato, destino final)
9. **Catación** (puntaje, defectos, perfil)
10. **Correlación** con año agrícola, clima, nutrición

### Lo que la app tiene hoy

| Concepto | Estado | Detalle |
|---|---|---|
| Lote de origen | **Existe** | `CoffeeIntake.loteId` |
| Peso cereza (maduro + verde) | **Existe** | `pesoNetoQq` + `pesoVerdeQq` |
| Pipeline de estados | **Existe** | 6 estados: RECIBIDO → DESPULPADO → SECANDO → PERGAMINO → ENVASADO → DESPACHADO |
| Peso pergamino | **Existe** | `pesoPergaminoQq` |
| Rendimiento cereza/pergamino | **Existe** | `rendimiento` calculado |
| Grados de pergamino | **No existe** | Planificado como Gap 4 en `plan-ingresos-cafe.md` |
| Mezcla de lotes | **No existe** | No hay modelo de blending |
| Despacho a beneficio externo | **Parcial** | `dispatchCode` y `dispatchDate` existen, pero no destino, calidad enviada, ni resultado de oro |
| Rendimiento pergamino → oro | **No existe** | |
| Exportación (contrato, destino) | **No existe** | Mencionado como FUTURO en schema |
| Catación completa | **Parcial** | `cuppingScore` existe como campo decimal, sin desglose (defectos, descriptores, protocolo SCA) |
| Correlación con clima/nutrición | **No existe** | |
| Trazabilidad inversa (oro → lote) | **No existe** | No hay genealogía de lotes |
| Cumplimiento EUDR | **No existe** | Polígonos GPS, due diligence, documentación de no-deforestación |

### Referencia industria

**Cropster** es el estándar global para trazabilidad post-cosecha en café de especialidad. Maneja genealogía de lotes (qué cereza → qué pergamino → qué oro → qué blend), protocolos de catación SCA, y tracking de procesamiento (fermentación, curvas de secado). Sin embargo, Cropster **no** cubre la parte de finca (labor, insumos, costos).

**Farmforce** (Syngenta) cubre trazabilidad "first-mile" (finca → punto de colección) con documentación de cumplimiento para certificaciones (Rainforest Alliance, Fairtrade, 4C).

Ningún software integra la cadena completa finca → beneficio → exportadora en una sola plataforma. Este es el gap más grande de la industria.

### Gap: CRÍTICO

La trazabilidad es el pilar de la propuesta de valor para la exportadora y el cumplimiento EUDR europeo. Eduardo fue explícito: *"Esto está de acuerdo con las regulaciones de EUDR de Europa."*

---

## 5. Benchmarking

### Lo que Eduardo describió

*"Este punto es clave para indicar benchmarking a través de los años y apurar la performance anual de las jornadas."*

Dos tipos de benchmarking:
1. **Interno**: comparar lotes dentro de la finca (costo/qq, rendimiento, productividad de jornadas)
2. **Externo**: comparar con los mejores productores del mismo arquetipo (fincas vitrina)

Indicadores de rendimiento con semáforo:
- **Verde**: dentro de parámetros ideales
- **Amarillo**: atención
- **Rojo**: fuera de rango

*"El software puede evaluar rojo si está malo, amarillo atención, verde está bueno."*

### Lo que la app tiene hoy

| Concepto | Estado | Detalle |
|---|---|---|
| Comparación entre lotes (producción) | **Parcial** | Resumen por Lote en ingreso-café muestra cereza/verde/días por lote |
| Comparación entre lotes (costo) | **Parcial** | Dashboard tiene gráfico "Costo por Lote" (solo mano de obra) |
| Semáforo en actividades | **Parcial** | `minQtyAlert` / `maxQtyAlert` en Activity + alertas en dashboard |
| Plan vs. Actual con semáforo | **Existe** | Plan grid compara jornales planeados vs. reales con colores |
| Costo por quintal por lote | **No existe** | Falta el modelo de costos completo |
| Benchmarking externo | **No existe** | Requiere datos de referencia de cooperativas/industria |
| Benchmarking multi-año | **No existe** | No hay comparación histórica año contra año |
| Indicadores de performance por actividad | **Parcial** | Solo alerta de rendimiento (< 4.0 o > 7.0) y cantidades sospechosas |

### Referencia industria

**MyFarm** lidera en benchmarking interno y externo. Se asocia con cooperativas (Cooxupé, Minasul) para benchmarking anonimizado entre productores: "tu costo por saca es R$480; el promedio cooperativa es R$420; el cuartil superior es R$380."

**Cropwise** tiene benchmarking de protección de cultivos (presión de plagas vs. promedio regional).

### Gap: MEDIO-ALTO

Los bloques base existen (alertas, plan vs. actual), pero el benchmarking completo necesita: modelo de costos, datos históricos multi-año, y eventualmente datos externos de referencia.

---

## 6. Compatibilidad Contable y Financiera

### Lo que Eduardo describió

*"Necesitamos también que el software tenga una proposición que es compatible con contabilidad y con financiero."*

- Integración con contabilidad (plan de cuentas)
- Contador con contraseña de acceso
- Separación: inversión (nuevo lote, camioneta) vs. mantenimiento
- Depreciación de activos (maquinaria, infraestructura, plantación)
- Compatible con estados financieros estándar (EBITDA)
- Ventas, compras, proveedores, catálogo de portafolio

### Lo que la app tiene hoy

| Concepto | Estado | Detalle |
|---|---|---|
| Plan de cuentas | **No existe** | |
| Integración contable | **No existe** | |
| Rol de contador | **No existe** | Los roles son MASTER/ADMIN/MANAGER/FIELD/CEO/CFO — CFO es read-only |
| Separación inversión/mantenimiento | **No existe** | |
| Depreciación de activos | **No existe** | |
| Estados financieros | **No existe** | |
| Ventas/exportaciones | **No existe** | |
| Facturación | **No existe** | |

### Referencia industria

**MyFarm** tiene plan de cuentas alineado con normas contables rurales brasileñas. **SAP Agriculture** es full ERP (GL, AP, AR, activos fijos, multi-moneda). **Aegro** integra con NFe (factura electrónica brasileña).

### Gap: ALTO

Este es un módulo completo de ERP que aún no existe. La app actual es un sistema de gestión operativa, no financiera.

---

## 7. Conexión con Exportadora

### Lo que Eduardo describió

*"El software es un ambiente de trabajo conectando la finca a la exportadora, al cliente final."*

- El sistema debe conectar finca ↔ exportadora (EDA)
- Envío de lotes listos (pergamino 11.5-12% humedad) al beneficio/exportadora
- Tracking de venta a Europa
- Ambiente compartido entre finca y exportadora

### Lo que la app tiene hoy

| Concepto | Estado | Detalle |
|---|---|---|
| Envío a exportadora | **Mínimo** | `dispatchCode` y `dispatchDate` — solo referencia, sin tracking |
| Portal para exportadora | **No existe** | |
| Contratos de venta | **No existe** | |
| Tracking de humedad | **No existe** | |
| Multi-finca (para exportadora) | **No existe** | |

### Referencia industria

**Cropster** tiene módulo de "Green Coffee" que conecta productores con compradores (gestión de contratos, muestras, evaluación de calidad). **Farmforce** conecta productores con exportadores para trazabilidad first-mile.

Ninguno de estos conecta operaciones de finca con operaciones de exportadora en un solo sistema.

### Gap: ALTO (pero puede ser fase posterior)

Eduardo mencionó que esto es una visión de 4-5 años. El sistema de la exportadora podría ser una app separada que consume datos de la app de finca vía API.

---

## 8. Estimados de Corte Multi-Punto

### Lo que Eduardo describió

*"Estimado de corte, vamos a tener cuatro. Un, al final del corte. Dos, durante la floración. Tres, en desarrollo de las uvas y un poco más adelante."*

- 4 estimados en diferentes momentos del ciclo
- Planilla de 8 años (4 pasados consolidados + 4 futuros)
- 2 años próximos para vender café + 2 a mediano plazo como potencial

### Lo que la app tiene hoy

| Concepto | Estado | Detalle |
|---|---|---|
| 4 estimados + final | **Existe** | `ProductionEstimate` con tipos PRIMERA, SEGUNDA, TERCERA, CUARTA, FINAL |
| Multi-año | **Existe** | 5 años agrícolas (2425-2829) |
| 8 años (4 pasados + 4 futuros) | **Parcial** | Solo 5 años. Falta expandir a 8 y separar consolidado vs. proyección |
| Escenarios | **No existe** | Solo un valor por estimado, no optimista/pesimista |
| Tracking de precisión del estimado | **No existe** | No se mide cuán preciso fue cada estimado vs. producción real |

### Referencia industria

Los softwares brasileños capturan estimados secuenciales y rastrean precisión histórica (qué tan confiable es cada tipo de estimado para mejorar metodología año a año).

### Gap: BAJO

La base existe y es funcional. Las mejoras son incrementales: expandir años, agregar escenarios, y comparar estimado vs. real.

---

## 9. Catálogo de Actividades con Niveles de Performance

### Lo que Eduardo describió

*"Hay un estado de todas las actividades con niveles ideales de performance, para tener en cuenta cuántas jornadas, que es multiplicada por el pago, por manzana, por actividad."*

*"Esto va a ser como un cardápio, un menú de actividades en el software."*

- Catálogo completo de todas las actividades agrícolas
- Cada actividad con niveles ideales de rendimiento
- Performance medida: cuántas hectáreas un tractor chapea por día, cuántos litros de diésel, cuánto de abono, cuánto de corte
- Benchmarks por actividad para capacitación

### Lo que la app tiene hoy

| Concepto | Estado | Detalle |
|---|---|---|
| Catálogo de actividades | **Existe** | 19 actividades con nombre, unidad, precio, flags cosecha/beneficio |
| Alertas de cantidad min/max | **Existe** | `minQtyAlert` / `maxQtyAlert` por actividad |
| Niveles ideales de performance | **Parcial** | Solo alertas binarias (fuera de rango), no benchmarks graduales |
| Performance por máquina | **No existe** | No hay modelo de maquinaria |
| Consumo de insumos por actividad | **No existe** | No hay relación actividad → insumos |
| Benchmarks para capacitación | **No existe** | |

### Referencia industria

**Cropwise** tiene protocolos de monitoreo estructurados con benchmarks por actividad. **Aegro** registra horas máquina, horas laborales, e insumos por actividad. En Brasil, 30 años de datos acumulados permiten benchmarks como: "chapear 1 hectárea requiere X jornales en terreno plano, Y en montaña."

### Gap: MEDIO

La estructura base existe. Falta enriquecer el catálogo con benchmarks detallados, consumo de insumos esperado, y tracking de maquinaria.

---

## 10. Validación de Datos en Campo

### Lo que Eduardo describió

*"Los softwares tienen filtros, por ejemplo. Podemos colocar, no acepten más de 500 quintales, porque nunca ocurrió. Es una faja mínima también."*

*"Como tratar de ir cerrando esos caps para que sea solo puro tipeo y ahí alertas de que no suena lógico que hoy cortamos mil quintales cuando hemos venido cortando 300."*

- Filtros de rango por campo (min/max)
- Alertas de inconsistencia lógica
- Unidades fijas (no texto libre)
- Validación de decimales y comas

### Lo que la app tiene hoy

| Concepto | Estado | Detalle |
|---|---|---|
| Unidades fijas (enum) | **Existe** | `ActivityUnit` enum: QUINTAL, MANZANA, HECTAREA, JORNAL, DIA |
| Rangos min/max por actividad | **Existe** | `minQtyAlert` / `maxQtyAlert` en Activity |
| Alerta de rendimiento anómalo | **Existe** | Dashboard: rendimiento < 4.0 o > 7.0 |
| Alerta de cantidad sospechosa | **Existe** | Dashboard: Corte de Café > 5 qq |
| Validación Zod | **Existe** | Schemas completos con regex, enums, bounds |
| Reglas condicionales | **Existe** | COSECHA requiere loteId, COMPRA requiere supplierName |
| Alertas de tendencia | **No existe** | No hay comparación con promedio histórico |
| Validación de decimal/coma | **Existe** | Zod `Decimal` + campos numéricos HTML |

### Gap: BAJO

Este es uno de los puntos más fuertes de la app actual. Las mejoras serían alertas basadas en tendencia histórica (no solo rangos estáticos).

---

## 11. Roles y Acceso Multi-Usuario

### Lo que Eduardo describió

*"El contador tiene una contraseña de acceso para hacer vendas también."*

- Finca (caporal, encargado)
- Administración (Luis)
- Contador (acceso financiero)
- Consejo/ejecutivos (reportes)
- Exportadora (acceso compartido)

### Lo que la app tiene hoy

| Concepto | Estado | Detalle |
|---|---|---|
| Roles operativos | **Existe** | MASTER, ADMIN, MANAGER, FIELD |
| Rol ejecutivo | **Existe** | CEO (dashboard), CFO (financiero) |
| Rol contador | **No existe** | CFO es read-only; no hay acceso a ventas/contabilidad |
| Acceso exportadora | **No existe** | No hay portal externo |
| Permisos granulares | **Parcial** | Guards por grupo de roles, no por acción individual |

### Gap: BAJO-MEDIO

Los roles base cubren la operación actual. Se necesitará expandir cuando se agreguen módulos financieros y de exportación.

---

## 12. Reportes y Exportaciones

### Lo que Eduardo describió

*"El software puede absorber las planillas Excel y también producir relatorios en Excel."*

- Importación de Excel
- Exportación a Excel
- Reportes de rendimiento por tractor, diésel, abono, corte
- Reportes para capacitación de extensionistas
- Reportes para exportadora

### Lo que la app tiene hoy

| Concepto | Estado | Detalle |
|---|---|---|
| Importación de Excel | **Realizado** | 179 registros cosecha + 5 compra importados desde Excel |
| Importación de foto de cuaderno | **Existe** | Claude Vision extrae datos de foto de cuaderno → batch insert |
| Exportación a Excel/CSV | **Parcial** | API retorna JSON; `/pagos` genera formato para banco; no hay export Excel directo |
| Reportes PDF | **No existe** | Planificado para recibo de ingreso (Gap 6) |
| Dashboards | **Existe** | KPIs, gráficos, alertas en tiempo real |
| Reportes por maquinaria | **No existe** | No hay modelo de maquinaria |

### Referencia industria

Todos los softwares de la industria (Aegro, MyFarm, Cropster) ofrecen exportación a Excel y PDF. **Aegro** genera dashboards con KPIs por safra. **Cropster** genera certificados de trazabilidad y reportes de calidad para compradores.

### Gap: MEDIO

Se necesita: exportación directa a Excel/CSV desde el UI, generación de PDF para recibos y reportes, y reportes consolidados multi-período.

---

## 13. Clima e Integración Agronómica

### Lo que Eduardo describió

*"Conectar la catación, los defectos, las tasas, con el año agrícola, a tiempo, clima, nutrición y taza."*

- Correlación de calidad de taza con variables agronómicas
- Datos climáticos por período
- Nutrición (qué se aplicó) correlacionada con resultados

### Lo que la app tiene hoy

| Concepto | Estado | Detalle |
|---|---|---|
| Datos climáticos | **No existe** | |
| Nutrición por lote | **No existe** | (requiere kardex de insumos) |
| Correlación calidad-agronomía | **No existe** | |
| Catación detallada | **Mínimo** | Solo `cuppingScore` decimal |

### Referencia industria

**Cropwise** lidera en integración climática (estaciones meteorológicas locales, pronósticos, modelos de grado-día). **Cropster** conecta perfiles de taza con método de procesamiento. Ninguno correlaciona automáticamente prácticas agronómicas de campo con calidad de taza.

### Gap: BAJO (largo plazo)

Esta es una feature de diferenciación a 3-5 años. Requiere primero: insumos por lote, catación detallada, y fuente de datos climáticos.

---

## Matriz Resumen de Gaps

| # | Dominio | Estado App | Prioridad Eduardo | Gap | Prerequisitos |
|---|---|---|---|---|---|
| 1 | Modelo de costos (despesa/custo) | No existe | CRÍTICO | CRÍTICO | Kardex insumos |
| 2 | Presupuesto anual por lote | Parcial (jornales) | ALTO | ALTO | Modelo de costos |
| 3 | Kardex de insumos | No existe | ALTO | ALTO | — |
| 4 | Trazabilidad completa | 40% | CRÍTICO | CRÍTICO | Grados pergamino, despachos, exportación |
| 5 | Benchmarking interno/externo | 30% | ALTO | MEDIO-ALTO | Modelo de costos, datos multi-año |
| 6 | Contabilidad/financiero | No existe | ALTO | ALTO | Modelo de costos |
| 7 | Conexión exportadora | Mínimo | MEDIO | ALTO | Trazabilidad, contabilidad |
| 8 | Estimados multi-punto | 80% | MEDIO | BAJO | — |
| 9 | Catálogo de performance | 60% | MEDIO | MEDIO | Kardex insumos |
| 10 | Validación de datos | 85% | ALTO | BAJO | — |
| 11 | Roles multi-usuario | 70% | MEDIO | BAJO-MEDIO | Módulos financieros |
| 12 | Reportes/Excel export | 40% | ALTO | MEDIO | — |
| 13 | Clima/agronomía | 0% | BAJO | BAJO | Insumos, catación |

---

## Arquitectura de Datos Faltante

Para cumplir la visión de Eduardo, se necesitan aproximadamente **8-10 modelos nuevos** en Prisma:

```
MODELOS EXISTENTES (14)                    MODELOS NECESARIOS (estimado)
─────────────────────                      ─────────────────────────────
User                                       InputProduct (catálogo insumos)
SystemSetting                              InputPurchase (compras de insumos)
NotebookDictionary                         InputApplication (aplicación por lote)
Lote                                       Supplier (catálogo proveedores)
Worker                                     ParchmentOutput (grados pergamino) *
Activity                                   CoffeeShipment (despachos) *
PayPeriod                                  CostAllocation (rateio despesa→custo)
ActivityRecord                             Budget (presupuesto por lote/año)
PayrollEntry                               Asset (activos + depreciación)
CoffeeIntake                               MachineryLog (uso de maquinaria)
PlanEntry
ProductionEstimate
AuditLog

* Ya planificados en plan-ingresos-cafe.md
```

---

## Comparación con Software de Industria

| Capacidad | Aegro | MyFarm | Cropster | Cropwise | **Finca App** |
|---|---|---|---|---|---|
| Actividades por lote | SI | SI | NO | SI | **SI** |
| Costo por lote (completo) | SI | SI (mejor) | NO | Básico | **Parcial** (solo MO) |
| Despesa → rateio → custo | NO | SI | NO | NO | **NO** |
| Trazabilidad cereza→oro | NO | NO | SI (post-cosecha) | NO | **Parcial** (cereza→pergamino) |
| Catación SCA | NO | NO | SI (mejor) | NO | **Mínimo** (solo score) |
| Inventario de insumos | SI | Básico | NO | Parcial | **NO** |
| Presupuesto por lote | Básico | SI (mejor) | NO | NO | **Parcial** (jornales) |
| Plan vs. actual | Básico | Básico | NO | SI (plagas) | **SI** |
| Benchmarking interno | SI | SI (mejor) | Calidad | Básico | **Parcial** |
| Benchmarking externo | Cooperativa | Cooperativa | Industria | NO | **NO** |
| Estimados de producción | NO | Básico | NO | Satélite | **SI** (mejor) |
| Offline/móvil | SI | Limitado | Limitado | SI (mejor) | **SI** |
| IA (visión/extracción) | NO | NO | NO | NO | **SI** (único) |
| EUDR compliance | NO | NO | Parcial | Parcial | **NO** |
| Integración contable | SI | SI | NO | NO | **NO** |
| Multi-finca | SI | SI | SI | SI | **NO** (1 finca) |

**Ventajas competitivas actuales de la app**:
1. **Claude Vision para extracción de cuaderno** — ningún software de la industria tiene esto
2. **Offline-first real** — comparable con Aegro y Cropwise, superior a MyFarm
3. **Estimados de producción multi-punto** — más estructurado que MyFarm
4. **Plan vs. actual granular** (semana/mes/lote/actividad)

**Gaps más grandes vs. industria**:
1. Modelo de costos completo (MyFarm es el estándar)
2. Trazabilidad post-cosecha (Cropster es el estándar)
3. Inventario de insumos (Aegro es el estándar)
4. Integración contable/financiera
5. Benchmarking inter-fincas

---

## Preguntas Clarificadoras

### Sobre el modelo de costos

1. **¿Quién hace el rateio (distribución de costos)?** ¿Luis en oficina, o el sistema debe proponer distribución automática (ej: proporcional por área)?

2. **¿Cuáles son los rubros de costo además de mano de obra?** Eduardo mencionó: insumos, transporte interno, maquinaria. ¿Hay otros? (ej: combustible, mantenimiento de infraestructura, agua, electricidad)

3. **¿La depreciación se calcula para qué activos?** Eduardo mencionó maquinaria. ¿También infraestructura (beneficio, patios, guardiola)? ¿La plantación misma? (En Brasil deprecian la "lavoura" — la inversión de siembra se amortiza sobre la vida productiva de 15-25 años.)

### Sobre trazabilidad

4. **¿Se mezclan lotes en la guardiola/patio?** Eduardo dijo: "de la guardiola puede ser mezclado con otros lotes". Si se mezclan, ¿se necesita rastrear la composición de cada mezcla? Esto cambiaría fundamentalmente el modelo de trazabilidad (de tracking por lote a tracking por lote compuesto/blend).

5. **¿Qué beneficios externos se usan?** Eduardo mencionó "Gabriel". El plan-ingresos-cafe.md menciona "La Joya" y "Coyote". ¿Son todos los destinos posibles? ¿Cada beneficio reporta rendimiento a oro?

6. **¿EDA es la exportadora?** Eduardo dijo "EDA lo compra y vende a Europa". ¿Es el único canal de exportación? ¿Hay relación contractual formal (contratos forward) o spot?

### Sobre el presupuesto

7. **¿Las planillas de Eduardo con presupuesto de 4 años ya están listas?** Él mencionó que estaban trabajando en planillas por lote con todas las actividades. Cuando estén disponibles, estas definen la estructura del módulo de presupuesto.

8. **¿Los escenarios (optimista/pesimista/probable) aplican solo a producción o también a costos?** Ej: escenario pesimista = baja producción + alto costo de insumos.

### Sobre la exportadora

9. **¿El sistema de la exportadora es un módulo dentro de esta app o una app separada?** Eduardo habló de "un ambiente de trabajo conectando la finca a la exportadora". Esto puede ser: (A) un portal dentro de esta app con rol de exportadora, o (B) una app separada que consume API de esta app.

10. **¿La app debe soportar múltiples fincas eventualmente?** Eduardo mencionó benchmarking entre fincas y extensionistas capacitando a otros finqueros. ¿Grupo Orión tiene o prevé tener otras fincas que usen este software?

### Sobre capacitación y extensionismo

11. **¿Se prevé que extensionistas externos usen el sistema?** Eduardo habló de que en Brasil, extensionistas de cooperativas visitan fincas y usan el software para capacitación. ¿Esto aplica a Danilandia? ¿Se necesita un rol de "extensionista" o "consultor" con acceso limitado?

### Sobre timeline

12. **Eduardo estimó 1-2 años para el software completo.** ¿Cuál es la expectativa de Grupo Orión? ¿Hay módulos que sean urgentes para la próxima cosecha (2627)?

13. **¿Las reuniones de los lunes con Eduardo ya se establecieron?** Él sugirió lunes por la tarde. ¿Se definió fecha de inicio?

---

## Propuesta de Secuencia (basada en dependencias técnicas)

```
FASE ACTUAL (completada)
├── Planilla (actividades + planilla de pago)
├── Ingreso de café (cereza/pergamino/compras)
├── Plan anual (jornales planeados vs. reales)
├── Estimados de producción
├── Dashboard + alertas
└── Workers + admin

FASE PRÓXIMA (prerequisitos para todo lo demás)
├── Gap 4: Grados de pergamino (ParchmentOutput)
├── Gap 5: Despachos (CoffeeShipment)
├── Gap 6: Recibos PDF
└── Exportación Excel/CSV desde UI

FASE INTERMEDIA (modelo de costos)
├── Kardex de insumos (InputProduct, InputPurchase, InputApplication)
├── Catálogo de proveedores (Supplier)
├── Modelo de costos completo (CostAllocation)
├── Presupuesto monetario por lote (Budget)
└── Reportes de costo por quintal

FASE AVANZADA (financiero + trazabilidad)
├── Activos y depreciación (Asset)
├── Integración contable básica
├── Trazabilidad completa (mezclas, exportación)
├── Benchmarking multi-año
└── EUDR compliance (polígonos GPS)

FASE FUTURA (conexión externa)
├── Portal exportadora
├── Catación detallada (protocolo SCA)
├── Datos climáticos
├── Correlación calidad-agronomía
├── Multi-finca
└── Benchmarking externo (cooperativas)
```

---

## Conclusión

La app de Finca Danilandia tiene una **base técnica sólida** — arquitectura production-ready, offline-first, validación rigurosa, auditoría completa. Lo construido hasta ahora funciona y está en uso real.

La visión de Eduardo es significativamente más amplia: un sistema integral de gestión de finca que conecta operaciones diarias → costos → contabilidad → exportación → trazabilidad → benchmarking. Esto es consistente con 40 años de evolución de software agrícola en Brasil.

El camino de aquí a allá es largo pero bien definido. Las dependencias son claras: **insumos primero** (porque el modelo de costos depende de ellos), **trazabilidad después** (porque conecta con la exportadora), **financiero al final** (porque depende de todo lo anterior).

La ventaja competitiva real es la integración. Ningún software del mercado cubre toda la cadena. **Aegro** cubre operaciones, **MyFarm** cubre finanzas, **Cropster** cubre calidad post-cosecha, pero nadie los une. Si esta app logra integrar los 3 mundos en una PWA offline-first con IA, sería único en la industria del café.
