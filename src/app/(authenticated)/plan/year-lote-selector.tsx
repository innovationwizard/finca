"use client";

// =============================================================================
// src/app/(authenticated)/plan/year-lote-selector.tsx — Client-side selectors
// Navigates via URL params on change
// =============================================================================

import { useRouter } from "next/navigation";
import { useCallback } from "react";

type YearSelectorProps = {
  availableYears: { code: string; label: string }[];
  selectedYear: string;
  /** Extra params to preserve on change */
  preserveParams?: Record<string, string>;
  basePath?: string;
};

export function YearSelector({
  availableYears,
  selectedYear,
  preserveParams,
  basePath = "/plan",
}: YearSelectorProps) {
  const router = useRouter();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const params = new URLSearchParams();
      params.set("year", e.target.value);
      if (preserveParams) {
        for (const [k, v] of Object.entries(preserveParams)) {
          if (v) params.set(k, v);
        }
      }
      router.push(`${basePath}?${params.toString()}` as never);
    },
    [router, preserveParams, basePath],
  );

  return (
    <div>
      <label
        htmlFor="year-select"
        className="mb-1 block text-xs font-medium text-finca-700"
      >
        Año agrícola
      </label>
      <select
        id="year-select"
        value={selectedYear}
        onChange={handleChange}
        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-finca-900 focus:border-earth-500 focus:outline-none focus:ring-1 focus:ring-earth-500"
      >
        {availableYears.map((y) => (
          <option key={y.code} value={y.code}>
            {y.label}
          </option>
        ))}
      </select>
    </div>
  );
}

type LoteSelectorProps = {
  lotes: { id: string; name: string }[];
  selectedLoteId: string | null;
  selectedYear: string;
};

export function LoteSelector({
  lotes,
  selectedLoteId,
  selectedYear,
}: LoteSelectorProps) {
  const router = useRouter();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const params = new URLSearchParams();
      params.set("year", selectedYear);
      if (e.target.value) params.set("loteId", e.target.value);
      router.push(`/plan?${params.toString()}` as never);
    },
    [router, selectedYear],
  );

  return (
    <div>
      <label
        htmlFor="lote-select"
        className="mb-1 block text-xs font-medium text-finca-700"
      >
        Lote
      </label>
      <select
        id="lote-select"
        value={selectedLoteId ?? ""}
        onChange={handleChange}
        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-finca-900 focus:border-earth-500 focus:outline-none focus:ring-1 focus:ring-earth-500"
      >
        <option value="">GENERAL (todos los lotes)</option>
        {lotes.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </div>
  );
}
