// =============================================================================
// src/lib/validators/holiday.ts — Zod schema for official/non-working days.
// Holidays reduce the séptimo's required-workday count for the week they fall in.
// =============================================================================

import { z } from "zod";

export const holidayCreateSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)"),
  name: z.string().min(1, "Nombre requerido").max(100, "Nombre demasiado largo"),
  recurringAnnual: z.boolean().default(false),
});

export type HolidayCreateInput = z.infer<typeof holidayCreateSchema>;
