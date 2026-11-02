import { prisma } from "@/lib/prisma";
import { getCurrentPayPeriod } from "@/lib/payroll/current-period";
import { HARVEST_ACTIVITY_SHORT_NAME } from "./constants";
import { isoDate } from "./dates";
import { displayLibras } from "./weight";

export type LedgerRow = {
  id: string;
  date: string;
  workerName: string;
  cui: string;
  category: string;
  cuadrilla: string | null;
  pante: string;
  libras: number;
  quintales: number;
  madurez: string | null;
  sacos: number | null;
  unitPrice: number;
  totalEarned: number;
  intakeCode: string | null;
};

export async function harvestLedger(): Promise<{
  rows: LedgerRow[];
  openPeriod: { id: string; startDate: string; endDate: string; periodNumber: number } | null;
}> {
  const [activity, period] = await Promise.all([
    prisma.activity.findUnique({
      where: { shortName: HARVEST_ACTIVITY_SHORT_NAME },
      select: { id: true },
    }),
    getCurrentPayPeriod(),
  ]);
  if (!activity) {
    return {
      rows: [],
      openPeriod: period
        ? {
            id: period.id,
            startDate: isoDate(period.startDate),
            endDate: isoDate(period.endDate),
            periodNumber: period.periodNumber,
          }
        : null,
    };
  }

  const records = await prisma.activityRecord.findMany({
    where: { activityId: activity.id },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: {
      worker: { select: { fullName: true, cui: true, category: true, cuadrilla: true } },
      lote: { select: { name: true } },
      coffeeIntake: {
        select: { code: true, pesoLibras: true, pesoNetoQq: true, madurez: true, bultos: true },
      },
    },
  });

  const rows: LedgerRow[] = records.map((record) => {
    const quintales = record.coffeeIntake ? Number(record.coffeeIntake.pesoNetoQq) : Number(record.quantity) / 100;
    const libras = record.coffeeIntake
      ? displayLibras(record.coffeeIntake.pesoLibras, Number(record.coffeeIntake.pesoNetoQq))
      : Number(record.quantity);
    return {
      id: record.id,
      date: isoDate(record.date),
      workerName: record.worker.fullName,
      cui: record.worker.cui,
      category: record.worker.category,
      cuadrilla: record.worker.cuadrilla,
      pante: record.lote?.name ?? "",
      libras,
      quintales,
      madurez: record.coffeeIntake?.madurez ?? null,
      sacos: record.coffeeIntake?.bultos ?? null,
      unitPrice: Number(record.unitPrice),
      totalEarned: Number(record.totalEarned),
      intakeCode: record.coffeeIntake?.code ?? null,
    };
  });

  return {
    rows,
    openPeriod: period
      ? {
          id: period.id,
          startDate: isoDate(period.startDate),
          endDate: isoDate(period.endDate),
          periodNumber: period.periodNumber,
        }
      : null,
  };
}
