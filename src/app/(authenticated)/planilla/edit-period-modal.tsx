"use client";

// =============================================================================
// src/app/(authenticated)/planilla/edit-period-modal.tsx
// Button + modal to edit the open pay period's dates (MASTER/ADMIN).
//
// A successor's start is DERIVED (predecessor.endDate + 1) and is never edited
// here — when `hasPredecessor`, only the end date is offered, and the start is
// shown read-only for context. Changing the end MOVES the successor chain by the
// same delta (duration preserved), so the admin is told before saving. The API
// enforces both rules independently; this is UX, not the guard.
// =============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCog, X } from "lucide-react";

type Props = {
  period: { id: string; periodNumber: number; startDate: string; endDate: string };
  // A strict predecessor exists (a period ending the day before this one starts)
  // → this period's start is derived and not editable.
  hasPredecessor: boolean;
  // Successor that will be shifted by an end-date change, for the warning.
  successor?: { periodNumber: number; startDate: string; endDate: string } | null;
};

const dm = (iso: string) => { const [, m, d] = iso.split("-"); return `${d}/${m}`; };

export function EditPeriodModal({ period, hasPredecessor, successor }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(period.startDate);
  const [endDate, setEndDate] = useState(period.endDate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = (!hasPredecessor && startDate !== period.startDate) || endDate !== period.endDate;
  // Days the successor chain will shift by, if the end moved.
  const deltaDays = Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${period.endDate}T00:00:00Z`)) / 86_400_000);
  const shifted = successor && deltaDays !== 0 && !Number.isNaN(deltaDays)
    ? {
        n: successor.periodNumber,
        start: new Date(Date.parse(`${successor.startDate}T00:00:00Z`) + deltaDays * 86_400_000).toISOString().slice(0, 10),
        end: new Date(Date.parse(`${successor.endDate}T00:00:00Z`) + deltaDays * 86_400_000).toISOString().slice(0, 10),
      }
    : null;

  async function save() {
    setError(null);
    if (endDate < startDate) { setError("La fecha de fin no puede ser anterior a la de inicio."); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/pay-periods/${period.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Derived start is never sent — the API rejects changing it.
        body: JSON.stringify(hasPredecessor ? { endDate } : { startDate, endDate }),
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
                {hasPredecessor ? (
                  <>
                    <p className="mt-1 w-full rounded-lg border border-finca-100 bg-finca-50 px-3 py-2 text-sm tabular-nums text-finca-500">
                      {period.startDate}
                    </p>
                    <p className="mt-1 text-xs text-finca-500">
                      Se deriva del período anterior (empieza el día siguiente a su fin) — no se edita aquí. Para moverla, cambie la fecha de fin del período anterior.
                    </p>
                  </>
                ) : (
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-finca-200 px-3 py-2 text-sm focus:border-finca-400 focus:outline-none"
                  />
                )}
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
              {shifted && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  El período {shifted.n} se moverá {deltaDays > 0 ? `${deltaDays} día(s) adelante` : `${Math.abs(deltaDays)} día(s) atrás`}, conservando su duración:{" "}
                  <b>{dm(successor!.startDate)} – {dm(successor!.endDate)}</b> → <b>{dm(shifted.start)} – {dm(shifted.end)}</b>.
                  {" "}El séptimo se re-deriva por fecha en el próximo <i>Recalcular nómina</i>.
                </div>
              )}
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
