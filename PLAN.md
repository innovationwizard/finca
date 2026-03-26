# Finca Danilandia — Implementation Plan

> **Status**: APPROVED — open data items flagged, ready to build
> **Created**: 2026-03-25
> **Entity**: Finca Danilandia y Anexos, S.A. (Grupo Orión)

---

## 0. Executive Summary

Build a production-grade, offline-capable PWA for managing coffee farm operations: daily labor tracking (planilla), coffee harvest intake, activity planning, and production estimates. The app replaces three Excel workbooks currently used to run the real operation.

**Tech stack**: Next.js 15 (App Router) · Prisma · Supabase (PostgreSQL + Auth) · Tailwind CSS · shadcn/ui · Serwist (PWA/offline) · Dexie.js (IndexedDB) · Zod · React Hook Form · TanStack Query · Vercel

**Color palette** (corporate agriculture):

| Token | Hex | Usage |
|---|---|---|
| `finca-900` | `#1B3A2D` | Sidebar, headers — deep forest green |
| `finca-800` | `#245C3E` | Primary buttons, active states |
| `finca-700` | `#2D7A50` | Hover states |
| `finca-600` | `#38996A` | Links, accents |
| `finca-500` | `#4DB882` | Success indicators, badges |
| `finca-100` | `#E8F5EE` | Background tints, card backgrounds |
| `finca-50` | `#F3FAF6` | Page background |
| `earth-800` | `#5C4033` | Secondary — coffee/earth brown |
| `earth-600` | `#8B6914` | Warm accent — harvest gold |
| `earth-100` | `#FDF6E3` | Warm card backgrounds |
| `neutral-900` | `#1A1A1A` | Text |
| `neutral-600` | `#6B7280` | Secondary text |
| `neutral-200` | `#E5E7EB` | Borders, dividers |
| `danger` | `#DC2626` | Errors, alerts |
| `warning` | `#D97706` | Warnings, suspicious data flags |

Dark mode: `finca-950: #0F2318` background, all surface colors inverted accordingly.

---

## 1. Phased Delivery

### Phase 0 — Foundation (Week 1-2)

Everything the app needs before any module can function.

#### 0.1 Project Scaffolding
- [ ] Initialize Next.js 15 project with App Router, TypeScript strict mode
- [ ] Configure Tailwind CSS with the `finca` + `earth` color palette above
- [ ] Install and configure shadcn/ui primitives (Button, Card, Input, Select, Badge, DataTable, etc.)
- [ ] Configure fonts: DM Sans (body), JetBrains Mono (data tables/numbers)
- [ ] Set up project structure matching the scaffold's `src/` layout
- [ ] Create `.env.example` with all required variables
- [ ] Initialize git repo with `.gitignore`

#### 0.2 Database & ORM
- [ ] Set up Prisma with the full schema from SCAFFOLD_FINCA_DANILANDIA.md (14 models)
- [ ] Configure Supabase PostgreSQL connection (DATABASE_URL, DIRECT_URL)
- [ ] Create initial migration (`npx prisma migrate dev`)
- [ ] Build `prisma/seed.ts` with **real data only**:
  - 12 lotes (from GENERAL sheet — VG1, VG2, CRUZ2, CRUZ1, MIRASOL, CANOA 1, CANOA 2, CAÑADA, CORONA, ARENERA, GALERA, SAN EMILIANO CRUZ)
  - 10 activities from Control_Actividades (with real prices in GTQ)
  - Additional plan-only activities (Deshije, Manejo de sombra, etc.) — **prices TBD, flagged for user input**
  - Worker records extracted from Planilla Excel (18+ workers with real names)
  - Production estimates for 2425 and 2627 from GENERAL sheet (real lb/plant and qq values)

#### 0.3 Authentication & Authorization
- [ ] Supabase Auth integration (server + browser clients)
- [ ] JWT middleware for API route protection
- [ ] RBAC with roles: MASTER, ADMIN, FIELD (defer MANAGER, CEO)
- [ ] Login page (`/login`)
- [ ] Session management (cookie-based JWT from Supabase)
- [ ] Initial users (created manually by user in Supabase Auth dashboard):
  - Jorge (developer) — MASTER
  - Luis C. — ADMIN
  - Luis A. — ADMIN
  - Caporal — FIELD
  - Additional roles deferred

**RBAC Matrix:**

