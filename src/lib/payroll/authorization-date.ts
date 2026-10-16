// =============================================================================
// src/lib/payroll/authorization-date.ts — the day an authorization closes.
//
// A day's pay is quantity × rate. Both are unknown until the day has happened,
// so authorizing payment cannot include a later day, and the authorization
// closes the period on its own calendar day. The planned end (often the next
// Saturday, so the séptimo week can finish inside the period) is only a plan
// while the period is open. "Editar fechas" may still move that plan. The close
// is what turns it into the last day actually paid.
//
// The calendar day is America/Guatemala, not UTC. Guatemala is UTC−6 with no
// daylight-saving change, so an authorization at 19:00 local is already the
// next date in UTC. closed_at is `timestamp without time zone` storing that UTC
// clock reading (Prisma DateTime). The matching SQL is
//   ((closed_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Guatemala')::date
// and not `closed_at AT TIME ZONE 'America/Guatemala'`, which would read the
// UTC clock as if it were already local.
// =============================================================================

const FARM_TZ = "America/Guatemala";

/** Calendar date YYYY-MM-DD of `instant` in America/Guatemala. */
export function guatemalaDateISO(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FARM_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** @db.Date value for a YYYY-MM-DD string. UTC midnight, matching the other period writes. */
export function isoToUtcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** The next calendar day, as YYYY-MM-DD. */
export function nextDateISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

export function formatDmy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}/${y}`;
}

/**
 * Inclusive last day written when a period running `startISO`–`endISO` is
 * authorized at `now`. A future planned end is cut to the authorization's
 * Guatemala date. An end already on or before that date is kept (a late close
 * must not pull extra days in). Null when that day falls before the period
 * starts — the period has not begun, so there is nothing to close.
 */
export function payableEndISO(startISO: string, endISO: string, now: Date): string | null {
  const authDay = guatemalaDateISO(now);
  const end = endISO < authDay ? endISO : authDay;
  if (end < startISO) return null;
  return end;
}
