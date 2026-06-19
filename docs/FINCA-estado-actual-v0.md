# Finca Danilandia — Estado Actual: ~25-30% del alcance total

**Lo que SÍ existe y funciona bien:**

- Actividades por lote con planilla de pago
- Ingreso de café (cereza/pergamino/compras) con pipeline de 6 estados
- Plan anual de jornales con comparación plan vs. real (visual, con colores)
- Estimados de producción (4 estimados + final, 5 años agrícolas)
- Dashboard con KPIs y alertas en tiempo real
- Workers, roles (MASTER/ADMIN/MANAGER/FIELD/CEO/CFO), RBAC
- Validación Zod completa, offline-first, auditoría
- Claude Vision para extracción de datos de cuaderno → batch insert
- Importación de Excel realizada (179 registros cosecha + 5 compras)

**Lo que NO existe (gaps críticos):**

- Modelo de costos completo (solo mano de obra, faltan insumos y transporte)
- Kardex de insumos (scaffold previsto en schema: `FUTURE: INSUMOS KARDEX`)
- Presupuesto monetario (solo jornales, no GTQ)
- Trazabilidad post-pergamino (no hay grados, mezclas, despacho real, exportación, catación detallada)
- Todo lo contable/financiero
- Conexión con exportadora
- Benchmarking multi-año y externo
- Clima, maquinaria, multi-finca

---

## Contexto Clave — Eduardo Sampaio

- Consultor brasileño, experiencia en +500 fincas de café
- Basado en 40 años de evolución de software agrícola en Brasil (desde los 80s)
- Concepto central: el software brasileño evolucionó de cooperativas y universidades, convirtió a pequeños productores en de alto rendimiento via benchmarking
- Año agrícola: **marzo → febrero** (corte finaliza en febrero, inicio marzo)
- Va a proveer screenshots de reportes de softwares brasileños como referencia
- Estima **1-2 años** para el software completo
- Reuniones propuestas: **lunes por la tarde** (fuso de 3 horas con Brasil)
- Está trabajando en planillas Excel por lote que serán la base del mapping para el software

---

## Equipo del Proyecto

Eduardo Sampaio (consultor Brasil), Leonel, Jorge Luis (dev), Luis Castellanos, Luis Arimany, Tono, Willy

---

## Cuello de Botella Principal

**El ingreso de datos en campo.** Eduardo y todos coinciden: donde fracasan las implementaciones es cuando la persona en finca no ingresa datos, lo hace mal, o confunde unidades. La app ya mitiga esto con Zod, enums, rangos min/max, y Claude Vision. Falta: alertas de tendencia histórica.

---

## Ventajas Competitivas Únicas (vs. Aegro, MyFarm, Cropster, Cropwise)

1. **Claude Vision** para extracción de cuaderno — ningún competidor tiene esto
2. **Offline-first real** — comparable a los mejores
3. **Estimados de producción multi-punto** — más estructurado que MyFarm
4. **Plan vs. actual granular** (semana/mes/lote/actividad)
5. **Potencial de integración total finca→beneficio→exportadora** — nadie en el mercado une los 3 mundos

---

## Secuencia Propuesta de Desarrollo

```
COMPLETADO ──────────────────────────────
  Planilla, ingreso café, plan anual,
  estimados, dashboard, workers

FASE PRÓXIMA ────────────────────────────
  Grados pergamino, despachos,
  recibos PDF, export Excel/CSV

FASE INTERMEDIA ─────────────────────────
  Kardex insumos, proveedores,
  modelo costos completo, presupuesto
  monetario, costo/quintal

FASE AVANZADA ───────────────────────────
  Activos/depreciación, contabilidad,
  trazabilidad completa + mezclas,
  benchmarking multi-año, EUDR

FASE FUTURA ─────────────────────────────
  Portal exportadora, catación SCA,
  clima, correlación calidad-agronomía,
  multi-finca, benchmarking externo
```

**Dependencias clave:** Insumos primero (costos depende de ellos) → Trazabilidad (conecta con exportadora) → Financiero (depende de todo lo anterior).

---

## Modelos Prisma: 14 existentes, ~8-10 nuevos necesarios

Nuevos estimados: InputProduct, InputPurchase, InputApplication, Supplier, ParchmentOutput, CoffeeShipment, CostAllocation, Budget, Asset, MachineryLog.

---