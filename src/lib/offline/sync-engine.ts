// =============================================================================
// src/lib/offline/sync-engine.ts — Outbox queue flush + conflict resolution
// =============================================================================
// Strategy: write-to-IndexedDB-first, sync-when-online.
// Dedup: server uses clientId — safe to retry.
// A held item stays on the phone. retry:false stops automatic attempts and
// keeps the row so the caporal can see the error. retry:true (period closed,
// person not on the server yet) does not count against the retry limit.

import { FACE_MODEL_FILES } from "@/lib/harvest/constants";
import { offlineDb, type OutboxEntry, type OutboxTable } from "./db";

const MAX_RETRIES = 5;
const SYNC_ENDPOINT = "/api/sync";
const TABLE_ORDER: OutboxTable[] = [
  "enrollments",
  "face_enrollments",
  "weighings",
  "activity_records",
  "coffee_intakes",
];

export type SyncResult = {
  synced: number;
  failed: number;
  remaining: number;
};

type Held = { clientId: string; error: string; retry: boolean };

type ServerSync = {
  syncedClientIds?: string[];
  held?: Held[];
};

export async function flushOutbox(): Promise<SyncResult> {
  const pending = await offlineDb.outbox.where("attempts").below(MAX_RETRIES).toArray();
  if (pending.length === 0) {
    return { synced: 0, failed: 0, remaining: await offlineDb.outbox.count() };
  }

  let synced = 0;
  let failed = 0;
  const grouped = groupBy(pending, (entry) => entry.table);

  for (const table of TABLE_ORDER) {
    const entries = grouped[table];
    if (!entries?.length) continue;
    if (table === "enrollments" || table === "face_enrollments") {
      for (const entry of entries) {
        const outcome = await flushOneWithPhotos(table, entry);
        if (outcome === "synced") synced++;
        else if (outcome === "failed") failed++;
      }
    } else {
      const outcome = await flushBatch(table, entries);
      synced += outcome.synced;
      failed += outcome.failed;
    }
  }

  return { synced, failed, remaining: await offlineDb.outbox.count() };
}

export async function getPendingCount(): Promise<number> {
  return offlineDb.outbox.count();
}

export async function getSyncError(): Promise<string | null> {
  const rows = await offlineDb.outbox.filter((row) => Boolean(row.lastError)).toArray();
  return rows[0]?.lastError ?? null;
}

export async function dismissOutboxEntry(id: number): Promise<void> {
  const entry = await offlineDb.outbox.get(id);
  if (!entry) return;
  await offlineDb.transaction("rw", [offlineDb.outbox, offlineDb.pendingBlobs], async () => {
    await offlineDb.outbox.delete(id);
    await offlineDb.pendingBlobs.where("clientId").equals(entry.clientId).delete();
  });
}

export async function addToOutbox(
  table: OutboxEntry["table"],
  clientId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await offlineDb.outbox.add({
    table,
    clientId,
    payload: JSON.stringify(payload),
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
    createdAt: new Date().toISOString(),
  });
}

async function flushOneWithPhotos(
  table: "enrollments" | "face_enrollments",
  entry: OutboxEntry,
): Promise<"synced" | "failed" | "held"> {
  try {
    const data = JSON.parse(entry.payload) as Record<string, unknown>;
    const paths = { ...((data.paths as Record<string, string> | undefined) ?? {}) };
    const blobs = await offlineDb.pendingBlobs.where("clientId").equals(entry.clientId).toArray();
    for (const blob of blobs) {
      if (paths[blob.slot]) continue;
      const imageBase64 = await blobToBase64(blob.blob);
      const res = await fetch("/api/cosecha/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: entry.clientId,
          slot: blob.slot,
          cui: typeof data.cui === "string" ? data.cui : null,
          imageBase64,
        }),
      });
      if (!res.ok) {
        await markHeld(entry, "No se pudo subir una foto. Sigue en el teléfono.", true);
        return "held";
      }
      const body = (await res.json()) as { path?: string };
      if (!body.path) {
        await markHeld(entry, "La foto no devolvió una ruta.", true);
        return "held";
      }
      paths[blob.slot] = body.path;
    }
    const payload = photoPathsOntoPayload(data, paths);
    if (entry.id) {
      await offlineDb.outbox.update(entry.id, { payload: JSON.stringify(payload) });
    }
    return applyServerResult(table, [entry], await postSync(table, [{ clientId: entry.clientId, data: payload }]));
  } catch {
    await bump(entry);
    return "failed";
  }
}

