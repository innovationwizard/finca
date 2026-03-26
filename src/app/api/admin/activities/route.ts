// =============================================================================
// src/app/api/admin/activities/route.ts — Activity catalog management API
// Access: MASTER, ADMIN only
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, SETTINGS_ROLES } from "@/lib/auth/guards";
import {
  activityUpdateSchema,
  activityCreateSchema,
} from "@/lib/validators/settings";

export async function GET() {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const activities = await prisma.activity.findMany({
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(activities);
}

export async function POST(request: NextRequest) {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const parsed = activityCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // Check for duplicate name
  const existing = await prisma.activity.findUnique({
    where: { name: parsed.data.name },
  });
  if (existing) {
    return NextResponse.json(
      { error: `Ya existe una actividad con el nombre "${parsed.data.name}"` },
      { status: 409 },
    );
  }

  const maxSort = await prisma.activity.aggregate({ _max: { sortOrder: true } });
  const nextSort = (maxSort._max.sortOrder ?? 0) + 1;

  const created = await prisma.activity.create({
    data: { ...parsed.data, sortOrder: nextSort },
  });

  await prisma.auditLog.create({
    data: {
      userId: auth.id,
      action: "CREATE",
      tableName: "activities",
      recordId: created.id,
      newValues: parsed.data,
    },
  });

  return NextResponse.json(created, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const parsed = activityUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { id, ...data } = parsed.data;

  const existing = await prisma.activity.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { error: "Actividad no encontrada" },
      { status: 404 },
    );
  }

  // Check name uniqueness if changed
  if (data.name !== existing.name) {
    const nameConflict = await prisma.activity.findUnique({
      where: { name: data.name },
    });
    if (nameConflict) {
      return NextResponse.json(
        { error: `Ya existe una actividad con el nombre "${data.name}"` },
        { status: 409 },
      );
    }
  }

  await prisma.auditLog.create({
    data: {
      userId: auth.id,
      action: "UPDATE",
      tableName: "activities",
      recordId: id,
      oldValues: {
        name: existing.name,
        unit: existing.unit,
        defaultPrice: existing.defaultPrice?.toString() ?? null,
        isActive: existing.isActive,
      },
      newValues: data,
    },
  });

  const updated = await prisma.activity.update({ where: { id }, data });

  return NextResponse.json(updated);
}
