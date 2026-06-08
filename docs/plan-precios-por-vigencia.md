# Plan — Precios de actividad con vigencia (effective-dated pricing)

**Estado:** Propuesta para aprobación · **Fecha:** 2026-06-08
**Autor:** Claude (bajo `docs/_THE_RULES.MD`)
**Módulo:** Catálogo de actividades + entrada de planilla (manual / foto / Excel)
**Requiere migración de base de datos en producción → no se ejecuta sin aprobación.**

---

## 1. Objetivo (intención del usuario, verbatim)

> "We are trying to move the user away from other forms of storing prices, and
> info in general (paper, xlsx). … prices … per activity, including uom, not per
> person … must not be a blanket price: if this week an activity is more
> expensive than last week, the user can intuitively set the new pricing and the
> start date of the new pricing without any retroactive effect on previous weeks."

Que el GUI sea **la única fuente de verdad de precios**, con precios **por
actividad (con su unidad de medida), no por persona**, y con **vigencia por
fecha**: fijar un precio nuevo + su fecha de inicio, sin efecto retroactivo sobre
semanas anteriores, y pudiendo programar un precio futuro.

### Decisiones confirmadas por Jorge (2026-06-08)

| # | Tema | Decisión |
|---|------|----------|
| 1 | Alcance | **Escribir el plan primero, aprobar, luego implementar.** No correr migración sin aprobación. |
| 2 | Base del precio | El precio por defecto de cada registro se resuelve por la **fecha del trabajo** (no por la fecha de captura). Semanas previas conservan su precio; se puede programar un precio futuro. |
| 3 | Dimensión | Precio **por actividad (con UoM)**, **no por persona** (ya es así hoy). |

---

## 2. Estado actual confirmado (evidencia, no supuesto)

- `Activity.defaultPrice Decimal?` — **un solo precio "blanket"** por actividad.
  **No existe** tabla de historial ni fecha de vigencia en el esquema.
- GUI `/admin/actividades` (solo MASTER/ADMIN) permite crear/editar actividad con
  `name`, `unit` (Quintal/Manzana/Hectárea/Día), `defaultPrice`, flags y alertas.
  → **Precio + UoM editables por actividad: SÍ.** **Vigencia/fecha: NO.**
- **Protección parcial hoy:** `ActivityRecord.unitPrice` se **congela** al
  capturar (snapshot), así que semanas ya guardadas no cambian al editar el
  precio. **Pero** el valor por defecto de un registro nuevo es "el precio actual
  al momento de capturar", **atado a la captura, no a la fecha del trabajo**:
  - No se puede programar "Q75 desde el próximo lunes".
  - Capturar/importar una semana vieja **después** de subir el precio toma el
    precio nuevo, salvo corrección manual en la tabla de revisión.

Conclusión: la capacidad pedida **no existe**; este plan la agrega.

---

## 3. Modelo de datos

Nuevo modelo (Prisma), aditivo y retro-compatible:

```prisma
model ActivityPrice {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  activityId    String   @map("activity_id") @db.Uuid
  price         Decimal  @db.Decimal(10, 2)
  effectiveFrom DateTime @map("effective_from") @db.Date
  note          String?
  createdBy     String?  @map("created_by") @db.Uuid
  createdAt     DateTime @default(now()) @map("created_at")

  activity Activity @relation(fields: [activityId], references: [id], onDelete: Cascade)

  @@unique([activityId, effectiveFrom]) // un precio por actividad por fecha de inicio
  @@index([activityId, effectiveFrom])
  @@map("activity_prices")
}
```
- En `Activity`: agregar `prices ActivityPrice[]`.
- **`Activity.defaultPrice` se conserva** como "precio vigente hoy" desnormalizado
  (display rápido + fallback para fechas anteriores a cualquier vigencia). Se
  mantiene sincronizado al precio cuya `effectiveFrom` es la mayor ≤ hoy.
  Esto evita romper todo el código existente que ya lee `defaultPrice`.

---

## 4. Resolución del precio (por fecha de trabajo)

Función pura, server y client (idéntica):

