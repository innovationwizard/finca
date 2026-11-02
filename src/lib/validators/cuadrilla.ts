import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");

export const cuadrillaWriteSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre es requerido").max(80, "Nombre demasiado largo"),
    startDate: isoDate,
    endDate: isoDate.nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.endDate && data.endDate < data.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "La fecha de fin no puede ser anterior al inicio",
      });
    }
  });

export type CuadrillaWriteInput = z.infer<typeof cuadrillaWriteSchema>;
