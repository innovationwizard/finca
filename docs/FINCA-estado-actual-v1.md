# Finca Danilandia — Estado Actual (v1)
**Avance estimado: ~30% del alcance total:** La visión completa de 13 features de Eduardo
- El módulo de **mano de obra / planilla** pasó de "funcional básico" a **operativo de extremo a extremo** (captura → séptimos → planilla → pagos al banco). 
- Los grandes vacíos (insumos, costos completos, trazabilidad post-pergamino,
financiero, exportadora, benchmarking) siguen sin cambios, por eso el porcentaje global se mantiene bajo.

---

## Lo que YA existe y funciona bien

**Planilla y nómina (módulo maduro de extremo a extremo):**

- **Períodos de pago** (`PayPeriod`): tipos SEMANAL y CATORCENA, por año agrícola,
  con fechas de inicio/fin **editables** (cubren los 2 casos reales: pago anticipado
  por flujo de caja, y extensión por bloqueo de transacción)

- **Cierre de período** (MASTER/ADMIN, auditado): marca `isClosed/closedAt/closedBy`
  y **auto-abre el siguiente período** (inicio = día siguiente; fin ≈ 4 semanas
  incl. séptimos)

- **Captura semanal** (`/planilla/captura`): grid de entrada directa, 1 trabajador
  por fila, Lote × Actividad × Unidades por día; precio resuelto por fecha de trabajo;
  edición/guardado por roles con permiso de escritura

- **Séptimos**: bono de asistencia por semana calendario, se acumula entre períodos,
  lo "posee" el período que contiene el sábado de esa semana; reduce los días
  requeridos según días feriados (`Holiday`)

- **Nómina** (`PayrollEntry`): devengado, bonificación, pago de séptimo, anticipos,
  deducciones, total a pagar; categorías VOLUNTARIO / FIJO; recálculo bajo demanda

- **Pagos / archivo de banco** (`/pagos`, CFO/MASTER/CONSULTANT): exporta CSV
  delimitado por `;` para el banco; particiona incluidos vs. excluidos (sin cuenta
  o monto ≤ 0, con aviso por nombre); **excluye automáticamente a quien ya fue
  pagado** (evita doble pago)

- **Precios con vigencia** (`ActivityPrice`): precios por actividad con fecha de
  inicio, resueltos por fecha de trabajo; los registros guardados **congelan** su
  precio (snapshot)

- **Resúmenes** de período (lectura): por trabajador, devengado + séptimo +
  bonificación + anticipos + deducciones, con DPI/cuenta bancaria

**Resto del sistema:**

- Actividades por lote con registro de jornales (`ActivityRecord`), catálogo de
  actividades con unidad, precio por defecto y alertas min/max de cantidad

- Ingreso de café (CEREZA / PERGAMINO / **ORO**; origen COSECHA o COMPRA) con
  pipeline de 6 estados (RECIBIDO → DESPULPADO → SECADO → PERGAMINO → ENVASADO →  DESPACHADO); campos ya previstos para despacho y catación (`dispatchCode`,  `cuppingScore`) aunque sin UI Dedicada todavía

- Plan anual de jornales con comparación plan vs. real (visual, por semana/mes/lote)

- Estimados de producción (4 estimados + final, multi-año agrícola)

- Dashboard con KPIs y alertas en tiempo real (rendimiento atípico, cantidades
  sospechosas de corte)

- Trabajadores: CRUD en página dedicada `/trabajadores` (selección por dropdown)

- Roles y RBAC: **roles** (ADMIN, MANAGER, FIELD, CEO, CFO, CONSULTANT)

- Validación Zod completa, offline-first (Dexie + cola de sync), auditoría (`AuditLog`)

- Importación histórica de Excel ya realizada (179 registros cosecha + 5 compras)

---

## Lo que NO existe todavía

- Modelo de costos completo (solo mano de obra; faltan insumos y transporte interno)
- Kardex de insumos (catálogo, compras, aplicación por lote, stock, proveedores)
- Presupuesto monetario en GTQ (hoy solo jornales/planilla, no presupuesto por lote)
- Trazabilidad post-pergamino real (grados, mezclas/blending, despacho a beneficio,
  oro, exportación, catación SCA detallada — los campos existen pero sin flujo)
