"use client";

// =============================================================================
// src/app/(authenticated)/planilla/edit-period-modal.tsx
// Button + modal to edit the open pay period's start/end dates (MASTER/ADMIN).
// Lets an admin extend the current period instead of creating a new one.
// =============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCog, X } from "lucide-react";

type Props = {
  period: { id: string; periodNumber: number; startDate: string; endDate: string };
};

export function EditPeriodModal({ period }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(period.startDate);
  const [endDate, setEndDate] = useState(period.endDate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = startDate !== period.startDate || endDate !== period.endDate;

  async function save() {
    setError(null);
    if (endDate < startDate) { setError("La fecha de fin no puede ser anterior a la de inicio."); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/pay-periods/${period.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Error al guardar"); setSaving(false); return; }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Error de red");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        onClick={() => { setStartDate(period.startDate); setEndDate(period.endDate); setError(null); setOpen(true); }}
        className="inline-flex items-center gap-2 rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm font-medium text-finca-700 transition-colors hover:bg-finca-50 touch-target"
      >
        <CalendarCog className="h-4 w-4" />
        Editar fechas
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-finca-100 px-5 py-4">
              <h2 className="text-base font-semibold text-finca-900">
                Editar fechas del período {period.periodNumber}
              </h2>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-finca-400 transition-colors hover:bg-finca-50">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <label className="block text-sm font-medium text-finca-700">Fecha de inicio</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-finca-200 px-3 py-2 text-sm focus:border-finca-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-finca-700">Fecha de fin</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-finca-200 px-3 py-2 text-sm focus:border-finca-400 focus:outline-none"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-finca-600 hover:bg-finca-50">
                  Cancelar
                </button>
                <button
                  onClick={save}
                  disabled={saving || !dirty}
                  className="rounded-lg bg-finca-900 px-4 py-2 text-sm font-medium text-white hover:bg-finca-800 disabled:opacity-50"
                >
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
