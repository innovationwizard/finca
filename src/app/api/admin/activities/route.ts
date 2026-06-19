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
import { todayISOGuatemala } from "@/lib/pricing/activity-prices";

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

  // Seed the first price vigencia (effective today) so the catalog is the
  // single source of truth for prices from creation onward.
  if (parsed.data.defaultPrice != null) {
    await prisma.activityPrice.create({
      data: {
        activityId: created.id,
        price: parsed.data.defaultPrice,
        effectiveFrom: new Date(todayISOGuatemala()),
        note: "Precio inicial",
        createdBy: auth.id,
      },
    });
  }

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

  // An inline price edit is recorded as a vigencia effective TODAY (so it never
  // rewrites past records). Explicit start dates / future prices use the price
  // history panel (POST /api/admin/activities/[id]/prices).
  const oldPrice = existing.defaultPrice != null ? Number(existing.defaultPrice) : null;
  if (data.defaultPrice != null && data.defaultPrice !== oldPrice) {
    const effectiveFrom = new Date(todayISOGuatemala());
    await prisma.activityPrice.upsert({
      where: { activityId_effectiveFrom: { activityId: id, effectiveFrom } },
      create: {
        activityId: id,
        price: data.defaultPrice,
        effectiveFrom,
        note: "Cambio de precio (hoy)",
        createdBy: auth.id,
      },
      update: { price: data.defaultPrice },
    });
  }

  return NextResponse.json(updated);
}

// Hard-delete an activity — ONLY when it has no work records and no plan entries
// (those FKs are restrict; deleting a referenced activity would break payroll
// history). If referenced, refuse and tell the admin to deactivate instead
// (Editar → Activo). Price vigencias cascade-delete with the activity.
export async function DELETE(request: NextRequest) {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Falta el id de la actividad" }, { status: 400 });
  }

  const existing = await prisma.activity.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Actividad no encontrada" }, { status: 404 });
  }

  const [recordCount, planCount] = await Promise.all([
    prisma.activityRecord.count({ where: { activityId: id } }),
    prisma.planEntry.count({ where: { activityId: id } }),
  ]);
  if (recordCount > 0 || planCount > 0) {
    return NextResponse.json(
      {
        error: `No se puede eliminar "${existing.name}": tiene ${recordCount} registro(s) de planilla y ${planCount} entrada(s) de plan. Para conservarla en el historial, desactívela (Editar → Activo).`,
      },
      { status: 409 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        userId: auth.id,
        action: "DELETE",
        tableName: "activities",
        recordId: id,
        oldValues: { name: existing.name, code: existing.code, unit: existing.unit, defaultPrice: existing.defaultPrice?.toString() ?? null },
      },
    });
    await tx.activity.delete({ where: { id } }); // activity_prices cascade
  });

  return NextResponse.json({ success: true });
}
