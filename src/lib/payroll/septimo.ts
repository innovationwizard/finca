// =============================================================================
// src/lib/payroll/septimo.ts — Séptimo (seventh-day commitment bonus).
// The séptimo is NOT pay for work on a 7th day; it is an attendance prize:
// when a worker attends all required workdays of a week, they earn a configured
// bonus. The amount is a SystemSetting (group "payroll"), editable on the config
// page; the computation lands in this module in Batch 7.
// =============================================================================

import { prisma } from "@/lib/prisma";

export const SEPTIMO_AMOUNT_KEY = "septimo_amount";
export const SEPTIMO_AMOUNT_GROUP = "payroll";
export const SEPTIMO_AMOUNT_LABEL = "Monto del séptimo (Q)";
// Initial value tied to the xlsx PAGOS rule (75 × 2). Configurable thereafter.
export const SEPTIMO_AMOUNT_DEFAULT = 150;

/**
 * Current séptimo bonus amount in GTQ. Falls back to the default when the
 * setting row does not exist yet (e.g., before it is first saved in config).
 */
export async function getSeptimoAmount(): Promise<number> {
  const s = await prisma.systemSetting.findUnique({ where: { key: SEPTIMO_AMOUNT_KEY } });
  if (!s) return SEPTIMO_AMOUNT_DEFAULT;
  const n = Number(s.value);
  return Number.isFinite(n) && n >= 0 ? n : SEPTIMO_AMOUNT_DEFAULT;
}
