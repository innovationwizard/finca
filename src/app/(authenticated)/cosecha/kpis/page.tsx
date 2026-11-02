import { requireRole, HARVEST_DESK_ROLES } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { getCurrentPayPeriod } from "@/lib/payroll/current-period";
import {
  getAgriculturalYearEnd,
  getAgriculturalYearStart,
  getCurrentAgriculturalYear,
} from "@/lib/utils/agricultural-year";
import { HARVEST_ACTIVITY_SHORT_NAME } from "@/lib/harvest/constants";
import { isoDate } from "@/lib/harvest/dates";
import { displayLibras, formatCoffeeWeight } from "@/lib/harvest/weight";
import { formatGTQ } from "@/lib/utils/format";
import { HarvestNav } from "@/components/harvest/harvest-nav";
import { KpiCharts, type CuadrillaPoint, type DayPoint, type LotePoint, type MadurezPoint } from "./kpi-charts";

export const metadata = { title: "KPIs de cosecha" };

export default async function KpiPage() {
  const user = await requireRole(...HARVEST_DESK_ROLES);
  const year = getCurrentAgriculturalYear();
  const period = await getCurrentPayPeriod();
  const activity = await prisma.activity.findUnique({
    where: { shortName: HARVEST_ACTIVITY_SHORT_NAME },
    select: { id: true },
  });

  const seasonStart = getAgriculturalYearStart(year);
  const seasonEnd = getAgriculturalYearEnd(year);
  const periodStart = period ? isoDate(period.startDate) : null;
  const periodEnd = period ? isoDate(period.endDate) : null;

  const intakes = activity
    ? await prisma.coffeeIntake.findMany({
        where: { activityRecord: { activityId: activity.id } },
        select: {
          date: true,
          pesoLibras: true,
          pesoNetoQq: true,
          madurez: true,
          workerId: true,
          lote: { select: { name: true } },
          worker: { select: { cuadrilla: { select: { name: true } } } },
          activityRecord: { select: { totalEarned: true, payPeriodId: true } },
        },
      })
    : [];

  const inSeason = intakes.filter((row) => {
    const date = isoDate(row.date);
    return date >= isoDate(seasonStart) && date <= isoDate(seasonEnd);
  });
  const inPeriod = period
    ? intakes.filter((row) => row.activityRecord?.payPeriodId === period.id)
    : [];

  const sumLb = (rows: typeof intakes) =>
    rows.reduce((sum, row) => sum + displayLibras(row.pesoLibras, Number(row.pesoNetoQq)), 0);
  const sumQq = (rows: typeof intakes) =>
    rows.reduce((sum, row) => sum + Number(row.pesoNetoQq), 0);
  const sumPay = (rows: typeof intakes) =>
    rows.reduce((sum, row) => sum + Number(row.activityRecord?.totalEarned ?? 0), 0);

  const byDay = new Map<string, number>();
  const byLote = new Map<string, number>();
  const byMadurez = new Map<string, number>();
  const byCuadrilla = new Map<string, number>();
  for (const row of inPeriod) {
    const date = isoDate(row.date);
    const libras = displayLibras(row.pesoLibras, Number(row.pesoNetoQq));
    byDay.set(date, (byDay.get(date) ?? 0) + libras);
    const lote = row.lote?.name ?? "Sin pante";
    byLote.set(lote, (byLote.get(lote) ?? 0) + libras);
    const madurez = row.madurez ?? "Sin madurez";
    byMadurez.set(madurez, (byMadurez.get(madurez) ?? 0) + libras);
    const cuadrilla = row.worker?.cuadrilla?.name?.trim() || "Sin cuadrilla";
    byCuadrilla.set(cuadrilla, (byCuadrilla.get(cuadrilla) ?? 0) + libras);
  }

  const days: DayPoint[] = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, libras]) => ({
    day: day.slice(5),
    libras: Math.round(libras * 100) / 100,
  }));
  const lotes: LotePoint[] = [...byLote.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([lote, libras]) => ({ lote, libras: Math.round(libras * 100) / 100 }));
  const madurez: MadurezPoint[] = [...byMadurez.entries()].map(([name, libras]) => ({
    name,
    libras: Math.round(libras * 100) / 100,
  }));
  const cuadrillas: CuadrillaPoint[] = [...byCuadrilla.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cuadrilla, libras]) => ({ cuadrilla, libras: Math.round(libras * 100) / 100 }));
  const people = new Set(inPeriod.map((row) => row.workerId).filter(Boolean)).size;

  return (
    <div className="mx-auto max-w-5xl px-4 py-4">
      <HarvestNav role={user.role} />
      <h1 className="mt-4 text-2xl font-semibold text-finca-900">KPIs de cosecha</h1>
      <p className="text-sm text-finca-500">
        Entrega de café. {period ? `Período abierto ${periodStart} a ${periodEnd}.` : "No hay período abierto."} Cosecha {year}.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="Período abierto" value={formatCoffeeWeight(sumLb(inPeriod), sumQq(inPeriod))} />
        <Card label="A pagar en el período" value={formatGTQ(sumPay(inPeriod))} />
        <Card label="Entregas / personas" value={`${inPeriod.length} / ${people}`} />
        <Card label="Cosecha" value={formatCoffeeWeight(sumLb(inSeason), sumQq(inSeason))} />
      </div>
      <KpiCharts days={days} lotes={lotes} madurez={madurez} cuadrillas={cuadrillas} />
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-finca-200 bg-white px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-finca-400">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-finca-900">{value}</p>
    </div>
  );
}
