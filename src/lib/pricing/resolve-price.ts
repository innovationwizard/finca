// =============================================================================
// src/lib/pricing/resolve-price.ts — Effective-dated activity price resolution.
//
// The price applied to a work record is the one whose `effectiveFrom` is the
// latest date <= the record's WORK DATE. This makes price changes non-retroactive
// (previous weeks keep their price) and lets future prices be pre-scheduled.
// Falls back to `defaultPrice` for dates before any vigencia exists.
//
// Pure and isomorphic: runs identically on the server (from Prisma data) and the
// client (from the offline cache), so the PWA resolves prices offline too.
// =============================================================================

export type PriceVigencia = {
  effectiveFrom: string; // ISO "YYYY-MM-DD"
  price: number;
  note?: string | null; // display-only; not used for resolution
};

/**
 * Resolve the unit price for a work date.
 * @param schedule    the activity's price vigencias (any order)
 * @param defaultPrice fallback when no vigencia covers the date (may be null)
 * @param workDate    ISO "YYYY-MM-DD" of the work being recorded
 */
export function resolveActivityPrice(
  schedule: PriceVigencia[] | undefined | null,
  defaultPrice: number | null | undefined,
  workDate: string,
): number {
  if (schedule && schedule.length > 0 && workDate) {
    // ISO date strings compare lexicographically in chronological order.
    let best: PriceVigencia | null = null;
    for (const v of schedule) {
      if (v.effectiveFrom <= workDate && (!best || v.effectiveFrom > best.effectiveFrom)) {
        best = v;
      }
    }
    if (best) return best.price;
  }
  return defaultPrice ?? 0;
}

/** Price in effect today (used to keep Activity.defaultPrice denormalized). */
export function currentPrice(
  schedule: PriceVigencia[] | undefined | null,
  defaultPrice: number | null | undefined,
  today: string,
): number {
  return resolveActivityPrice(schedule, defaultPrice, today);
}

/** The next future-scheduled vigencia after `today`, if any (for UI hints). */
export function nextScheduled(
  schedule: PriceVigencia[] | undefined | null,
  today: string,
): PriceVigencia | null {
  if (!schedule) return null;
  let next: PriceVigencia | null = null;
  for (const v of schedule) {
    if (v.effectiveFrom > today && (!next || v.effectiveFrom < next.effectiveFrom)) {
      next = v;
    }
  }
  return next;
}