```
resolveActivityPrice(activity, workDate):
  candidatos = activity.prices donde effectiveFrom <= workDate
  si candidatos: return el de mayor effectiveFrom .price
  si no:         return activity.defaultPrice   // fallback (fechas muy antiguas)
```

- **Sin efecto retroactivo:** subir el precio crea una fila con `effectiveFrom`
  futura/actual; los registros de fechas anteriores siguen resolviendo el precio
  viejo. Y como cada `ActivityRecord` además **congela** su `unitPrice`, lo ya
  guardado es inmutable pase lo que pase.
- **Programación a futuro:** una vigencia con `effectiveFrom` futura solo aplica
  cuando `workDate >= effectiveFrom`.

---

## 5. Migración + backfill (idempotente)

1. `prisma migrate` para crear `activity_prices`.
2. Script idempotente `scripts/backfill-activity-prices.ts` (dry-run por defecto,
   `--commit`): por cada actividad sin vigencias, inserta una fila
   `{ effectiveFrom: ANCLA, price: defaultPrice }`.
   - **ANCLA** = inicio del año agrícola actual (p. ej. `2025-03-01`). Las fechas
     anteriores caen al fallback `defaultPrice` (mismo número), así que **nada
     cambia** numéricamente; solo se establece la línea base.
3. Verificación: cada actividad tiene ≥1 vigencia; resolver(actividad, hoy) ==
   `defaultPrice` para todas (sin cambios de monto el día 1).

---

## 6. GUI — línea de tiempo de precios en `/admin/actividades`

- Cada fila de actividad gana un panel expandible "Historial de precios":
  tabla `Vigente desde | Precio (Q) | Nota | (eliminar)`, ordenada desc.
- Acción **"Agregar precio nuevo"**: campos `Precio` + `Vigente desde` (date, se
  permite futura para pre-programar) + `Nota` opcional. Intuitivo: el usuario
  escribe el precio nuevo y la fecha; **no** toca semanas anteriores.
- Se muestra de forma prominente el **precio vigente hoy** y, si hay, el **próximo
  precio programado** (fecha + monto).
- Se mantiene el aviso de **salario mínimo agrícola** ya existente; opcional:
  marcar en ámbar un precio/día por debajo del mínimo legal (informativo).
- Crear/editar la actividad (nombre, UoM, flags) sigue igual; el precio inicial al
  **crear** una actividad genera su primera vigencia (`effectiveFrom` = hoy).

---

## 7. Integración con los flujos de captura (los 3)

El monto guardado sigue **congelándose** por registro; solo cambia **qué precio se
ofrece por defecto**, ahora según la fecha del trabajo:

- **Manual** (`planilla/nueva/page.tsx`): al cambiar actividad **o** fecha,
  `unitPrice` por defecto = `resolveActivityPrice(activity, form.date)`
  (hoy solo reacciona al cambio de actividad). Editable.
- **Foto / Excel** (`api/planilla/process-planilla`): `resolvedActivityPrice` de
  cada entry = `resolveActivityPrice(activity, entry.date)` en vez del
  `defaultPrice` plano. Esto **alinea con la decisión #2 del import .xlsx**
  ("usar precio de la DB") y **corrige** el problema de importar semanas viejas.
- **Tabla de revisión** (`review-table.tsx`): al cambiar la actividad de una fila,
  resolver el precio por **la fecha de esa fila**, no por `defaultPrice`.

---

## 8. API y caché offline

- **`GET /api/activities`** y **`GET /api/admin/activities`**: incluir el
  `priceSchedule: { effectiveFrom: "YYYY-MM-DD"; price: number }[]` por actividad
  (además de `defaultPrice`).
- **Precios (admin):** `POST /api/admin/activities/[id]/prices`
  `{ price, effectiveFrom, note? }` → crea vigencia (guarda unicidad), recalcula y
  sincroniza `defaultPrice` al vigente-hoy, registra `AuditLog`.
  `DELETE …/prices/[priceId]` → elimina (mínimo 1 vigencia; no altera snapshots).
