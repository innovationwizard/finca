# Finca Danilandia — Sistema de Gestión Agrícola

> **Finca Danilandia y Anexos, S.A.** · Grupo Orión
> Offline-first PWA for coffee farm management.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy env and fill in Supabase credentials
cp .env.example .env.local

# 3. Push schema to Supabase
npx prisma db push

# 4. Seed with real data (lotes, activities, workers)
npm run db:seed

# 5. Create initial users in Supabase Auth dashboard:
#    - Your account (MASTER role)
#    - Luis (ADMIN role)
#    - Roberto (MANAGER role)
#    Then insert matching rows in the `users` table via Prisma Studio:
npx prisma studio

# 6. Run dev server
npm run dev
```

## Architecture

- **Next.js 15** (App Router) on **Vercel**
- **Supabase** (PostgreSQL + Auth + Storage + Realtime)
- **Prisma** ORM with strict typing
- **PWA** with Serwist (service worker) + Dexie.js (IndexedDB)
- **Offline-first**: write to IndexedDB → outbox queue → background sync

## Modules (Priority Order)

1. **Planilla** — Daily activity recording, payroll summary
2. **Ingreso de Café** — Harvest intake, rendimiento tracking
3. **Plan Anual** — Activity planning by lot (plan vs actual)
4. **Estimaciones** — Production estimates (4 + final per year)

## Admin Pages (MASTER + ADMIN only)

- `/admin/lotes` — Lot area, plants, density configuration
- `/admin/actividades` — Activity catalog (units, prices), pay cycle settings

## Agricultural Year

March → February. Code format: `2526` = March 2025 → February 2026.
