"use client";

// =============================================================================
// src/components/plan/lote-selector.tsx — Lote filter for a plan page
// Navigates via URL params on change.
//
// There is deliberately no year selector. Each cosecha has its own route
// (/plan2526, /plan2627) so a page can only ever show the cosecha its URL names:
// a plan is a document the farm works from for a season, not a view with a
// dropdown, and the old selector let /plan quietly render a different year than
// its title claimed.
// =============================================================================

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { Route } from "next";

type LoteSelectorProps = {
  lotes: { id: string; name: string }[];
  selectedLoteId: string | null;
  /** The plan route this selector navigates within, e.g. "/plan2526". */
  basePath: string;
};

export function LoteSelector({
  lotes,
  selectedLoteId,
  basePath,
}: LoteSelectorProps) {
  const router = useRouter();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const params = new URLSearchParams();
      if (e.target.value) params.set("loteId", e.target.value);
      const qs = params.toString();
      router.push((qs ? `${basePath}?${qs}` : basePath) as Route);
    },
    [router, basePath],
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
