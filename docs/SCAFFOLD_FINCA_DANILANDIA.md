# Finca Danilandia — Application Scaffold

> **Entity**: Finca Danilandia y Anexos, S.A.
> **Holding**: Grupo Orión
> **Agricultural Year**: March → February
> **Currency**: Quetzales (GTQ)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     VERCEL (Edge)                        │
│  ┌───────────────────────────────────────────────────┐  │
│  │              Next.js 15 (App Router)               │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────┐ │  │
│  │  │ Server      │  │ API Routes   │  │ PWA      │ │  │
│  │  │ Components  │  │ (REST)       │  │ Manifest │ │  │
│  │  └─────────────┘  └──────────────┘  └──────────┘ │  │
│  └───────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │   SUPABASE CLOUD    │
              │  ┌───────────────┐  │
              │  │  PostgreSQL   │  │
              │  │  (via Prisma) │  │
              │  ├───────────────┤  │
              │  │  Auth (JWT)   │  │
              │  ├───────────────┤  │
              │  │  Realtime     │  │
              │  │  (WebSocket)  │  │
              │  ├───────────────┤  │
              │  │  Storage      │  │
              │  │  (files/imgs) │  │
              │  └───────────────┘  │
              └─────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                  CLIENT (PWA)                             │
│  ┌─────────────────┐  ┌──────────────────────────────┐  │
│  │ Service Worker   │  │ IndexedDB (Dexie.js)         │  │
│  │ (Serwist)        │  │ ┌──────────────────────────┐ │  │
│  │ • Cache assets   │  │ │ Offline queue            │ │  │
│  │ • Background     │  │ │ (pending mutations)      │ │  │
│  │   sync           │  │ ├──────────────────────────┤ │  │
│  │ • Push notifs    │  │ │ Local data cache         │ │  │
│  │   (future)       │  │ │ (read-only mirror)       │ │  │
│  └─────────────────┘  │ └──────────────────────────┘ │  │
│                        └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Offline-First Strategy

The finca has **intermittent connectivity**. The caporal and field workers need to enter data in the field via mobile. The architecture must guarantee:

1. **No data loss**: All mutations are written to IndexedDB first, then synced.
2. **Usable offline**: Core data entry screens (daily activities, coffee intake) work fully offline.
3. **Conflict resolution**: Last-write-wins with `updatedAt` timestamps. Acceptable because field workers create records — they rarely edit the same record simultaneously.
4. **Sync indicator**: UI always shows sync status (synced / pending / error).

