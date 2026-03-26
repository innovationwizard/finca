// =============================================================================
// src/lib/offline/sync-engine.ts — Outbox queue flush + conflict resolution
// =============================================================================
// Strategy: write-to-IndexedDB-first, sync-when-online.
// Dedup: server uses clientId UPSERT — safe to retry.
// Conflict: last-write-wins on updatedAt (acceptable for field data entry).

import { offlineDb, type OutboxEntry } from "./db";

const MAX_RETRIES = 5;
const SYNC_ENDPOINT = "/api/sync";

export type SyncResult = {
  synced: number;
  failed: number;
  remaining: number;
};

/**
 * Flush all pending outbox entries to the server.
 * Called by:
 *  1. SyncProvider on "online" event
 *  2. Service Worker background sync
 *  3. Manual sync button
 */
export async function flushOutbox(): Promise<SyncResult> {
  const pending = await offlineDb.outbox
    .where("attempts")
    .below(MAX_RETRIES)
    .toArray();

  if (pending.length === 0) {
    return { synced: 0, failed: 0, remaining: 0 };
  }

  let synced = 0;
  let failed = 0;

  // Batch by table for efficiency
  const grouped = groupBy(pending, (e) => e.table);

  for (const [table, entries] of Object.entries(grouped)) {
    try {
      const payloads = entries.map((e) => ({
        clientId: e.clientId,
        data: JSON.parse(e.payload),
      }));

      const res = await fetch(SYNC_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table, records: payloads }),
      });

      if (res.ok) {
        const result = await res.json();
        const syncedIds: string[] = result.syncedClientIds ?? [];

        // Mark synced in local DB
        await offlineDb.transaction("rw", [offlineDb.outbox, offlineDb.activityRecords, offlineDb.coffeeIntakes], async () => {
          for (const entry of entries) {
            if (syncedIds.includes(entry.clientId)) {
              // Remove from outbox
              if (entry.id) await offlineDb.outbox.delete(entry.id);

              // Mark local record as synced
              const now = new Date().toISOString();
              if (table === "activity_records") {
                await offlineDb.activityRecords.update(entry.clientId, { syncedAt: now });
              } else if (table === "coffee_intakes") {
                await offlineDb.coffeeIntakes.update(entry.clientId, { syncedAt: now });
              }

              synced++;
            }
          }
        });
      } else {
        // Server error — increment attempts
        for (const entry of entries) {
          if (entry.id) {
            await offlineDb.outbox.update(entry.id, {
              attempts: entry.attempts + 1,
              lastAttemptAt: new Date().toISOString(),
            });
          }
        }
        failed += entries.length;
      }
    } catch {
      // Network error — increment attempts
      for (const entry of entries) {
        if (entry.id) {
          await offlineDb.outbox.update(entry.id, {
            attempts: entry.attempts + 1,
            lastAttemptAt: new Date().toISOString(),
          });
        }
      }
      failed += entries.length;
    }
  }

  const remaining = await offlineDb.outbox.count();

  return { synced, failed, remaining };
}

/**
 * Get count of pending outbox entries.
 */
export async function getPendingCount(): Promise<number> {
  return offlineDb.outbox.count();
}

/**
 * Add a record to the outbox for later sync.
 */
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
    createdAt: new Date().toISOString(),
  });
}

/**
 * Refresh reference data caches from server.
 * Called on login and periodically when online.
 */
export async function refreshReferenceData(): Promise<void> {
  try {
    const [workers, activities, lotes, payPeriods] = await Promise.all([
      fetch("/api/workers?active=true").then((r) => r.ok ? r.json() : []),
      fetch("/api/activities?active=true").then((r) => r.ok ? r.json() : []),
      fetch("/api/lotes?active=true").then((r) => r.ok ? r.json() : []),
      fetch("/api/pay-periods?current=true").then((r) => r.ok ? r.json() : []),
    ]);

    await offlineDb.transaction("rw", [offlineDb.workers, offlineDb.activities, offlineDb.lotes, offlineDb.payPeriods], async () => {
      if (workers.length) {
        await offlineDb.workers.clear();
        await offlineDb.workers.bulkPut(workers);
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
    });
  } catch {
    // Offline — use stale cache. This is fine.
  }
}

// ── Utils ────────────────────────────────────────────────────────────────────

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
