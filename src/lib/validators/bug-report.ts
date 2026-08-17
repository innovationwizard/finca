// =============================================================================
// src/lib/validators/bug-report.ts — "Reportar" payload contract.
//
// Pure and dependency-light on purpose: the widget imports it to decide whether
// the ENVIAR button is enabled, and the intake route imports it to re-validate
// every field independently. The client check is UX; this module is the
// integrity boundary, and the server never trusts the client's copy of it.
// =============================================================================

import { z } from "zod";

/**
 * Column widths in prisma/migrations/20260817120000_bug_reports. Kept here as
 * named constants so an over-length value is rejected with a Spanish message
 * instead of surfacing as an opaque database error.
 */
export const BUG_REPORT_SHORT_FIELD_MAX = 200; // donde / appDice / appDeberiaDecir — VARCHAR(200)
export const BUG_REPORT_LONG_FIELD_MAX = 5000; // queFalta — TEXT, capped in code
export const BUG_REPORT_URL_MAX = 2000;
export const BUG_REPORT_AUTOR_MAX = 500; // autor — VARCHAR(500)

/**
 * Screenshot ceiling: ~3 M base64 chars ≈ 2.2 MB binary.
 *
 * The binding constraint is VERCEL'S REQUEST BODY LIMIT (4.5 MB), not the mail
 * provider's attachment limit. Raising this without checking the platform limit
 * turns a valid report into a 413 the user cannot diagnose.
 */
export const BUG_REPORT_SCREENSHOT_MAX_B64 = 3_000_000;

const shortField = (label: string) =>
  z
    .string()
    .transform((v) => v.trim())
    .pipe(
      z
        .string()
        .min(1, `${label} es obligatorio`)
        .max(BUG_REPORT_SHORT_FIELD_MAX, `${label} es demasiado largo`),
    );

/**
 * Environment metadata is NORMALIZED, NEVER REJECTED. Malformed or missing
 * environment data must not cost a valid report — the report is the point, the
 * metadata is a convenience. Every field falls back with .catch().
 */
export const bugReportMetaSchema = z.object({
  userAgent: z.string().max(500).catch(""),
  viewport: z.string().max(50).catch(""),
  screen: z.string().max(50).catch(""),
  dpr: z.number().finite().positive().max(10).catch(1),
  tz: z.string().max(100).catch(""),
  capturedAt: z.string().max(50).catch(""),
});

export type BugReportMeta = z.infer<typeof bugReportMetaSchema>;

const EMPTY_META: BugReportMeta = {
  userAgent: "",
  viewport: "",
  screen: "",
  dpr: 1,
  tz: "",
  capturedAt: "",
};

/**
 * Coerce anything at all into usable metadata. Used both on intake and when
 * reading a stored row back, so neither path can throw on a malformed `meta`.
 */
export function parseBugReportMeta(value: unknown): BugReportMeta {
  const parsed = bugReportMetaSchema.safeParse(value);
  return parsed.success ? parsed.data : EMPTY_META;
}

const baseFields = {
  url: z
    .string()
    .transform((v) => v.trim())
    .pipe(
      z
        .string()
        .min(1, "La dirección de la página es obligatoria")
        .max(BUG_REPORT_URL_MAX, "La dirección de la página es demasiado larga"),
    ),
  // Normalized, never rejected: malformed environment data must not cost a
  // valid report. `unknown` + transform (rather than .catch) so a null or a
  // string in `meta` is absorbed too, not just a wrong-shaped object.
  meta: z.unknown().transform((v) => parseBugReportMeta(v)),
  screenshot: z
    .string()
    .max(
      BUG_REPORT_SCREENSHOT_MAX_B64,
      "La foto de la pantalla es demasiado grande",
    )
    .nullable()
    .optional()
    .transform((v) => v ?? null),
};

/**
 * Two shapes, discriminated by `kind` — the same union the database enforces
 * with the bug_reports_kind_fields CHECK. Zod's discriminated union also means
 * fields from the other shape are stripped rather than smuggled through.
 */
export const bugReportSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("DATO_INCORRECTO"),
    donde: shortField("El lugar (fila y columna)"),
    appDice: shortField("Lo que dice la app"),
    appDeberiaDecir: shortField("Lo que debería decir la app"),
    ...baseFields,
  }),
  z.object({
    kind: z.literal("FALTA_ALGO"),
    queFalta: z
      .string()
      .transform((v) => v.trim())
      .pipe(
        z
          .string()
          .min(1, "La descripción es obligatoria")
          .max(BUG_REPORT_LONG_FIELD_MAX, "La descripción es demasiado larga"),
      ),
    ...baseFields,
  }),
]);

export type BugReportInput = z.infer<typeof bugReportSchema>;
export type BugReportKindValue = BugReportInput["kind"];

/**
 * The client's enable/disable check for the ENVIAR button. Deliberately the same
 * emptiness rule as the schema (trim, then non-empty) so the button never
 * promises a submission the server will reject.
 */
export function isBugReportDraftComplete(draft: {
  kind: BugReportKindValue | null;
  donde: string;
  appDice: string;
  appDeberiaDecir: string;
  queFalta: string;
}): boolean {
  if (draft.kind === "DATO_INCORRECTO") {
    return (
      draft.donde.trim().length > 0 &&
      draft.appDice.trim().length > 0 &&
      draft.appDeberiaDecir.trim().length > 0
    );
  }
  if (draft.kind === "FALTA_ALGO") {
    return draft.queFalta.trim().length > 0;
  }
  return false;
}
