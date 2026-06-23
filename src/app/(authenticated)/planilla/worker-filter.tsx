"use client";

// =============================================================================
// src/app/(authenticated)/planilla/worker-filter.tsx
// Per-worker filter for "Planillas anteriores". Navigates via the ?trabajador=
// search param, preserving the current period/week selection.
// =============================================================================

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

type Props = {
  workers: { id: string; name: string }[];
  selected: string;
};

export function WorkerFilter({ workers, selected }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const params = new URLSearchParams(searchParams.toString());
      if (e.target.value) params.set("trabajador", e.target.value);
      else params.delete("trabajador");
      const qs = params.toString();
      router.push((qs ? `/planilla?${qs}` : "/planilla") as never);
    },
    [router, searchParams],
  );

  return (
    <select
      value={selected}
      onChange={handleChange}
      aria-label="Filtrar por trabajador"
      className="rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm text-finca-700 focus:border-earth-400 focus:outline-none sm:w-72"
    >
      <option value="">Todos los trabajadores</option>
      {workers.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
        </option>
      ))}
    </select>
  );
}
