// =============================================================================
// src/lib/validators/activity-record.ts — Shared client/server validation
// =============================================================================

import { z } from "zod";

export const activityRecordSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  payPeriodId: z.string().uuid("Período de pago requerido"),
  workerId: z.string().uuid("Trabajador requerido"),
  activityId: z.string().uuid("Actividad requerida"),
  loteId: z.string().uuid().nullable().optional(),
  quantity: z
    .number()
    .positive("La cantidad debe ser mayor a 0")
    .max(999, "Cantidad parece excesiva"),
  unitPrice: z
    .number()
    .min(0, "El precio no puede ser negativo"),
  notes: z.string().max(500).nullable().optional(),
});

export type ActivityRecordInput = z.infer<typeof activityRecordSchema>;

export const activityRecordBatchSchema = z.object({
  records: z.array(activityRecordSchema).min(1).max(100),
});
