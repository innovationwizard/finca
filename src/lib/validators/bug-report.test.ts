// =============================================================================
// src/lib/validators/bug-report.test.ts — The "Reportar" payload contract.
//
// This module is the integrity boundary between an authenticated user's typing
// and the database, so the boundaries are tested rather than assumed: what is
// rejected, what is trimmed, and — the easy one to get wrong — what is
// NORMALIZED instead of rejected.
//   npx vitest run
// =============================================================================

import { describe, expect, it } from "vitest";
import {
  bugReportSchema,
  isBugReportDraftComplete,
  parseBugReportMeta,
  BUG_REPORT_SCREENSHOT_MAX_B64,
  BUG_REPORT_SHORT_FIELD_MAX,
  BUG_REPORT_LONG_FIELD_MAX,
} from "./bug-report";

const META = {
  userAgent: "Mozilla/5.0",
  viewport: "1280x800",
  screen: "1920x1080",
  dpr: 2,
  tz: "America/Guatemala",
  capturedAt: "2026-08-17T12:00:00.000Z",
};

const BASE = { url: "https://app.example.com/planilla", meta: META, screenshot: null };

const datoIncorrecto = (over: Record<string, unknown> = {}) => ({
  kind: "DATO_INCORRECTO",
  donde: "Fila 12, columna Total",
  appDice: "Q450.00",
  appDeberiaDecir: "Q452.50",
  ...BASE,
  ...over,
});

const faltaAlgo = (over: Record<string, unknown> = {}) => ({
  kind: "FALTA_ALGO",
  queFalta: "Falta el séptimo de la semana pasada",
  ...BASE,
  ...over,
});

describe("bugReportSchema — accepted shapes", () => {
  it("accepts a complete DATO_INCORRECTO with only its own fields", () => {
    const parsed = bugReportSchema.parse(datoIncorrecto());
    expect(parsed.kind).toBe("DATO_INCORRECTO");
    expect(parsed).not.toHaveProperty("queFalta");
  });

  it("accepts a complete FALTA_ALGO with only its own field", () => {
    const parsed = bugReportSchema.parse(faltaAlgo());
    expect(parsed.kind).toBe("FALTA_ALGO");
    expect(parsed).not.toHaveProperty("donde");
  });

  it("strips fields belonging to the other shape instead of storing both", () => {
    const parsed = bugReportSchema.parse(
      faltaAlgo({ donde: "Fila 3", appDice: "Q1" }),
    );
    expect(parsed).not.toHaveProperty("donde");
    expect(parsed).not.toHaveProperty("appDice");
  });

  it("rejects an unknown kind", () => {
    expect(bugReportSchema.safeParse(datoIncorrecto({ kind: "OTRA_COSA" })).success)
      .toBe(false);
  });
});

