"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { offlineDb } from "@/lib/offline/db";
import { dismissOutboxEntry } from "@/lib/offline/sync-engine";

export function OutboxNotice({ tables }: { tables: string[] }) {
  const rows = useLiveQuery(
    () => offlineDb.outbox.filter((row) => tables.includes(row.table)).toArray(),
    [tables.join(",")],
  );
  const problems = (rows ?? []).filter((row) => row.lastError);
  if (problems.length === 0) return null;
  return (
    <div className="space-y-2">
      {problems.map((row) => (
        <div key={row.id} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p>{row.lastError}</p>
          <button
            type="button"
            className="mt-1 text-xs font-medium underline"
            onClick={() => row.id && dismissOutboxEntry(row.id)}
          >
            Quitar de la cola
          </button>
        </div>
      ))}
    </div>
  );
}
