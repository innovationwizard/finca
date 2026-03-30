// =============================================================================
// POST /api/planilla/batch — Batch insert reviewed activity records
// Called after user reviews and confirms extracted notebook data.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { apiRequireRole, SETTINGS_ROLES } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { batchInsertSchema } from "@/lib/validators/notebook-upload";
import { learnCorrection } from "@/lib/ai/notebook-dictionary";

export async function POST(request: NextRequest) {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const parsed = batchInsertSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { rows, corrections, imageUrl, csvUrl } = parsed.data;

  // Persist learned corrections to dictionary (names, abbreviations fixed by user)
  if (corrections && corrections.length > 0) {
    for (const c of corrections) {
      await learnCorrection(c.category, c.handwritten, c.canonical, c.referenceId);
    }
  }

  // Validate all referenced IDs exist
  const workerIds = [...new Set(rows.map((r) => r.workerId))];
  const activityIds = [...new Set(rows.map((r) => r.activityId))];
  const payPeriodIds = [...new Set(rows.map((r) => r.payPeriodId))];

  const [workers, activities, payPeriods] = await Promise.all([
    prisma.worker.findMany({ where: { id: { in: workerIds }, isActive: true }, select: { id: true } }),
    prisma.activity.findMany({ where: { id: { in: activityIds }, isActive: true }, select: { id: true } }),
    prisma.payPeriod.findMany({ where: { id: { in: payPeriodIds }, isClosed: false }, select: { id: true } }),
  ]);

  const validWorkerIds = new Set(workers.map((w) => w.id));
  const validActivityIds = new Set(activities.map((a) => a.id));
  const validPeriodIds = new Set(payPeriods.map((p) => p.id));

  const errors: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!validWorkerIds.has(r.workerId)) errors.push(`Fila ${i + 1}: Trabajador no encontrado o inactivo`);
    if (!validActivityIds.has(r.activityId)) errors.push(`Fila ${i + 1}: Actividad no encontrada o inactiva`);
    if (!validPeriodIds.has(r.payPeriodId)) errors.push(`Fila ${i + 1}: Período de pago no encontrado o cerrado`);
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "Errores de validación", details: errors }, { status: 400 });
  }

  // Insert all records in a transaction
  try {
    const result = await prisma.$transaction(
      rows.map((r) =>
        prisma.activityRecord.create({
          data: {
            date: new Date(r.date),
            payPeriodId: r.payPeriodId,
            workerId: r.workerId,
            activityId: r.activityId,
            loteId: r.loteId,
            quantity: r.quantity,
            unitPrice: r.unitPrice,
            totalEarned: r.totalEarned,
            clientId: `notebook-${r.date}-${r.workerId}-${r.activityId}-${r.quantity}`,
            syncedAt: new Date(),
          },
        }),
      ),
    );

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: auth.id,
        action: "BATCH_CREATE",
        tableName: "activity_records",
        recordId: result[0]?.id || "batch",
        newValues: {
          count: result.length,
          source: "notebook_photo",
          imageUrl: imageUrl || null,
          csvUrl: csvUrl || null,
        },
      },
    });

    return NextResponse.json({
      success: true,
      count: result.length,
    });
  } catch (error) {
    console.error("Batch insert error:", error);

    // Check for unique constraint violation (duplicate clientId)
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "Algunos registros ya existen en la base de datos (duplicados detectados)" },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "Error al insertar registros" },
      { status: 500 },
    );
  }
}
