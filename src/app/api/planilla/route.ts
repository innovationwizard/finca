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

export async function PATCH(request: NextRequest) {
  const auth = await apiRequireRole(...WRITE_ROLES);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { id, ...updates } = body;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  }

  const existing = await prisma.activityRecord.findUnique({
    where: { id },
    include: { payPeriod: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
  }
  if (existing.payPeriod.isClosed) {
    return NextResponse.json({ error: "El período de pago ya está cerrado" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (updates.quantity !== undefined) data.quantity = updates.quantity;
  if (updates.unitPrice !== undefined) data.unitPrice = updates.unitPrice;
  if (updates.activityId !== undefined) data.activityId = updates.activityId;
  if (updates.loteId !== undefined) data.loteId = updates.loteId || null;
  if (updates.date !== undefined) data.date = new Date(updates.date);
  if (updates.notes !== undefined) data.notes = updates.notes || null;

  // Recalculate total
  const qty = (data.quantity as number) ?? Number(existing.quantity);
  const price = (data.unitPrice as number) ?? Number(existing.unitPrice);
  data.totalEarned = Math.round(qty * price * 100) / 100;

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: auth.id,
      action: "UPDATE",
      tableName: "activity_records",
      recordId: id,
      oldValues: {
        quantity: Number(existing.quantity),
        unitPrice: Number(existing.unitPrice),
        totalEarned: Number(existing.totalEarned),
        activityId: existing.activityId,
        loteId: existing.loteId,
      },
      newValues: data as Record<string, string | number | null>,
    },
  });

  const updated = await prisma.activityRecord.update({
    where: { id },
    data,
    include: {
      worker: { select: { id: true, fullName: true } },
      activity: { select: { id: true, name: true, unit: true } },
      lote: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest) {
  const auth = await apiRequireRole(...WRITE_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  }

  const existing = await prisma.activityRecord.findUnique({
    where: { id },
    include: { payPeriod: true, worker: true, activity: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
  }
  if (existing.payPeriod.isClosed) {
    return NextResponse.json({ error: "El período de pago ya está cerrado" }, { status: 400 });
  }

  await prisma.auditLog.create({
    data: {
      userId: auth.id,
      action: "DELETE",
      tableName: "activity_records",
      recordId: id,
      oldValues: {
        date: existing.date.toISOString().split("T")[0],
        worker: existing.worker.fullName,
        activity: existing.activity.name,
        quantity: Number(existing.quantity),
        totalEarned: Number(existing.totalEarned),
      },
    },
  });

  await prisma.activityRecord.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
