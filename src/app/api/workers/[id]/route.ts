// =============================================================================
// src/app/api/workers/[id]/route.ts — Single worker GET + PATCH
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, READ_ALL_ROLES, SETTINGS_ROLES } from "@/lib/auth/guards";
import { workerUpdateSchema } from "@/lib/validators/worker";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await apiRequireRole(...READ_ALL_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

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
    return NextResponse.json(
      { error: "Trabajador no encontrado" },
      { status: 404 },
    );
  }

  return NextResponse.json({
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
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "JSON inválido" },
      { status: 400 },
    );
  }

  const parsed = workerUpdateSchema.safeParse({ ...body as object, id });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id: _id, startDate, endDate, ...rest } = parsed.data;

  const existing = await prisma.worker.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { error: "Trabajador no encontrado" },
      { status: 404 },
    );
  }

  const worker = await prisma.worker.update({
    where: { id },
    data: {
      ...rest,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    },
  });

  return NextResponse.json({
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
  });
}
