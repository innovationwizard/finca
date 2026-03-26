// =============================================================================
// src/app/api/activities/route.ts — Activity catalog (reference data)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, READ_ALL_ROLES } from "@/lib/auth/guards";

export async function GET(request: NextRequest) {
  const auth = await apiRequireRole(...READ_ALL_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("active") === "true";

  const activities = await prisma.activity.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(
    activities.map((a) => ({
      id: a.id,
      name: a.name,
      unit: a.unit,
      defaultPrice: Number(a.defaultPrice),
      isHarvest: a.isHarvest,
      isBeneficio: a.isBeneficio,
      isActive: a.isActive,
    })),
  );
}
