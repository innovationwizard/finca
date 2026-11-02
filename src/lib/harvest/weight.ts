import { LB_PER_QQ } from "./constants";

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function quintalesFromLibras(libras: number): number {
  return round4(libras / LB_PER_QQ);
}

export function librasFromQuintales(qq: number): number {
  return round2(qq * LB_PER_QQ);
}

/** Historical rows have no pesoLibras. Show pesoNetoQq × 100. */
export function displayLibras(
  pesoLibras: number | null | undefined,
  pesoNetoQq: number,
): number {
  if (pesoLibras != null && Number.isFinite(pesoLibras)) return round2(pesoLibras);
  return librasFromQuintales(pesoNetoQq);
}

export function formatCoffeeWeight(
  pesoLibras: number | null | undefined,
  pesoNetoQq: number,
): string {
  const lb = displayLibras(pesoLibras, pesoNetoQq);
  const lbText = lb.toLocaleString("es-GT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const qqText = pesoNetoQq.toLocaleString("es-GT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
  return `${lbText} lb · ${qqText} qq`;
}

export function sumCoffeeWeights(
  rows: { pesoNetoQq: number; pesoLibras?: number | null }[],
): { libras: number; quintales: number } {
  let libras = 0;
  let quintales = 0;
  for (const row of rows) {
    quintales += row.pesoNetoQq;
    libras += displayLibras(row.pesoLibras, row.pesoNetoQq);
  }
  return { libras: round2(libras), quintales: round4(quintales) };
}

/** Pay line for one weighing. Quantity is libras. Money is rounded to cents. */
export function weighingAmounts(libras: number, unitPrice: number): {
  quantity: number;
  unitPrice: number;
  totalEarned: number;
  pesoLibras: number;
  pesoNetoQq: number;
} {
  const quantity = round2(libras);
  return {
    quantity,
    unitPrice,
    totalEarned: round2(quantity * unitPrice),
    pesoLibras: quantity,
    pesoNetoQq: quintalesFromLibras(quantity),
  };
}
