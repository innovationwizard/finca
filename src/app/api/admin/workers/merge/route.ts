// =============================================================================
// POST /api/admin/workers/merge
// Merge duplicate worker records into a canonical one:
//   - reassign all activity_records from each duplicate → keep
//   - reassign payroll_entries; on a (period, category) clash, SUM the money into
//     keep's entry (same person, two partial entries) and drop the duplicate's
//   - deactivate each duplicate (isActive=false, endDate=now) — NOT deleted, so
//     the merge is reversible and auditable
// Access: MASTER, ADMIN. Every merge is written to the audit log.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, SETTINGS_ROLES } from "@/lib/auth/guards";
import { Prisma } from "@prisma/client";

const schema = z.object({
  keepId: z.string().uuid(),
  mergeIds: z.array(z.string().uuid()).min(1).max(50),
});

export async function POST(request: NextRequest) {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { keepId } = parsed.data;
  const mergeIds = parsed.data.mergeIds.filter((id) => id !== keepId);
  if (mergeIds.length === 0) {
    return NextResponse.json({ error: "No hay registros para fusionar" }, { status: 400 });
  }

  const keep = await prisma.worker.findUnique({ where: { id: keepId }, select: { id: true, fullName: true } });
  if (!keep) return NextResponse.json({ error: "Trabajador a conservar no encontrado" }, { status: 404 });

  const dups = await prisma.worker.findMany({ where: { id: { in: mergeIds } }, select: { id: true, fullName: true } });
  if (dups.length !== mergeIds.length) {
    return NextResponse.json({ error: "Algún registro a fusionar no existe" }, { status: 404 });
  }

  let movedActivity = 0;
  let movedPayroll = 0;
  let summedPayroll = 0;

  await prisma.$transaction(async (tx) => {
    for (const dupId of mergeIds) {
      // 1. Activity records → keep (no unique constraint on workerId).
      const a = await tx.activityRecord.updateMany({ where: { workerId: dupId }, data: { workerId: keepId } });
      movedActivity += a.count;

      // 2. Payroll entries → keep, merging money on (payPeriodId, category) clash.
      const dupEntries = await tx.payrollEntry.findMany({ where: { workerId: dupId } });
      for (const e of dupEntries) {
        const clash = await tx.payrollEntry.findUnique({
          where: { payPeriodId_workerId_category: { payPeriodId: e.payPeriodId, workerId: keepId, category: e.category } },
        });
        if (!clash) {
          await tx.payrollEntry.update({ where: { id: e.id }, data: { workerId: keepId } });
          movedPayroll++;
        } else {
          const add = (x: Prisma.Decimal, y: Prisma.Decimal) => x.add(y);
          await tx.payrollEntry.update({
            where: { id: clash.id },
            data: {
              totalEarned: add(clash.totalEarned, e.totalEarned),
              bonification: add(clash.bonification, e.bonification),
              seventhDayPay: add(clash.seventhDayPay, e.seventhDayPay),
              advances: add(clash.advances, e.advances),
              deductions: add(clash.deductions, e.deductions),
              totalToPay: add(clash.totalToPay, e.totalToPay),
              isPaid: clash.isPaid || e.isPaid,
            },
          });
          await tx.payrollEntry.delete({ where: { id: e.id } });
          summedPayroll++;
        }
      }

      // 3. Deactivate the duplicate (reversible — not deleted).
      await tx.worker.update({ where: { id: dupId }, data: { isActive: false, endDate: new Date() } });

      // 4. Audit.
      await tx.auditLog.create({
        data: {
          userId: auth.id,
          action: "MERGE",
          tableName: "workers",
          recordId: dupId,
          oldValues: { fullName: dups.find((d) => d.id === dupId)?.fullName ?? null, isActive: true },
          newValues: { mergedInto: keepId, mergedIntoName: keep.fullName, isActive: false },
        },
      });
    }
  });

  return NextResponse.json({
    ok: true,
    keep: keep.fullName,
    mergedCount: mergeIds.length,
    movedActivity,
    movedPayroll,
    summedPayroll,
  });
}
