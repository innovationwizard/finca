import { describe, expect, it } from "vitest";
import { cuiMatchKey, splitCui } from "./cui";

describe("splitCui", () => {
  it("strips spaces and dashes from a 13-digit CUI and keeps the printed form", () => {
    expect(splitCui(" 1234 56789 0101 ")).toEqual({
      cui: "1234567890101",
      cuiAsPrinted: "1234 56789 0101",
    });
    expect(splitCui("1234-56789-0101")).toEqual({
      cui: "1234567890101",
      cuiAsPrinted: "1234-56789-0101",
    });
  });

  it("keeps a legacy id verbatim", () => {
    expect(splitCui(" F-6 22274 ")).toEqual({
      cui: "F-6 22274",
      cuiAsPrinted: "F-6 22274",
    });
  });

  it("does not treat a non-13 digit string as a modern CUI", () => {
    expect(splitCui("1234 5678").cui).toBe("1234 5678");
  });
});

describe("cuiMatchKey", () => {
  it("matches a typed modern CUI to the stored normalized value", () => {
    const stored = splitCui("1234 56789 0101").cui;
    expect(cuiMatchKey("1234567890101")).toBe(stored);
  });
});
