// =============================================================================
// src/lib/planilla/septimo-semanal.ts — "Séptimos por semana" view model
// Per-week reconciliation for a CLOSED pay period: what each worker was paid by
// activity, what séptimo they earned that week, and whether the sum matches the
// séptimo actually stored on PayrollEntry. Consumed by the xlsx export
// (api/planilla/septimos) and by scripts/septimo-audit-semanal.ts, so the
// download and the audit can never drift.
//
// Week model — the two rules that make this non-obvious:
//   • The SÉPTIMO of a week is owned by the period containing that week's
//     SATURDAY (see src/lib/payroll/septimo.ts). A week whose Saturday falls
//     outside the period therefore shows no séptimo here: it is paid elsewhere.
//     Attendance is still read BY DATE across every period, so a week that
//     straddles a period boundary accumulates its required days normally.
//   • ACTIVITY pay is CLIPPED to the period: only records belonging to this
//     period count, so the weekly columns sum to the period's devengado. A
//     boundary week's activity therefore covers fewer days than its séptimo
//     requirement did — which is why each week carries its own clipped label.
// =============================================================================

import { PrismaClient, Prisma } from "@prisma/client";
import { getSeptimoAmount } from "@/lib/payroll/septimo";
import { DAY_MS, isoUTC, dayMsUTC, weekMondayMs, dm } from "@/lib/planilla/history";

type Db = PrismaClient | Prisma.TransactionClient;

/** One Mon–Sun calendar week intersecting the period. */
export type SeptimoWeek = {
  index: number;
  monday: string; // full Mon–Sat span the séptimo requirement is judged on…
  saturday: string; // …even when it reaches back into the previous period
  requiredDays: string[]; // Mon–Sat minus holidays (holidays reduce the requirement)
  ownsSeptimo: boolean; // the Saturday falls inside this period
  clipFrom: string; // first period day inside the week
  clipTo: string; // last period day inside the week
  label: string; // "Semana del 16/07 al 19/07"
};

export type SeptimoCell = { actividades: number; septimo: number | null; total: number };

export type SeptimoRow = {
  workerId: string;
  workerName: string;
  cells: SeptimoCell[]; // one per week, in order
  septimoCalculado: number; // Σ of the weekly séptimos this period owns
  septimoPlanilla: number; // PayrollEntry.seventhDayPay for the period
  diferencia: number; // calculado − planilla (0.00 when payroll is right)
  actividadesTotal: number; // Σ of the weekly activity columns
  devengadoPlanilla: number; // PayrollEntry.totalEarned for the period
};

export type SeptimoReport = {
  amount: number; // the configured séptimo (GTQ)
  weeks: SeptimoWeek[];
  rows: SeptimoRow[]; // sorted by full name (es)
  holidayCount: number;
};

const money = (n: number): number => Math.round(n * 100) / 100;

/** "Semana del 16/07 al 19/07" — the days actually paid in this period. */
const weekLabelClipped = (clipFrom: string, clipTo: string): string =>
  `Semana del ${dm(clipFrom)} al ${dm(clipTo)}`;

/**
 * The Mon–Sun calendar weeks a period spans, each clipped to the period's own
 * dates. Pure: `holidayKeys` decides which Mon–Sat days are required.
 */
export function septimoWeeks(
  start: Date,
  end: Date,
  isHoliday: (dayIso: string) => boolean,
): SeptimoWeek[] {
  const startMs = dayMsUTC(start);
  const endMs = dayMsUTC(end);
  const weeks: SeptimoWeek[] = [];
  for (let monMs = weekMondayMs(startMs); monMs <= endMs; monMs += 7 * DAY_MS) {
    const satMs = monMs + 5 * DAY_MS;
    const sunMs = monMs + 6 * DAY_MS;
    const requiredDays: string[] = [];
    for (let t = monMs; t <= satMs; t += DAY_MS) {
      const key = isoUTC(t);
      if (!isHoliday(key)) requiredDays.push(key);
    }
    const clipFrom = isoUTC(Math.max(monMs, startMs));
    const clipTo = isoUTC(Math.min(sunMs, endMs));
    weeks.push({
      index: weeks.length,
      monday: isoUTC(monMs),
      saturday: isoUTC(satMs),
      requiredDays,
      ownsSeptimo: satMs >= startMs && satMs <= endMs,
      clipFrom,
      clipTo,
      label: weekLabelClipped(clipFrom, clipTo),
    });
  }
  return weeks;
}

/**
 * Build the whole report for one CLOSED period. `workerId` optionally narrows
 * it to a single worker (the page's ?trabajador= filter).
 *
 * Roster = every worker with a PayrollEntry in the period OR any activity in
 * it — not the full active roster: a worker absent all period has nothing to
 * reconcile and would only add all-zero rows.
 */
