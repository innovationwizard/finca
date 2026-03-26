// =============================================================================
// src/lib/utils/format.ts — Display formatters
// =============================================================================

/**
 * Format Quetzales: 1234.50 → "Q1,234.50"
 */
export function formatGTQ(amount: number): string {
  return `Q${amount.toLocaleString("es-GT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format quantity with unit: (3.5, "qq") → "3.50 qq"
 */
export function formatQuantity(qty: number, unit: string): string {
  const abbr: Record<string, string> = {
    QUINTAL: "qq",
    MANZANA: "mz",
    HECTAREA: "ha",
    JORNAL: "jor",
    DIA: "día",
  };
  return `${qty.toLocaleString("es-GT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${abbr[unit] ?? unit}`;
}

/**
 * Format date for display: "13 Feb 2026"
 */
export function formatDateShort(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("es-GT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Format date for ISO input: "2026-02-13"
 */
export function formatDateISO(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Format integer with thousand separators: 67116 → "67,116"
 */
export function formatInteger(n: number): string {
  return n.toLocaleString("es-GT");
}

/**
 * Format decimal for area/rendimiento: 5.7 → "5.70"
 */
export function formatDecimal(n: number, decimals = 2): string {
  return n.toLocaleString("es-GT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format rendimiento: 5.7 → "5.70:1"
 */
export function formatRendimiento(r: number): string {
  return `${formatDecimal(r)}:1`;
}
