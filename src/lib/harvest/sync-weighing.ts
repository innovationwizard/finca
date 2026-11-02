import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentPayPeriod } from "@/lib/payroll/current-period";
import { recomputePayroll } from "@/lib/payroll/recalc";
import { resolveActivityPrice, type PriceVigencia } from "@/lib/pricing/resolve-price";
import { HARVEST_ACTIVITY_SHORT_NAME, MADUREZ_VALUES, type Madurez } from "./constants";
import { agriculturalYearFromISO, isoDate } from "./dates";
import { weighingAmounts } from "./weight";

export type WeighingPayload = {
  date: string;
  workerId?: string | null;
  workerClientId?: string | null;
  loteId: string;
  libras: number;
  madurez: string;
  sacos: number;
};

export type SyncItemResult =
  | { ok: true }
  | { ok: false; error: string; retry: boolean };

function isUniqueTarget(err: unknown, token: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return false;
  const target = err.meta?.target;
  const text = Array.isArray(target) ? target.join(",") : String(target ?? "");
  return text.toLowerCase().includes(token.toLowerCase());
}

function asMadurez(value: string): Madurez | null {
  return (MADUREZ_VALUES as readonly string[]).includes(value) ? (value as Madurez) : null;
}

async function nextIntakeCode(tx: Prisma.TransactionClient, iso: string): Promise<string> {
  const year = agriculturalYearFromISO(iso);
  const prefix = `IC-${year}-`;
  const last = await tx.coffeeIntake.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const currentMax = last ? Number.parseInt(last.code.split("-").pop() ?? "0", 10) : 0;
  const seq = String((Number.isFinite(currentMax) ? currentMax : 0) + 1).padStart(2, "0");
  return `${prefix}${seq}`;
}

export async function syncWeighing(clientId: string, data: WeighingPayload): Promise<SyncItemResult> {
  const madurez = asMadurez(data.madurez);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    return { ok: false, error: "Fecha inválida", retry: false };
  }
  if (!madurez) {
    return { ok: false, error: "Madurez debe ser Maduro o Inmaduro", retry: false };
  }
  if (!Number.isFinite(data.libras) || data.libras <= 0) {
    return { ok: false, error: "Libras debe ser mayor a 0", retry: false };
  }
  if (!Number.isInteger(data.sacos) || data.sacos < 0) {
    return { ok: false, error: "Sacos debe ser un entero", retry: false };
  }
  if (!data.loteId) {
    return { ok: false, error: "Pante requerido", retry: false };
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await prisma.$transaction(async (tx): Promise<SyncItemResult> => {
        const existing = await tx.activityRecord.findUnique({
          where: { clientId },
          select: { id: true },
        });
        if (existing) return { ok: true };

        const period = await tx.payPeriod.findFirst({
          where: { isClosed: false },
          orderBy: { startDate: "asc" },
        });
        if (!period) {
          return { ok: false, error: "No hay un período de pago abierto", retry: true };
        }
        const start = isoDate(period.startDate);
        const end = isoDate(period.endDate);
        if (data.date < start || data.date > end) {
          return {
            ok: false,
            error: `La fecha ${data.date} está fuera del período abierto (${start} a ${end})`,
            retry: true,
          };
        }

        let workerId = data.workerId || null;
        if (!workerId && data.workerClientId) {
          const capture = await tx.enrollmentCapture.findUnique({
            where: { clientId: data.workerClientId },
            select: { workerId: true },
          });
          workerId = capture?.workerId ?? null;
          if (!workerId) {
            return { ok: false, error: "La persona aún no está en el servidor", retry: true };
          }
        }
        if (!workerId) {
          return { ok: false, error: "Falta la persona de esta entrega", retry: false };
        }
        const worker = await tx.worker.findUnique({
          where: { id: workerId },
          select: { id: true },
        });
        if (!worker) {
          return { ok: false, error: "Trabajador no encontrado", retry: false };
        }

        const lote = await tx.lote.findUnique({ where: { id: data.loteId }, select: { id: true } });
        if (!lote) return { ok: false, error: "Pante no encontrado", retry: false };

        const activity = await tx.activity.findUnique({
          where: { shortName: HARVEST_ACTIVITY_SHORT_NAME },
          include: { prices: { orderBy: { effectiveFrom: "asc" } } },
        });
        if (!activity) {
          return { ok: false, error: "No existe la actividad Entrega de Café", retry: true };
        }
        const schedule: PriceVigencia[] = activity.prices.map((price) => ({
          effectiveFrom: isoDate(price.effectiveFrom),
          price: Number(price.price),
        }));
        const covering = schedule.some((row) => row.effectiveFrom <= data.date);
        if (!covering) {
          return {
            ok: false,
            error: "No hay vigencia de precio para Entrega de Café. La entrega sigue en el teléfono.",
            retry: true,
          };
        }
        const unitPrice = resolveActivityPrice(schedule, null, data.date);
        const amounts = weighingAmounts(data.libras, unitPrice);

        const record = await tx.activityRecord.create({
          data: {
            clientId,
            date: new Date(`${data.date}T00:00:00.000Z`),
            payPeriodId: period.id,
            workerId,
            activityId: activity.id,
            loteId: data.loteId,
            quantity: amounts.quantity,
            unitPrice: amounts.unitPrice,
            totalEarned: amounts.totalEarned,
            syncedAt: new Date(),
          },
        });

        const code = await nextIntakeCode(tx, data.date);
        await tx.coffeeIntake.create({
          data: {
            code,
            clientId,
            date: new Date(`${data.date}T00:00:00.000Z`),
            // CoffeeType has no CAFÉ value. The pipeline's cereza type is CEREZA.
            coffeeType: "CEREZA",
            source: "COSECHA",
            status: "RECIBIDO",
            loteId: data.loteId,
            workerId,
            sacos: data.sacos,
            pesoLibras: amounts.pesoLibras,
            pesoNetoQq: amounts.pesoNetoQq,
            madurez,
            activityRecordId: record.id,
            syncedAt: new Date(),
          },
        });

        return { ok: true };
      }, { timeout: 20_000 });
      if (result.ok) {
        try {
          const period = await getCurrentPayPeriod();
          if (period) await recomputePayroll(prisma, period.id);
        } catch (err) {
          console.error(`Payroll recalc after weighing ${clientId} failed:`, err);
        }
      }
      return result;
    } catch (err) {
      if (isUniqueTarget(err, "client")) return { ok: true };
      if (isUniqueTarget(err, "code") && attempt < 4) continue;
      console.error(`Failed to sync weighing ${clientId}:`, err);
      return { ok: false, error: "No se pudo guardar la entrega", retry: true };
    }
  }
  return { ok: false, error: "No se pudo asignar el código de ingreso", retry: true };
}
