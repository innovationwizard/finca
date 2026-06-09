# Changelog — Captura Semanal + Reconciliación de Catálogo

**Fecha:** 2026-06-08
**Tipo:** Funcionalidad nueva + cambio de datos en producción (catálogo/precios)
**Plan asociado:** [plan-planilla-entry-page.md](plan-planilla-entry-page.md)
**Fuente del formato:** `format/PLANILLAFINCA.xlsx` (PII — gitignored)

> **Resumen.** Se agregó una página de **captura semanal** que emula la hoja de
> entrada del Excel del finquero (`DATA MANUEL FLORES`): una cuadrícula donde, por
> trabajador y por día, se captura **Lote · Actividad · Unidades**, con listas
> desplegables (no tecleo libre). Para soportarla, el catálogo de actividades de la
> app se **reconcilió con la hoja `ACTIVIDADES`** del Excel (códigos del finquero +
> precios), tomada como fuente de verdad. La app ya producía el costeo (PLANILLA) y
> el pago (PAGOS); esta página solo cubre la **captura** y escribe `ActivityRecord`s.

---

## ⚠️ Cambios aplicados a la base de datos de PRODUCCIÓN

Estos cambios **ya se ejecutaron** contra la DB (no esperan deploy):

### 1. Migración `20260608170000_add_activity_code`
- `activities` += columna **`code TEXT`** (nullable) + índice único `activities_code_key`.
- Aditiva y reversible. Aplicada con `prisma migrate deploy`.

### 2. Reconciliación del catálogo (`scripts/reconcile-activities-from-xlsx.ts --commit`)
Fuente de verdad = hoja `ACTIVIDADES` del Excel. Se aplicó:

**Códigos asignados a 16 actividades existentes/nuevas** (CP, BE, CA, FE, FERIADO,
FG, LL, MG, MS, AH, HERIDO, TZ, HA, SP, RP, DESCONOCIDA). `BN` se registró como
**alias** de Beneficio en el diccionario (no como segundo código).

**Cambios de precio — como vigencias con fecha (efectivas 2026-06-08, NO
retroactivas):**

| Código | Actividad | Antes | Ahora (vigente 2026-06-08) |
|---|---|---|---|
| BE/BN | Beneficio | **Q100.00** | **Q75.00** ⚠ (baja — afecta pago futuro) |
| CA | Trabajos varios Carbón | Q70.00 | Q75.00 |
| LL | Limpia lote | Q70.00 | Q75.00 |
| TZ | Trazado para siembra | Q70.00 | Q75.00 |
| FERIADO | Feriado | Q0.00 | Q75.00 |
| MG | Mantenimiento General | (sin precio) | Q75.00 |

> **No retroactivo (verificado):** el trabajo con fecha anterior al 2026-06-08
> sigue costeándose al precio viejo (ej. Beneficio de abril = Q100); del 2026-06-08
> en adelante usa el precio nuevo (Q75). Reversible: borrar/reemplazar la vigencia
> del 2026-06-08.

**Actividades nuevas creadas** (no existían en la app): **Hacienda** (HA, DÍA,
Q65), **Septimo** (SP, DÍA, Q75), **Repaso Sombra** (RP, DÍA, Q75), **Desconocida**
(DESCONOCIDA, DÍA, Q0). `FE` (Fertilización Q17.5) se mapeó a la existente
"Fertilización 1.5 oz" (precio coincide).

> **Corrección semántica:** el código `RP` del finquero es **Repaso SOMBRA**, NO
> "Repaso Poda" (que ya existía en la app y es una actividad distinta).

---

## Esquema (Prisma)

```diff
 model Activity {
   id           String       @id ...
   name         String       @unique
+  code         String?      @unique // abreviatura del finquero (CP, BE, MG, RP…)
   unit         ActivityUnit
   ...
 }
```

---

## Funcionalidad nueva

### Página de Captura Semanal — `/planilla/captura`
- Acceso: `WRITE_ROLES` (MASTER, ADMIN, FIELD). Enlace en el sidebar
  ("Captura Semanal").
- **Cuadrícula** fiel al Excel (escritorio-first): filas = trabajadores; columnas =
  días × (Lote, Actividad, Unidades). Encabezados de fecha por día.
- **Navegación de semana** (lunes–sábado) + interruptor "incluir domingo (séptimo)".
- **Desplegables** en vez de tecleo libre: Actividad muestra `CÓDIGO · Nombre`
  (CP·Caporal, RP·Repaso Sombra…); Lote es lista de lotes reales (+ "—" sin lote).
  Elimina de raíz la suciedad de datos del Excel.
- **Atajos de productividad:** "copiar lunes a toda la semana" por trabajador;
  unidades por defecto = 1 al elegir actividad.
- **Vista previa de costeo:** total por trabajador y total de la semana, costeado
  por **fecha de trabajo** (precios con vigencia).
