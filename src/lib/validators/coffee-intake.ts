// =============================================================================
// src/lib/validators/coffee-intake.ts — Shared client/server validation
// =============================================================================

import { z } from "zod";

export const coffeeIntakeCreateSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
    coffeeType: z.enum(["CEREZA", "PERGAMINO", "ORO"], {
      required_error: "Tipo de café requerido",
    }),
    source: z.enum(["COSECHA", "COMPRA"], {
      required_error: "Origen requerido",
    }),
    loteId: z.string().uuid("Lote inválido").nullable().optional(),
    supplierName: z.string().max(200).nullable().optional(),
    procedencia: z.string().max(200).nullable().optional(),
    supplierAccount: z.string().max(100).nullable().optional(),
    pricePerQq: z
      .number()
      .min(0, "El precio no puede ser negativo")
      .nullable()
      .optional(),
    bultos: z
      .number()
      .int("Bultos debe ser entero")
      .min(0, "Bultos no puede ser negativo")
      .nullable()
      .optional(),
    pesoNetoQq: z
      .number()
      .positive("El peso neto debe ser mayor a 0")
      .max(9999, "Peso parece excesivo"),
    pesoVerdeQq: z
      .number()
      .min(0, "El peso verde no puede ser negativo")
      .nullable()
      .optional(),
    notes: z.string().max(1000).nullable().optional(),
    clientId: z.string().uuid().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.source === "COSECHA" && !data.loteId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El lote es requerido para café de cosecha propia",
        path: ["loteId"],
      });
    }
    if (data.source === "COMPRA" && !data.supplierName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El nombre del proveedor es requerido para compras",
        path: ["supplierName"],
      });
    }
  });

export type CoffeeIntakeCreateInput = z.infer<typeof coffeeIntakeCreateSchema>;

export const coffeeIntakeUpdateSchema = z.object({
  // Core fields (editable)
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
    .optional(),
  coffeeType: z.enum(["CEREZA", "PERGAMINO", "ORO"]).optional(),
  source: z.enum(["COSECHA", "COMPRA"]).optional(),
  loteId: z.string().uuid("Lote inválido").nullable().optional(),
  supplierName: z.string().max(200).nullable().optional(),
  procedencia: z.string().max(200).nullable().optional(),
  supplierAccount: z.string().max(100).nullable().optional(),
  pricePerQq: z
    .number()
    .min(0, "El precio no puede ser negativo")
    .nullable()
    .optional(),
  // Pipeline / processing fields
  status: z
    .enum([
      "RECIBIDO",
      "DESPULPADO",
      "SECANDO",
      "PERGAMINO",
      "ENVASADO",
      "DESPACHADO",
    ])
    .optional(),
  pesoPergaminoQq: z
    .number()
    .positive("El peso pergamino debe ser mayor a 0")
    .nullable()
    .optional(),
  processedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
    .nullable()
    .optional(),
  dispatchDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
    .nullable()
    .optional(),
  dispatchCode: z.string().max(50).nullable().optional(),
  cuppingScore: z
    .number()
    .min(0, "Puntaje mínimo 0")
    .max(100, "Puntaje máximo 100")
    .nullable()
    .optional(),
  paymentStatus: z.string().max(50).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  bultos: z
    .number()
    .int("Bultos debe ser entero")
    .min(0)
    .nullable()
    .optional(),
  pesoNetoQq: z
    .number()
    .positive("El peso neto debe ser mayor a 0")
    .optional(),
  pesoVerdeQq: z
    .number()
    .min(0, "El peso verde no puede ser negativo")
    .nullable()
    .optional(),
});

export type CoffeeIntakeUpdateInput = z.infer<typeof coffeeIntakeUpdateSchema>;
