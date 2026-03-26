// =============================================================================
// src/app/api/lotes/route.ts — Lot list (reference data)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, READ_ALL_ROLES } from "@/lib/auth/guards";

export async function GET(request: NextRequest) {
  const auth = await apiRequireRole(...READ_ALL_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("active") === "true";

  const lotes = await prisma.lote.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    select: {
      id: true,
      name: true,
      slug: true,
      areaManzanas: true,
      isActive: true,
    },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(
    lotes.map((l) => ({ ...l, areaManzanas: Number(l.areaManzanas) })),
  );
}