describe("bugReportSchema — required fields", () => {
  it.each(["donde", "appDice", "appDeberiaDecir"])(
    "rejects an empty %s",
    (field) => {
      expect(bugReportSchema.safeParse(datoIncorrecto({ [field]: "" })).success)
        .toBe(false);
    },
  );

  it.each(["donde", "appDice", "appDeberiaDecir"])(
    "rejects a whitespace-only %s",
    (field) => {
      expect(bugReportSchema.safeParse(datoIncorrecto({ [field]: "   " })).success)
        .toBe(false);
    },
  );

  it("rejects an empty queFalta", () => {
    expect(bugReportSchema.safeParse(faltaAlgo({ queFalta: "" })).success).toBe(false);
  });

  it("rejects a whitespace-only queFalta", () => {
    expect(bugReportSchema.safeParse(faltaAlgo({ queFalta: " \n\t " })).success)
      .toBe(false);
  });

  it("rejects an empty url", () => {
    expect(bugReportSchema.safeParse(datoIncorrecto({ url: "" })).success).toBe(false);
  });

  it("reports the failing rule in Spanish", () => {
    const result = bugReportSchema.safeParse(datoIncorrecto({ donde: "" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("obligatorio");
    }
  });
});

describe("bugReportSchema — trimming and length", () => {
  it("trims the stored value", () => {
    const parsed = bugReportSchema.parse(datoIncorrecto({ donde: "  Fila 12  " }));
    if (parsed.kind !== "DATO_INCORRECTO") throw new Error("wrong shape");
    expect(parsed.donde).toBe("Fila 12");
  });

  it("accepts a short field at the limit and rejects one over it", () => {
    const atLimit = "x".repeat(BUG_REPORT_SHORT_FIELD_MAX);
    expect(bugReportSchema.safeParse(datoIncorrecto({ donde: atLimit })).success)
      .toBe(true);
    expect(
      bugReportSchema.safeParse(datoIncorrecto({ donde: `${atLimit}x` })).success,
    ).toBe(false);
  });

  it("rejects an over-length queFalta", () => {
    const tooLong = "x".repeat(BUG_REPORT_LONG_FIELD_MAX + 1);
    expect(bugReportSchema.safeParse(faltaAlgo({ queFalta: tooLong })).success)
      .toBe(false);
  });

  it("measures length after trimming, not before", () => {
    const padded = `  ${"x".repeat(BUG_REPORT_SHORT_FIELD_MAX)}  `;
    expect(bugReportSchema.safeParse(datoIncorrecto({ donde: padded })).success)
      .toBe(true);
  });
});

describe("bugReportSchema — screenshot", () => {
  it("accepts a missing screenshot as null", () => {
    const parsed = bugReportSchema.parse(datoIncorrecto({ screenshot: undefined }));
    expect(parsed.screenshot).toBeNull();
  });

  it("accepts a screenshot at the ceiling", () => {
    const atLimit = "A".repeat(BUG_REPORT_SCREENSHOT_MAX_B64);
    expect(bugReportSchema.safeParse(datoIncorrecto({ screenshot: atLimit })).success)
      .toBe(true);
  });

  it("rejects a screenshot over the ceiling", () => {
    const tooBig = "A".repeat(BUG_REPORT_SCREENSHOT_MAX_B64 + 1);
    expect(bugReportSchema.safeParse(datoIncorrecto({ screenshot: tooBig })).success)
      .toBe(false);
  });
});

describe("meta — normalized, never rejected", () => {
  it("accepts a report whose meta is malformed", () => {
    const result = bugReportSchema.safeParse(
      datoIncorrecto({ meta: { dpr: "dos", viewport: 42 } }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts a report with no meta at all", () => {
    expect(bugReportSchema.safeParse(datoIncorrecto({ meta: undefined })).success)
      .toBe(true);
  });

  it("accepts a report whose meta is not even an object", () => {
    expect(bugReportSchema.safeParse(datoIncorrecto({ meta: "nope" })).success)
      .toBe(true);
  });

  it("defaults dpr to 1 when it is unusable", () => {
    expect(parseBugReportMeta({ ...META, dpr: "dos" }).dpr).toBe(1);
    expect(parseBugReportMeta(null).dpr).toBe(1);
  });

  it("keeps valid metadata intact", () => {
    expect(parseBugReportMeta(META)).toEqual(META);
  });
});

describe("isBugReportDraftComplete — the submit button's rule", () => {
  const empty = { donde: "", appDice: "", appDeberiaDecir: "", queFalta: "" };

  it("is false before a kind is chosen", () => {
    expect(isBugReportDraftComplete({ kind: null, ...empty })).toBe(false);
  });

  it("requires all three fields for DATO_INCORRECTO", () => {
    expect(
      isBugReportDraftComplete({
        kind: "DATO_INCORRECTO",
        ...empty,
        donde: "Fila 1",
        appDice: "Q1",
      }),
    ).toBe(false);
    expect(
      isBugReportDraftComplete({
        kind: "DATO_INCORRECTO",
        ...empty,
        donde: "Fila 1",
        appDice: "Q1",
        appDeberiaDecir: "Q2",
      }),
    ).toBe(true);
  });

  it("treats whitespace as empty, exactly like the schema", () => {
    expect(
      isBugReportDraftComplete({ kind: "FALTA_ALGO", ...empty, queFalta: "   " }),
    ).toBe(false);
    expect(
      isBugReportDraftComplete({ kind: "FALTA_ALGO", ...empty, queFalta: "algo" }),
    ).toBe(true);
  });
});
