// =============================================================================
// src/app/(authenticated)/plan/plan-summary-table.tsx — Plan vs Ejecutado
// Shared server component. Used in /plan (GENERAL) and /plan/[loteSlug].
// Columns: Actividad | Plan | Ejecutado | Δ Jornales | % Cumpl. | Estado
// Over-execution (actual >= planned) is treated as positive (green).
// =============================================================================

type ActivityInfo = {
  id: string;
  name: string;
  sortOrder: number;
};

export type PlanSummaryTableProps = {
  activities: ActivityInfo[];
  planByActivity: Record<string, number>;
  actualByActivity: Record<string, number>;
  totalPlanned: number;
  totalActual: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cumplimientoStyle(planned: number, actual: number): string {
  if (planned === 0 && actual === 0) return "bg-gray-100 text-gray-500";
  if (planned === 0) return "bg-yellow-100 text-yellow-700";
  const pct = actual / planned;
  if (pct >= 0.95) return "bg-green-100 text-green-700";
  if (pct >= 0.75) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}

function cumplimientoText(planned: number, actual: number): string {
  if (planned === 0 && actual === 0) return "—";
  if (planned === 0) return "Sin plan";
  return `${Math.round((actual / planned) * 100)}%`;
}

function statusStyle(planned: number, actual: number): string {
  if (planned === 0 && actual === 0) return "bg-gray-100 text-gray-500";
  if (planned === 0 && actual > 0) return "bg-yellow-100 text-yellow-800";
  if (actual >= planned) return "bg-green-100 text-green-800";
  const deficit = (planned - actual) / planned;
  if (deficit <= 0.2) return "bg-green-100 text-green-800";
  if (deficit <= 0.5) return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}

function statusText(planned: number, actual: number): string {
  if (planned === 0 && actual === 0) return "Sin datos";
  if (planned === 0 && actual > 0) return "Sin plan";
  if (actual >= planned) return "En rango";
  const deficit = (planned - actual) / planned;
  if (deficit <= 0.2) return "En rango";
  if (deficit <= 0.5) return "Desviación";
  return "Alerta";
}

function deltaStyle(diff: number): string {
  if (diff > 0) return "text-green-600";
  if (diff < 0) return "text-red-600";
  return "";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PlanSummaryTable({
  activities,
  planByActivity,
  actualByActivity,
  totalPlanned,
  totalActual,
}: PlanSummaryTableProps) {
  const totalDiff = totalActual - totalPlanned;
  const totalCumplStyle = cumplimientoStyle(totalPlanned, totalActual);
  const totalCumplText = cumplimientoText(totalPlanned, totalActual);

  const visibleRows = activities.filter(
    (act) =>
      (planByActivity[act.id] ?? 0) > 0 ||
      (actualByActivity[act.id] ?? 0) > 0,
  );

  if (visibleRows.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-finca-50">
            <th className="px-4 py-2 text-left font-medium text-finca-800">
              Actividad
            </th>
            <th className="px-4 py-2 text-right font-medium text-finca-800">
              Plan (j)
            </th>
            <th className="px-4 py-2 text-right font-medium text-finca-800">
              Ejecutado (j)
            </th>
            <th className="px-4 py-2 text-right font-medium text-finca-800">
              Δ Jornales
            </th>
            <th className="px-4 py-2 text-center font-medium text-finca-800">
              % Cumpl.
            </th>
            <th className="px-4 py-2 text-center font-medium text-finca-800">
              Estado
            </th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((act) => {
            const planned = planByActivity[act.id] ?? 0;
            const actual = actualByActivity[act.id] ?? 0;
            const diff = actual - planned;

            return (
              <tr
                key={act.id}
                className="border-b border-gray-100 last:border-0"
              >
                <td className="px-4 py-2 font-medium text-finca-900">
                  {act.name}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {planned.toFixed(1)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {actual.toFixed(1)}
                </td>
                <td
                  className={`px-4 py-2 text-right tabular-nums ${deltaStyle(diff)}`}
                >
                  {diff > 0 ? "+" : ""}
                  {diff.toFixed(1)}
                </td>
                <td className="px-4 py-2 text-center">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cumplimientoStyle(planned, actual)}`}
                  >
                    {cumplimientoText(planned, actual)}
                  </span>
                </td>
                <td className="px-4 py-2 text-center">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle(planned, actual)}`}
                  >
                    {statusText(planned, actual)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-300 bg-finca-50 font-semibold">
            <td className="px-4 py-2 text-finca-900">Total</td>
            <td className="px-4 py-2 text-right tabular-nums">
              {totalPlanned.toFixed(1)}
            </td>
            <td className="px-4 py-2 text-right tabular-nums">
              {totalActual.toFixed(1)}
            </td>
            <td
              className={`px-4 py-2 text-right tabular-nums ${deltaStyle(totalDiff)}`}
            >
              {totalDiff > 0 ? "+" : ""}
              {totalDiff.toFixed(1)}
            </td>
            <td className="px-4 py-2 text-center">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${totalCumplStyle}`}
              >
                {totalCumplText}
              </span>
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
