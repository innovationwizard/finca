"use client";

// =============================================================================
// Review table for extracted notebook data.
// User can edit, fix worker matches, and confirm before DB insert.
// =============================================================================

import { Trash2, AlertTriangle, CheckCircle, HelpCircle } from "lucide-react";

export type ReviewRow = {
  id: string;
  workerName: string;
  workerId: string | null;
  workerConfidence: "exact" | "partial" | "none";
  activityId: string;
  loteId: string | null;
  date: string;
  quantity: number;
  unitPrice: number;
  totalEarned: number;
  payPeriodId: string;
};

type WorkerOption = { id: string; fullName: string };
type ActivityOption = { id: string; name: string; defaultPrice: number | null };
type LoteOption = { id: string; name: string };
type PeriodOption = { id: string; periodNumber: number; startDate: string; endDate: string };

type Props = {
  rows: ReviewRow[];
  workers: WorkerOption[];
  activities: ActivityOption[];
  lotes: LoteOption[];
  payPeriods: PeriodOption[];
  onUpdateRow: (id: string, updates: Partial<ReviewRow>) => void;
  onDeleteRow: (id: string) => void;
};

export function ReviewTable({
  rows,
  workers,
  activities,
  lotes,
  payPeriods,
  onUpdateRow,
  onDeleteRow,
}: Props) {
  const validRows = rows.filter((r) => r.workerId);
  const totalEarned = validRows.reduce((sum, r) => sum + r.totalEarned, 0);

  return (
    <div>
      {/* Summary */}
      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        <div className="rounded-lg border border-finca-200 bg-white px-3 py-2">
          <span className="text-finca-500">Total filas:</span>{" "}
          <span className="font-semibold text-finca-900">{rows.length}</span>
        </div>
        <div className="rounded-lg border border-finca-200 bg-white px-3 py-2">
          <span className="text-finca-500">Válidas:</span>{" "}
          <span className="font-semibold text-emerald-700">{validRows.length}</span>
        </div>
        <div className="rounded-lg border border-finca-200 bg-white px-3 py-2">
          <span className="text-finca-500">Total devengado:</span>{" "}
          <span className="font-semibold text-finca-900">
            Q{totalEarned.toLocaleString("es-GT", { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-finca-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-finca-100 bg-finca-50">
              <th className="px-3 py-2.5 font-medium text-finca-600">Estado</th>
              <th className="px-3 py-2.5 font-medium text-finca-600">Trabajador</th>
              <th className="px-3 py-2.5 font-medium text-finca-600">Fecha</th>
              <th className="px-3 py-2.5 font-medium text-finca-600">Actividad</th>
              <th className="px-3 py-2.5 font-medium text-finca-600">Lote</th>
              <th className="px-3 py-2.5 font-medium text-finca-600 text-right">Cantidad</th>
              <th className="px-3 py-2.5 font-medium text-finca-600 text-right">Precio</th>
              <th className="px-3 py-2.5 font-medium text-finca-600 text-right">Total</th>
              <th className="px-3 py-2.5 font-medium text-finca-600">Período</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-finca-100">
            {rows.map((row) => (
              <tr
                key={row.id}
                className={
                  !row.workerId
                    ? "bg-red-50/50"
                    : row.workerConfidence === "partial"
                      ? "bg-amber-50/50"
                      : ""
                }
              >
                {/* Status indicator */}
                <td className="px-3 py-2">
                  {!row.workerId ? (
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                  ) : row.workerConfidence === "partial" ? (
                    <HelpCircle className="h-4 w-4 text-amber-500" />
                  ) : (
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                  )}
                </td>

                {/* Worker selector */}
                <td className="px-3 py-2">
                  <div>
                    <p className="text-xs text-finca-400 mb-0.5">{row.workerName}</p>
                    <select
                      value={row.workerId || ""}
                      onChange={(e) =>
                        onUpdateRow(row.id, {
                          workerId: e.target.value || null,
                          workerConfidence: e.target.value ? "exact" : "none",
                        })
                      }
                      className={`w-full rounded border px-2 py-1 text-xs ${
                        !row.workerId
                          ? "border-red-300 bg-red-50"
                          : "border-finca-200"
                      }`}
                    >
                      <option value="">— Seleccionar —</option>
                      {workers.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                </td>

                {/* Date */}
                <td className="px-3 py-2">
                  <input
                    type="date"
                    value={row.date}
                    onChange={(e) => onUpdateRow(row.id, { date: e.target.value })}
                    className="rounded border border-finca-200 px-2 py-1 text-xs"
                  />
                </td>

                {/* Activity */}
                <td className="px-3 py-2">
                  <select
                    value={row.activityId}
                    onChange={(e) => {
                      const act = activities.find((a) => a.id === e.target.value);
                      const price = act?.defaultPrice ?? row.unitPrice;
                      onUpdateRow(row.id, {
                        activityId: e.target.value,
                        unitPrice: price,
                        totalEarned: Math.round(row.quantity * price * 100) / 100,
                      });
                    }}
                    className="rounded border border-finca-200 px-2 py-1 text-xs"
                  >
                    {activities.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </td>

                {/* Lote */}
                <td className="px-3 py-2">
                  <select
                    value={row.loteId || ""}
                    onChange={(e) =>
                      onUpdateRow(row.id, { loteId: e.target.value || null })
                    }
                    className="rounded border border-finca-200 px-2 py-1 text-xs"
                  >
                    <option value="">—</option>
                    {lotes.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </td>

                {/* Quantity */}
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={row.quantity}
                    onChange={(e) => {
                      const qty = parseFloat(e.target.value) || 0;
                      onUpdateRow(row.id, {
                        quantity: qty,
                        totalEarned: Math.round(qty * row.unitPrice * 100) / 100,
                      });
                    }}
                    className="w-20 rounded border border-finca-200 px-2 py-1 text-right text-xs tabular-nums"
                  />
                </td>

                {/* Unit price */}
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.unitPrice}
                    onChange={(e) => {
                      const price = parseFloat(e.target.value) || 0;
                      onUpdateRow(row.id, {
                        unitPrice: price,
                        totalEarned: Math.round(row.quantity * price * 100) / 100,
                      });
                    }}
                    className="w-20 rounded border border-finca-200 px-2 py-1 text-right text-xs tabular-nums"
                  />
                </td>

                {/* Total */}
                <td className="px-3 py-2 text-right font-medium tabular-nums text-finca-900">
                  Q{row.totalEarned.toFixed(2)}
                </td>

                {/* Pay period */}
                <td className="px-3 py-2">
                  <select
                    value={row.payPeriodId}
                    onChange={(e) => onUpdateRow(row.id, { payPeriodId: e.target.value })}
                    className="rounded border border-finca-200 px-2 py-1 text-xs"
                  >
                    {payPeriods.map((p) => (
                      <option key={p.id} value={p.id}>
                        Sem {p.periodNumber}
                      </option>
                    ))}
                  </select>
                </td>

                {/* Delete */}
                <td className="px-3 py-2">
                  <button
                    onClick={() => onDeleteRow(row.id)}
                    className="rounded p-1 text-finca-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
