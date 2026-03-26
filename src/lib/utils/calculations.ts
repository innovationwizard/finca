// =============================================================================
// src/lib/utils/calculations.ts — Business logic calculations
// =============================================================================

/**
 * Calculate total earned for an activity record.
 * totalEarned = quantity × unitPrice
 */
export function calcTotalEarned(quantity: number, unitPrice: number): number {
  return Math.round(quantity * unitPrice * 100) / 100;
}

/**
 * Calculate payroll net pay.
 * totalToPay = totalEarned + bonification - advances - deductions
 */
export function calcNetPay(
  totalEarned: number,
  bonification: number,
  advances: number,
  deductions: number,
): number {
  return Math.round((totalEarned + bonification - advances - deductions) * 100) / 100;
}

/**
 * Calculate rendimiento (cereza:pergamino ratio).
 * rendimiento = pesoNetoQq / pesoPergaminoQq
 * A higher number means lower yield (more cherry needed per unit of parchment).
 * Normal range for Danilandia: 4.0 - 7.0 (5.7 noted as "high").
 */
export function calcRendimiento(
  pesoNetoQq: number,
  pesoPergaminoQq: number,
): number | null {
  if (pesoPergaminoQq <= 0) return null;
  return Math.round((pesoNetoQq / pesoPergaminoQq) * 100) / 100;
}

/**
 * Calculate production estimates from lb/plant.
 * From GENERAL sheet formula chain:
 *   qqMaduroPerLote = (lbPerPlant × plantCount) / 100
 *   qqOroPerLote = qqMaduroPerLote / rendimientoPromedio
 *   qqOroPerManzana = qqOroPerLote / areaManzanas
 *
 * rendimientoPromedio = average ratio maduro:oro (typically ~6)
 */
export function calcProductionEstimate(
  lbPerPlant: number,
  plantCount: number,
  areaManzanas: number,
  rendimientoPromedio: number = 6,
): {
  qqMaduroPerLote: number;
  qqOroPerLote: number;
  qqOroPerManzana: number;
} {
  const qqMaduroPerLote = (lbPerPlant * plantCount) / 100;
  const qqOroPerLote = rendimientoPromedio > 0
    ? qqMaduroPerLote / rendimientoPromedio
    : 0;
  const qqOroPerManzana = areaManzanas > 0
    ? qqOroPerLote / areaManzanas
    : 0;

  return {
    qqMaduroPerLote: Math.round(qqMaduroPerLote * 100) / 100,
    qqOroPerLote: Math.round(qqOroPerLote * 100) / 100,
    qqOroPerManzana: Math.round(qqOroPerManzana * 100) / 100,
  };
}

/**
 * Calculate jornales per manzana for a lot.
 * jornalesPerMz = totalJornales / areaManzanas
 */
export function calcJornalesPerManzana(
  totalJornales: number,
  areaManzanas: number,
): number {
  if (areaManzanas <= 0) return 0;
  return Math.round((totalJornales / areaManzanas) * 100) / 100;
}
