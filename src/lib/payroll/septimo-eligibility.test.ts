import { describe, expect, it } from "vitest";
import { earnsSeptimo } from "./septimo-eligibility";

describe("earnsSeptimo", () => {
  it("excludes temporal and keeps voluntario and fijo", () => {
    expect(earnsSeptimo("TEMPORAL")).toBe(false);
    expect(earnsSeptimo("VOLUNTARIO")).toBe(true);
    expect(earnsSeptimo("FIJO")).toBe(true);
  });
});