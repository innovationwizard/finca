"use client";

// =============================================================================
// src/components/providers/sync-provider.tsx
// Listens for online/offline events, auto-flushes outbox, refreshes cache
// =============================================================================

import { useEffect, useRef } from "react";
import { useSyncStore } from "@/hooks/use-sync-status";
import { flushOutbox, getPendingCount, refreshReferenceData } from "@/lib/offline/sync-engine";

const POLL_INTERVAL_MS = 30_000; // Check pending count every 30s

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { setOnline, setPendingCount, setSyncing } = useSyncStore();
  const flushingRef = useRef(false);

  // Online/offline listeners
  useEffect(() => {
    const goOnline = async () => {
      setOnline(true);
      await doSync();
      await refreshReferenceData();
    };

    const goOffline = () => {
      setOnline(false);
    };

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    // Initial state
    setOnline(navigator.onLine);

    // Initial reference data load + pending count
    refreshReferenceData();
    updatePendingCount();

    // If online on mount, flush
    if (navigator.onLine) {
      doSync();
    }

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Periodic pending count poll
  useEffect(() => {
    const interval = setInterval(updatePendingCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doSync() {
    if (flushingRef.current) return;
    flushingRef.current = true;
    setSyncing(true);

    try {
      await flushOutbox();
    } finally {
      flushingRef.current = false;
      setSyncing(false);
      await updatePendingCount();
    }
  }

  async function updatePendingCount() {
    try {
      const count = await getPendingCount();
      setPendingCount(count);
    } catch {
      // IndexedDB not available — ignore
    }
  }

  return <>{children}</>;
}
