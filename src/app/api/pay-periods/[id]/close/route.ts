// =============================================================================
// src/app/api/pay-periods/[id]/close/route.ts — Close a pay period.
// MASTER/ADMIN only (SETTINGS_ROLES). Sets isClosed=true, closedAt=now,
// closedBy=current user, and audits it. Refuses an already-closed period.
//
// Closing LOCKS the period: captura locks those days, "Recalcular nómina" and
// planilla edits refuse closed periods. Do it after payment is confirmed.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, SETTINGS_ROLES } from "@/lib/auth/guards";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const period = await prisma.payPeriod.findUnique({ where: { id } });
  if (!period) {
    return NextResponse.json({ error: "Período no encontrado" }, { status: 404 });
  }
  if (period.isClosed) {
    return NextResponse.json({ error: "El período ya está cerrado." }, { status: 409 });
  }

  const updated = await prisma.payPeriod.update({
    where: { id },
    data: { isClosed: true, closedAt: new Date(), closedBy: auth.id },
  });

  await prisma.auditLog.create({
    data: {
      userId: auth.id,
      action: "CLOSE_PAY_PERIOD",
      tableName: "pay_periods",
      recordId: id,
      oldValues: { isClosed: false },
      newValues: { isClosed: true, closedAt: updated.closedAt?.toISOString() ?? null },
    },
  });

  return NextResponse.json({
    id: updated.id,
    periodNumber: updated.periodNumber,
    isClosed: updated.isClosed,
  });
}
