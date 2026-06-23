// =============================================================================
// src/app/api/planilla/ajustes/route.ts — Descuentos / Adicionales input.
// Sets PayrollEntry.deductions (DESCUENTOS) and .bonification (ADICIONALES) for
// the OPEN pay period and recomputes totalToPay. These feed the bank file, so
// writes are limited to PAY_ADJUST_WRITE_ROLES (MASTER + MANAGER), the period
// must be open, and every change is audited. recomputePayroll preserves these
// two fields on later captura saves, so the values persist.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, PAY_ADJUST_WRITE_ROLES } from "@/lib/auth/guards";
import { calcNetPay } from "@/lib/utils/calculations";

const schema = z.object({
  payPeriodId: z.string().uuid(),
  rows: z
    .array(
      z.object({
        workerId: z.string().uuid(),
        deductions: z.number().min(0).max(1_000_000),
        bonification: z.number().min(0).max(1_000_000),
      }),
    )
    .min(1)
    .max(2000),
});

export async function PATCH(request: NextRequest) {
  const auth = await apiRequireRole(...PAY_ADJUST_WRITE_ROLES);
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
  const { payPeriodId, rows } = parsed.data;

  const period = await prisma.payPeriod.findUnique({ where: { id: payPeriodId } });
  if (!period) {
    return NextResponse.json({ error: "Período no encontrado" }, { status: 404 });
  }
  if (period.isClosed) {
    return NextResponse.json({ error: "El período está cerrado; no se pueden editar ajustes." }, { status: 409 });
  }

  // Round money to cents; reject the row set if any worker is unknown/inactive.
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const workerIds = [...new Set(rows.map((r) => r.workerId))];
  const workers = await prisma.worker.findMany({
    where: { id: { in: workerIds }, isActive: true },
    select: { id: true, category: true },
  });
  const categoryOf = new Map(workers.map((w) => [w.id, w.category]));
  if (workers.length !== workerIds.length) {
    return NextResponse.json({ error: "Algún trabajador no existe o está inactivo." }, { status: 400 });
  }

  let updated = 0;
  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const deductions = r2(row.deductions);
      const bonification = r2(row.bonification);
      // One entry per (period, worker, category). A worker normally has one.
      const existing = await tx.payrollEntry.findFirst({ where: { payPeriodId, workerId: row.workerId } });

      if (existing) {
        const totalEarned = Number(existing.totalEarned);
        const seventhDayPay = Number(existing.seventhDayPay);
        const advances = Number(existing.advances);
        const totalToPay = calcNetPay(totalEarned, bonification, seventhDayPay, advances, deductions);
        if (Number(existing.deductions) === deductions && Number(existing.bonification) === bonification) continue;
        await tx.payrollEntry.update({ where: { id: existing.id }, data: { deductions, bonification, totalToPay } });
        await tx.auditLog.create({
          data: {
            userId: auth.id,
            action: "UPDATE",
            tableName: "payroll_entries",
            recordId: existing.id,
            oldValues: { deductions: Number(existing.deductions), bonification: Number(existing.bonification), totalToPay: Number(existing.totalToPay) },
            newValues: { deductions, bonification, totalToPay },
          },
        });
        updated++;
      } else {
        // No earnings yet — a pure adjustment (e.g. a stand-alone adicional).
        if (deductions === 0 && bonification === 0) continue;
        const totalToPay = calcNetPay(0, bonification, 0, 0, deductions);
        const created = await tx.payrollEntry.create({
          data: {
            payPeriodId,
            workerId: row.workerId,
            category: categoryOf.get(row.workerId) ?? "VOLUNTARIO",
            totalEarned: 0,
            seventhDayPay: 0,
            advances: 0,
            deductions,
            bonification,
            totalToPay,
          },
        });
        await tx.auditLog.create({
          data: {
            userId: auth.id,
            action: "CREATE",
            tableName: "payroll_entries",
            recordId: created.id,
            newValues: { deductions, bonification, totalToPay },
          },
        });
        updated++;
      }
    }
  });

  return NextResponse.json({ updated });
}
