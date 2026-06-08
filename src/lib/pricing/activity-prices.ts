// =============================================================================
// src/lib/pricing/activity-prices.ts — Server-side helpers for activity prices.
// Bridges Prisma rows (Date / Decimal) to the isomorphic PriceVigencia shape.
// =============================================================================

import type { PriceVigencia } from "./resolve-price";

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
