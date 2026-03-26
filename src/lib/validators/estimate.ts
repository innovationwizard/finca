// =============================================================================
// src/lib/validators/estimate.ts — Shared Zod schemas for production estimates
// =============================================================================

import { z } from "zod";

export const ESTIMATE_TYPES = [
  "PRIMERA",
  "SEGUNDA",
  "TERCERA",
  "CUARTA",
  "FINAL",
] as const;

export const ESTIMATE_TYPE_LABELS: Record<string, string> = {
  PRIMERA: "1a Est.",
  SEGUNDA: "2a Est.",
  TERCERA: "3a Est.",
  CUARTA: "4a Est.",
  FINAL: "Final",
};

export const AGRICULTURAL_YEARS = ["2425", "2526", "2627", "2728", "2829"] as const;

/** Default rendimiento promedio for qqMaduro → qqOro conversion */
export const DEFAULT_RENDIMIENTO = 5.5;

/** Target qq oro per manzana */
export const TARGET_QQ_ORO_MZ = 25;

export const estimateCreateSchema = z.object({
  agriculturalYear: z
    .string()
    .regex(/^\d{4}$/, "Año agrícola inválido (ej: 2526)"),
  loteId: z.string().uuid("Lote requerido"),
  estimateType: z.enum(ESTIMATE_TYPES, {
    errorMap: () => ({ message: "Tipo de estimación inválido" }),
  }),
  estimateDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  lbPerPlant: z
    .number()
    .min(0, "Lb/planta no puede ser negativo")
    .max(100, "Lb/planta parece excesivo"),
  notes: z.string().max(500).nullable().optional(),
});

export type EstimateCreateInput = z.infer<typeof estimateCreateSchema>;

export const estimateUpdateSchema = estimateCreateSchema.extend({
  id: z.string().uuid().optional(),
});

export type EstimateUpdateInput = z.infer<typeof estimateUpdateSchema>;