export async function buildSeptimoReport(
  db: Db,
  period: { id: string; startDate: Date; endDate: Date },
  workerId?: string,
): Promise<SeptimoReport> {
  const amount = await getSeptimoAmount();

  // Holidays: exact dates always match; recurringAnnual matches by month-day.
  const holidays = await db.holiday.findMany({ select: { date: true, recurringAnnual: true } });
  const exact = new Set(holidays.map((h) => isoUTC(dayMsUTC(h.date))));
  const recurring = new Set(
    holidays.filter((h) => h.recurringAnnual).map((h) => isoUTC(dayMsUTC(h.date)).slice(5)),
  );
  const isHoliday = (key: string) => exact.has(key) || recurring.has(key.slice(5));

  const weeks = septimoWeeks(period.startDate, period.endDate, isHoliday);
  if (weeks.length === 0) return { amount, weeks, rows: [], holidayCount: holidays.length };

  // Attendance BY DATE over every week's full Mon–Sat span — across all
  // periods, so a week straddling a boundary still accumulates.
  const spanFrom = new Date(`${weeks[0].monday}T00:00:00.000Z`);
  const spanTo = new Date(`${weeks[weeks.length - 1].saturday}T00:00:00.000Z`);
  const attendanceRecords = await db.activityRecord.findMany({
    where: { date: { gte: spanFrom, lte: spanTo } },
    select: { workerId: true, date: true },
  });
  const attended = new Map<string, Set<string>>();
  for (const r of attendanceRecords) {
    const key = isoUTC(dayMsUTC(r.date));
    const set = attended.get(r.workerId) ?? attended.set(r.workerId, new Set()).get(r.workerId)!;
    set.add(key);
  }

  // Activity pay CLIPPED to the period (records that belong to it).
  const payRecords = await db.activityRecord.findMany({
    where: { payPeriodId: period.id },
    select: { workerId: true, date: true, totalEarned: true },
  });
  const payByWorkerDay = new Map<string, Map<string, number>>();
  for (const r of payRecords) {
    const byDay = payByWorkerDay.get(r.workerId) ?? payByWorkerDay.set(r.workerId, new Map()).get(r.workerId)!;
    const key = isoUTC(dayMsUTC(r.date));
    byDay.set(key, (byDay.get(key) ?? 0) + Number(r.totalEarned));
  }

  // What payroll actually stored — the figure the recomputation is checked
  // against. (period, worker, category) is unique, so a worker may hold more
  // than one entry: sum across them rather than assuming a single row.
  const entries = await db.payrollEntry.findMany({
    where: { payPeriodId: period.id },
    select: { workerId: true, totalEarned: true, seventhDayPay: true, worker: { select: { fullName: true } } },
  });
  const stored = new Map<string, { name: string; earned: number; septimo: number }>();
  for (const e of entries) {
    const cur = stored.get(e.workerId) ?? { name: e.worker.fullName, earned: 0, septimo: 0 };
    cur.earned += Number(e.totalEarned);
    cur.septimo += Number(e.seventhDayPay);
    stored.set(e.workerId, cur);
  }

  let workerIds = [...new Set([...stored.keys(), ...payByWorkerDay.keys()])];
  if (workerId) workerIds = workerIds.filter((id) => id === workerId);
  const names = new Map(
    (await db.worker.findMany({ where: { id: { in: workerIds } }, select: { id: true, fullName: true } })).map(
      (w) => [w.id, w.fullName] as const,
    ),
  );

  const rows: SeptimoRow[] = workerIds.map((id) => {
    const byDay = payByWorkerDay.get(id) ?? new Map<string, number>();
    const days = attended.get(id) ?? new Set<string>();
    const cells: SeptimoCell[] = weeks.map((w) => {
      let actividades = 0;
      const from = Date.parse(`${w.clipFrom}T00:00:00.000Z`);
      const to = Date.parse(`${w.clipTo}T00:00:00.000Z`);
      for (let t = from; t <= to; t += DAY_MS) actividades += byDay.get(isoUTC(t)) ?? 0;
      actividades = money(actividades);
      const septimo = !w.ownsSeptimo
        ? null
        : w.requiredDays.length > 0 && w.requiredDays.every((d) => days.has(d))
          ? amount
          : 0;
      return { actividades, septimo, total: money(actividades + (septimo ?? 0)) };
    });
    const s = stored.get(id);
    const septimoCalculado = money(cells.reduce((a, c) => a + (c.septimo ?? 0), 0));
    const septimoPlanilla = money(s?.septimo ?? 0);
    return {
      workerId: id,
      workerName: s?.name ?? names.get(id) ?? id,
      cells,
      septimoCalculado,
      septimoPlanilla,
      diferencia: money(septimoCalculado - septimoPlanilla),
      actividadesTotal: money(cells.reduce((a, c) => a + c.actividades, 0)),
      devengadoPlanilla: money(s?.earned ?? 0),
    };
  });
  rows.sort((a, b) => a.workerName.localeCompare(b.workerName, "es"));

  return { amount, weeks, rows, holidayCount: holidays.length };
}

// ── Table shape shared by the xlsx export and the audit script's CSV ─────────

/** Header label for a week's column group; flags weeks paid in another period. */
export const weekGroupHeader = (w: SeptimoWeek): string =>
  w.ownsSeptimo ? w.label : `${w.label} (séptimo en otro período)`;

export const WEEK_SUB_HEADERS = ["Pagado por actividades", "Pagado por séptimos", "Pagado en total"] as const;
export const TRAILING_HEADERS = ["Séptimo calculado (total)", "Séptimo en planilla (total)", "Diferencia"] as const;

/** The TOTAL footer: per-week sums, then the three reconciliation totals. */
export function septimoTotals(report: SeptimoReport): {
  perWeek: { actividades: number; septimo: number | null; total: number }[];
  septimoCalculado: number;
  septimoPlanilla: number;
  diferencia: number;
} {
  const perWeek = report.weeks.map((w, i) => {
    const actividades = money(report.rows.reduce((s, r) => s + r.cells[i].actividades, 0));
    const septimo = w.ownsSeptimo ? money(report.rows.reduce((s, r) => s + (r.cells[i].septimo ?? 0), 0)) : null;
    return { actividades, septimo, total: money(actividades + (septimo ?? 0)) };
  });
  const septimoCalculado = money(report.rows.reduce((s, r) => s + r.septimoCalculado, 0));
  const septimoPlanilla = money(report.rows.reduce((s, r) => s + r.septimoPlanilla, 0));
  return { perWeek, septimoCalculado, septimoPlanilla, diferencia: money(septimoCalculado - septimoPlanilla) };
}
