// =============================================================================
// src/app/api/plan/actual/route.ts — Aggregate actual ActivityRecord data
// Groups by loteId, activityId, agricultural month, and week for comparison
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, READ_ALL_ROLES } from "@/lib/auth/guards";
import {
  getAgriculturalYearStart,
  getAgriculturalYearEnd,
  getAgriculturalMonth,
  getWeekInMonth,
} from "@/lib/utils/agricultural-year";

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

  // Aggregate by loteId + activityId + month + week
  const aggregated: Record<
    string,
    { loteId: string | null; activityId: string; month: number; week: number; actualJornales: number }
  > = {};

  for (const rec of records) {
    const d = new Date(rec.date);
    const month = getAgriculturalMonth(d);
    const week = getWeekInMonth(d);
    const key = `${rec.loteId ?? "null"}_${rec.activityId}_${month}_${week}`;

    if (!aggregated[key]) {
      aggregated[key] = {
        loteId: rec.loteId,
        activityId: rec.activityId,
        month,
        week,
        actualJornales: 0,
      };
    }
    // Each activity record represents a jornal (quantity as jornales worked)
    aggregated[key].actualJornales += Number(rec.quantity);
  }

  return NextResponse.json(Object.values(aggregated));
}