**Implementation**:
- **Serwist** (successor to next-pwa) for service worker management
- **Dexie.js** for IndexedDB with a typed schema mirroring Prisma models
- **Background Sync API** to flush the offline queue when connectivity returns
- **Supabase Realtime** subscriptions for live updates when online (Roberto's dashboard)

### Key Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| ORM | Prisma | Type-safe, schema-first, works with Supabase PG |
| Auth | Supabase Auth | JWT-based, row-level security, standalone |
| Offline storage | Dexie.js (IndexedDB) | Typed, reactive, mature, small footprint |
| Service worker | Serwist | Maintained fork of next-pwa for App Router |
| Sync pattern | Outbox queue → background sync | Simple, reliable, no CRDT complexity needed |
| State management | Zustand + TanStack Query | Zustand for UI state, TanStack for server state + cache |
| UI components | shadcn/ui + Tailwind | Accessible, composable, no vendor lock-in |
| Forms | React Hook Form + Zod | Validation shared between client and server |
| Date handling | date-fns | Tree-shakeable, immutable, locale support |

---

## 2. Database Schema (Prisma)

Designed from the **actual Excel data** provided (Planilla, Ingresos de Café, Actividades Eduardo Z).

```prisma
// schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// ============================================================
// AUTH & ACCESS
// ============================================================

enum UserRole {
  ADMIN       // Luis — full CRUD, payroll, data entry
  MANAGER     // Roberto — read-all, approve payroll, dashboards
  FIELD       // Caporal — mobile data entry (activities, intake)
  CEO         // Octavio — dashboard only (future)
}

model User {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  supabaseId    String    @unique @map("supabase_id")
  email         String    @unique
  name          String
  role          UserRole  @default(FIELD)
  isActive      Boolean   @default(true) @map("is_active")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  @@map("users")
}

// ============================================================
// FINCA STRUCTURE
// ============================================================

model Lote {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name          String    @unique                          // "VG1", "CRUZ2", "CANOA 1", etc.
  slug          String    @unique                          // "vg1", "cruz2", "canoa-1"
  areaManzanas  Decimal   @map("area_manzanas") @db.Decimal(8, 2) // Area in manzanas
  plantCount    Int       @map("plant_count")              // Total plants in lot
  density       String?                                     // e.g. "3888 pl/mz"
  altitudeMasl  Int?      @map("altitude_masl")            // Meters above sea level
  variety       String?                                     // Coffee variety
  isActive      Boolean   @default(true) @map("is_active")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  activityRecords   ActivityRecord[]
  coffeeIntakes     CoffeeIntake[]
  planEntries       PlanEntry[]
  productionEstimates ProductionEstimate[]

  @@map("lotes")
}

// ============================================================
// WORKERS
// ============================================================

model Worker {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  fullName      String    @map("full_name")                // "GILDABERTO SOLANO"
  dpi           String?   @unique                          // Documento Personal de Identificación
  nit           String?                                     // Tax ID
  bankAccount   String?   @map("bank_account")
  phone         String?
  photoUrl      String?   @map("photo_url")                // Supabase Storage
  isMinor       Boolean   @default(false) @map("is_minor") // Under 18 — special handling
  isActive      Boolean   @default(true) @map("is_active")
  startDate     DateTime? @map("start_date")
  endDate       DateTime? @map("end_date")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  activityRecords ActivityRecord[]
  payrollEntries  PayrollEntry[]

  @@map("workers")
}

// ============================================================
// ACTIVITY CATALOG
// ============================================================

enum ActivityUnit {
  QUINTAL   // qq — for Corte de Café, Pepena
  MANZANA   // mz — for Poda, Repaso Poda
  HECTAREA  // ha — for Fertilización
  JORNAL    // day-labor — for Limpia Manual
  DIA       // fixed day rate — for Caporal, Beneficio, Encargado
}

model Activity {
  id            String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name          String       @unique                       // "Corte de Café", "Poda", etc.
  unit          ActivityUnit                                // What unit workers are paid in
  defaultPrice  Decimal      @map("default_price") @db.Decimal(10, 2) // Current rate in GTQ
  isHarvest     Boolean      @default(false) @map("is_harvest")       // True for Corte, Pepena
  isBeneficio   Boolean      @default(false) @map("is_beneficio")     // True for beneficio work
  sortOrder     Int          @default(0) @map("sort_order")
  isActive      Boolean      @default(true) @map("is_active")
  createdAt     DateTime     @default(now()) @map("created_at")
  updatedAt     DateTime     @updatedAt @map("updated_at")

  // Range validation — alerts if quantity is outside historical norms
  minQtyAlert   Decimal?     @map("min_qty_alert") @db.Decimal(10, 2)
  maxQtyAlert   Decimal?     @map("max_qty_alert") @db.Decimal(10, 2)

  activityRecords ActivityRecord[]
  planEntries     PlanEntry[]

  @@map("activities")
}

// ============================================================
// MODULE 1: PLANILLA (Daily Activities + Payroll)
// ============================================================

// Agricultural year runs March → February
// Pay periods: catorcena (biweekly) or semanal (weekly)
// From Excel: currently weekly (column "Semana" = week number)

enum PayPeriodType {
  SEMANAL
  CATORCENA
}

model PayPeriod {
  id              String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  type            PayPeriodType @default(SEMANAL)
  periodNumber    Int           @map("period_number")         // Week or catorcena number
  agriculturalYear String       @map("agricultural_year")     // "2526" = Mar 2025 → Feb 2026
  startDate       DateTime      @map("start_date")
  endDate         DateTime      @map("end_date")
  isClosed        Boolean       @default(false) @map("is_closed")
  closedAt        DateTime?     @map("closed_at")
  closedBy        String?       @map("closed_by") @db.Uuid
  createdAt       DateTime      @default(now()) @map("created_at")
  updatedAt       DateTime      @updatedAt @map("updated_at")

  activityRecords ActivityRecord[]
  payrollEntries  PayrollEntry[]

  @@unique([agriculturalYear, periodNumber, type])
  @@map("pay_periods")
}

model ActivityRecord {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  date          DateTime  @db.Date                           // Work date
  payPeriodId   String    @map("pay_period_id") @db.Uuid
  workerId      String    @map("worker_id") @db.Uuid
  activityId    String    @map("activity_id") @db.Uuid
  loteId        String?   @map("lote_id") @db.Uuid           // Nullable: beneficio has no lote
  quantity      Decimal   @db.Decimal(10, 2)                  // Units of work done
  unitPrice     Decimal   @map("unit_price") @db.Decimal(10, 2) // Rate applied (snapshot)
  totalEarned   Decimal   @map("total_earned") @db.Decimal(10, 2) // quantity × unitPrice
  notes         String?
  // Offline sync fields
  clientId      String?   @unique @map("client_id")          // UUID generated on device
  syncedAt      DateTime? @map("synced_at")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  payPeriod     PayPeriod @relation(fields: [payPeriodId], references: [id])
  worker        Worker    @relation(fields: [workerId], references: [id])
  activity      Activity  @relation(fields: [activityId], references: [id])
  lote          Lote?     @relation(fields: [loteId], references: [id])

  @@index([date])
  @@index([payPeriodId])
  @@index([workerId])
  @@index([loteId])
  @@index([activityId])
  @@map("activity_records")
}

model PayrollEntry {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  payPeriodId     String    @map("pay_period_id") @db.Uuid
  workerId        String    @map("worker_id") @db.Uuid
  totalEarned     Decimal   @map("total_earned") @db.Decimal(10, 2)   // Sum of activity_records
  bonification    Decimal   @default(0) @db.Decimal(10, 2)            // Manual bonus
  advances        Decimal   @default(0) @db.Decimal(10, 2)            // Anticipos
  deductions      Decimal   @default(0) @db.Decimal(10, 2)            // Other deductions
  totalToPay      Decimal   @map("total_to_pay") @db.Decimal(10, 2)  // earned + bonus - advances - deductions
  isPaid          Boolean   @default(false) @map("is_paid")
  paidAt          DateTime? @map("paid_at")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  payPeriod       PayPeriod @relation(fields: [payPeriodId], references: [id])
  worker          Worker    @relation(fields: [workerId], references: [id])

  @@unique([payPeriodId, workerId])
  @@map("payroll_entries")
}

// ============================================================
// MODULE 2: INGRESO DE CAFÉ (Harvest Intake + Rendimiento)
// ============================================================

enum CoffeeType {
  CEREZA      // Fresh cherry — most common
  PERGAMINO   // Parchment
  ORO         // Green/gold — rare at finca level
}

enum IntakeSource {
  COSECHA     // Own harvest
  COMPRA      // Purchased from neighbor/small producer
}

enum CoffeeStatus {
  RECIBIDO    // Received at beneficio
  DESPULPADO  // Depulped
  SECANDO     // Drying (in guardiola or patio)
  PERGAMINO   // Dried parchment, ready for storage
  ENVASADO    // Bagged
  DESPACHADO  // Shipped to exportadora
}

model CoffeeIntake {
  id              String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  code            String       @unique                          // "IC-2526-01" format
  date            DateTime     @db.Date                          // Intake date
  coffeeType      CoffeeType   @default(CEREZA) @map("coffee_type")
  source          IntakeSource @default(COSECHA)
  loteId          String?      @map("lote_id") @db.Uuid          // Origin lot (null if compra)
  supplierName    String?      @map("supplier_name")              // Only for COMPRA
  bultos          Int?                                             // Number of bags/bultos
  pesoNetoQq      Decimal      @map("peso_neto_qq") @db.Decimal(10, 2)  // Net weight in quintales (maduro/cereza)
  pesoPergaminoQq Decimal?     @map("peso_pergamino_qq") @db.Decimal(10, 2) // Weight after processing
  rendimiento     Decimal?     @db.Decimal(6, 2)                   // cereza / pergamino ratio
  status          CoffeeStatus @default(RECIBIDO)
  processedDate   DateTime?    @map("processed_date") @db.Date    // When processing completed
  dispatchDate    DateTime?    @map("dispatch_date") @db.Date     // When shipped to exportadora
  dispatchCode    String?      @map("dispatch_code")               // Dispatch reference
  cuppingScore    Decimal?     @map("cupping_score") @db.Decimal(4, 1) // Quality score (future)
  notes           String?
  // Offline sync
  clientId        String?      @unique @map("client_id")
  syncedAt        DateTime?    @map("synced_at")
  createdAt       DateTime     @default(now()) @map("created_at")
  updatedAt       DateTime     @updatedAt @map("updated_at")

  lote            Lote?        @relation(fields: [loteId], references: [id])

  @@index([date])
  @@index([loteId])
  @@index([status])
  @@index([code])
  @@map("coffee_intakes")
}

// ============================================================
// MODULE 3: ACTIVITY PLANNING (Master Plan by Lot)
// ============================================================

// The master plan defines expected jornales per activity per lot per week
// This is the PLAN — ActivityRecord is the ACTUAL

model PlanEntry {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  agriculturalYear String   @map("agricultural_year")        // "2627"
  loteId           String   @map("lote_id") @db.Uuid
  activityId       String   @map("activity_id") @db.Uuid
  month            Int                                        // 1-12
  week             Int                                        // 1-4 within month
  plannedJornales  Decimal  @map("planned_jornales") @db.Decimal(8, 2)
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")

  lote             Lote     @relation(fields: [loteId], references: [id])
  activity         Activity @relation(fields: [activityId], references: [id])

  @@unique([agriculturalYear, loteId, activityId, month, week])
  @@index([agriculturalYear])
  @@index([loteId])
  @@map("plan_entries")
}

// ============================================================
// MODULE 4: PRODUCTION ESTIMATES
// ============================================================

// 4 estimates + 1 final per agricultural year per lot
// From Excel: lb/planta → qq maduro/lote → qq oro/mz → qq oro/lote

enum EstimateType {
  PRIMERA     // First estimate (e.g. post-harvest assessment)
  SEGUNDA     // First flowering
  TERCERA     // First grain development
  CUARTA      // Green grain
  FINAL       // Actual end-of-harvest
}

model ProductionEstimate {
  id               String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  agriculturalYear String       @map("agricultural_year")     // "2627"
  loteId           String       @map("lote_id") @db.Uuid
  estimateType     EstimateType @map("estimate_type")
  estimateDate     DateTime     @map("estimate_date") @db.Date
  lbPerPlant       Decimal      @map("lb_per_plant") @db.Decimal(6, 2)  // Sampled lb per plant
  // Computed fields stored for query performance:
  qqMaduroPerLote  Decimal?     @map("qq_maduro_per_lote") @db.Decimal(10, 2)
  qqOroPerManzana  Decimal?     @map("qq_oro_per_manzana") @db.Decimal(10, 2)
  qqOroPerLote     Decimal?     @map("qq_oro_per_lote") @db.Decimal(10, 2)
  notes            String?
  createdAt        DateTime     @default(now()) @map("created_at")
  updatedAt        DateTime     @updatedAt @map("updated_at")

  lote             Lote         @relation(fields: [loteId], references: [id])

  @@unique([agriculturalYear, loteId, estimateType])
  @@index([agriculturalYear])
  @@map("production_estimates")
}

// ============================================================
// FUTURE: INSUMOS KARDEX (Diesel, Herbicides, Fertilizer)
// ============================================================
// Placeholder — will be designed when requirements are gathered.
// From transcription: Kardex de diésel, control de herbicidas/fertilizantes,
// órdenes de compra de insumos, tracking nitrogen usage per year.

// ============================================================
// FUTURE: DESPACHOS & TRAZABILIDAD
// ============================================================
// Placeholder — links CoffeeIntake → Dispatch → Exportadora
// Partida-level traceability: who picked it, when, from where, catación score.
// Will connect to the Exportadora app when that ships.

// ============================================================
// AUDIT
// ============================================================

model AuditLog {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId      String   @map("user_id") @db.Uuid
  action      String                                          // "CREATE", "UPDATE", "DELETE"
  tableName   String   @map("table_name")
  recordId    String   @map("record_id") @db.Uuid
  oldValues   Json?    @map("old_values")
  newValues   Json?    @map("new_values")
  ipAddress   String?  @map("ip_address")
  userAgent   String?  @map("user_agent")
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([tableName, recordId])
  @@index([userId])
  @@index([createdAt])
  @@map("audit_logs")
}
```

---

## 3. Project Structure

```
finca-danilandia/
├── .env.local                          # Local env vars (never committed)
├── .env.example                        # Template
├── next.config.ts                      # Next.js + Serwist PWA config
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── prisma/
│   ├── schema.prisma                   # Single source of truth
│   ├── migrations/                     # Idempotent migrations
│   └── seed.ts                         # Seed: lotes, activities, users (from real data)
├── public/
│   ├── manifest.json                   # PWA manifest
│   ├── icons/                          # App icons (192, 512)
│   └── sw.js                           # Generated by Serwist
├── src/
│   ├── app/
│   │   ├── layout.tsx                  # Root layout (auth guard, sync provider)
│   │   ├── page.tsx                    # Redirect → /planilla or /login
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── (authenticated)/            # Route group — requires auth
│   │   │   ├── layout.tsx              # Sidebar nav, sync status indicator
│   │   │   ├── planilla/               # MODULE 1
│   │   │   │   ├── page.tsx            # Weekly activity list view
│   │   │   │   ├── nueva/page.tsx      # New activity entry form
│   │   │   │   ├── resumen/page.tsx    # Payroll summary per period
│   │   │   │   └── [periodId]/page.tsx # Period detail
│   │   │   ├── ingreso-cafe/           # MODULE 2
│   │   │   │   ├── page.tsx            # Intake log (list)
│   │   │   │   ├── nuevo/page.tsx      # New intake form
│   │   │   │   └── [intakeId]/page.tsx # Detail + status tracking
│   │   │   ├── plan/                   # MODULE 3
│   │   │   │   ├── page.tsx            # Annual plan (calendar/grid view)
│   │   │   │   └── [loteId]/page.tsx   # Lot-specific plan
│   │   │   ├── estimaciones/           # MODULE 4
│   │   │   │   ├── page.tsx            # Estimates overview (all lots × years)
│   │   │   │   └── [year]/page.tsx     # Year detail
│   │   │   ├── trabajadores/           # Worker management
│   │   │   │   ├── page.tsx            # Worker list
│   │   │   │   ├── nuevo/page.tsx      # New worker
│   │   │   │   └── [workerId]/page.tsx # Worker ficha (profile + history)
│   │   │   ├── lotes/                  # Lot management
│   │   │   │   ├── page.tsx            # Lot list with KPIs
│   │   │   │   └── [loteId]/page.tsx   # Lot detail (production, activities, costs)
│   │   │   └── dashboard/              # Roberto/Octavio overview
│   │   │       └── page.tsx
│   │   └── api/
│   │       ├── sync/route.ts           # Offline queue sync endpoint
│   │       ├── planilla/route.ts
│   │       ├── ingreso-cafe/route.ts
│   │       ├── workers/route.ts
│   │       └── estimates/route.ts
│   ├── lib/
│   │   ├── prisma.ts                   # Prisma client singleton
│   │   ├── supabase/
│   │   │   ├── server.ts               # Server-side Supabase client
│   │   │   └── client.ts               # Browser-side Supabase client
│   │   ├── auth/
│   │   │   ├── middleware.ts            # Auth middleware
│   │   │   └── guards.ts               # Role-based access checks
│   │   ├── offline/
│   │   │   ├── db.ts                   # Dexie.js schema (mirrors Prisma)
│   │   │   ├── sync-engine.ts          # Queue flush + conflict resolution
│   │   │   └── hooks.ts               # useOfflineQuery, useOfflineMutation
│   │   ├── validators/
│   │   │   ├── activity-record.ts      # Zod schemas (shared client/server)
│   │   │   ├── coffee-intake.ts
│   │   │   ├── worker.ts
│   │   │   └── payroll.ts
│   │   ├── constants/
│   │   │   ├── lotes.ts               # Lote definitions from real data
│   │   │   ├── activities.ts          # Activity catalog from real data
│   │   │   └── agricultural-year.ts   # Year calculation helpers
│   │   └── utils/
│   │       ├── format.ts              # Currency (GTQ), date, quantity formatters
│   │       ├── calculations.ts        # Rendimiento, payroll totals, etc.
│   │       └── code-generators.ts     # IC-2526-XX, RI-YYYYMM-XX sequences
│   ├── components/
│   │   ├── ui/                        # shadcn/ui primitives
│   │   ├── layout/
│   │   │   ├── sidebar.tsx
│   │   │   ├── mobile-nav.tsx
│   │   │   └── sync-indicator.tsx     # Online/offline/syncing badge
│   │   ├── forms/
│   │   │   ├── activity-form.tsx
│   │   │   ├── intake-form.tsx
│   │   │   └── worker-form.tsx
│   │   └── data/
│   │       ├── data-table.tsx         # Generic sortable/filterable table
│   │       ├── kpi-card.tsx
│   │       └── period-selector.tsx
│   ├── hooks/
│   │   ├── use-current-period.ts
│   │   ├── use-agricultural-year.ts
│   │   └── use-sync-status.ts
│   └── types/
│       └── index.ts                   # Shared TypeScript types
└── tests/
    ├── unit/
    └── e2e/
```

---

## 4. Module Specifications

### Module 1: Planilla (Priority 1)

**Replaces**: `Planilla_Finca_Cafe_Semanal_CON_Lotes_feb-marz.xlsx`

**Core workflow**:
1. Caporal writes in notebook → Luis enters on desktop (day one)
2. Caporal enters directly on mobile (target state)
3. Each entry = Worker + Activity + Lote + Quantity + Date
4. System auto-calculates: `totalEarned = quantity × unitPrice`
5. At period close: generate PayrollEntry per worker (sum + bonus - advances)
6. Roberto reviews and approves

**Data entry form fields** (from real Excel):
- Date (default: today)
- Worker (dropdown — searchable)
- Activity (dropdown — filters from Activity catalog)
- Lot (dropdown — from Lote table; optional for beneficio activities)
- Quantity (numeric — unit auto-populated from Activity)
- Unit Price (auto-populated from Activity.defaultPrice; override allowed)

**Validation rules** (from transcription):
- Quantity must be within `Activity.minQtyAlert` / `maxQtyAlert` — warn if outside range
- If Corte de Café and quantity > 5 qq per person per day → flag as suspicious
- Cannot enter records for a closed PayPeriod
- Worker must be active

**Views**:
- Daily entry list (filterable by date, worker, activity, lot)
- Weekly summary by worker
- Payroll summary: total earned, bonus, advances, net pay per worker
- Lot summary: jornales and cost per lot per period

---

### Module 2: Ingreso de Café (Priority 2)

**Replaces**: `Ingresos_de_Cafe__por_Corte__2025_2026_acumulado_maduro.xlsx`

**Core workflow**:
1. Coffee arrives at beneficio (cereza from harvest or purchased)
2. Record intake: date, type, weight, origin lot
3. After processing: record pergamino weight → system computes rendimiento
4. Track status: RECIBIDO → DESPULPADO → SECANDO → PERGAMINO → ENVASADO → DESPACHADO
5. Running accumulator: total maduro received per lot (season-to-date)

**Auto-generated code**: `IC-{agricultural_year}-{sequential}` → e.g. `IC-2526-47`

**Key calculations**:
- `rendimiento = pesoNetoQq / pesoPergaminoQq` (cereza:pergamino ratio)
- Alert if rendimiento < 4.0 or > 7.0 (outside normal range for this finca — 5.7 was noted as "high")
- Accumulated maduro per lot per season
- Accumulated pergamino per lot per season

---

### Module 3: Activity Planning (Priority 3)

**Replaces**: Per-lote sheets in `ACTIVIDADES_EDUARDO_Z_-_FCA_DANILANDIA.xlsx`

**Structure**: Grid view — rows = activities, columns = weeks (4 per month × 12 months)
- Each cell = planned jornales for that activity in that lot in that week
- One grid per lote per agricultural year
- "GENERAL" view aggregates all lots

**Plan vs Actual**: Compare PlanEntry.plannedJornales against actual ActivityRecord sum for same lot/activity/week. Semáforo: green (within 20%), yellow (20-50% deviation), red (>50% or not started).

---

### Module 4: Production Estimates (Priority 4)

**Replaces**: GENERAL sheet in `ACTIVIDADES_EDUARDO_Z_-_FCA_DANILANDIA.xlsx`

**Structure**:
- 4 estimates + 1 final per lot per agricultural year
- Input: lb/plant (from field sampling)
- Auto-computed:
  - `qqMaduroPerLote = (lbPerPlant × lote.plantCount) / 100`
  - `qqOroPerLote = qqMaduroPerLote / rendimientoPromedio` (uses historical average rendimiento from Module 2)
  - `qqOroPerManzana = qqOroPerLote / lote.areaManzanas`
- Target: 25 qq oro/mz (from GENERAL sheet: `PROMEDIO DE PRODUCCION = 25`)
- Multi-year comparison: 5 agricultural years side by side (2425, 2526, 2627, 2728, 2829)

---

## 5. Seed Data (from your Excels)

### Lotes (12 confirmed)

| Name | Slug | Area (mz) | Plants |
|---|---|---|---|
| VG1 | vg1 | 10 | 35,000 |
| VG2 | vg2 | 5 | 17,500 |
| CRUZ2 | cruz2 | 12 | 57,737 |
| CRUZ 1 | cruz-1 | 14 | 64,392 |
| MIRASOL | mirasol | 7 | 24,318 |
| CANOA 1 | canoa-1 | 18* | 67,116 |
| CANOA 2 | canoa-2 | — | — |
| CAÑADA | canada | — | — |
| CORONA | corona | — | — |
| ARENERA | arenera | — | — |
| GALERA | galera | — | — |
| SAN EMILIANO CRUZ | san-emiliano-cruz | — | — |

*Note: CANOA 1 shows 18 mz for 2425/2526 but 7 mz for 2627+. Need clarification — area change or data error?*

### Activities (10 confirmed from Control_Actividades)

| Activity | Unit | Default Price (GTQ) |
|---|---|---|
| Corte de Café | Quintal | 70 |
| Pepena | Quintal | 0 |
| Fertilización | Hectárea | 150 |
| Limpia Manual | Jornal | 50 |
| Poda | Manzana | 110 |
| Caporal | Día | 100 |
| Beneficio | Día | 100 |
| Encargado Beneficio | Día | 130 |
| Muestreo de Suelos | Día | 75 |
| Repaso Poda | Manzana | 100 |

*Additional activities from the plan sheets not in Control_Actividades: Deshije, Manejo de sombra, Chapea y desbejucar, Herbicida, Monitoreo de plagas, Control Roya, Análisis de suelos y foliar, Fertilización foliar, Enmiendas. These need unit and price defined.*

---

## 6. Offline Sync Architecture

```
FIELD (Mobile / No Internet)              CLOUD (Supabase)
┌──────────────────────────┐         ┌──────────────────────┐
│ User creates record      │         │                      │
│         │                │         │                      │
│         ▼                │         │                      │
│ ┌──────────────────────┐ │         │                      │
│ │ Dexie.js (IndexedDB) │ │         │                      │
│ │ • Write to local DB  │ │         │                      │
│ │ • Add to outbox queue│ │         │                      │
│ └──────────┬───────────┘ │         │                      │
│            │              │         │                      │
│  ┌─────────▼──────────┐  │         │                      │
│  │ UI updates          │  │         │                      │
│  │ immediately         │  │         │                      │
│  │ (optimistic)        │  │         │                      │
│  └─────────────────────┘  │         │                      │
│                           │         │                      │
│  ... time passes ...      │         │                      │
│  ... connectivity! ...    │         │                      │
│                           │         │                      │
│  ┌─────────────────────┐  │  POST   │  ┌────────────────┐ │
│  │ Background Sync     │──│────────►│  │ /api/sync      │ │
│  │ (Service Worker)    │  │         │  │ • Validate     │ │
│  │ • Flush outbox      │  │         │  │ • Upsert via   │ │
│  │ • Retry on failure  │  │         │  │   Prisma       │ │
│  └─────────────────────┘  │  200 OK │  │ • Return IDs   │ │
│                           │◄────────│  └────────────────┘ │
│  ┌─────────────────────┐  │         │                      │
│  │ Mark synced ✓       │  │         │                      │
│  │ Clear outbox items  │  │         │                      │
│  └─────────────────────┘  │         │                      │
└──────────────────────────┘         └──────────────────────┘
```

**Conflict resolution**: Each record has a `clientId` (UUID v4 generated on device). Server uses `UPSERT` on `clientId` — if it already exists, skip. This prevents duplicates from retry attempts. Last-write-wins on `updatedAt` for edits.

**Reference data** (lotes, activities, workers) is pre-cached on login and refreshed when online. These tables change rarely.

---

## 7. Phased Delivery

| Phase | Scope | Depends On |
|---|---|---|
| **0 — Foundation** | Auth, DB, PWA shell, sync engine, seed data | — |
| **1 — Planilla** | Activity entry, payroll summary, worker management | Phase 0 |
| **2 — Ingreso Café** | Coffee intake, rendimiento, status tracking | Phase 0 |
| **3 — Plan** | Annual activity plan grid, plan vs actual | Phase 1 |
| **4 — Estimaciones** | Production estimates, multi-year comparison | Phase 2 |
| **5 — Dashboard** | KPIs, alerts, Roberto/Octavio overview | Phases 1-4 |

---

## 8. Open Questions (Need Your Input)

1. **CANOA 1 area discrepancy**: 18 mz in 2425/2526 vs 7 mz in 2627+. Which is correct?
2. **Missing activities**: Deshije, Manejo de sombra, Chapea, Herbicida, Control Roya, etc. — what are their units and prices?
3. **Missing lot data**: CANOA 2, CAÑADA, CORONA, ARENERA, GALERA, SAN EMILIANO CRUZ have no area/plant data in the GENERAL sheet. Is this because they're being added or because data wasn't entered?
4. **Pepena at Q0**: Is this correct that Pepena (gleaning) is unpaid? Or is it a placeholder?
5. **Pay period**: The Excel uses weekly ("Semana"). Is the actual pay cycle weekly or biweekly (catorcena)? The transcription mentions both.
6. **Repo**: New repo or monorepo with other Grupo Orión apps?
