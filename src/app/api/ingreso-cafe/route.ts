// =============================================================================
// src/app/api/ingreso-cafe/route.ts — Coffee intake list + create
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  apiRequireRole,
  WRITE_ROLES,
  READ_ALL_ROLES,
} from "@/lib/auth/guards";
import { coffeeIntakeCreateSchema } from "@/lib/validators/coffee-intake";
import {
  generateIntakeCode,
  generateCompraIntakeCode,
} from "@/lib/utils/code-generators";
import {
  getCurrentAgriculturalYear,
  getAgriculturalYearStart,
  getAgriculturalYearEnd,
} from "@/lib/utils/agricultural-year";

export async function GET(request: NextRequest) {
  const auth = await apiRequireRole(...READ_ALL_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const coffeeType = searchParams.get("coffeeType");
  const source = searchParams.get("source");
  const status = searchParams.get("status");
  const loteId = searchParams.get("loteId");
  const year = searchParams.get("year");

  const where: Record<string, unknown> = {};

  // Date range filter
  if (dateFrom || dateTo) {
    const dateFilter: Record<string, Date> = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) dateFilter.lte = new Date(dateTo);
    where.date = dateFilter;
  } else if (year) {
    // Filter by agricultural year
    where.date = {
      gte: getAgriculturalYearStart(year),
      lte: getAgriculturalYearEnd(year),
    };
  }

  if (coffeeType) where.coffeeType = coffeeType;
  if (source) where.source = source;
  if (status) where.status = status;
  if (loteId) where.loteId = loteId;

  const intakes = await prisma.coffeeIntake.findMany({
    where,
    include: {
      lote: { select: { id: true, name: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 500,
  });

  const serialized = intakes.map((i) => ({
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
  }));

  return NextResponse.json(serialized);
}

export async function POST(request: NextRequest) {
  const auth = await apiRequireRole(...WRITE_ROLES);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const parsed = coffeeIntakeCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // Verify lote exists if provided
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

  // Generate sequential code based on source
  const year = getCurrentAgriculturalYear();
  const prefix = data.source === "COMPRA" ? "ICC" : "IC";
  const existingCount = await prisma.coffeeIntake.count({
    where: {
      code: { startsWith: `${prefix}-${year}-` },
    },
  });

  const code =
    data.source === "COMPRA"
      ? generateCompraIntakeCode(existingCount)
      : generateIntakeCode(existingCount);

  const intake = await prisma.coffeeIntake.create({
    data: {
      code,
      date: new Date(data.date),
      coffeeType: data.coffeeType,
      source: data.source,
      loteId: data.loteId ?? null,
      supplierName: data.supplierName ?? null,
      procedencia: data.procedencia ?? null,
      supplierAccount: data.supplierAccount ?? null,
      pricePerQq: data.pricePerQq ?? null,
      bultos: data.bultos ?? null,
      pesoNetoQq: data.pesoNetoQq,
      notes: data.notes ?? null,
      clientId: data.clientId ?? null,
      syncedAt: new Date(),
    },
    include: {
      lote: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(
    {
      ...intake,
      date: intake.date.toISOString().split("T")[0],
      pesoNetoQq: Number(intake.pesoNetoQq),
      pesoPergaminoQq: intake.pesoPergaminoQq
        ? Number(intake.pesoPergaminoQq)
        : null,
      rendimiento: intake.rendimiento ? Number(intake.rendimiento) : null,
      pricePerQq: intake.pricePerQq ? Number(intake.pricePerQq) : null,
      cuppingScore: intake.cuppingScore ? Number(intake.cuppingScore) : null,
      processedDate: intake.processedDate
        ? intake.processedDate.toISOString().split("T")[0]
        : null,
      dispatchDate: intake.dispatchDate
        ? intake.dispatchDate.toISOString().split("T")[0]
        : null,
      syncedAt: intake.syncedAt?.toISOString() ?? null,
      createdAt: intake.createdAt.toISOString(),
      updatedAt: intake.updatedAt.toISOString(),
    },
    { status: 201 },
  );
}
