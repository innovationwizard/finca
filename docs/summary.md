summary.md

Here's what you're getting:
Infrastructure (Phase 0)

prisma/schema.prisma — 14 models, MASTER role, SystemSetting table, full audit logging
prisma/seed.ts — 12 lotes, 19 activities, 18 workers, 9 settings — all from your actual Excels
Supabase Auth (server + browser clients), JWT middleware, role-based guards
Serwist service worker + Dexie.js IndexedDB schema + outbox sync engine
SyncProvider (auto-flush on reconnect, 30s polling, background sync API)

Module 1: Planilla (fully wired)

/planilla — list view with filters (date, worker, lote), KPI cards, footer totals
/planilla/nueva — offline-aware data entry form (writes to IndexedDB when offline, POSTs when online, auto-fills price from activity catalog)
/planilla/resumen — payroll summary grouped by worker
/api/planilla — GET (filtered list) + POST (validated, period-must-be-open, worker-must-be-active)
/api/sync — batch upsert endpoint for outbox flush
/api/pay-periods — list + create

Admin Pages (MASTER + ADMIN)

/admin/lotes — inline-editable table (area, plants, density, variety, active toggle), "Sin datos" badges on placeholder lots
/admin/actividades — full CRUD table for activity catalog (unit picker, price, harvest/beneficio flags, alert thresholds) + pay cycle settings (SEMANAL/CATORCENA toggle, alert thresholds, production targets)

Modules 2-4 — placeholder pages, API routes for reference data, all validators ready
To get running: npm install → fill .env.local with Supabase creds → npx prisma db push → npm run db:seed → create users in Supabase Auth dashboard → npm run dev