// =============================================================================
// src/app/(authenticated)/pagos/page.tsx — Payments page (CFO only)
// =============================================================================

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guards";
import { PagosView } from "./pagos-view";

export const metadata = { title: "Pagos" };

export default async function PagosPage() {
  await requireRole("CFO", "MASTER", "CONSULTANT");

  // The 3 most recent ALREADY-ENDED pay periods, by date. Deliberately NOT
  // scoped to the current agricultural year: near a year boundary, the most
  // recent period — or its one/two predecessors — can fall in the prior year,
  // and all three must still resolve.
  const now = new Date();
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  const periods = await prisma.payPeriod.findMany({
    where: { endDate: { lt: todayUtc } },
    orderBy: { endDate: "desc" },
    take: 3,
    select: {
      id: true,
      periodNumber: true,
      startDate: true,
      endDate: true,
      type: true,
      isClosed: true,
    },
  });

  const serializedPeriods = periods.map((p) => ({
    id: p.id,
    periodNumber: p.periodNumber,
    startDate: p.startDate.toISOString().split("T")[0],
    endDate: p.endDate.toISOString().split("T")[0],
    type: p.type,
    isClosed: p.isClosed,
  }));

  // Bank code — constant column 3 of every CSV line.
  const bankCodeSetting = await prisma.systemSetting.findUnique({
    where: { key: "bank_code" },
  });
  const bankCode = bankCodeSetting ? JSON.parse(bankCodeSetting.value) : "";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-finca-900">
          Pagos
        </h1>
        <p className="mt-1 text-sm text-finca-500">
          Descarga aquí el csv de pagos para enviar al banco
        </p>
      </div>

      <PagosView periods={serializedPeriods} bankCode={bankCode} />
    </div>
  );
}
