// =============================================================================
// src/app/api/plan/actual/route.ts — Aggregate actual ActivityRecord data
// Groups executed jornales into the same week buckets the plan uses, so the two
// line up cell for cell. The bucket is the week's real first day (weekStart);
// the cosecha and month index come with it, derived, for rendering only.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, READ_ALL_ROLES } from "@/lib/auth/guards";
import {
  getAgriculturalYearStart,
  getAgriculturalYearEnd,
} from "@/lib/utils/agricultural-year";
import { cellOf, weekStartOf, weekStartIso } from "@/lib/plan/plan-week";

export async function GET(request: NextRequest) {
  const auth = await apiRequireRole(...READ_ALL_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const agriculturalYear = searchParams.get("year");
  const loteId = searchParams.get("loteId");

  if (!agriculturalYear) {
    return NextResponse.json(
      { error: "Parámetro 'year' requerido" },
      { status: 400 },
    );
  }

  const startDate = getAgriculturalYearStart(agriculturalYear);
  const endDate = getAgriculturalYearEnd(agriculturalYear);

  const where: Record<string, unknown> = {
    date: { gte: startDate, lte: endDate },
  };
  if (loteId) where.loteId = loteId;

  const records = await prisma.activityRecord.findMany({
    where,
    select: {
      date: true,
      activityId: true,
      loteId: true,
      quantity: true,
    },
  });

  // Aggregate by loteId + activityId + week
  const aggregated: Record<
    string,
    {
      loteId: string | null;
      activityId: string;
      weekStart: string;
      month: number;
      week: number;
      actualJornales: number;
    }
  > = {};

  for (const rec of records) {
    const weekStart = weekStartOf(rec.date);
    const iso = weekStartIso(weekStart);
    const key = `${rec.loteId ?? "null"}_${rec.activityId}_${iso}`;

    if (!aggregated[key]) {
      const cell = cellOf(weekStart);
      aggregated[key] = {
        loteId: rec.loteId,
        activityId: rec.activityId,
        weekStart: iso,
        month: cell.agMonth,
        week: cell.week,
        actualJornales: 0,
      };
    }
    // Each activity record represents a jornal (quantity as jornales worked)
    aggregated[key].actualJornales += Number(rec.quantity);
  }

  return NextResponse.json(Object.values(aggregated));
}