function photoPathsOntoPayload(
  data: Record<string, unknown>,
  paths: Record<string, string>,
): Record<string, unknown> {
  return {
    ...data,
    paths,
    facePhotoPath: paths.face ?? data.facePhotoPath ?? null,
    dpiFrontPath: paths.dpiFront ?? data.dpiFrontPath ?? null,
    dpiBackPath: paths.dpiBack ?? data.dpiBackPath ?? null,
    partidaPath: paths.partida ?? data.partidaPath ?? null,
  };
}

async function flushBatch(
  table: OutboxTable,
  entries: OutboxEntry[],
): Promise<{ synced: number; failed: number }> {
  try {
    const records = entries.map((entry) => ({
      clientId: entry.clientId,
      data: JSON.parse(entry.payload) as Record<string, unknown>,
    }));
    const result = await postSync(table, records);
    const outcome = await applyServerResult(table, entries, result);
    return outcome === "synced"
      ? { synced: result.syncedClientIds?.length ?? 0, failed: 0 }
      : { synced: result.syncedClientIds?.length ?? 0, failed: entries.length - (result.syncedClientIds?.length ?? 0) };
  } catch {
    for (const entry of entries) await bump(entry);
    return { synced: 0, failed: entries.length };
  }
}

async function postSync(
  table: OutboxTable,
  records: { clientId: string; data: Record<string, unknown> }[],
): Promise<ServerSync & { ok: boolean }> {
  const res = await fetch(SYNC_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ table, records }),
  });
  if (!res.ok) return { ok: false };
  const body = (await res.json()) as ServerSync;
  return { ...body, ok: true };
}

async function applyServerResult(
  table: OutboxTable,
  entries: OutboxEntry[],
  result: ServerSync & { ok: boolean },
): Promise<"synced" | "failed" | "held"> {
  if (!result.ok) {
    for (const entry of entries) await bump(entry);
    return "failed";
  }
  const syncedIds = new Set(result.syncedClientIds ?? []);
  const held = new Map((result.held ?? []).map((item) => [item.clientId, item]));
  let anyHeld = false;
  await offlineDb.transaction(
    "rw",
    [
      offlineDb.outbox,
      offlineDb.activityRecords,
      offlineDb.coffeeIntakes,
      offlineDb.pendingBlobs,
      offlineDb.workers,
      offlineDb.faceDescriptors,
    ],
    async () => {
      for (const entry of entries) {
        if (syncedIds.has(entry.clientId)) {
          if (entry.id) await offlineDb.outbox.delete(entry.id);
          await offlineDb.pendingBlobs.where("clientId").equals(entry.clientId).delete();
          if (table === "enrollments") {
            const localId = `local:${entry.clientId}`;
            await offlineDb.workers.delete(localId);
            await offlineDb.faceDescriptors.where("workerId").equals(localId).delete();
          }
          const now = new Date().toISOString();
          if (table === "activity_records") {
            await offlineDb.activityRecords.update(entry.clientId, { syncedAt: now });
          } else if (table === "coffee_intakes") {
            await offlineDb.coffeeIntakes.update(entry.clientId, { syncedAt: now });
          }
          continue;
        }
        const hold = held.get(entry.clientId);
        if (hold && entry.id) {
          anyHeld = true;
          await offlineDb.outbox.update(entry.id, {
            lastError: hold.error,
            attempts: hold.retry ? entry.attempts : MAX_RETRIES,
            lastAttemptAt: new Date().toISOString(),
          });
          continue;
        }
        if (entry.id) {
          anyHeld = true;
          await offlineDb.outbox.update(entry.id, {
            attempts: entry.attempts + 1,
            lastAttemptAt: new Date().toISOString(),
            lastError: "No se pudo sincronizar. Sigue en el teléfono.",
          });
        }
      }
    },
  );
  return anyHeld ? "held" : "synced";
}

async function markHeld(entry: OutboxEntry, error: string, retry: boolean): Promise<void> {
  if (!entry.id) return;
  await offlineDb.outbox.update(entry.id, {
    lastError: error,
    attempts: retry ? entry.attempts : MAX_RETRIES,
    lastAttemptAt: new Date().toISOString(),
  });
}

async function bump(entry: OutboxEntry): Promise<void> {
  if (!entry.id) return;
  await offlineDb.outbox.update(entry.id, {
    attempts: entry.attempts + 1,
    lastAttemptAt: new Date().toISOString(),
    lastError: "No se pudo sincronizar. Sigue en el teléfono.",
  });
}