- **Caché offline** (`CachedActivity` en `lib/offline/db.ts`): agregar
  `priceSchedule`. El `sync-engine` lo llena desde `/api/activities`. El resolver
  cliente usa la caché → **funciona offline** (PWA).
  (Agregar un campo no-indexado no exige bump de versión Dexie; si se decide
  versionar, hacerlo explícito.)

---

## 9. Nómina — sin cambios

`PayrollEntry` y los resúmenes derivan de `ActivityRecord.totalEarned` /
`unitPrice` (ya congelados). El cambio de modelo **no afecta** la nómina histórica
ni los pagos ya calculados.

---

## 10. Casos borde

- **Precio futuro (pre-programado):** aplica solo a partir de su fecha.
- **Bajar el precio:** igual mecánica; semanas previas intactas.
- **Dos precios el mismo día:** prohibido por `@@unique(activityId, effectiveFrom)`.
- **Fecha anterior a toda vigencia:** cae a `defaultPrice` (= base de backfill).
- **Editar la fecha de trabajo de un registro existente:** el `unitPrice` ya
  congelado **no** se reescribe solo (consistente con hoy); si se desea, el form
  ofrece el precio vigente para esa nueva fecha como sugerencia editable.
- **Eliminar una vigencia ya usada por registros:** permitido; los snapshots no
  cambian; solo afecta defaults futuros.

---

## 11. Archivos

**Nuevos**
- `prisma/migrations/<ts>_activity_prices/…` — migración.
- `scripts/backfill-activity-prices.ts` — backfill idempotente (dry-run/commit).
- `src/lib/pricing/resolve-price.ts` — `resolveActivityPrice` (puro, compartido).
- `src/app/api/admin/activities/[id]/prices/route.ts` — POST/DELETE vigencias.

**Modificados**
- `prisma/schema.prisma` — modelo `ActivityPrice` + relación.
- `src/app/(authenticated)/admin/actividades/activities-manager.tsx` — panel de
  historial + "agregar precio".
- `src/app/(authenticated)/admin/actividades/page.tsx` — cargar `priceSchedule`.
- `src/app/api/activities/route.ts` y `src/app/api/admin/activities/route.ts` —
  incluir `priceSchedule`; sincronizar `defaultPrice` al crear/editar.
- `src/app/(authenticated)/planilla/nueva/page.tsx` — default por (actividad, fecha).
- `src/app/(authenticated)/planilla/nueva/review-table.tsx` — precio por fecha de fila.
- `src/app/api/planilla/process-planilla/route.ts` — precio por `entry.date`.
- `src/lib/offline/db.ts` + `src/lib/offline/sync-engine.ts` — `priceSchedule` en caché.

**Sin cambios:** nómina, `ActivityRecord` (sigue congelando `unitPrice`).

---

## 12. Verificación

1. Backfill: todas las actividades con ≥1 vigencia; montos del día 1 idénticos.
2. Subir precio de "Corte de Café" a Q75 vigente **mañana** → registros de **hoy y
   antes** siguen en Q70; registros de **mañana** salen Q75 por defecto.
3. Importar `.xlsx` de una semana **anterior** a un alza → toma el precio viejo.
4. Pre-programar un precio futuro → no afecta nada hasta su fecha.
5. Offline: resolver precio por fecha sin red (desde caché).
6. Nómina histórica intacta (snapshots).
7. `tsc` + `next lint` en verde; textos Latam-Spanish.

---

## 13. Criterios de aceptación

- [ ] El usuario fija precio + "vigente desde" por actividad en el GUI, sin tocar
      semanas anteriores y pudiendo programar a futuro.
- [ ] El precio por defecto de cada registro (manual/foto/Excel) se resuelve por
      la **fecha del trabajo**.
- [ ] Cero efecto retroactivo; snapshots históricos inmutables.
- [ ] `defaultPrice` queda como "vigente hoy" para back-compat; nada existente se
      rompe.
- [ ] Funciona offline (PWA).
- [ ] Migración idempotente; sin cambios de monto el día 1.

---

## 14. Riesgos / no-objetivos

- **Migración de producción:** requiere ventana y respaldo; ejecutar backfill en
  dry-run antes de `--commit`.
