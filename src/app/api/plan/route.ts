// =============================================================================
// src/app/api/plan/route.ts — Plan Anual CRUD (GET list + POST upsert)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  apiRequireRole,
  READ_ALL_ROLES,
  WRITE_ROLES,
} from "@/lib/auth/guards";
import { planEntrySchema } from "@/lib/validators/plan-entry";

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

  const where: Record<string, unknown> = { agriculturalYear };
  if (loteId) where.loteId = loteId;

  const entries = await prisma.planEntry.findMany({
    where,
    include: {
      activity: { select: { id: true, name: true, unit: true, sortOrder: true } },
      lote: { select: { id: true, name: true, slug: true } },
    },
    orderBy: [
      { activity: { sortOrder: "asc" } },
      { month: "asc" },
      { week: "asc" },
    ],
  });

  return NextResponse.json(
    entries.map((e) => ({
      id: e.id,
      agriculturalYear: e.agriculturalYear,
      loteId: e.loteId,
      activityId: e.activityId,
      month: e.month,
      week: e.week,
      plannedJornales: Number(e.plannedJornales),
      activity: e.activity,
      lote: e.lote,
    })),
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

  // Verify lote exists
  const lote = await prisma.lote.findUnique({ where: { id: data.loteId } });
  if (!lote) {
    return NextResponse.json(
      { error: "Lote no encontrado" },
      { status: 404 },
    );
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

  // Upsert: create or update based on unique constraint
  const entry = await prisma.planEntry.upsert({
    where: {
      agriculturalYear_loteId_activityId_month_week: {
        agriculturalYear: data.agriculturalYear,
        loteId: data.loteId,
        activityId: data.activityId,
        month: data.month,
        week: data.week,
      },
    },
    update: {
      plannedJornales: data.plannedJornales,
    },
    create: {
      agriculturalYear: data.agriculturalYear,
      loteId: data.loteId,
      activityId: data.activityId,
      month: data.month,
      week: data.week,
      plannedJornales: data.plannedJornales,
    },
    include: {
      activity: { select: { id: true, name: true, unit: true, sortOrder: true } },
      lote: { select: { id: true, name: true, slug: true } },
    },
  });

  return NextResponse.json(
    {
      id: entry.id,
      agriculturalYear: entry.agriculturalYear,
      loteId: entry.loteId,
      activityId: entry.activityId,
      month: entry.month,
      week: entry.week,
      plannedJornales: Number(entry.plannedJornales),
      activity: entry.activity,
      lote: entry.lote,
    },
    { status: 200 },
  );
}
