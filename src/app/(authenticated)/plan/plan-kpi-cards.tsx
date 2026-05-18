// =============================================================================
// src/app/(authenticated)/plan/plan-kpi-cards.tsx — KPI summary cards
// Shows Plan YTD, Ejecutado, % Cumplimiento, and Δ Jornales.
// planYtd = sum of planned jornales for weeks already elapsed this year.
// actualYtd = sum of all recorded jornales in the selected year.
// =============================================================================

type PlanKpiCardsProps = {
  planYtd: number;
  actualYtd: number;
};

export function PlanKpiCards({ planYtd, actualYtd }: PlanKpiCardsProps) {
  const hasPlan = planYtd > 0;
  const pct = hasPlan ? Math.round((actualYtd / planYtd) * 100) : null;
  const delta = actualYtd - planYtd;

  const pctColor =
    pct === null
      ? "text-gray-500"
      : pct >= 95
        ? "text-green-700"
        : pct >= 75
          ? "text-yellow-700"
          : "text-red-700";

  const pctBg =
    pct === null
      ? "bg-white"
      : pct >= 95
        ? "bg-green-50"
        : pct >= 75
          ? "bg-yellow-50"
          : "bg-red-50";

  const pctBorder =
    pct === null
      ? "border-gray-200"
      : pct >= 95
        ? "border-green-200"
        : pct >= 75
          ? "border-yellow-200"
          : "border-red-200";

  const pctLabel =
    pct === null ? "Sin datos" : pct >= 95 ? "En rango" : pct >= 75 ? "Desviación" : "Alerta";

  const deltaColor =
    delta > 0 ? "text-green-600" : delta < 0 ? "text-red-600" : "text-gray-700";

  const deltaLabel = delta >= 0 ? "sobre plan" : "bajo plan";

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {/* Plan acumulado */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Plan acumulado
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-finca-900">
          {hasPlan ? planYtd.toFixed(1) : "—"}
        </p>
        <p className="mt-0.5 text-xs text-gray-400">jornales planificados</p>
      </div>

      {/* Ejecutado */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Ejecutado
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-finca-900">
          {actualYtd > 0 ? actualYtd.toFixed(1) : "—"}
        </p>
        <p className="mt-0.5 text-xs text-gray-400">jornales registrados</p>
      </div>

      {/* % Cumplimiento */}
      <div
        className={`rounded-lg border ${pctBorder} ${pctBg} p-4 shadow-sm`}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          % Cumplimiento
        </p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${pctColor}`}>
          {pct !== null ? `${pct}%` : "—"}
        </p>
        <p className={`mt-0.5 text-xs font-medium ${pctColor}`}>{pctLabel}</p>
      </div>

      {/* Δ Jornales */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Diferencia
        </p>
        <p
          className={`mt-1 text-2xl font-semibold tabular-nums ${deltaColor}`}
        >
          {hasPlan || actualYtd > 0
            ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`
            : "—"}
        </p>
        <p className={`mt-0.5 text-xs font-medium ${deltaColor}`}>
          {hasPlan || actualYtd > 0 ? deltaLabel : "Sin datos"}
        </p>
      </div>
    </div>
  );
}