- **No-objetivo:** precios por persona, por lote o por trabajador — explícitamente
  fuera (decisión #3). Solo por actividad + UoM + fecha.
- **No-objetivo:** reescribir automáticamente `unitPrice` de registros ya
  guardados al cambiar precios (rompería la inmutabilidad histórica).

---

## 15. Secuencia de implementación (tras aprobación)

1. Esquema + migración (revisada) + `resolve-price.ts` + tests.
2. Backfill dry-run → revisión de Jorge → `--commit`.
3. API (`priceSchedule` + endpoints de vigencia) + caché offline.
4. GUI de historial de precios.
5. Cableado de los 3 flujos de captura.
6. Verificación end-to-end + revisión humana antes de habilitar.

> Jorge maneja git y aprueba la migración. Yo preparo archivos y texto de commit;
> no ejecuto `git add/commit/push` ni `prisma migrate` en producción sin su visto bueno.

---

## 16. Estado de implementación (2026-06-08)

**Código implementado y verificado** (`tsc --noEmit` y `next lint` en verde, sin
supresiones; `prisma validate` OK; resolver probado por lógica). **La migración y
el backfill NO se han aplicado a producción** — se entregan listos para que Jorge
los corra (paso que reservé explícitamente para su visto bueno).

### Creado
- `prisma/schema.prisma` — modelo `ActivityPrice` + relación `Activity.prices`.
- `prisma/migrations/20260608120000_add_activity_prices/migration.sql` — aditiva
  (solo crea `activity_prices` + FK + índices). Reversible (DROP TABLE).
- `src/lib/pricing/resolve-price.ts` — `resolveActivityPrice` / `currentPrice` /
  `nextScheduled` (puro, isomorfo server/cliente).
- `src/lib/pricing/activity-prices.ts` — `toPriceSchedule`, `todayISOGuatemala`.
- `src/app/api/admin/activities/[id]/prices/route.ts` — GET/POST/DELETE vigencias.
- `scripts/backfill-activity-prices.ts` — backfill idempotente (dry-run/commit).

### Modificado
- `src/lib/validators/settings.ts` — `activityPriceCreateSchema`.
- `src/app/api/activities/route.ts` — incluye `priceSchedule`.
- `src/app/api/admin/activities/route.ts` — al crear actividad se siembra la
  primera vigencia (hoy); al editar el precio inline se registra como vigencia de
  hoy (sin retroactividad).
- `src/app/api/planilla/process-planilla/route.ts` — precio por `entry.date`;
  `priceSchedule` en la respuesta.
- `src/app/(authenticated)/admin/actividades/{page,activities-manager}.tsx` —
  panel "Precios" por actividad (historial + agregar precio con fecha de vigencia,
  programación a futuro, eliminar; muestra precio vigente hoy y próximo).
- `src/app/(authenticated)/planilla/nueva/page.tsx` — default por (actividad, fecha).
- `src/app/(authenticated)/planilla/nueva/review-table.tsx` — precio por fecha de fila.
- `src/lib/offline/db.ts` — `priceSchedule` en `CachedActivity` (sin bump Dexie;
  el sync-engine ya hace `bulkPut` del payload de `/api/activities`).

### Para aplicar en producción (orden importante)
> La migración **debe** aplicarse **antes o junto con** el deploy de este código:
> el código consulta `activity_prices`; sin la tabla, `/api/activities` y el admin
> fallarían.

```
# 1) aplicar migración (solo crea la tabla nueva)
npx dotenv -e .env.local -- npx prisma migrate deploy

# 2) backfill — primero dry-run, revisar, luego commit
npx dotenv -e .env.local -- npx tsx scripts/backfill-activity-prices.ts
npx dotenv -e .env.local -- npx tsx scripts/backfill-activity-prices.ts --commit
```

El backfill ancla una vigencia base = `defaultPrice` por actividad al inicio del
año agrícola → **ningún monto cambia el día 1**. Verificación post-aplicación:
toda actividad con ≥1 vigencia; `resolveActivityPrice(act, hoy) == defaultPrice`.
