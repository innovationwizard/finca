// =============================================================================
// src/lib/validators/plan-entry.ts — Validation schemas for Plan Anual
// =============================================================================

import { z } from "zod";

export const planEntrySchema = z.object({
  agriculturalYear: z
    .string()
    .regex(/^\d{4}$/, "Año agrícola inválido (ej: 2526)"),
  loteId: z.string().uuid("Lote requerido"),
  activityId: z.string().uuid("Actividad requerida"),
  month: z
    .number()
    .int()
    .min(1, "Mes debe ser entre 1 y 12")
    .max(12, "Mes debe ser entre 1 y 12"),
  week: z
    .number()
    .int()
    .min(1, "Semana debe ser entre 1 y 4")
    .max(4, "Semana debe ser entre 1 y 4"),
  plannedJornales: z
    .number()
    .min(0, "Jornales no pueden ser negativos")
    .max(9999, "Valor parece excesivo"),
});

export type PlanEntryInput = z.infer<typeof planEntrySchema>;

export const planEntryQuerySchema = z.object({
  agriculturalYear: z
    .string()
    .regex(/^\d{4}$/, "Año agrícola inválido"),
  loteId: z.string().uuid().optional(),
});

export type PlanEntryQuery = z.infer<typeof planEntryQuerySchema>;