export async function refreshReferenceData(): Promise<void> {
  try {
    const [workers, activities, lotes, payPeriods, cuadrillas] = await Promise.all([
      fetch("/api/workers?active=true").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/activities?active=true").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/lotes?active=true").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/pay-periods?current=true").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/cuadrillas").then((r) => (r.ok ? r.json() : [])),
    ]);

    const localWorkers = await offlineDb.workers.filter((worker) => worker.id.startsWith("local:")).toArray();

    await offlineDb.transaction(
      "rw",
      [offlineDb.workers, offlineDb.activities, offlineDb.lotes, offlineDb.payPeriods, offlineDb.cuadrillas],
      async () => {
        if (workers.length) {
          await offlineDb.workers.clear();
          await offlineDb.workers.bulkPut([
            ...workers.map(toCachedWorker),
            ...localWorkers,
          ]);
        }
        if (activities.length) {
          await offlineDb.activities.clear();
          await offlineDb.activities.bulkPut(activities);
        }
        if (lotes.length) {
          await offlineDb.lotes.clear();
          await offlineDb.lotes.bulkPut(lotes);
        }
        if (payPeriods.length) {
          await offlineDb.payPeriods.clear();
          await offlineDb.payPeriods.bulkPut(payPeriods);
        }
        if (cuadrillas.length) {
          await offlineDb.cuadrillas.clear();
          await offlineDb.cuadrillas.bulkPut(cuadrillas);
        }
      },
    );
  } catch {
    // Offline — use the stale cache.
  }

  await refreshFaceCache();
}

type WorkerJson = {
  id: string;
  fullName: string;
  isActive: boolean;
  cui?: string;
  category?: string;
  cuadrillaId?: string | null;
};

function toCachedWorker(worker: WorkerJson) {
  return {
    id: worker.id,
    fullName: worker.fullName,
    isActive: worker.isActive,
    cui: worker.cui ?? "",
    category: worker.category ?? "",
    cuadrillaId: worker.cuadrillaId ?? null,
  };
}

async function refreshFaceCache(): Promise<void> {
  try {
    const res = await fetch("/api/cosecha/descriptors");
    if (!res.ok) return;
    const body = (await res.json()) as {
      faceMatchMinSimilarity?: number;
      descriptors?: { id: string; workerId: string; descriptor: number[]; captureTime: string }[];
      photos?: { workerId: string; url: string }[];
    };
    const local = await offlineDb.faceDescriptors.filter((row) => row.source === "local").toArray();
    await offlineDb.faceDescriptors.clear();
    await offlineDb.faceDescriptors.bulkPut([
      ...(body.descriptors ?? []).map((row) => ({ ...row, source: "server" as const })),
      ...local,
    ]);
    if (typeof body.faceMatchMinSimilarity === "number") {
      await offlineDb.harvestMeta.put({
        key: "config",
        faceMatchMinSimilarity: body.faceMatchMinSimilarity,
      });
    }
    await cacheWorkerPhotos(body.photos ?? []);
  } catch {
    // Face cache is optional until the next online refresh.
  }
}

async function cacheWorkerPhotos(photos: { workerId: string; url: string }[]): Promise<void> {
  const queue = photos.filter((photo) => photo.url);
  const workers = 4;
  let index = 0;
  async function next(): Promise<void> {
    const photo = queue[index++];
    if (!photo) return;
    try {
      const existing = await offlineDb.workerPhotos.get(photo.workerId);
      if (!existing) {
        const res = await fetch(photo.url);
        if (res.ok) {
          const blob = await res.blob();
          await offlineDb.workerPhotos.put({ workerId: photo.workerId, blob });
        }
      }
    } catch {
      // The signed URL can be fetched again on the next refresh.
    }
    await next();
  }
  await Promise.all(Array.from({ length: workers }, () => next()));
}

export async function cacheModelFiles(): Promise<void> {
  await Promise.all(
    FACE_MODEL_FILES.map(async (name) => {
      const existing = await offlineDb.modelFiles.get(name);
      if (existing) return;
      const res = await fetch(`/models/${name}`);
      if (!res.ok) return;
      const blob = await res.blob();
      await offlineDb.modelFiles.put({ name, blob });
    }),
  );
}

let fetchPatched = false;

/** When /models is missing from the network and the service worker, read IndexedDB. */
export function installModelFetchFallback(): void {
  if (fetchPatched || typeof window === "undefined") return;
  fetchPatched = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const marker = "/models/";
    if (!url.includes(marker)) return original(input, init);
    try {
      const res = await original(input, init);
      if (res.ok) return res;
    } catch {
      // Fall through to the IndexedDB copy.
    }
    const name = url.slice(url.indexOf(marker) + marker.length).split("?")[0];
    const row = await offlineDb.modelFiles.get(name);
    if (!row) return original(input, init);
    return new Response(row.blob);
  };
}

function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return arr.reduce(
    (acc, item) => {
      const key = keyFn(item);
      (acc[key] ??= []).push(item);
      return acc;
    },
    {} as Record<string, T[]>,
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const comma = text.indexOf(",");
      resolve(comma >= 0 ? text.slice(comma + 1) : text);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
