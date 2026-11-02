// =============================================================================
// src/lib/offline/db.ts — Dexie.js IndexedDB schema for offline-first
// =============================================================================
// Mirrors the subset of Prisma models that need offline support:
// - ActivityRecord (write offline → sync)
// - CoffeeIntake (write offline → sync)
// - Enrollment bundles and cherry weighings (outbox)
// - Reference data caches (read-only mirrors)
// - Outbox queue (pending mutations)

import Dexie, { type EntityTable } from "dexie";
import type { PhotoSlot } from "@/lib/harvest/constants";

export interface OfflineActivityRecord {
  clientId: string;
  date: string;
  payPeriodId: string;
  workerId: string;
  activityId: string;
  loteId: string | null;
  quantity: number;
  unitPrice: number;
  totalEarned: number;
  notes: string | null;
  createdAt: string;
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

export interface CachedWorker {
  id: string;
  fullName: string;
  isActive: boolean;
  cui: string;
  category: string;
  cuadrilla: string | null;
}

export interface CachedActivity {
  id: string;
  name: string;
  shortName?: string | null;
  unit: string;
  defaultPrice: number;
  isHarvest: boolean;
  isBeneficio: boolean;
  isActive: boolean;
  priceSchedule?: { effectiveFrom: string; price: number }[];
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

export interface CachedFaceDescriptor {
  id: string;
  workerId: string;
  descriptor: number[];
  captureTime: string;
  source: "server" | "local";
}

export interface PendingBlob {
  id?: number;
  clientId: string;
  slot: PhotoSlot;
  blob: Blob;
}

export interface WorkerPhoto {
  workerId: string;
  blob: Blob;
}

export interface ModelFile {
  name: string;
  blob: Blob;
}

export interface HarvestMeta {
  key: string;
  faceMatchMinSimilarity: number;
}

export type OutboxTable =
  | "activity_records"
  | "coffee_intakes"
  | "enrollments"
  | "face_enrollments"
  | "weighings";

export interface OutboxEntry {
  id?: number;
  table: OutboxTable;
  clientId: string;
  payload: string;
  attempts: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  createdAt: string;
}

class FincaOfflineDB extends Dexie {
  activityRecords!: EntityTable<OfflineActivityRecord, "clientId">;
  coffeeIntakes!: EntityTable<OfflineCoffeeIntake, "clientId">;
  workers!: EntityTable<CachedWorker, "id">;
  activities!: EntityTable<CachedActivity, "id">;
  lotes!: EntityTable<CachedLote, "id">;
  payPeriods!: EntityTable<CachedPayPeriod, "id">;
  outbox!: EntityTable<OutboxEntry, "id">;
  faceDescriptors!: EntityTable<CachedFaceDescriptor, "id">;
  pendingBlobs!: EntityTable<PendingBlob, "id">;
  workerPhotos!: EntityTable<WorkerPhoto, "workerId">;
  modelFiles!: EntityTable<ModelFile, "name">;
  harvestMeta!: EntityTable<HarvestMeta, "key">;

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

    this.version(2).stores({
      activityRecords: "clientId, date, workerId, payPeriodId, syncedAt",
      coffeeIntakes: "clientId, date, code, syncedAt",
      workers: "id, fullName, cui, category",
      activities: "id, name",
      lotes: "id, slug",
      payPeriods: "id, agriculturalYear",
      outbox: "++id, table, clientId, createdAt",
      faceDescriptors: "id, workerId, source",
      pendingBlobs: "++id, clientId, slot",
      workerPhotos: "workerId",
      modelFiles: "name",
      harvestMeta: "key",
    });
  }
}

export const offlineDb = new FincaOfflineDB();
