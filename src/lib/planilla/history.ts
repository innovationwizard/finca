// =============================================================================
// src/lib/planilla/history.ts — Planillas Anteriores view model (shared)
// The pure logic behind the historical review grid: the Mon–Sat weeks a closed
// period spans, and the per-worker × per-day cell map built from its records.
// Both the on-screen page (planilla/page.tsx) and the xlsx export
// (api/planilla/export/route.ts) consume THIS module, so the downloaded
// workbook can never drift from what the grid shows.
// =============================================================================

import { formatQuantity } from "@/lib/utils/format";

// ── Date helpers (UTC: @db.Date values are UTC midnight; UTC has no DST, so
//    stepping by 86_400_000 ms always lands on the next midnight) ──────────────
export const DAY_MS = 86_400_000;
export const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]; // Mon–Sat (no Sunday: the séptimo is computed, never entered)

export const isoUTC = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
export const dayMsUTC = (d: Date): number => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
export const weekMondayMs = (ms: number): number => ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY_MS; // Mon=0
export const weekSaturdayMs = (ms: number): number => ms + (6 - new Date(ms).getUTCDay()) * DAY_MS;
export const dm = (iso: string): string => { const [, m, d] = iso.split("-"); return `${d}/${m}`; };

export function weekLabel(monIso: string, satIso: string): string {
  const [, m1, d1] = monIso.split("-");
  const [, m2, d2] = satIso.split("-");
  return `De ${MONTHS_ES[Number(m1) - 1]} ${Number(d1)} a ${MONTHS_ES[Number(m2) - 1]} ${Number(d2)}`;
}

export type Week = { index: number; monday: string; saturday: string; days: string[] };

// The Mon–Sat calendar weeks the period spans: from the Monday of the week
// containing its start to the Saturday of the week containing its end. This
// matches the séptimo "owned week" set for a normal period (which ends on a
// Saturday) while still covering every day — and therefore every record — of a
// period whose dates were edited off a week boundary (early payment, etc.).
export function periodWeeks(start: Date, end: Date): Week[] {
  const firstMon = weekMondayMs(dayMsUTC(start));
  const lastSat = weekSaturdayMs(dayMsUTC(end));
  const weeks: Week[] = [];
  let idx = 0;
  for (let t = firstMon; t <= lastSat; t += 7 * DAY_MS) {
    weeks.push({
      index: idx++,
      monday: isoUTC(t),
      saturday: isoUTC(t + 5 * DAY_MS),
      days: Array.from({ length: 6 }, (_, i) => isoUTC(t + i * DAY_MS)),
    });
  }
  return weeks;
}

// A single activity a worker performed on a day. A worker may have >1 activity
// in a day; we never collapse them — every record is shown.
export type Entry = { code: string | null; name: string; lote: string | null; units: number; unit: string; total: number };

// The minimum record shape the grid needs (a subset of ActivityRecord + joins).
export type GridRecord = {
  workerId: string;
  date: Date;
  quantity: unknown; // Prisma Decimal — coerced via Number()
  totalEarned: unknown; // Prisma Decimal — coerced via Number()
  activity: { name: string; code: string | null; unit: string };
  lote: { name: string } | null;
};

export type Grid = {
  cells: Map<string, Entry[]>; // key `${workerId}|${dayIso}` → entries
  workerTotals: Map<string, number>; // workerId → summed totalEarned
};

// Build the cell map + per-worker totals from a flat record list. Keyed by
// worker and ISO day so the page and the export index cells identically.
export function buildGrid(records: GridRecord[]): Grid {
  const cells = new Map<string, Entry[]>();
  const workerTotals = new Map<string, number>();
  for (const r of records) {
    const dayIso = r.date.toISOString().slice(0, 10);
    const k = `${r.workerId}|${dayIso}`;
    (cells.get(k) ?? cells.set(k, []).get(k)!).push({
      code: r.activity.code,
      name: r.activity.name,
      lote: r.lote?.name ?? null,
      units: Number(r.quantity),
      unit: r.activity.unit,
      total: Number(r.totalEarned),
    });
    workerTotals.set(r.workerId, (workerTotals.get(r.workerId) ?? 0) + Number(r.totalEarned));
  }
  return { cells, workerTotals };
}

export const cellKey = (workerId: string, dayIso: string): string => `${workerId}|${dayIso}`;

// The activity label shown on the grid's first cell line: "CODE · Name" or just
// the name when the activity has no code.
export const entryActivityLabel = (e: Entry): string => (e.code ? `${e.code} · ${e.name}` : e.name);

// The detail line under it: "Lote · 3.50 qq" (or "—" when there is no lote).
export const entryDetailLabel = (e: Entry): string => `${e.lote ?? "—"} · ${formatQuantity(e.units, e.unit)}`;
