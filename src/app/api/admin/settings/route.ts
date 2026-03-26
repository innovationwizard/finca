// =============================================================================
// src/app/api/admin/settings/route.ts — System settings API
// Access: MASTER, ADMIN only
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, SETTINGS_ROLES } from "@/lib/auth/guards";
import { systemSettingUpdateSchema } from "@/lib/validators/settings";

export async function GET() {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const settings = await prisma.systemSetting.findMany({
    orderBy: [{ group: "asc" }, { key: "asc" }],
  });

  return NextResponse.json(settings);
}

export async function PATCH(request: NextRequest) {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const parsed = systemSettingUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const existing = await prisma.systemSetting.findUnique({
    where: { key: parsed.data.key },
  });

  if (!existing) {
    return NextResponse.json(
      { error: `Setting "${parsed.data.key}" no encontrada` },
      { status: 404 },
    );
  }

  await prisma.auditLog.create({
    data: {
      userId: auth.id,
      action: "UPDATE",
      tableName: "system_settings",
      recordId: existing.id,
      oldValues: { key: existing.key, value: existing.value },
      newValues: parsed.data,
    },
  });

  const updated = await prisma.systemSetting.update({
    where: { key: parsed.data.key },
    data: { value: parsed.data.value, updatedBy: auth.id },
  });

  return NextResponse.json(updated);
}
