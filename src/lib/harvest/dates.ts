/** Calendar date in America/Guatemala, YYYY-MM-DD. */
export function guatemalaTodayISO(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guatemala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Monday–Saturday week containing an ISO date.
 * Assumption: the farm week used by séptimo, not a Sunday week.
 * A Sunday belongs to the Monday–Saturday that just ended.
 */
export function mondaySaturdayContaining(iso: string): { from: string; to: string } {
  const [y, m, d] = iso.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d);
  const day = new Date(utc).getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = utc + mondayOffset * 86_400_000;
  const saturday = monday + 5 * 86_400_000;
  const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: isoOf(monday), to: isoOf(saturday) };
}

export function monthBounds(yyyyMm: string): { from: string; to: string } {
  const [y, m] = yyyyMm.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    from: `${yyyyMm}-01`,
    to: `${yyyyMm}-${String(last).padStart(2, "0")}`,
  };
}

/** Cosecha code from a calendar date, without a timezone shift. October starts the year. */
export function agriculturalYearFromISO(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const startYear = m >= 10 ? y : y - 1;
  return `${String(startYear).slice(2)}${String(startYear + 1).slice(2)}`;
}

export function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
