import { describe, expect, it } from "vitest";
import { agriculturalYearFromISO, mondaySaturdayContaining, monthBounds } from "./dates";

describe("harvest dates", () => {
  it("uses Monday–Saturday and puts Sunday in the week that ended", () => {
    expect(mondaySaturdayContaining("2026-11-04")).toEqual({
      from: "2026-11-02",
      to: "2026-11-07",
    });
    expect(mondaySaturdayContaining("2026-11-08")).toEqual({
      from: "2026-11-02",
      to: "2026-11-07",
    });
  });

  it("bounds a calendar month", () => {
    expect(monthBounds("2026-11")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(monthBounds("2024-02")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });

  it("starts the cosecha in October", () => {
    expect(agriculturalYearFromISO("2026-11-02")).toBe("2627");
    expect(agriculturalYearFromISO("2026-09-30")).toBe("2526");
  });
});
