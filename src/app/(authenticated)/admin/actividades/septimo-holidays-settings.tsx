"use client";

// =============================================================================
// src/app/(authenticated)/admin/actividades/septimo-holidays-settings.tsx
// Séptimo bonus amount + official/non-working holidays (which reduce the
// séptimo's required-workday count). Settings roles only (page-guarded).
// =============================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus } from "lucide-react";

type Holiday = { id: string; date: string; name: string; recurringAnnual: boolean };
type Msg = { kind: "ok" | "err"; text: string } | null;

export function SeptimoHolidaysSettings({ amount, holidays }: { amount: number; holidays: Holiday[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [amt, setAmt] = useState(String(amount));
  const [msg, setMsg] = useState<Msg>(null);
  const [hDate, setHDate] = useState("");
  const [hName, setHName] = useState("");
  const [hRec, setHRec] = useState(false);

  const refresh = () => startTransition(() => router.refresh());

  const saveAmount = async () => {
    setMsg(null);
    const n = Number(amt);
    if (!Number.isFinite(n) || n < 0) { setMsg({ kind: "err", text: "Monto inválido" }); return; }
    const res = await fetch("/api/admin/septimo-amount", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: n }),
    });
    if (res.ok) { setMsg({ kind: "ok", text: "Monto del séptimo actualizado" }); refresh(); }
    else { setMsg({ kind: "err", text: (await res.json()).error ?? "Error al guardar" }); }
  };

  const addHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const res = await fetch("/api/admin/holidays", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: hDate, name: hName.trim(), recurringAnnual: hRec }),
    });
    if (res.ok) { setHDate(""); setHName(""); setHRec(false); refresh(); }
    else { setMsg({ kind: "err", text: (await res.json()).error ?? "Error al agregar feriado" }); }
  };

  const delHoliday = async (id: string) => {
    setMsg(null);
    const res = await fetch(`/api/admin/holidays/${id}`, { method: "DELETE" });
    if (res.ok) refresh();
    else setMsg({ kind: "err", text: "Error al eliminar" });
  };

  return (
    <div className="space-y-6">
      {msg && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${msg.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          {msg.text}
        </div>
      )}

      {/* Séptimo amount */}
      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-stone-900">Monto del séptimo (Q)</h3>
        <p className="mt-1 text-xs text-stone-500">
          Premio por asistir todos los días requeridos de la semana. No es pago por trabajar el domingo.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="number" min="0" step="0.01" inputMode="decimal"
            value={amt} onChange={(e) => setAmt(e.target.value)}
            className="w-40 rounded-lg border border-stone-200 px-3 py-2 text-sm tabular-nums focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400"
          />
          <button onClick={saveAmount} disabled={isPending}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50">
            Guardar
          </button>
        </div>
      </div>

      {/* Holidays */}
      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-stone-900">Feriados / días no laborables</h3>
        <p className="mt-1 text-xs text-stone-500">
          Reducen los días requeridos de esa semana para ganar el séptimo.
        </p>

        <ul className="mt-3 divide-y divide-stone-100">
          {holidays.length === 0 && <li className="py-3 text-sm text-stone-400">Sin feriados registrados.</li>}
          {holidays.map((h) => (
            <li key={h.id} className="flex items-center justify-between py-2">
              <span className="text-sm text-stone-800">
                <span className="tabular-nums text-stone-500">{h.date}</span> · {h.name}
                {h.recurringAnnual && <span className="ml-2 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500">anual</span>}
              </span>
              <button onClick={() => delHoliday(h.id)} disabled={isPending}
                className="rounded p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50" aria-label="Eliminar">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>

        <form onSubmit={addHoliday} className="mt-4 flex flex-wrap items-end gap-2 border-t border-stone-100 pt-4">
          <div>
            <label className="mb-1 block text-xs text-stone-500">Fecha</label>
            <input type="date" required value={hDate} onChange={(e) => setHDate(e.target.value)}
              className="rounded-lg border border-stone-200 px-3 py-2 text-sm focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400" />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="mb-1 block text-xs text-stone-500">Nombre</label>
            <input type="text" required maxLength={100} value={hName} onChange={(e) => setHName(e.target.value)} placeholder="Ej: Día de la Independencia"
              className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400" />
          </div>
          <label className="flex items-center gap-1.5 pb-2 text-xs text-stone-600">
            <input type="checkbox" checked={hRec} onChange={(e) => setHRec(e.target.checked)} className="h-4 w-4 rounded border-stone-300" />
            Anual
          </label>
          <button type="submit" disabled={isPending}
            className="inline-flex items-center gap-1 rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50">
            <Plus className="h-4 w-4" /> Agregar
          </button>
        </form>
      </div>
    </div>
  );
}