| Capability | MASTER | ADMIN | FIELD |
|---|---|---|---|
| All CRUD + system config | Yes | — | — |
| Data entry, payroll, reports | Yes | Yes | — |
| Mobile data entry (planilla, intake) | Yes | Yes | Yes |
| Worker management | Yes | Yes | — |
| Close pay periods | Yes | Yes | — |
| View dashboard | Yes | Yes | — |
| User management | Yes | — | — |
| Audit log access | Yes | — | — |

#### 0.4 App Shell & Layout
- [ ] `AppShell` component (inspired by example app):
  - Fixed sidebar on desktop (md+), hamburger drawer on mobile
  - Navigation: Planilla, Ingreso Café, Plan, Estimaciones, Trabajadores, Lotes, Dashboard
  - Role-based nav item visibility
  - Sync status indicator (top bar)
  - Dark/light mode toggle
- [ ] `PageHeader` component (title + breadcrumbs + action button)
- [ ] `DataTable` component (TanStack React Table — sortable, paginated, footer aggregates)
- [ ] `KpiCard` component
- [ ] `StatusBadge` component
- [ ] `EmptyState` component
- [ ] GTQ currency formatter, date formatter, quantity formatter (in `src/lib/utils/format.ts`)

#### 0.5 PWA Shell (Online-Only for Day 1)
- [ ] Serwist service worker setup (cache static assets, app shell for installability)
- [ ] PWA manifest (`manifest.json` with finca icons, theme color `#1B3A2D`)
- [ ] App is installable as PWA on mobile but **requires connectivity for all operations**

> **OPEN: Offline capability** — Full offline-first with Dexie.js IndexedDB, outbox sync engine, Background Sync API, and conflict resolution is required but deferred. Will be designed and added as a dedicated phase after the online-only MVP ships. Architecture is already prepared (clientId fields in schema, sync endpoint planned).

#### 0.6 Vercel Deployment
- [ ] User handles: Vercel account, repo connection, environment variables, domain setup
- [ ] App must be deployment-ready: `next build` clean, `.env.example` complete

---

### Phase 1 — Planilla (Week 2-4)

**Replaces**: `Planilla_Finca_Cafe_Semanal_CON_Lotes_feb-marz.xlsx`
**Users**: Luis C. / Luis A. (ADMIN — desktop data entry), Caporal (FIELD — mobile data entry)

#### 1.1 Pay Period Management
- [ ] `/api/pay-periods` — GET (list) + POST (create)
- [ ] PayPeriod CRUD (type: SEMANAL/CATORCENA, agricultural year "2526" format)
- [ ] Auto-generate period numbers within agricultural year (March→February)
- [ ] Period close/open logic (closed periods reject new entries)

#### 1.2 Activity Entry Form (`/planilla/nueva`)
- [ ] Data entry form (online-only for now; offline deferred)
- [ ] Fields from real Excel:
  - Date (default: today)
  - Worker (searchable dropdown — from Worker table)
  - Activity (dropdown — from Activity catalog)
  - Lote (dropdown — from Lote table; optional for beneficio activities)
  - Quantity (numeric — unit label auto-populated from Activity)
  - Unit Price (auto-populated from Activity.defaultPrice; override allowed)
- [ ] Auto-calculate: `totalEarned = quantity × unitPrice`
- [ ] Validation:
  - Quantity within `Activity.minQtyAlert` / `maxQtyAlert` — warn (not block) if outside
  - Corte de Café > 5 qq/person/day → suspicious flag
  - Cannot enter for closed PayPeriod
  - Worker must be active
- [ ] Success: redirect to list or allow "save & add another"

#### 1.3 Activity List View (`/planilla`)
- [ ] DataTable with columns: Fecha, Trabajador, Actividad, Lote, Cantidad, Unidad, Precio, Total
- [ ] Filters: date range, worker, activity, lote
- [ ] KPI cards at top: Total devengado (period), # registros, # trabajadores activos
- [ ] Footer row: sum of Total Devengado
- [ ] Clickable rows for edit
- [ ] Period selector (week picker)

#### 1.4 Payroll Summary (`/planilla/resumen`)
- [ ] Grouped by worker per period
- [ ] Columns: Trabajador, Total Devengado, Bonificación, Anticipos, Deducciones, Total a Pagar
- [ ] Editable bonus/advances/deductions fields (inline)
- [ ] "Cerrar Periodo" action (MASTER/ADMIN only) — generates PayrollEntry records
- [ ] Export to print-friendly layout

