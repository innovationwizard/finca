// =============================================================================
// src/app/api/estimaciones/route.ts — Production estimates CRUD
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, READ_ALL_ROLES, WRITE_ROLES } from "@/lib/auth/guards";
import { estimateCreateSchema, DEFAULT_RENDIMIENTO } from "@/lib/validators/estimate";
import { Decimal } from "@prisma/client/runtime/library";

export async function GET(request: NextRequest) {
  const auth = await apiRequireRole(...READ_ALL_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year");

  const where = year ? { agriculturalYear: year } : {};

  const estimates = await prisma.productionEstimate.findMany({
    where,
    include: {
      lote: {
        select: {
          id: true,
          name: true,
          areaManzanas: true,
          plantCount: true,
          isActive: true,
          sortOrder: true,
        },
      },
    },
    orderBy: [{ lote: { sortOrder: "asc" } }, { estimateType: "asc" }],
  });

  const serialized = estimates.map((e) => ({
    id: e.id,
    agriculturalYear: e.agriculturalYear,
    loteId: e.loteId,
    estimateType: e.estimateType,
    estimateDate: e.estimateDate.toISOString().split("T")[0],
    lbPerPlant: Number(e.lbPerPlant),
    qqMaduroPerLote: e.qqMaduroPerLote ? Number(e.qqMaduroPerLote) : null,
    qqOroPerManzana: e.qqOroPerManzana ? Number(e.qqOroPerManzana) : null,
    qqOroPerLote: e.qqOroPerLote ? Number(e.qqOroPerLote) : null,
    notes: e.notes,
    lote: {
      id: e.lote.id,
      name: e.lote.name,
      areaManzanas: e.lote.areaManzanas ? Number(e.lote.areaManzanas) : null,
      plantCount: e.lote.plantCount,
      isActive: e.lote.isActive,
      sortOrder: e.lote.sortOrder,
    },
  }));

  return NextResponse.json(serialized);
}

export async function POST(request: NextRequest) {
  const auth = await apiRequireRole(...WRITE_ROLES);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "JSON inválido" },
      { status: 400 },
    );
  }

  const parsed = estimateCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // Fetch lote data for calculations
  const lote = await prisma.lote.findUnique({
    where: { id: data.loteId },
    select: { areaManzanas: true, plantCount: true },
  });

  if (!lote) {
    return NextResponse.json(
      { error: "Lote no encontrado" },
      { status: 404 },
    );
  }

  // Calculate derived values
  let qqMaduroPerLote: Decimal | null = null;
  let qqOroPerLote: Decimal | null = null;
  let qqOroPerManzana: Decimal | null = null;

  if (lote.plantCount && lote.plantCount > 0) {
    const maduro = (data.lbPerPlant * lote.plantCount) / 100;
    qqMaduroPerLote = new Decimal(maduro.toFixed(2));

    const oro = maduro / DEFAULT_RENDIMIENTO;
    qqOroPerLote = new Decimal(oro.toFixed(2));

    if (lote.areaManzanas && Number(lote.areaManzanas) > 0) {
      const oroPerMz = oro / Number(lote.areaManzanas);
      qqOroPerManzana = new Decimal(oroPerMz.toFixed(2));
    }
  }

  // Upsert: update if same year+lote+type exists
  const estimate = await prisma.productionEstimate.upsert({
    where: {
      agriculturalYear_loteId_estimateType: {
        agriculturalYear: data.agriculturalYear,
        loteId: data.loteId,
        estimateType: data.estimateType,
      },
    },
    update: {
      estimateDate: new Date(data.estimateDate),
      lbPerPlant: new Decimal(data.lbPerPlant.toFixed(2)),
      qqMaduroPerLote,
      qqOroPerManzana,
      qqOroPerLote,
      notes: data.notes ?? null,
    },
    create: {
      agriculturalYear: data.agriculturalYear,
      loteId: data.loteId,
      estimateType: data.estimateType,
      estimateDate: new Date(data.estimateDate),
      lbPerPlant: new Decimal(data.lbPerPlant.toFixed(2)),
      qqMaduroPerLote,
      qqOroPerManzana,
      qqOroPerLote,
      notes: data.notes ?? null,
    },
  });

  return NextResponse.json({
    id: estimate.id,
    agriculturalYear: estimate.agriculturalYear,
    loteId: estimate.loteId,
    estimateType: estimate.estimateType,
    estimateDate: estimate.estimateDate.toISOString().split("T")[0],
    lbPerPlant: Number(estimate.lbPerPlant),
    qqMaduroPerLote: estimate.qqMaduroPerLote ? Number(estimate.qqMaduroPerLote) : null,
    qqOroPerManzana: estimate.qqOroPerManzana ? Number(estimate.qqOroPerManzana) : null,
    qqOroPerLote: estimate.qqOroPerLote ? Number(estimate.qqOroPerLote) : null,
    notes: estimate.notes,
  });
}
