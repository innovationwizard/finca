"use client";

// =============================================================================
// src/components/layout/sync-indicator.tsx — Online/offline/syncing badge
// =============================================================================

import { useSyncStatus } from "@/hooks/use-sync-status";

export function SyncIndicator() {
  const { isOnline, pendingCount, isSyncing } = useSyncStatus();

  if (isSyncing) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-earth-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-earth-500" />
        </span>
        <span className="text-earth-600">
          Sincronizando ({pendingCount})...
        </span>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="inline-flex h-2 w-2 rounded-full bg-amber-400" />
        <span className="text-amber-600">
          Sin conexión
          {pendingCount > 0 && ` · ${pendingCount} pendiente${pendingCount > 1 ? "s" : ""}`}
        </span>
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="inline-flex h-2 w-2 rounded-full bg-amber-400" />
        <span className="text-amber-600">
          {pendingCount} pendiente{pendingCount > 1 ? "s" : ""}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      <span className="text-emerald-600">Sincronizado</span>
    </div>
  );
}
