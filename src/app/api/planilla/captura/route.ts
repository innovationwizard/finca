// =============================================================================
// POST /api/planilla/captura — Save the weekly capture grid.
// A worker may do more than one activity in a day, so every grid line carries
// its own ActivityRecord id (a UUIDv7 the client generates for a new line).
// Saving is keyed on that id — never on lote/actividad, which the user can
// edit — so changing a line's lote or activity UPDATES it in place instead of
// creating a second, double-paid record. Re-sending the same payload is
// idempotent. Lines the user removed arrive in `deleteIds` and are deleted.
// Only records in OPEN periods are ever written or deleted. Access: WRITE_ROLES.
//
// After saving, payroll is recomputed for each affected (open) period in the
// same transaction, so payroll_entry totals never go stale — the user never
// needs a separate "Recalcular nómina" step.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { apiRequireRole, CAPTURA_WRITE_ROLES } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { recomputePayroll } from "@/lib/payroll/recalc";
import { isUuidv7 } from "@/lib/utils/uuidv7";

const rowSchema = z.object({
  id: z.string().uuid(),
  workerId: z.string().uuid(),
  activityId: z.string().uuid(),
  loteId: z.string().uuid().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  totalEarned: z.number().min(0),
  payPeriodId: z.string().uuid(),
});
const schema = z
  .object({
    rows: z.array(rowSchema).max(2000),
    deleteIds: z.array(z.string().uuid()).max(2000).default([]),
  })
  .refine((b) => b.rows.length + b.deleteIds.length > 0, { message: "Nada que guardar" });

const dateKey = (d: Date): string => d.toISOString().slice(0, 10);

