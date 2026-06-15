// =============================================================================
// POST /api/planilla/captura — Save the weekly capture grid.
// UPSERTS one ActivityRecord per (date, worker, activity, lote) using a
// deterministic clientId, so re-saving the grid is idempotent and editing a
// quantity updates in place (no double-pay, no duplicates). Access: WRITE_ROLES.
//
// After saving, payroll is recomputed for each affected (open) period in the
// same transaction, so payroll_entry totals never go stale — the user never
// needs a separate "Recalcular nómina" step.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiRequireRole, WRITE_ROLES } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { recomputePayroll } from "@/lib/payroll/recalc";

const rowSchema = z.object({
  workerId: z.string().uuid(),
  activityId: z.string().uuid(),
  loteId: z.string().uuid().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  totalEarned: z.number().min(0),
  payPeriodId: z.string().uuid(),
});
const schema = z.object({ rows: z.array(rowSchema).min(1).max(2000) });

export async function POST(request: NextRequest) {
  const auth = await apiRequireRole(...WRITE_ROLES);
  if (auth instanceof NextResponse) return auth;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { rows } = parsed.data;

  // Validate referenced IDs (active worker/activity, open period).
  const [workers, activities, periods] = await Promise.all([
    prisma.worker.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.workerId))] }, isActive: true }, select: { id: true } }),
    prisma.activity.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.activityId))] }, isActive: true }, select: { id: true } }),
    prisma.payPeriod.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.payPeriodId))] }, isClosed: false }, select: { id: true } }),
  ]);
  const okW = new Set(workers.map((w) => w.id));
  const okA = new Set(activities.map((a) => a.id));
  const okP = new Set(periods.map((p) => p.id));
  const errors: string[] = [];
  rows.forEach((r, i) => {
    if (!okW.has(r.workerId)) errors.push(`Fila ${i + 1}: trabajador inválido`);
    if (!okA.has(r.activityId)) errors.push(`Fila ${i + 1}: actividad inválida`);
    if (!okP.has(r.payPeriodId)) errors.push(`Fila ${i + 1}: período inválido o cerrado`);
  });
  if (errors.length) return NextResponse.json({ error: "Errores de validación", details: errors }, { status: 400 });

  const clientId = (r: typeof rows[number]) => `captura|${r.date}|${r.workerId}|${r.activityId}|${r.loteId ?? "none"}`;

  // Open periods actually touched by this save (validated above) — recompute each.
  const affectedPeriodIds = [...new Set(rows.map((r) => r.payPeriodId))].filter((id) => okP.has(id));

  const result = await prisma.$transaction(
    async (tx) => {
      const upserted = [];
      for (const r of rows) {
        upserted.push(
          await tx.activityRecord.upsert({
            where: { clientId: clientId(r) },
            update: { quantity: r.quantity, unitPrice: r.unitPrice, totalEarned: r.totalEarned, loteId: r.loteId, payPeriodId: r.payPeriodId, syncedAt: new Date() },
            create: {
              date: new Date(r.date), payPeriodId: r.payPeriodId, workerId: r.workerId, activityId: r.activityId, loteId: r.loteId,
              quantity: r.quantity, unitPrice: r.unitPrice, totalEarned: r.totalEarned, clientId: clientId(r), syncedAt: new Date(),
            },
          }),
        );
      }
      // Keep payroll_entry in sync with the records just saved. Idempotent;
      // preserves manual bonification/advances/deductions, recomputes séptimo.
      for (const pid of affectedPeriodIds) {
        await recomputePayroll(tx, pid);
      }
      return upserted;
    },
    { timeout: 120_000 },
  );

  await prisma.auditLog.create({
    data: { userId: auth.id, action: "CAPTURA_SAVE", tableName: "activity_records", recordId: result[0]?.id ?? "captura", newValues: { count: result.length, source: "captura_grid", recalculatedPeriods: affectedPeriodIds.length } },
  });

  return NextResponse.json({ success: true, count: result.length });
}
