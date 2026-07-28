// =============================================================================
// src/app/api/plan/route.ts — Plan Anual CRUD (GET list + POST upsert)
//
// A plan cell is addressed by (lote, activity, weekStart) — a real date, not a
// (year, month index, week index) position. GET still accepts a cosecha code for
// convenience and turns it into the date range that cosecha covers.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  apiRequireRole,
  READ_ALL_ROLES,
  WRITE_ROLES,
} from "@/lib/auth/guards";
import {
  planEntrySchema,
  planEntryQuerySchema,
} from "@/lib/validators/plan-entry";
import {
  getAgriculturalYearStart,
  getAgriculturalYearEnd,
} from "@/lib/utils/agricultural-year";
import { cellOf, weekStartIso, parseWeekStartIso } from "@/lib/plan/plan-week";

export async function GET(request: NextRequest) {
  const auth = await apiRequireRole(...READ_ALL_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const parsedQuery = planEntryQuerySchema.safeParse({
    agriculturalYear: searchParams.get("year") ?? undefined,
    loteId: searchParams.get("loteId") ?? undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      {
        error: "Parámetros inválidos",
        details: parsedQuery.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const { agriculturalYear, loteId } = parsedQuery.data;

  const where: Record<string, unknown> = {
    weekStart: {
      gte: getAgriculturalYearStart(agriculturalYear),
      lte: getAgriculturalYearEnd(agriculturalYear),
    },
  };
  if (loteId) where.loteId = loteId;

  const entries = await prisma.planEntry.findMany({
    where,
    include: {
      activity: { select: { id: true, name: true, unit: true, sortOrder: true } },
      lote: { select: { id: true, name: true, slug: true } },
    },
    orderBy: [{ activity: { sortOrder: "asc" } }, { weekStart: "asc" }],
  });

  return NextResponse.json(
    entries.map((e) => {
      const cell = cellOf(e.weekStart);
      return {
        id: e.id,
        weekStart: weekStartIso(e.weekStart),
        // Derived for the grid that renders them. Never persisted.
        agriculturalYear: cell.agriculturalYear,
        month: cell.agMonth,
        week: cell.week,
        loteId: e.loteId,
        activityId: e.activityId,
        plannedJornales: Number(e.plannedJornales),
        activity: e.activity,
        lote: e.lote,
      };
    }),
  );
}

export async function POST(request: NextRequest) {
  const auth = await apiRequireRole(...WRITE_ROLES);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const parsed = planEntrySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const weekStart = parseWeekStartIso(data.weekStart);

  // Verify lote exists
  const lote = await prisma.lote.findUnique({ where: { id: data.loteId } });
  if (!lote) {
    return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
  }

  // Verify activity exists
  const activity = await prisma.activity.findUnique({
    where: { id: data.activityId },
  });
  if (!activity) {
    return NextResponse.json(
      { error: "Actividad no encontrada" },
      { status: 404 },
    );
  }

  // Upsert: create or update based on the unique (lote, activity, week) key
  const entry = await prisma.planEntry.upsert({
    where: {
      loteId_activityId_weekStart: {
        loteId: data.loteId,
        activityId: data.activityId,
        weekStart,
      },
    },
    update: {
      plannedJornales: data.plannedJornales,
    },
    create: {
      loteId: data.loteId,
      activityId: data.activityId,
      weekStart,
      plannedJornales: data.plannedJornales,
    },
    include: {
      activity: { select: { id: true, name: true, unit: true, sortOrder: true } },
      lote: { select: { id: true, name: true, slug: true } },
    },
  });

  const cell = cellOf(entry.weekStart);

  return NextResponse.json(
    {
      id: entry.id,
      weekStart: weekStartIso(entry.weekStart),
      agriculturalYear: cell.agriculturalYear,
      month: cell.agMonth,
      week: cell.week,
      loteId: entry.loteId,
      activityId: entry.activityId,
      plannedJornales: Number(entry.plannedJornales),
      activity: entry.activity,
      lote: entry.lote,
    },
    { status: 200 },
  );
}
