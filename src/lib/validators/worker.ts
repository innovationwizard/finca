// =============================================================================
// src/lib/validators/worker.ts — Shared Zod schemas for worker management
// =============================================================================

import { z } from "zod";

const workerFields = z.object({
  // Identity (DPI canon): apellidos = both surnames combined, nombres = given
  // names combined. fullName is derived server-side ("nombres apellidos").
  apellidos: z
    .string()
    .min(1, "Apellidos requeridos")
    .max(100, "Apellidos demasiado largos"),
  nombres: z
    .string()
    .min(1, "Nombres requeridos")
    .max(100, "Nombres demasiado largos"),
  // CUI captured verbatim — modern 13-digit OR legacy formats. No format
  // regex (legacy IDs like "F-6 22274" are valid real values).
  cui: z
    .string()
    .min(1, "CUI requerido")
    .max(20, "CUI demasiado largo"),
  nit: z
    .string()
    .max(20, "NIT demasiado largo")
    .nullable()
    .optional(),
  bankAccount: z
    .string()
    .max(50, "Número de cuenta demasiado largo")
    .nullable()
    .optional(),
  bankName: z
    .string()
    .max(100, "Nombre de banco demasiado largo")
    .nullable()
    .optional(),
  phone: z
    .string()
    .max(20, "Teléfono demasiado largo")
    .nullable()
    .optional(),
  personPhotoUrl: z
    .string()
    .url("URL de foto inválida")
    .nullable()
    .optional(),
  category: z.enum(["VOLUNTARIO", "FIJO", "TEMPORAL"]).default("VOLUNTARIO"),
  cuadrillaId: z.string().uuid("Cuadrilla inválida").nullable().optional(),
  isMinor: z.boolean().default(false),
  isActive: z.boolean().default(true),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
    .nullable()
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
    .nullable()
    .optional(),
});

function requireTemporalCuadrilla(
  data: { category?: string; cuadrillaId?: string | null },
  ctx: z.RefinementCtx,
) {
  if (data.category === "TEMPORAL" && !data.cuadrillaId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["cuadrillaId"],
      message: "La cuadrilla es obligatoria para un temporal",
    });
  }
}

export const workerCreateSchema = workerFields.superRefine(requireTemporalCuadrilla);

export type WorkerCreateInput = z.infer<typeof workerCreateSchema>;

export const workerUpdateSchema = workerFields.partial().extend({
  id: z.string().uuid(),
}).superRefine(requireTemporalCuadrilla);

export type WorkerUpdateInput = z.infer<typeof workerUpdateSchema>;

// Derive the maintained display name from canon parts.
export function deriveFullName(nombres: string, apellidos: string): string {
  return `${nombres.trim()} ${apellidos.trim()}`.trim();
}
