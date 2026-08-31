// =============================================================================
// src/lib/validators/plan-entry.ts — Validation schemas for Plan Anual
// =============================================================================

import { z } from "zod";
import { weekStartIso, weekStartOf, parseWeekStartIso } from "@/lib/plan/plan-week";

/**
 * A week_start on the wire: "2026-11-08". Must be a real date AND the actual
 * first day of one of the grid's weeks (the 1st, 8th, 15th or 22nd). Anything
 * else creates a cell the grid can never address again — and, since
 * (lote, activity, week_start) is unique, a silent second row for a week that
 * already has a value.
 */
const weekStartSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (formato: 2026-11-08)")
  .refine((s) => !Number.isNaN(parseWeekStartIso(s).getTime()), "Fecha inexistente")
  .refine(
    (s) => weekStartIso(weekStartOf(parseWeekStartIso(s))) === s,
    "La fecha debe ser el primer día de una semana del plan (día 1, 8, 15 o 22)",
  );

export const planEntrySchema = z.object({
  weekStart: weekStartSchema,
  loteId: z.string().uuid("Lote requerido"),
  activityId: z.string().uuid("Actividad requerida"),
  plannedJornales: z
    .number()
    .min(0, "Jornales no pueden ser negativos")
    .max(9999, "Valor parece excesivo"),
});

export type PlanEntryInput = z.infer<typeof planEntrySchema>;

/**
 * The address of a cell, with no value attached — what DELETE takes to clear one.
 *
 * Clearing is its own operation rather than an upsert of 0 because the grid
 * cannot draw the difference: a 0 renders as "–", exactly like a week with no
 * row. Storing 0 to mean "nothing planned" is what let 251 wiped cells of the
 * 26/27 plan look untouched instead of wrong.
 */
export const planEntryKeySchema = planEntrySchema.omit({
  plannedJornales: true,
});

export type PlanEntryKey = z.infer<typeof planEntryKeySchema>;

export const planEntryQuerySchema = z.object({
  agriculturalYear: z
    .string()
    .regex(/^\d{4}$/, "Año agrícola inválido (ej: 2526)"),
  loteId: z.string().uuid().optional(),
});

export type PlanEntryQuery = z.infer<typeof planEntryQuerySchema>;
