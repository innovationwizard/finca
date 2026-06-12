// =============================================================================
// src/app/api/admin/payroll/recalc/route.ts — "Recalcular nómina" for a period.
// On-demand, idempotent. Settings roles. Refuses closed periods. Audited.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, SETTINGS_ROLES } from "@/lib/auth/guards";
import { recomputePayroll } from "@/lib/payroll/recalc";

const schema = z.object({ payPeriodId: z.string().uuid() });

export async function POST(request: NextRequest) {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const period = await prisma.payPeriod.findUnique({ where: { id: parsed.data.payPeriodId } });
  if (!period) {
    return NextResponse.json({ error: "Período no encontrado" }, { status: 404 });
  }
  if (period.isClosed) {
    return NextResponse.json({ error: "El período está cerrado; no se puede recalcular." }, { status: 409 });
  }

  const summary = await prisma.$transaction((tx) => recomputePayroll(tx, period.id), { timeout: 120_000 });

  await prisma.auditLog.create({
    data: {
      userId: auth.id,
      action: "RECALC_PAYROLL",
      tableName: "payroll_entries",
      recordId: period.id,
      newValues: { ...summary },
    },
  });

  return NextResponse.json(summary);
}
