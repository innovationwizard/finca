// =============================================================================
// src/app/api/ingreso-cafe/[id]/route.ts — Single intake GET + PATCH
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  apiRequireRole,
  WRITE_ROLES,
  READ_ALL_ROLES,
  SETTINGS_ROLES,
} from "@/lib/auth/guards";
import { coffeeIntakeUpdateSchema } from "@/lib/validators/coffee-intake";

function serializeIntake(i: {
  id: string;
  code: string;
  date: Date;
  coffeeType: string;
  source: string;
  loteId: string | null;
  supplierName: string | null;
  procedencia: string | null;
  supplierAccount: string | null;
  pricePerQq: unknown;
  paymentStatus: string | null;
  bultos: number | null;
  pesoNetoQq: unknown;
  pesoPergaminoQq: unknown;
  rendimiento: unknown;
  status: string;
  processedDate: Date | null;
  dispatchDate: Date | null;
  dispatchCode: string | null;
  cuppingScore: unknown;
  notes: string | null;
  clientId: string | null;
  syncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lote: { id: string; name: string } | null;
}) {
  return {
    ...i,
    date: i.date.toISOString().split("T")[0],
    pesoNetoQq: Number(i.pesoNetoQq),
    pesoPergaminoQq: i.pesoPergaminoQq ? Number(i.pesoPergaminoQq) : null,
    rendimiento: i.rendimiento ? Number(i.rendimiento) : null,
    pricePerQq: i.pricePerQq ? Number(i.pricePerQq) : null,
    cuppingScore: i.cuppingScore ? Number(i.cuppingScore) : null,
    processedDate: i.processedDate
      ? i.processedDate.toISOString().split("T")[0]
      : null,
    dispatchDate: i.dispatchDate
      ? i.dispatchDate.toISOString().split("T")[0]
      : null,
    syncedAt: i.syncedAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  };
}

// Status pipeline order
const STATUS_ORDER = [
  "RECIBIDO",
  "DESPULPADO",
  "SECANDO",
  "PERGAMINO",
  "ENVASADO",
  "DESPACHADO",
] as const;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await apiRequireRole(...READ_ALL_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const intake = await prisma.coffeeIntake.findUnique({
    where: { id },
    include: {
      lote: { select: { id: true, name: true } },
    },
  });

  if (!intake) {
    return NextResponse.json(
      { error: "Ingreso no encontrado" },
      { status: 404 },
    );
  }

  return NextResponse.json(serializeIntake(intake));
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await apiRequireRole(...WRITE_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const body = await request.json();
  const parsed = coffeeIntakeUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const existing = await prisma.coffeeIntake.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Ingreso no encontrado" },
      { status: 404 },
    );
  }

  const data = parsed.data;

  // Validate status transition (must advance forward)
  if (data.status) {
    const currentIdx = STATUS_ORDER.indexOf(
      existing.status as (typeof STATUS_ORDER)[number],
    );
    const newIdx = STATUS_ORDER.indexOf(
      data.status as (typeof STATUS_ORDER)[number],
    );
    if (newIdx <= currentIdx) {
      return NextResponse.json(
        {
          error: `No se puede cambiar de ${existing.status} a ${data.status}. Solo se permite avanzar.`,
        },
        { status: 400 },
      );
    }
  }

  // Validate lote exists if changing loteId
  if (data.loteId) {
    const lote = await prisma.lote.findUnique({
      where: { id: data.loteId },
    });
    if (!lote) {
      return NextResponse.json(
        { error: "Lote no encontrado" },
        { status: 404 },
      );
    }
  }

  // Build update payload
  const updateData: Record<string, unknown> = {};

  // Core fields
  if (data.date !== undefined) updateData.date = new Date(data.date);
  if (data.coffeeType !== undefined) updateData.coffeeType = data.coffeeType;
  if (data.source !== undefined) updateData.source = data.source;
  if (data.loteId !== undefined) updateData.loteId = data.loteId;
  if (data.supplierName !== undefined)
    updateData.supplierName = data.supplierName;
  if (data.procedencia !== undefined) updateData.procedencia = data.procedencia;
  if (data.supplierAccount !== undefined)
    updateData.supplierAccount = data.supplierAccount;
  if (data.pricePerQq !== undefined) updateData.pricePerQq = data.pricePerQq;

  // Pipeline / processing fields
  if (data.status) updateData.status = data.status;
  if (data.pesoPergaminoQq !== undefined) {
    updateData.pesoPergaminoQq = data.pesoPergaminoQq;
    // Auto-compute rendimiento: cereza / pergamino
    if (data.pesoPergaminoQq && data.pesoPergaminoQq > 0) {
      const pesoNeto = data.pesoNetoQq ?? Number(existing.pesoNetoQq);
      updateData.rendimiento = parseFloat(
        (pesoNeto / data.pesoPergaminoQq).toFixed(2),
      );
    }
  }
  if (data.processedDate)
    updateData.processedDate = new Date(data.processedDate);
  if (data.dispatchDate) updateData.dispatchDate = new Date(data.dispatchDate);
  if (data.dispatchCode !== undefined)
    updateData.dispatchCode = data.dispatchCode;
  if (data.cuppingScore !== undefined)
    updateData.cuppingScore = data.cuppingScore;
  if (data.paymentStatus !== undefined)
    updateData.paymentStatus = data.paymentStatus;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.bultos !== undefined) updateData.bultos = data.bultos;
  if (data.pesoNetoQq !== undefined) updateData.pesoNetoQq = data.pesoNetoQq;

  const updated = await prisma.coffeeIntake.update({
    where: { id },
    data: updateData,
    include: {
      lote: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(serializeIntake(updated));
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const existing = await prisma.coffeeIntake.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Ingreso no encontrado" },
      { status: 404 },
    );
  }

  await prisma.coffeeIntake.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