- **Roster editable:** precarga trabajadores activos; agregar/quitar; se recuerda
  por dispositivo (localStorage).

### Endpoint — `POST /api/planilla/captura`
- **Upsert idempotente** por clave determinística `captura|fecha|trabajador|
  actividad|lote`. Re-guardar la cuadrícula o editar una cantidad **actualiza en
  sitio** (sin duplicados, sin doble pago). Valida IDs activos + período abierto.
  Registra `AuditLog` (`CAPTURA_SAVE`).
- Se usó endpoint dedicado (no `/api/planilla/batch`) porque batch genera
  `clientId` con índice de fila → re-guardar duplicaría.

---

## Archivos

**Nuevos**
- `src/app/(authenticated)/planilla/captura/page.tsx` — carga catálogo + roster.
- `src/app/(authenticated)/planilla/captura/grid-client.tsx` — la cuadrícula.
- `src/app/api/planilla/captura/route.ts` — guardado upsert.
- `scripts/reconcile-activities-from-xlsx.ts` — reconciliación (dry-run/commit).
- `prisma/migrations/20260608170000_add_activity_code/migration.sql`.
- `docs/plan-planilla-entry-page.md`, este changelog.

**Modificados**
- `prisma/schema.prisma` — `Activity.code`.
- `src/app/api/activities/route.ts` — expone `code`.
- `src/components/layout/sidebar.tsx` — enlace "Captura Semanal".
- `.gitignore` — `format/` (PII), `revision-trabajadores.html`.

**Reutilizado sin cambios:** `resolve-price` (precio por fecha), vigencias de
precio, dedup, `PayrollEntry`/módulo de pagos (costeo y pago ya existían).

---

## Cambios de comportamiento / compatibilidad

- **Precio de Beneficio Q75 ya vigente** (antes Q100) para entradas con fecha ≥
  2026-06-08. Como la app desplegada lee la DB, **el cambio ya está activo** sin
  necesidad de desplegar la página nueva. Reversible.
- **Sin breaking changes de API**; `Activity.code` es nullable y aditivo.

---

## Pendientes conocidos / deuda (documentados, no ocultos)

1. **Sin soporte offline** en la cuadrícula (la entrada manual sí lo tiene). Los de
   campo sin señal aún no pueden capturar offline → mejora v2.
2. **Regla del "séptimo"** (en `PAGOS` el Excel usa `75*2`): se capturan los
   `ActivityRecord` de `SP`, pero el **cálculo del bono** es regla de nómina que
   **no se asumió** — confirmar contra el módulo de pagos.
3. ~~**Tabla `ACTIVITY_ABBR` desincronizada**~~ ✅ **RESUELTO (2026-06-08).** El
   flujo de import (foto/.xlsx) en `process-planilla` ahora resuelve por el campo
   **`Activity.code`** primero (autoritativo: `RP → Repaso Sombra`, `FE →
   Fertilización 1.5 oz`, etc.); la tabla `ACTIVITY_ABBR` quedó solo como
   **fallback** para los códigos de cuaderno que el campo `code` no cubre (CC, PP,
   EB, MU, CD, LM, DH, HB, MIP, AN, FF, EM, MT, SI). Todos los caminos de captura
   ahora concuerdan. (Modificado: `src/app/api/planilla/process-planilla/route.ts`.)
4. **Roster con duplicados**: muestra los 216 trabajadores activos hasta correr el
   merge en `/admin/trabajadores-duplicados`; el usuario lo recorta y se recuerda.
5. **Creación de período**: la cuadrícula avisa si la semana no tiene período de
   pago, pero no lo crea en línea (se crea en Planilla).

---

## Verificación

- `tsc --noEmit` y `next lint` en verde, sin supresiones nuevas.
- **Precio por fecha de trabajo verificado:** Beneficio = Q100 (abr-15) / Q75
  (jun-15); MG = Q0 (abr) / Q75 (jun); etc. — no retroactivo.
- Reconciliación verificada: 16 actividades con código y precio alineado.
- **Pendiente:** `next build` completo + prueba E2E en navegador; chequeo de
  fidelidad de la semana 1 de `PLANILLAFINCA.xlsx` contra el guardado.

---

## Notas de despliegue

- La **migración y la reconciliación ya están aplicadas en la DB de producción**.
- Hacer commit + push del código deja app y DB consistentes (la columna `code` y
  las actividades nuevas ya existen).
- El xlsx `format/PLANILLAFINCA.xlsx` contiene PII (nombres, cuentas en PAGOS) — no
  se commitea (gitignored).
- Git lo maneja Jorge; las migraciones/reconciliaciones de datos se aprueban antes
  de aplicar (la reconciliación de precios se aplicó bajo decisión explícita de
  "ACTIVIDADES = fuente de verdad").
