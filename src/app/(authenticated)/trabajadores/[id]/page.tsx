// =============================================================================
// src/app/(authenticated)/trabajadores/[id]/page.tsx — Worker profile
// =============================================================================

import { prisma } from "@/lib/prisma";
import { requireRole, READ_ALL_ROLES, SETTINGS_ROLES } from "@/lib/auth/guards";
import { notFound } from "next/navigation";
import Link from "next/link";
import { WorkerProfile } from "./worker-profile";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const worker = await prisma.worker.findUnique({
    where: { id },
    select: { fullName: true },
  });
  return {
    title: worker ? worker.fullName : "Trabajador",
  };
}

export default async function WorkerDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireRole(...READ_ALL_ROLES);

  const worker = await prisma.worker.findUnique({
    where: { id },
    include: {
      activityRecords: {
        select: {
          id: true,
          date: true,
          quantity: true,
          unitPrice: true,
          totalEarned: true,
          activity: { select: { name: true, unit: true } },
          lote: { select: { name: true } },
        },
        orderBy: { date: "desc" },
        take: 50,
      },
      payrollEntries: {
        select: {
          id: true,
          totalEarned: true,
          totalToPay: true,
          bonification: true,
          advances: true,
          deductions: true,
          isPaid: true,
          payPeriod: {
            select: {
              periodNumber: true,
              agriculturalYear: true,
              startDate: true,
              endDate: true,
            },
          },
        },
        orderBy: { payPeriod: { startDate: "desc" } },
        take: 20,
      },
    },
  });

  if (!worker) {
    notFound();
  }

  const serialized = {
    id: worker.id,
    fullName: worker.fullName,
    dpi: worker.dpi,
    nit: worker.nit,
    bankAccount: worker.bankAccount,
    phone: worker.phone,
    photoUrl: worker.photoUrl,
    isMinor: worker.isMinor,
    isActive: worker.isActive,
    startDate: worker.startDate?.toISOString().split("T")[0] ?? null,
    endDate: worker.endDate?.toISOString().split("T")[0] ?? null,
    createdAt: worker.createdAt.toISOString(),
    activityRecords: worker.activityRecords.map((r) => ({
      id: r.id,
      date: r.date.toISOString().split("T")[0],
      quantity: Number(r.quantity),
      unitPrice: Number(r.unitPrice),
      totalEarned: Number(r.totalEarned),
      activityName: r.activity.name,
      activityUnit: r.activity.unit,
      loteName: r.lote?.name ?? null,
    })),
    payrollEntries: worker.payrollEntries.map((p) => ({
      id: p.id,
      totalEarned: Number(p.totalEarned),
      totalToPay: Number(p.totalToPay),
      bonification: Number(p.bonification),
      advances: Number(p.advances),
      deductions: Number(p.deductions),
      isPaid: p.isPaid,
      periodNumber: p.payPeriod.periodNumber,
      agriculturalYear: p.payPeriod.agriculturalYear,
      startDate: p.payPeriod.startDate.toISOString().split("T")[0],
      endDate: p.payPeriod.endDate.toISOString().split("T")[0],
    })),
  };

  const canEdit = SETTINGS_ROLES.includes(user.role);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Back link */}
      <Link
        href={"/trabajadores" as never}
        className="mb-6 inline-block text-sm text-finca-500 hover:text-finca-700"
      >
        ← Volver a Trabajadores
      </Link>

      <WorkerProfile worker={serialized} canEdit={canEdit} />
    </div>
  );
}
