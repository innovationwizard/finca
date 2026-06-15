"use client";

// =============================================================================
// src/app/(authenticated)/planilla/close-period-modal.tsx
// Button + confirm modal to CLOSE the open pay period (MASTER/ADMIN). Closing
// locks the period: no more captura edits, no recálculo, no planilla edits.
// Do it only after the bank payment is confirmed.
// =============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, X } from "lucide-react";

type Props = {
  period: { id: string; periodNumber: number; startDate: string; endDate: string };
};

export function ClosePeriodModal({ period }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function close() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/pay-periods/${period.id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Error al cerrar"); setSaving(false); return; }
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
        onClick={() => { setError(null); setOpen(true); }}
        className="inline-flex items-center gap-2 rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm font-medium text-finca-700 transition-colors hover:bg-finca-50 touch-target"
      >
        <Lock className="h-4 w-4" />
        Cerrar período
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-finca-100 px-5 py-4">
              <h2 className="text-base font-semibold text-finca-900">
                Cerrar período {period.periodNumber}
              </h2>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-finca-400 transition-colors hover:bg-finca-50">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <p className="text-sm text-finca-700">
                Vas a cerrar el período <b>{period.periodNumber}</b> ({period.startDate} — {period.endDate}).
              </p>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Al cerrar, el período queda <b>bloqueado</b>: no se podrán editar registros en
                captura, ni recalcular la nómina, ni modificar la planilla. Hazlo solo
                cuando el pago al banco esté confirmado.
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-finca-600 hover:bg-finca-50">
                  Cancelar
                </button>
                <button
                  onClick={close}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-finca-900 px-4 py-2 text-sm font-medium text-white hover:bg-finca-800 disabled:opacity-50"
                >
                  <Lock className="h-4 w-4" />
                  {saving ? "Cerrando…" : "Cerrar período"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