#### 1.5 Worker Management (`/trabajadores`)
- [ ] Worker list (name, DPI, active status, start date)
- [ ] Worker form (nuevo + edit): fullName, dpi, nit, bankAccount, phone, isMinor, startDate
- [ ] Worker profile (`/trabajadores/[id]`): personal data + activity history + earnings summary
- [ ] Active/inactive toggle

#### 1.6 Lot Summary View
- [ ] Per-period view: jornales and cost per lot
- [ ] Matches the `Resumen_Lotes` sheet from the Excel

---

### Phase 2 — Ingreso de Café (Week 4-5)

**Replaces**: `Ingresos de Café por Corte 2025 2026 acumulado maduro.xlsx`

#### 2.1 Coffee Intake Form (`/ingreso-cafe/nuevo`)
- [ ] Offline-aware entry form
- [ ] Fields:
  - Date
  - Coffee type (CEREZA, PERGAMINO, ORO)
  - Source (COSECHA own harvest / COMPRA purchased)
  - Lote (if COSECHA) or Supplier name + procedencia (if COMPRA)
  - Bultos (number of bags)
  - Peso neto (quintales)
  - Notes
- [ ] Auto-generate code: `IC-{agricultural_year}-{sequential}` (own harvest) or `ICC-{agricultural_year}-{sequential}` (purchased)
- [ ] For COMPRA: capture supplier name, procedencia, bank account, precio per quintal, payment status

#### 2.2 Coffee Intake List (`/ingreso-cafe`)
- [ ] DataTable: Fecha, Código, Tipo, Bultos, Peso Neto QQ, Lote/Proveedor, Estado
- [ ] Filters: date range, type, source, status, lote
- [ ] KPI cards: Acumulado maduro (season), Acumulado pergamino, # ingresos

#### 2.3 Intake Detail & Processing (`/ingreso-cafe/[id]`)
- [ ] Status tracking pipeline: RECIBIDO → DESPULPADO → SECANDO → PERGAMINO → ENVASADO → DESPACHADO
- [ ] Record pergamino weight after processing → auto-compute rendimiento
- [ ] Alert if rendimiento < 4.0 or > 7.0
- [ ] Dispatch tracking (date, code, destination)

