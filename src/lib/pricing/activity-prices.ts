// =============================================================================
// src/lib/pricing/activity-prices.ts — Server-side helpers for activity prices.
// Bridges Prisma rows (Date / Decimal) to the isomorphic PriceVigencia shape.
// =============================================================================

import { currentPrice, type PriceVigencia } from "./resolve-price";
import { prisma } from "@/lib/prisma";
import { getCurrentPayPeriod } from "@/lib/payroll/current-period";

type RawVigencia = { effectiveFrom: Date; price: unknown; note?: string | null };

/** Map Prisma price rows → sorted PriceVigencia[] (ISO date, numeric price). */
export function toPriceSchedule(prices: RawVigencia[]): PriceVigencia[] {
  return prices
    .map((p) => ({
      effectiveFrom: p.effectiveFrom.toISOString().split("T")[0],
      price: Number(p.price),
      note: p.note ?? null,
    }))
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

/** Today's date as ISO "YYYY-MM-DD" in America/Guatemala (UTC-6, no DST). */
export function todayISOGuatemala(): string {
  const now = new Date();
  const gt = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  return gt.toISOString().split("T")[0];
}

/**
 * The `effectiveFrom` an INLINE price edit (Actividades → Editar) should carry.
 *
 * It used to be "today", which quietly made every mid-period correction a no-op
 * for the week actually being captured: the capture grid resolves each cell's
 * price by WORK DATE, and the open period's days all precede the edit. On
 * 2026-09-03 Herbicida/Primera Limpia Manual/deshije were repriced to
 * Q22/Q30/Q17 while period 11 (Aug 12 – Sep 9) was open, so Captura kept
 * totalling the March backfill prices and the change looked like it had never
 * saved. Anchoring to the OPEN PERIOD'S START makes the correction cover the
 * period it was made for, which is what "corregí el precio" means on the farm.
 *
 * Past CLOSED periods are still never touched — they end before the open one
 * begins. An explicit date (including a future, pre-scheduled one) is still
 * available through the price-history panel: POST /api/admin/activities/[id]/prices.
 *
 * Clamped to today when a successor period has been opened early, so a price
 * changed "now" is never stamped into the future.
 */
export async function inlinePriceEffectiveFrom(): Promise<Date> {
  const today = todayISOGuatemala();
  const open = await getCurrentPayPeriod();
  if (!open) return new Date(today);
  const start = open.startDate.toISOString().split("T")[0];
  return new Date(start < today ? start : today);
}

/**
 * Recompute `Activity.defaultPrice` = the price effective TODAY.
 *
 * `defaultPrice` is a denormalized read cache of the schedule, so it must be
 * derived, never assumed to be whatever the admin just typed: a backdated or
 * pre-scheduled vigencia can leave a DIFFERENT price in force today.
 */
export async function resyncDefaultPrice(activityId: string): Promise<void> {
  const prices = await prisma.activityPrice.findMany({
    where: { activityId },
    orderBy: { effectiveFrom: "asc" },
  });
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    select: { defaultPrice: true },
  });
  const fallback = activity?.defaultPrice != null ? Number(activity.defaultPrice) : null;
  const current = currentPrice(toPriceSchedule(prices), fallback, todayISOGuatemala());
  await prisma.activity.update({ where: { id: activityId }, data: { defaultPrice: current } });
}
