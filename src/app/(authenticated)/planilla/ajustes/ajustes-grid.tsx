"use client";

// =============================================================================
// src/app/(authenticated)/planilla/ajustes/ajustes-grid.tsx
// Editable per-worker DESCUENTOS / ADICIONALES grid. TOTAL A PAGAR recomputes
// live (TOTAL − descuento + adicional). Each non-zero amount REQUIRES a note
// (CFO audit). Saves only changed rows to PATCH /api/planilla/ajustes;
// read-only roles see disabled inputs.
// =============================================================================

import { useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Loader2 } from "lucide-react";
import { formatGTQ } from "@/lib/utils/format";

type Row = {
  workerId: string;
  name: string;
  gross: number;
  deductions: number;
  bonification: number;
  deductionsNote: string;
  bonificationNote: string;
};
type Draft = { deductions: string; bonification: string; deductionsNote: string; bonificationNote: string };

const n = (s: string) => {
  const v = parseFloat(s);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

export function AjustesGrid({ periodId, rows, canWrite }: { periodId: string; rows: Row[]; canWrite: boolean }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Drafts keyed by workerId; seeded from server values.
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const seed: Record<string, Draft> = {};
    for (const r of rows) {
      seed[r.workerId] = {
        deductions: r.deductions ? String(r.deductions) : "",
        bonification: r.bonification ? String(r.bonification) : "",
        deductionsNote: r.deductionsNote ?? "",
        bonificationNote: r.bonificationNote ?? "",
      };
    }
    return seed;
  });

  const setField = useCallback((workerId: string, field: keyof Draft, value: string) => {
    setDrafts((prev) => ({ ...prev, [workerId]: { ...prev[workerId], [field]: value } }));
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  // Rows whose draft differs from the server value (amount or note).
  const changed = useMemo(
    () =>
      rows.filter((r) => {
        const d = drafts[r.workerId];
        return (
          n(d.deductions) !== r.deductions ||
          n(d.bonification) !== r.bonification ||
          d.deductionsNote.trim() !== (r.deductionsNote ?? "") ||
          d.bonificationNote.trim() !== (r.bonificationNote ?? "")
        );
      }),
    [rows, drafts],
  );

  // Among rows to be saved, any non-zero amount missing its note is invalid.
  const missingNote = useCallback(
    (d: Draft) =>
      (n(d.deductions) > 0 && d.deductionsNote.trim() === "") ||
      (n(d.bonification) > 0 && d.bonificationNote.trim() === ""),
    [],
  );
  const invalid = useMemo(() => changed.filter((r) => missingNote(drafts[r.workerId])), [changed, drafts, missingNote]);

  const totals = useMemo(() => {
    let gross = 0, desc = 0, adic = 0, pay = 0;
    for (const r of rows) {
      const d = drafts[r.workerId];
      const de = n(d.deductions), bo = n(d.bonification);
      gross += r.gross; desc += de; adic += bo; pay += r.gross - de + bo;
    }
    return { gross, desc, adic, pay };
  }, [rows, drafts]);

  const handleSave = useCallback(async () => {
    if (changed.length === 0) { setMsg({ kind: "err", text: "No hay cambios para guardar." }); return; }
    if (invalid.length > 0) { setMsg({ kind: "err", text: `Cada descuento o adicional requiere una nota (${invalid.length} sin nota).` }); return; }
    setSaving(true); setMsg(null);
    try {
      const res = await fetch("/api/planilla/ajustes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payPeriodId: periodId,
          rows: changed.map((r) => {
            const d = drafts[r.workerId];
            return {
              workerId: r.workerId,
              deductions: n(d.deductions),
              bonification: n(d.bonification),
              deductionsNote: d.deductionsNote.trim(),
              bonificationNote: d.bonificationNote.trim(),
            };
          }),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ kind: "err", text: data.error || "Error al guardar" }); setSaving(false); return; }
      setMsg({ kind: "ok", text: `${data.updated ?? changed.length} ajuste(s) guardado(s).` });
      router.refresh();
    } catch {
      setMsg({ kind: "err", text: "Error de conexión" });
    } finally {
      setSaving(false);
    }
  }, [changed, invalid, drafts, periodId, router]);

  const noteClass = (needs: boolean) =>
    `mt-1 w-full rounded border px-2 py-1 text-xs focus:outline-none disabled:cursor-not-allowed disabled:bg-finca-50 disabled:text-finca-400 ${
      needs ? "border-red-300 focus:border-red-500" : "border-finca-200 focus:border-earth-400"
    }`;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar trabajador…"
          className="w-full rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm placeholder:text-finca-300 focus:border-earth-400 focus:outline-none sm:w-72"
        />
        <span className="ml-auto text-sm text-finca-500">
          A pagar: <span className="font-semibold tabular-nums text-finca-900">{formatGTQ(totals.pay)}</span>
        </span>
      </div>

      {msg && (
        <div className={`mb-3 rounded-lg border px-4 py-2 text-sm ${msg.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{msg.text}</div>
      )}

      <div className="overflow-x-auto rounded-xl border border-finca-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-finca-100 bg-finca-50/50 text-finca-600">
              <th className="w-8 px-2 py-2.5 font-medium">#</th>
              <th className="px-3 py-2.5 font-medium">Trabajador</th>
              <th className="px-3 py-2.5 text-right font-medium">Total</th>
              <th className="px-3 py-2.5 font-medium">Descuentos</th>
              <th className="px-3 py-2.5 font-medium">Adicionales</th>
              <th className="px-3 py-2.5 text-right font-medium">Total a Pagar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-finca-50">
            {visible.map((r, idx) => {
              const d = drafts[r.workerId];
              const pay = r.gross - n(d.deductions) + n(d.bonification);
              const needDesc = n(d.deductions) > 0 && d.deductionsNote.trim() === "";
              const needBon = n(d.bonification) > 0 && d.bonificationNote.trim() === "";
              return (
                <tr key={r.workerId} className="hover:bg-finca-50/30">
                  <td className="px-2 py-1.5 align-top text-finca-400 tabular-nums">{idx + 1}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 align-top font-medium text-finca-900">{r.name}</td>
                  <td className="px-3 py-1.5 text-right align-top tabular-nums text-finca-700">{formatGTQ(r.gross)}</td>
                  <td className="min-w-[12rem] px-3 py-1.5 align-top">
                    <input
                      type="number" step="0.01" min="0" inputMode="decimal"
                      value={d.deductions}
                      disabled={!canWrite}
                      onChange={(e) => setField(r.workerId, "deductions", e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded border border-finca-200 px-2 py-1 text-right text-sm tabular-nums focus:border-earth-400 focus:outline-none disabled:cursor-not-allowed disabled:bg-finca-50 disabled:text-finca-400"
                    />
                    {n(d.deductions) > 0 && (
                      <input
                        type="text" maxLength={500}
                        value={d.deductionsNote}
                        disabled={!canWrite}
                        onChange={(e) => setField(r.workerId, "deductionsNote", e.target.value)}
                        placeholder="Nota / motivo (requerido)"
                        className={noteClass(needDesc)}
                      />
                    )}
                  </td>
                  <td className="min-w-[12rem] px-3 py-1.5 align-top">
                    <input
                      type="number" step="0.01" min="0" inputMode="decimal"
                      value={d.bonification}
                      disabled={!canWrite}
                      onChange={(e) => setField(r.workerId, "bonification", e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded border border-finca-200 px-2 py-1 text-right text-sm tabular-nums focus:border-earth-400 focus:outline-none disabled:cursor-not-allowed disabled:bg-finca-50 disabled:text-finca-400"
                    />
                    {n(d.bonification) > 0 && (
                      <input
                        type="text" maxLength={500}
                        value={d.bonificationNote}
                        disabled={!canWrite}
                        onChange={(e) => setField(r.workerId, "bonificationNote", e.target.value)}
                        placeholder="Nota / motivo (requerido)"
                        className={noteClass(needBon)}
                      />
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right align-top tabular-nums font-semibold text-finca-900">{formatGTQ(pay)}</td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-finca-400">Sin resultados.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-finca-200 bg-finca-50/30 font-semibold text-finca-900">
              <td />
              <td className="px-3 py-2.5">Total</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatGTQ(totals.gross)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatGTQ(totals.desc)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatGTQ(totals.adic)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatGTQ(totals.pay)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {canWrite && (
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || changed.length === 0 || invalid.length > 0}
            className="inline-flex items-center gap-2 rounded-lg bg-finca-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-finca-800 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            Guardar {changed.length > 0 ? `${changed.length} cambio(s)` : "cambios"}
          </button>
          {invalid.length > 0 && (
            <span className="text-xs text-red-600">{invalid.length} ajuste(s) sin nota.</span>
          )}
        </div>
      )}
    </div>
  );
}
