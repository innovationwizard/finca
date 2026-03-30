// =============================================================================
// src/lib/validators/notebook-upload.ts — Zod schemas for notebook photo upload
// =============================================================================

import { z } from "zod";

export const uploadContextSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2030),
  activityName: z.string().optional(),
  unitPrice: z.number().min(0).optional(),
});

export const reviewedRowSchema = z.object({
  workerId: z.string().uuid(),
  activityId: z.string().uuid(),
  loteId: z.string().uuid().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  totalEarned: z.number().min(0),
  payPeriodId: z.string().uuid(),
});

export const learnedCorrectionSchema = z.object({
  handwritten: z.string().min(1),
  canonical: z.string().min(1),
  category: z.enum(["worker", "activity", "lote", "abbreviation"]),
  referenceId: z.string().uuid().optional(),
});

export const batchInsertSchema = z.object({
  rows: z.array(reviewedRowSchema).min(1).max(500),
  corrections: z.array(learnedCorrectionSchema).optional(),
  imageUrl: z.string().optional(),
  csvUrl: z.string().optional(),
});

export type UploadContext = z.infer<typeof uploadContextSchema>;
export type ReviewedRow = z.infer<typeof reviewedRowSchema>;
export type BatchInsertInput = z.infer<typeof batchInsertSchema>;
