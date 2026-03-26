// =============================================================================
// src/lib/validators/worker.ts — Shared Zod schemas for worker management
// =============================================================================

import { z } from "zod";

export const workerCreateSchema = z.object({
  fullName: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(200, "El nombre es demasiado largo"),
  dpi: z
    .string()
    .regex(/^\d{13}$/, "DPI debe tener 13 dígitos")
    .nullable()
    .optional(),
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
  phone: z
    .string()
    .max(20, "Teléfono demasiado largo")
    .nullable()
    .optional(),
  photoUrl: z
    .string()
    .url("URL de foto inválida")
    .nullable()
    .optional(),
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

export type WorkerCreateInput = z.infer<typeof workerCreateSchema>;

export const workerUpdateSchema = workerCreateSchema.partial().extend({
  id: z.string().uuid(),
});

export type WorkerUpdateInput = z.infer<typeof workerUpdateSchema>;
