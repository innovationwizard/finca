// =============================================================================
// src/app/api/planilla/route.ts — Activity records CRUD
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, WRITE_ROLES, READ_ALL_ROLES } from "@/lib/auth/guards";
import { activityRecordSchema } from "@/lib/validators/activity-record";
import { calcTotalEarned } from "@/lib/utils/calculations";

export async function GET(request: NextRequest) {
  const auth = await apiRequireRole(...READ_ALL_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const periodId = searchParams.get("periodId");
  const date = searchParams.get("date");
  const workerId = searchParams.get("workerId");
  const loteId = searchParams.get("loteId");

  const where: Record<string, unknown> = {};
  if (periodId) where.payPeriodId = periodId;
  if (date) where.date = new Date(date);
  if (workerId) where.workerId = workerId;
  if (loteId) where.loteId = loteId;

  const records = await prisma.activityRecord.findMany({
    where,
    include: {
      worker: { select: { id: true, fullName: true } },
      activity: { select: { id: true, name: true, unit: true } },
      lote: { select: { id: true, name: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 500,
  });

  return NextResponse.json(records);
}

export async function POST(request: NextRequest) {
  const auth = await apiRequireRole(...WRITE_ROLES);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const parsed = activityRecordSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // Verify pay period is open
  const period = await prisma.payPeriod.findUnique({
    where: { id: data.payPeriodId },
  });
  if (!period) {
    return NextResponse.json(
      { error: "Período de pago no encontrado" },
      { status: 404 },
    );
  }
  if (period.isClosed) {
    return NextResponse.json(
      { error: "El período de pago ya está cerrado" },
      { status: 400 },
    );
  }

  // Verify worker is active
  const worker = await prisma.worker.findUnique({
    where: { id: data.workerId },
  });
  if (!worker?.isActive) {
    return NextResponse.json(
      { error: "Trabajador no encontrado o inactivo" },
      { status: 400 },
    );
  }

  const totalEarned = calcTotalEarned(data.quantity, data.unitPrice);

  const record = await prisma.activityRecord.create({
    data: {
      date: new Date(data.date),
      payPeriodId: data.payPeriodId,
      workerId: data.workerId,
      activityId: data.activityId,
      loteId: data.loteId ?? null,
      quantity: data.quantity,
      unitPrice: data.unitPrice,
      totalEarned,
      notes: data.notes ?? null,
      syncedAt: new Date(),
    },
    include: {
      worker: { select: { id: true, fullName: true } },
      activity: { select: { id: true, name: true, unit: true } },
      lote: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(record, { status: 201 });
}
