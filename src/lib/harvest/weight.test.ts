import { describe, expect, it } from "vitest";
import {
  displayLibras,
  formatCoffeeWeight,
  quintalesFromLibras,
  weighingAmounts,
} from "./weight";

describe("coffee weight", () => {
  it("round-trips 2-decimal libras through 4-decimal quintales", () => {
    expect(quintalesFromLibras(12.34)).toBe(0.1234);
    expect(displayLibras(12.34, 0.1234)).toBe(12.34);
  });

  it("derives libras from quintales when pesoLibras is missing", () => {
    expect(displayLibras(null, 12.5)).toBe(1250);
    expect(formatCoffeeWeight(null, 12.5)).toContain("lb");
    expect(formatCoffeeWeight(null, 12.5)).toContain("qq");
  });

  it("snapshots pay from libras times the resolved price", () => {
    expect(weighingAmounts(12.34, 0.85)).toEqual({
      quantity: 12.34,
      unitPrice: 0.85,
      totalEarned: 10.49,
      pesoLibras: 12.34,
      pesoNetoQq: 0.1234,
    });
  });
});
