// =============================================================================
// src/app/api/admin/holidays/[id]/route.ts — Delete a holiday. Settings roles. Audited.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, SETTINGS_ROLES } from "@/lib/auth/guards";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const existing = await prisma.holiday.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Feriado no encontrado" }, { status: 404 });
  }

  await prisma.holiday.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      userId: auth.id,
      action: "DELETE",
      tableName: "holidays",
      recordId: id,
      oldValues: { date: existing.date.toISOString().split("T")[0], name: existing.name },
    },
  });

  return NextResponse.json({ ok: true });
}