#### 2.4 Accumulator Views
- [ ] Season-to-date: total maduro by lote (matches the Excel's running accumulator)
- [ ] Rendimiento trends per lote

---

### Phase 3 — Activity Planning (Week 5-6)

**Replaces**: Per-lote sheets in `ACTIVIDADES EDUARDO Z - FCA DANILANDIA.xlsx`

#### 3.1 Plan Grid (`/plan`)
- [ ] Grid view: rows = activities, columns = 48 weeks (4 per month × 12 months)
- [ ] One grid per lote per agricultural year
- [ ] Editable cells: planned jornales
- [ ] GENERAL view: aggregates all lots (sum across lotes per activity per week)

#### 3.2 Plan vs Actual
- [ ] Compare PlanEntry vs actual ActivityRecord sums
- [ ] Semáforo indicators:
  - Green: within 20% of plan
  - Yellow: 20-50% deviation
  - Red: >50% deviation or not started
- [ ] Visual overlay on the plan grid

#### 3.3 Lot Detail Plan (`/plan/[loteId]`)
- [ ] Single-lot view with plan + actual side by side
- [ ] Total jornales per activity (matches Excel's rightmost "TOTAL JORNALES" column)

---

### Phase 4 — Production Estimates (Week 6-7)

**Replaces**: GENERAL sheet in `ACTIVIDADES EDUARDO Z - FCA DANILANDIA.xlsx`

#### 4.1 Estimate Entry (`/estimaciones`)
- [ ] 4 estimates + 1 final per lot per agricultural year
- [ ] Input: lb/plant (from field sampling)
- [ ] Auto-compute:
  - `qqMaduroPerLote = (lbPerPlant × lote.plantCount) / 100`
  - `qqOroPerLote = qqMaduroPerLote / rendimientoPromedio`
  - `qqOroPerManzana = qqOroPerLote / lote.areaManzanas`
- [ ] Target reference: 25 qq oro/mz (from GENERAL sheet)

#### 4.2 Multi-Year Comparison (`/estimaciones/[year]`)
- [ ] 5 agricultural years side by side (2425, 2526, 2627, 2728, 2829)
- [ ] Columns per year: Area, Plants, 1-4 EST, FINAL, qq maduro/lote, qq oro/mz, qq oro/lote
- [ ] Matches the GENERAL sheet structure exactly

---

### Phase 5 — Dashboard (Week 7-8)

#### 5.1 Manager Dashboard (`/dashboard`)
- [ ] KPI cards:
  - Total workforce (active workers)
  - Payroll current period (GTQ)
  - Coffee accumulated (season, maduro + pergamino)
  - Production vs estimate (% of target)
- [ ] Charts (Recharts):
  - Coffee intake trend (weekly, season-to-date)
  - Payroll cost by lote (bar chart)
  - Plan vs Actual compliance (radar or stacked bar)
- [ ] Alerts panel:
  - Suspicious quantities
  - Rendimiento outliers
  - Overdue period closures
- [ ] Role-based visibility:
  - ADMIN: read-only overview + reports
  - MASTER: full access + action buttons + system config

---

## 2. Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15 (App Router) | Server Components, streaming, ISR — matches example app |
| ORM | Prisma | Type-safe, schema-first, works with Supabase PG |
| Auth | Supabase Auth | JWT-based, managed, row-level security ready |
| Offline | Deferred (Dexie.js + Serwist planned) | Online-only MVP; offline architecture designed, not built |
| State | Zustand (UI) + TanStack Query (server) | Proven pattern from example app |
| UI | shadcn/ui + Tailwind | Accessible, composable, no vendor lock |
| Forms | React Hook Form + Zod | Validation shared client/server |
| Tables | TanStack React Table | Sorting, pagination, footer aggregates |
| Charts | Recharts | Lightweight, composable, used in example app |
| Deploy | Vercel | Edge functions, preview deploys, zero-config |
| Precision | Decimal(10,2) in Prisma | Financial-grade precision for GTQ amounts |

---

## 3. From Example App — What We Take

Patterns adopted from `example_app/`:

1. **AppShell layout**: Fixed sidebar + mobile drawer + top bar (same architecture, different colors)
2. **DataTable component**: TanStack React Table with sortable headers, pagination (50 rows), footer aggregates, numeric right-alignment
3. **CollapsibleSection**: For detail pages (intake detail, worker profile)
4. **PageHeader**: Title + breadcrumbs + action button pattern
5. **StatusBadge**: Adapted for CoffeeStatus and PayPeriod states
6. **Format utilities**: `formatGTQ()`, `formatNumber()`, `formatDate()`, `formatPercent()` — adapted for GTQ (not USD)
7. **Route group pattern**: `(auth)` for login, `(authenticated)` for protected routes
8. **Server actions + Zod**: For mutations (not raw API routes for everything)
9. **Role-based sidebar**: MASTER-only items hidden for ADMIN/FIELD roles
10. **Real-time calculation preview**: For activity entry form (live total as user types)

**What we do NOT take**:
- The `orion` color palette (replaced with `finca` green/earth palette)
- The coffee export/contract domain models (different business domain)
- Custom JWT auth (using Supabase Auth instead)

---

## 4. Seed Data Inventory (Real Data Only)

All seed data comes directly from the provided Excel workbooks.

### Lotes (12)
| Source | Name | Area (mz) | Plants | Density |
|---|---|---|---|---|
| GENERAL | VG1 | 10 | 35,000 | 3,888 pl/mz |
| GENERAL | VG2 | 5 | 17,500 | 3,500 pl/mz |
| GENERAL | CRUZ2 | 12 | 57,737 | — |
| GENERAL | CRUZ 1 | 14 | 64,392 | — |
| GENERAL | MIRASOL | 7 | 24,318 | — |
| GENERAL | CANOA 1 | **?** | 67,116 | — |
| DATOS | CANOA 2 | — | — | — |
| DATOS | CAÑADA | — | — | — |
| DATOS | CORONA | — | — | — |
| DATOS | ARENERA | — | — | — |
| DATOS | GALERA | — | — | — |
| DATOS | SAN EMILIANO CRUZ | — | — | — |

### Workers (18+ from Planilla)
Extracted from `Registro_Actividades` sheet: GILDABERTO SOLANO, HENRY RANDOLFO HERNANDEZ, CARMELO GUAMUCH, LUZ DE MARIA MARTINEZ, JAIME ANIBAL MARROQUIN, SUSANA SOLANO, ENMA PEREZ, EDGAR ROLANDO NAVAS, SULEIMA MARROQUIN, FERNANDO GUAMUCH, GERMAN SOLANO, CARLOS GARCIA, JULIA MARROQUIN, BALDOMERO SOLANO, and others from the full 607-row dataset.

### Activities (10 priced + 9 plan-only)
**Priced** (from Control_Actividades):
Corte de Café (Q70/qq), Pepena (Q0/qq), Fertilización (Q150/ha), Limpia Manual (Q50/jornal), Poda (Q110/mz), Caporal (Q100/día), Beneficio (Q100/día), Encargado Beneficio (Q130/día), Muestreo de Suelos (Q75/día), Repaso Poda (Q100/mz)

**Plan-only** (prices TBD — need user input):
Deshije, Manejo de sombra, Chapea y desbejucar, Herbicida, Monitoreo de plagas y enfermedades, Control Roya, Análisis de suelos y foliar, Fertilización foliar, Enmiendas

### Production Estimates (from GENERAL sheet)
Real data for agricultural years 2425 (with FINAL values) and 2627 (with 1st estimates). Example: VG1 2627 = 1.33 lb/plant → 465.5 qq maduro/lote.

### Coffee Intakes (from Ingresos Excel)
Real intake records starting 2025-10-02 (IC-2526-01 through IC-2526-XX) including purchases (ICC-2526-XX) with actual supplier names, weights, and prices.

---

## 5. Open Data Items

These items have unknown values. They are set to `null` in seed data and flagged in the UI for the user to fill in when the information becomes available.

| # | Item | Current Value | Where It Matters |
|---|---|---|---|
| 1 | CANOA 1 area (mz) | `null` | Seed data, production estimate calculations |
| 2 | 6 lots missing area + plant count (CANOA 2, CAÑADA, CORONA, ARENERA, GALERA, SAN EMILIANO CRUZ) | `null` | Seed data, estimate calculations |
| 3 | 9 plan-only activity prices (Deshije, Manejo de sombra, Chapea, Herbicida, Monitoreo plagas, Control Roya, Análisis suelos, Fertilización foliar, Enmiendas) | `null` | Activity catalog, payroll calculations |
| 4 | Pepena price — Q0 or actual price? | `null` (Q0 in Excel) | Payroll calculations |
| 5 | Pay period type — weekly or biweekly? | `null` | PayPeriod default configuration |
| 6 | Offline-first capability | Deferred | Architecture prepared (clientId fields, sync endpoint schema) but implementation deferred to post-MVP |

### Resolved Decisions

| # | Decision | Resolution |
|---|---|---|
| 6-8 | Supabase, Vercel, domain | User creates manually |
| 9 | RBAC | MASTER (Jorge), ADMIN (Luis C., Luis A.), FIELD (Caporal). Defer MANAGER, CEO. |
| 10 | Auth | Supabase Auth |
| 11 | MVP scope | All 4 modules (Planilla + Ingreso Café + Plan + Estimaciones + Dashboard) |
| 12 | Offline day 1 | Online-only. Offline deferred, flagged as open. |

---

## 6. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Incomplete seed data (6 lots missing area/plants) | High | Low | Nullable fields, UI flags for "data pending" |
| Mobile performance (607+ activity records) | Medium | Medium | Pagination (50 rows), server-side filtering |
| Supabase Auth token refresh in PWA | Medium | Medium | Silent refresh, fallback to re-login |
| Agricultural year boundary (March→Feb) | Low | High | Centralized year calculation helper, tested edge cases |
| No offline support on day 1 | High | Medium | Field workers need connectivity; offline deferred but architecture prepared |
| 9 activities with null prices | High | Low | UI flags "price pending", payroll calculates as Q0 until set |

---

## 7. Definition of Done (per phase)

Each phase is considered complete when:
- [ ] All routes render with real data from the database
- [ ] All forms validate with Zod schemas (client + server)
- [ ] All mutations create AuditLog entries
- [ ] Role-based access enforced (middleware + UI)
- [ ] Mobile responsive (tested at 375px width)
- [ ] No TypeScript errors (`tsc --noEmit` clean)
- [ ] No ESLint errors
- [ ] Deployed to Vercel preview and manually verified
- [ ] GTQ formatting correct (Q 1,234.56 format)
