// =============================================================================
// src/lib/validators/settings.ts — Shared Zod schemas for settings management
// =============================================================================

import { z } from "zod";

// ── Lote ──────────────────────────────────────────────────────────────────────

export const loteUpdateSchema = z.object({
  id: z.string().uuid(),
  areaManzanas: z
    .number()
    .positive("El área debe ser mayor a 0")
    .max(1000, "El área no puede superar 1,000 manzanas")
    .nullable(),
  plantCount: z
    .number()
    .int("La cantidad de plantas debe ser un número entero")
    .min(0, "La cantidad de plantas no puede ser negativa")
    .nullable(),
  density: z.string().nullable().optional(),
  variety: z.string().nullable().optional(),
  altitudeMasl: z.number().int().min(0).max(5000).nullable().optional(),
  isActive: z.boolean(),
});

export type LoteUpdateInput = z.infer<typeof loteUpdateSchema>;

// ── Activity ──────────────────────────────────────────────────────────────────

export const ACTIVITY_UNITS = [
  { value: "QUINTAL", label: "Quintal (qq)", abbr: "qq" },
  { value: "MANZANA", label: "Manzana (mz)", abbr: "mz" },
  { value: "HECTAREA", label: "Hectárea (ha)", abbr: "ha" },
  { value: "JORNAL", label: "Jornal", abbr: "jor" },
  { value: "DIA", label: "Día", abbr: "día" },
] as const;

export const activityUpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "El nombre es requerido").max(100),
  unit: z.enum(["QUINTAL", "MANZANA", "HECTAREA", "JORNAL", "DIA"]),
  defaultPrice: z
    .number()
    .min(0, "El precio no puede ser negativo")
    .max(100000, "El precio parece excesivo")
    .nullable(),
  isHarvest: z.boolean(),
  isBeneficio: z.boolean(),
  isActive: z.boolean(),
  minQtyAlert: z.number().min(0).nullable().optional(),
  maxQtyAlert: z.number().min(0).nullable().optional(),
});

export const activityCreateSchema = activityUpdateSchema.omit({ id: true });

export type ActivityUpdateInput = z.infer<typeof activityUpdateSchema>;
export type ActivityCreateInput = z.infer<typeof activityCreateSchema>;

// ── System Settings ───────────────────────────────────────────────────────────

export const systemSettingUpdateSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
});

export const payPeriodTypeSchema = z.enum(["SEMANAL", "CATORCENA"]);

export type SystemSettingUpdateInput = z.infer<typeof systemSettingUpdateSchema>;
