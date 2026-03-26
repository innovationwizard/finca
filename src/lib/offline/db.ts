// =============================================================================
// src/lib/offline/db.ts — Dexie.js IndexedDB schema for offline-first
// =============================================================================
// Mirrors the subset of Prisma models that need offline support:
// - ActivityRecord (write offline → sync)
// - CoffeeIntake (write offline → sync)
// - Reference data caches (read-only mirrors)
// - Outbox queue (pending mutations)

import Dexie, { type EntityTable } from "dexie";

// ── Offline record types ─────────────────────────────────────────────────────

export interface OfflineActivityRecord {
  clientId: string; // UUID v4 — dedup key
  date: string; // ISO date
  payPeriodId: string;
  workerId: string;
  activityId: string;
  loteId: string | null;
  quantity: number;
  unitPrice: number;
  totalEarned: number;
  notes: string | null;
  createdAt: string; // ISO datetime
  syncedAt: string | null;
}

export interface OfflineCoffeeIntake {
  clientId: string;
  code: string;
  date: string;
  coffeeType: string;
  source: string;
  loteId: string | null;
  supplierName: string | null;
  bultos: number | null;
  pesoNetoQq: number;
  pesoPergaminoQq: number | null;
  rendimiento: number | null;
  status: string;
  notes: string | null;
  createdAt: string;
  syncedAt: string | null;
}

// ── Reference data caches (synced on login, refreshed when online) ───────────

export interface CachedWorker {
  id: string;
  fullName: string;
  isActive: boolean;
}

export interface CachedActivity {
  id: string;
  name: string;
  unit: string;
  defaultPrice: number;
  isHarvest: boolean;
  isBeneficio: boolean;
  isActive: boolean;
}

export interface CachedLote {
  id: string;
  name: string;
  slug: string;
  areaManzanas: number;
  isActive: boolean;
}

export interface CachedPayPeriod {
  id: string;
  type: string;
  periodNumber: number;
  agriculturalYear: string;
  startDate: string;
  endDate: string;
  isClosed: boolean;
}

// ── Outbox queue entry ───────────────────────────────────────────────────────

export interface OutboxEntry {
  id?: number; // Auto-increment
  table: "activity_records" | "coffee_intakes";
  clientId: string;
  payload: string; // JSON-serialized record
  attempts: number;
  lastAttemptAt: string | null;
  createdAt: string;
}

// ── Database ─────────────────────────────────────────────────────────────────

class FincaOfflineDB extends Dexie {
  activityRecords!: EntityTable<OfflineActivityRecord, "clientId">;
  coffeeIntakes!: EntityTable<OfflineCoffeeIntake, "clientId">;
  workers!: EntityTable<CachedWorker, "id">;
  activities!: EntityTable<CachedActivity, "id">;
  lotes!: EntityTable<CachedLote, "id">;
  payPeriods!: EntityTable<CachedPayPeriod, "id">;
  outbox!: EntityTable<OutboxEntry, "id">;

  constructor() {
    super("finca-danilandia");

    this.version(1).stores({
      activityRecords: "clientId, date, workerId, payPeriodId, syncedAt",
      coffeeIntakes: "clientId, date, code, syncedAt",
      workers: "id, fullName",
      activities: "id, name",
      lotes: "id, slug",
      payPeriods: "id, agriculturalYear",
      outbox: "++id, table, clientId, createdAt",
    });
  }
}

export const offlineDb = new FincaOfflineDB();
