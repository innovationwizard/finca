"use client";

// =============================================================================
// src/hooks/use-sync-status.ts — Reactive sync status
// =============================================================================

// zustand-based sync status store
import { create } from "zustand";

type SyncState = {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  setOnline: (v: boolean) => void;
  setPendingCount: (n: number) => void;
  setSyncing: (v: boolean) => void;
};

export const useSyncStore = create<SyncState>((set) => ({
  isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  pendingCount: 0,
  isSyncing: false,
  setOnline: (v) => set({ isOnline: v }),
  setPendingCount: (n) => set({ pendingCount: n }),
  setSyncing: (v) => set({ isSyncing: v }),
}));

export function useSyncStatus() {
  const isOnline = useSyncStore((s) => s.isOnline);
  const pendingCount = useSyncStore((s) => s.pendingCount);
  const isSyncing = useSyncStore((s) => s.isSyncing);

  return { isOnline, pendingCount, isSyncing };
}