export async function POST(request: NextRequest) {
  const auth = await apiRequireRole(...CAPTURA_WRITE_ROLES);
  if (auth instanceof NextResponse) return auth;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { rows } = parsed.data;
  const deleteIds = [...new Set(parsed.data.deleteIds)];

  const errors: string[] = [];
  const rowIds = new Set<string>();
  rows.forEach((r, i) => {
    if (rowIds.has(r.id)) errors.push(`Fila ${i + 1}: línea repetida`);
    rowIds.add(r.id);
  });
  const deleteSet = new Set(deleteIds);
  for (const id of rowIds) if (deleteSet.has(id)) errors.push(`La línea ${id} viene para guardar y para eliminar a la vez`);
  if (errors.length) return NextResponse.json({ error: "Errores de validación", details: errors }, { status: 400 });

  // Validate referenced IDs (active worker/activity, open period covering the
  // date) and load every record the payload refers to by id.
  const [workers, activities, periods, existing] = await Promise.all([
    prisma.worker.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.workerId))] }, isActive: true }, select: { id: true } }),
    prisma.activity.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.activityId))] }, isActive: true }, select: { id: true } }),
    prisma.payPeriod.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.payPeriodId))] }, isClosed: false }, select: { id: true, startDate: true, endDate: true } }),
    prisma.activityRecord.findMany({
      where: { id: { in: [...rowIds, ...deleteIds] } },
      select: {
        id: true, workerId: true, date: true, payPeriodId: true, activityId: true, loteId: true, quantity: true, totalEarned: true,
        payPeriod: { select: { isClosed: true } },
      },
    }),
  ]);
  const okW = new Set(workers.map((w) => w.id));
  const okA = new Set(activities.map((a) => a.id));
  const openPeriod = new Map(periods.map((p) => [p.id, { start: dateKey(p.startDate), end: dateKey(p.endDate) }]));
  const existingById = new Map(existing.map((e) => [e.id, e]));

  rows.forEach((r, i) => {
    if (!okW.has(r.workerId)) errors.push(`Fila ${i + 1}: trabajador inválido`);
    if (!okA.has(r.activityId)) errors.push(`Fila ${i + 1}: actividad inválida`);
    const p = openPeriod.get(r.payPeriodId);
    if (!p) errors.push(`Fila ${i + 1}: período inválido o cerrado`);
    else if (r.date < p.start || r.date > p.end) errors.push(`Fila ${i + 1}: la fecha ${r.date} no pertenece al período`);
    const e = existingById.get(r.id);
    if (e) {
      // An id may only update its own worker-day: lote, activity and quantity
      // are editable, who and when are not.
      if (e.workerId !== r.workerId || dateKey(e.date) !== r.date) errors.push(`Fila ${i + 1}: el registro no corresponde a ese trabajador y fecha`);
      if (e.payPeriod.isClosed) errors.push(`Fila ${i + 1}: el registro está en un período cerrado`);
    } else if (!isUuidv7(r.id)) {
      errors.push(`Fila ${i + 1}: identificador de línea inválido`);
    }
  });
  // Ids that no longer exist were already deleted (e.g. a retried save): no-op.
  const toDelete = deleteIds.map((id) => existingById.get(id)).filter((e) => e !== undefined);
  for (const e of toDelete) {
    if (e.payPeriod.isClosed) errors.push(`No se puede eliminar un registro de un período cerrado (${dateKey(e.date)})`);
  }
  if (errors.length) return NextResponse.json({ error: "Errores de validación", details: errors }, { status: 400 });

  // Open periods touched by this save — recompute each. Includes the period a
  // deleted or updated record belonged to, so its payroll drops the money too.
  const affectedPeriodIds = [
    ...new Set([
      ...rows.map((r) => r.payPeriodId),
      ...toDelete.map((e) => e.payPeriodId),
      ...rows.flatMap((r) => { const e = existingById.get(r.id); return e ? [e.payPeriodId] : []; }),
    ]),
  ];

  let result: { saved: number; deleted: number; firstId: string | null };
  try {
    result = await prisma.$transaction(
      async (tx) => {
        if (toDelete.length) {
          await tx.activityRecord.deleteMany({ where: { id: { in: toDelete.map((e) => e.id) } } });
        }
        for (const r of rows) {
          const data = {
            activityId: r.activityId, loteId: r.loteId, quantity: r.quantity, unitPrice: r.unitPrice,
            totalEarned: r.totalEarned, payPeriodId: r.payPeriodId, syncedAt: new Date(),
          };
          if (existingById.has(r.id)) {
            await tx.activityRecord.update({ where: { id: r.id }, data });
          } else {
            await tx.activityRecord.create({ data: { ...data, id: r.id, workerId: r.workerId, date: new Date(r.date) } });
          }
        }
        // Keep payroll_entry in sync with the records just saved. Idempotent;
        // preserves manual bonification/advances/deductions, recomputes séptimo.
        for (const pid of affectedPeriodIds) {
          await recomputePayroll(tx, pid);
        }
        return { saved: rows.length, deleted: toDelete.length, firstId: rows[0]?.id ?? toDelete[0]?.id ?? null };
      },
      { timeout: 120_000 },
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2002" || err.code === "P2025")) {
      return NextResponse.json({ error: "Otro usuario modificó estos registros al mismo tiempo. Recargue la página y vuelva a guardar." }, { status: 409 });
    }
    throw err;
  }

  await prisma.auditLog.create({
    data: {
      userId: auth.id, action: "CAPTURA_SAVE", tableName: "activity_records", recordId: result.firstId ?? "captura",
      // Deleted records are money that was on the payroll: keep what they were.
      oldValues: toDelete.length
        ? {
            deleted: toDelete.map((e) => ({
              id: e.id, workerId: e.workerId, date: dateKey(e.date), activityId: e.activityId, loteId: e.loteId,
              quantity: Number(e.quantity), totalEarned: Number(e.totalEarned), payPeriodId: e.payPeriodId,
            })),
          }
        : undefined,
      newValues: { count: result.saved, deleted: result.deleted, source: "captura_grid", recalculatedPeriods: affectedPeriodIds.length },
    },
  });

  return NextResponse.json({ success: true, count: result.saved, deleted: result.deleted });
}
