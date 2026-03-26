// =============================================================================
// src/app/api/pay-periods/route.ts — Pay period management
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, READ_ALL_ROLES, SETTINGS_ROLES } from "@/lib/auth/guards";
import { getCurrentAgriculturalYear } from "@/lib/utils/agricultural-year";

export async function GET(request: NextRequest) {
  const auth = await apiRequireRole(...READ_ALL_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const currentOnly = searchParams.get("current") === "true";
  const year = searchParams.get("year") ?? getCurrentAgriculturalYear();

  const where: Record<string, unknown> = { agriculturalYear: year };
  if (currentOnly) {
    where.isClosed = false;
  }

  const periods = await prisma.payPeriod.findMany({
    where,
    orderBy: { periodNumber: "desc" },
  });

  return NextResponse.json(
    periods.map((p) => ({
      ...p,
      startDate: p.startDate.toISOString().split("T")[0],
      endDate: p.endDate.toISOString().split("T")[0],
    })),
  );
}

export async function POST(request: NextRequest) {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { startDate, endDate } = body;

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "startDate y endDate son requeridos" },
      { status: 400 },
    );
  }

  const year = getCurrentAgriculturalYear();

  // Get next period number
  const maxPeriod = await prisma.payPeriod.aggregate({
    where: { agriculturalYear: year },
    _max: { periodNumber: true },
  });
  const nextNumber = (maxPeriod._max.periodNumber ?? 0) + 1;

  // Read pay period type from settings
  const typeSetting = await prisma.systemSetting.findUnique({
    where: { key: "pay_period_type" },
  });
  const type = typeSetting
    ? JSON.parse(typeSetting.value)
    : "SEMANAL";

  const period = await prisma.payPeriod.create({
    data: {
      type,
      periodNumber: nextNumber,
      agriculturalYear: year,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    },
  });

  return NextResponse.json(period, { status: 201 });
}
