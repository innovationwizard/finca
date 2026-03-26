// =============================================================================
// src/lib/utils/code-generators.ts — Sequential code generation
// =============================================================================

import { getCurrentAgriculturalYear } from "./agricultural-year";

/**
 * Generate next coffee intake code: "IC-2526-47" (COSECHA)
 * Requires current max from database.
 */
export function generateIntakeCode(currentMax: number): string {
  const year = getCurrentAgriculturalYear();
  const seq = String(currentMax + 1).padStart(2, "0");
  return `IC-${year}-${seq}`;
}

/**
 * Generate next compra intake code: "ICC-2526-03" (COMPRA)
 * Requires current max from database.
 */
export function generateCompraIntakeCode(currentMax: number): string {
  const year = getCurrentAgriculturalYear();
  const seq = String(currentMax + 1).padStart(2, "0");
  return `ICC-${year}-${seq}`;
}

/**
 * Generate dispatch code: "OD-2526-03"
 */
export function generateDispatchCode(currentMax: number): string {
  const year = getCurrentAgriculturalYear();
  const seq = String(currentMax + 1).padStart(2, "0");
  return `OD-${year}-${seq}`;
}

/**
 * Generate receipt code: "RI-202601"
 */
export function generateReceiptCode(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `RI-${y}${m}`;
}

/**
 * Generate a UUID v4 (for offline clientId).
 * Uses crypto.randomUUID if available, fallback for older browsers.
 */
export function generateClientId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
