"use client";

// =============================================================================
// src/app/(authenticated)/planilla/planilla-list.tsx — Records table with edit/delete
// =============================================================================

import { useState, useMemo, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Check, X, Loader2 } from "lucide-react";
import { formatGTQ, formatQuantity, formatDateShort } from "@/lib/utils/format";

type Record = {
  id: string;
  date: string;
  quantity: number;
  unitPrice: number;
  totalEarned: number;
  notes: string | null;
  syncedAt: string | null;
  worker: { id: string; fullName: string };
  activity: { id: string; name: string; unit: string };
  lote: { id: string; name: string } | null;
};

type FilterState = {
  search: string;
  date: string;
  lote: string;
};

type EditState = {
  id: string;
  quantity: string;
  unitPrice: string;
};

export function PlanillaList({ records, canWrite }: { records: Record[]; canWrite: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [filter, setFilter] = useState<FilterState>({ search: "", date: "", lote: "" });
  const [editing, setEditing] = useState<EditState | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const showMessage = useCallback((msg: string, isError = false) => {
    if (isError) { setError(msg); setSuccess(null); }
    else { setSuccess(msg); setError(null); }
    setTimeout(() => { setError(null); setSuccess(null); }, 3000);
  }, []);

  // Unique dates and lotes for filter dropdowns
  const uniqueDates = useMemo(
    () => [...new Set(records.map((r) => r.date))].sort().reverse(),
    [records],
  );
  const uniqueLotes = useMemo(
    () => [...new Set(records.filter((r) => r.lote).map((r) => r.lote!.name))].sort(),
    [records],
  );

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (filter.search) {
        const q = filter.search.toLowerCase();
        if (
          !r.worker.fullName.toLowerCase().includes(q) &&
          !r.activity.name.toLowerCase().includes(q)
        )
          return false;
      }
      if (filter.date && r.date !== filter.date) return false;
      if (filter.lote && r.lote?.name !== filter.lote) return false;
      return true;
    });
  }, [records, filter]);

  // Edit handlers
  const startEdit = useCallback((r: Record) => {
    setEditing({
      id: r.id,
      quantity: r.quantity.toString(),
      unitPrice: r.unitPrice.toString(),
    });
    setError(null);
  }, []);

  const cancelEdit = useCallback(() => setEditing(null), []);

  const saveEdit = useCallback(async () => {
    if (!editing) return;
    const quantity = parseFloat(editing.quantity);
    const unitPrice = parseFloat(editing.unitPrice);
    if (isNaN(quantity) || quantity <= 0) { setError("Cantidad inválida"); return; }
    if (isNaN(unitPrice) || unitPrice < 0) { setError("Precio inválido"); return; }

    try {
      const res = await fetch("/api/planilla", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, quantity, unitPrice }),
      });
      const data = await res.json();
      if (!res.ok) { showMessage(data.error || "Error al actualizar", true); return; }
      setEditing(null);
      showMessage("Registro actualizado");
      startTransition(() => router.refresh());
    } catch {
      showMessage("Error de conexión", true);
    }
  }, [editing, router, showMessage]);

  // Delete handler
  const handleDelete = useCallback(async (r: Record) => {
    if (!confirm(`¿Eliminar registro de ${r.worker.fullName} del ${formatDateShort(r.date)}?\n${r.activity.name} — ${formatGTQ(r.totalEarned)}\n\nEsta acción no se puede deshacer.`)) return;
    setDeleting(r.id);

    try {
      const res = await fetch(`/api/planilla?id=${r.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { showMessage(data.error || "Error al eliminar", true); setDeleting(null); return; }
      showMessage("Registro eliminado");
      setDeleting(null);
      startTransition(() => router.refresh());
    } catch {
      showMessage("Error de conexión", true);
      setDeleting(null);
    }
  }, [router, showMessage]);

  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-finca-200 bg-white px-6 py-12 text-center">
        <p className="text-sm text-finca-500">No hay registros en este período.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Messages */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}
      {success && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Buscar trabajador o actividad..."
          value={filter.search}
          onChange={(e) => setFilter({ ...filter, search: e.target.value })}
          className="w-full rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm placeholder:text-finca-300 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400 sm:w-64"
        />
        <select
          value={filter.date}
          onChange={(e) => setFilter({ ...filter, date: e.target.value })}
          className="rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm text-finca-700 focus:border-earth-400 focus:outline-none"
        >
          <option value="">Todas las fechas</option>
          {uniqueDates.map((d) => (
            <option key={d} value={d}>{formatDateShort(d)}</option>
          ))}
        </select>
        <select
          value={filter.lote}
          onChange={(e) => setFilter({ ...filter, lote: e.target.value })}
          className="rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm text-finca-700 focus:border-earth-400 focus:outline-none"
        >
          <option value="">Todos los lotes</option>
          {uniqueLotes.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        {(filter.search || filter.date || filter.lote) && (
          <button
            onClick={() => setFilter({ search: "", date: "", lote: "" })}
            className="rounded-lg border border-finca-200 bg-white px-3 py-2 text-xs font-medium text-finca-500 hover:bg-finca-50"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Count */}
      <p className="mb-2 text-xs text-finca-400">
        {filtered.length} de {records.length} registros
      </p>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-finca-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-finca-100 bg-finca-50/50">
              <th className="px-4 py-3 font-medium text-finca-600">Fecha</th>
              <th className="px-4 py-3 font-medium text-finca-600">Trabajador</th>
              <th className="px-4 py-3 font-medium text-finca-600">Actividad</th>
              <th className="px-4 py-3 font-medium text-finca-600">Lote</th>
              <th className="px-4 py-3 font-medium text-finca-600 text-right">Cantidad</th>
              <th className="px-4 py-3 font-medium text-finca-600 text-right">Precio</th>
              <th className="px-4 py-3 font-medium text-finca-600 text-right">Total</th>
              {canWrite && <th className="w-20 px-2 py-3 font-medium text-finca-600 text-right">Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-finca-50">
            {filtered.map((r) => {
              const isEditing = editing?.id === r.id;
              const isDeleting = deleting === r.id;

              return (
                <tr
                  key={r.id}
                  className={`transition-colors ${
                    isEditing ? "bg-amber-50/50" : isDeleting ? "opacity-50" : "hover:bg-finca-50/30"
                  }`}
                >
                  <td className="px-4 py-2.5 text-finca-600">{formatDateShort(r.date)}</td>
                  <td className="px-4 py-2.5 font-medium text-finca-900">{r.worker.fullName}</td>
                  <td className="px-4 py-2.5 text-finca-700">{r.activity.name}</td>
                  <td className="px-4 py-2.5 text-finca-500">{r.lote?.name ?? "—"}</td>

                  {/* Quantity */}
                  <td className="px-4 py-2.5 text-right tabular-nums text-finca-700">
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={editing.quantity}
                        onChange={(e) => setEditing({ ...editing, quantity: e.target.value })}
                        className="w-20 rounded border border-amber-300 px-2 py-1 text-right text-xs focus:border-amber-500 focus:outline-none"
                        autoFocus
                      />
                    ) : (
                      formatQuantity(r.quantity, r.activity.unit)
                    )}
                  </td>

                  {/* Price */}
                  <td className="px-4 py-2.5 text-right tabular-nums text-finca-500">
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editing.unitPrice}
                        onChange={(e) => setEditing({ ...editing, unitPrice: e.target.value })}
                        className="w-20 rounded border border-amber-300 px-2 py-1 text-right text-xs focus:border-amber-500 focus:outline-none"
                      />
                    ) : (
                      formatGTQ(r.unitPrice)
                    )}
                  </td>

                  {/* Total */}
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium text-finca-900">
                    {isEditing
                      ? formatGTQ(
                          (parseFloat(editing.quantity) || 0) * (parseFloat(editing.unitPrice) || 0),
                        )
                      : formatGTQ(r.totalEarned)}
                  </td>

                  {/* Actions */}
                  {canWrite && (
                    <td className="px-2 py-2.5 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={saveEdit}
                            className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
                            title="Guardar"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="rounded p-1 text-finca-400 hover:bg-finca-50"
                            title="Cancelar"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : isDeleting ? (
                        <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-finca-400" />
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => startEdit(r)}
                            className="rounded p-1 text-finca-400 transition-colors hover:bg-finca-50 hover:text-finca-700"
                            title="Editar"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(r)}
                            className="rounded p-1 text-finca-400 transition-colors hover:bg-red-50 hover:text-red-500"
                            title="Eliminar"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-finca-200 bg-finca-50/30">
              <td colSpan={canWrite ? 6 : 6} className="px-4 py-3 text-right text-sm font-medium text-finca-600">
                Total
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-sm font-semibold text-finca-900">
                {formatGTQ(filtered.reduce((s, r) => s + r.totalEarned, 0))}
              </td>
              {canWrite && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