- Todo lo contable/financiero (plan de cuentas, depreciación, EBITDA, facturación)
- Conexión con exportadora (portal EDA, contratos, tracking de envíos)
- Benchmarking multi-año, interno entre lotes y externo
- Clima, maquinaria, multi-finca
- **Alertas de tendencia histórica** (siguen pendientes — clave para el cuello de botella)



---

## Cuello de Botella Principal

**El ingreso de datos en campo.** 
- Eduardo y todos coinciden: donde fracasan las implementaciones es cuando la persona en finca no ingresa datos, lo hace mal, o confunde unidades. → Nuestra app ya mitiga esto con Zod, enums, rangos min/max, captura estructurada en grid y resolución de precio por fecha.

---

## Ventajas Competitivas Únicas (vs. Aegro, MyFarm, Cropster, Cropwise)

1. **Offline-first real** — comparable a los mejores (Dexie + cola de sync)
2. **Planilla → nómina → archivo de banco de extremo a extremo**, con séptimos
   por semana calendario y precios con vigencia, específico al modelo guatemalteco
3. **Estimados de producción multi-punto** más estructurado que MyFarm
4. **Plan vs. actual granular** (semana/mes/lote/actividad)
5. **Potencial de integración total finca → beneficio → exportadora** nadie en el
   mercado une los 3 mundos

---

## Cambios principales desde nuestra conversación anterior

1. **Nómina de extremo a extremo:** períodos de pago (cierre + auto-apertura del
   siguiente), séptimos por semana calendario, `PayrollEntry`, y exportación de
   **archivo de banco** en `/pagos` con exclusión de ya-pagados.
2. **Captura semanal en grid** (`/planilla/captura`) reemplaza la extracción por
   foto como vía de ingreso de planilla.
3. **Precios con vigencia** (`ActivityPrice`) ya en producción; los registros
   congelan su precio al guardarse.
4. **Claude Vision retirado; la ingesta estructurada se hace directamente en la app
5. **Modelos Prisma:** de 14 a ~18; cuatro de los que antes estaban únicamente planificados ahora ya existen.

---








## Secuencia Para el Desarrollo

COMPLETADO ──────────────────────────────
  Planilla + captura semanal, períodos de
  pago (cierre/auto-apertura), séptimos,
  nómina, pagos/archivo de banco, precios
  con vigencia, ingreso café, plan anual,
  estimados, dashboard, workers

FASE PRÓXIMA ────────────────────────────
  Ingesta grados pergamino,
  despachos, recibos PDF, export Excel/CSV
  de reportes, alertas de tendencia histórica

FASE INTERMEDIA ─────────────────────────
  Kardex insumos, proveedores, modelo de
  costos completo (mano de obra + insumo +
  transporte interno), presupuesto monetario,
  costo/quintal

FASE AVANZADA ───────────────────────────
  Activos/depreciación, contabilidad,
  trazabilidad completa + mezclas,
  benchmarking multi-año, EUDR

FASE FUTURA ─────────────────────────────
  Portal exportadora, catación SCA, clima,
  correlación calidad-agronomía, multi-finca,
  benchmarking externo

**Dependencias clave:** 
Insumos primero (costos depende de ellos) → Trazabilidad
(conecta con exportadora) → Financiero (depende de todo lo anterior).

---

## Modelos Prisma: ~18 existentes, ~10 nuevos necesarios

Existentes (núcleo): User, SystemSetting, Lote, Worker, WorkerDocument, DpiDocument, BirthCertificateDocument, Activity, **ActivityPrice**, **PayPeriod**, ActivityRecord, **PayrollEntry**, **Holiday**, CoffeeIntake, PlanEntry, ProductionEstimate, AuditLog. 
Nuevos aún necesarios (sin construir): InputProduct, InputPurchase, InputApplication, Supplier, ParchmentOutput, CoffeeShipment, CostAllocation, Budget, Asset, MachineryLog.
--- --- --- 
