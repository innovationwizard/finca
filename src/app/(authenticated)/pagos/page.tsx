// =============================================================================
// src/app/(authenticated)/pagos/page.tsx — Payments page (CFO only)
// =============================================================================

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guards";
import { getCurrentAgriculturalYear } from "@/lib/utils/agricultural-year";
import { PagosView } from "./pagos-view";

export const metadata = { title: "Pagos" };

export default async function PagosPage() {
  await requireRole("CFO", "MASTER", "CONSULTANT");

  const year = getCurrentAgriculturalYear();

  // Get all pay periods for current agricultural year
  const periods = await prisma.payPeriod.findMany({
    where: { agriculturalYear: year },
    orderBy: { periodNumber: "desc" },
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

  // Get bank code
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
          Archivo de pagos bancarios · Año agrícola {year}
        </p>
      </div>

      <PagosView
        periods={serializedPeriods}
        agriculturalYear={year}
        bankCode={bankCode}
      />
    </div>
  );
}
