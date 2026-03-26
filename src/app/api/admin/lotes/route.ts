// =============================================================================
// src/app/api/admin/lotes/route.ts — Lote management API
// Access: MASTER, ADMIN only
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, SETTINGS_ROLES } from "@/lib/auth/guards";
import { loteUpdateSchema } from "@/lib/validators/settings";

export async function GET() {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const lotes = await prisma.lote.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      areaManzanas: true,
      plantCount: true,
      density: true,
      variety: true,
      altitudeMasl: true,
      isActive: true,
      sortOrder: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(lotes);
}

export async function PATCH(request: NextRequest) {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const parsed = loteUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { id, ...data } = parsed.data;

  const existing = await prisma.lote.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
  }

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: auth.id,
      action: "UPDATE",
      tableName: "lotes",
      recordId: id,
      oldValues: {
        areaManzanas: existing.areaManzanas?.toString() ?? null,
        plantCount: existing.plantCount,
        density: existing.density,
        isActive: existing.isActive,
      },
      newValues: data,
    },
  });

  const updated = await prisma.lote.update({
    where: { id },
    data: {
      areaManzanas: data.areaManzanas,
      plantCount: data.plantCount,
      density: data.density,
      variety: data.variety,
      altitudeMasl: data.altitudeMasl,
      isActive: data.isActive,
    },
  });

  return NextResponse.json(updated);
}
