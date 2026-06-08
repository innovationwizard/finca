"use client";

// =============================================================================
// Interactive review of suspected duplicate workers. Per group, the user marks
// each record Conservar / Fusionar / Distinta, then applies the merge. Applying
// reassigns records to the kept worker and deactivates the duplicates.
// =============================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import type { WorkerLite } from "@/lib/workers/duplicate-clusters";

type Sel = "keep" | "merge" | "dist";

export function DedupClient({
  clusters,
  singleCount,
  totalWorkers,
}: {
  clusters: WorkerLite[][];
  singleCount: number;
  totalWorkers: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // selection[g][m] for each cluster member; default: top (most records) = keep.
  const [sel, setSel] = useState<Sel[][]>(() => clusters.map((c) => c.map((_, i) => (i === 0 ? "keep" : "merge"))));
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [doneGroups, setDoneGroups] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  function setMember(g: number, m: number, v: Sel) {
    setSel((prev) => {
      const next = prev.map((row) => row.slice());
      if (v === "keep") next[g] = next[g].map((s) => (s === "keep" ? "merge" : s));
      next[g][m] = v;
      return next;
    });
    setConfirming(null);
  }

  function keepIdx(g: number): number {
    return sel[g].indexOf("keep");
  }
  function mergeCount(g: number): number {
    return sel[g].filter((s) => s === "merge").length;
  }
  function canApply(g: number): boolean {
    return keepIdx(g) >= 0 && mergeCount(g) > 0;
  }

  async function apply(g: number) {
    const ki = keepIdx(g);
    if (ki < 0) return;
    const keepId = clusters[g][ki].id;
    const mergeIds = clusters[g].filter((_, i) => sel[g][i] === "merge").map((w) => w.id);
    if (mergeIds.length === 0) return;
    setBusy(g);
    setError(null);
    try {
      const res = await fetch("/api/admin/workers/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keepId, mergeIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al fusionar");
        setBusy(null);
        setConfirming(null);
        return;
      }
      setDoneGroups((p) => ({
        ...p,
        [g]: `Fusionado en ${data.keep}: ${data.mergedCount} registro(s), ${data.movedActivity} trabajos reasignados${data.summedPayroll ? `, ${data.summedPayroll} pago(s) sumados` : ""}.`,
      }));
      setBusy(null);
      setConfirming(null);
      // Refresh server data so merged records disappear from the list.
      startTransition(() => router.refresh());
    } catch {
      setError("Error de conexión");
      setBusy(null);
      setConfirming(null);
    }
  }

  const pendingGroups = clusters.filter((_, g) => !doneGroups[g]).length;

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap gap-3 text-sm">
        <Stat label="Total activos" value={totalWorkers} />
        <Stat label="Grupos por revisar" value={pendingGroups} />
        <Stat label="Sin duplicados" value={singleCount} />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {clusters.length === 0 && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          No se detectaron duplicados.
        </div>
      )}

      {clusters.map((cluster, g) => {
        if (doneGroups[g]) {
          return (
            <div key={g} className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-800">
              <CheckCircle className="mr-1.5 inline h-4 w-4" />
              {doneGroups[g]}
            </div>
          );
        }
        return (
          <div key={g} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">
              Grupo {g + 1} · {cluster.length} registros
            </div>
            <div className="space-y-1.5">
              {cluster.map((w, m) => {
                const s = sel[g][m];
                return (
                  <div
                    key={w.id}
                    className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${
                      s === "keep" ? "border-emerald-200 bg-emerald-50" : s === "dist" ? "border-amber-200 bg-amber-50/60 opacity-90" : "border-stone-100"
                    }`}
                  >
                    <span className="flex-1 text-sm font-semibold text-stone-900">{w.fullName}</span>
                    <span className="whitespace-nowrap text-xs text-stone-500">
                      {w.recs} trabajos · {w.pays} pagos
                    </span>
                    <span className="inline-flex overflow-hidden rounded-lg border border-stone-300 text-xs font-semibold">
                      <Seg on={s === "keep"} cls="bg-emerald-600" onClick={() => setMember(g, m, "keep")}>Conservar</Seg>
                      <Seg on={s === "merge"} cls="bg-blue-600" onClick={() => setMember(g, m, "merge")}>Fusionar</Seg>
                      <Seg on={s === "dist"} cls="bg-amber-600" onClick={() => setMember(g, m, "dist")}>Distinta</Seg>
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex items-center gap-3">
              {confirming === g ? (
                <>
                  <span className="text-xs text-amber-700">
                    Fusionar {mergeCount(g)} en <strong>{cluster[keepIdx(g)]?.fullName}</strong>. ¿Confirmar?
                  </span>
                  <button
                    onClick={() => apply(g)}
                    disabled={busy === g}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
                  >
                    {busy === g ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                    Sí, fusionar
                  </button>
                  <button onClick={() => setConfirming(null)} className="text-sm text-stone-500 hover:text-stone-700">
                    Cancelar
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirming(g)}
                  disabled={!canApply(g) || isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 px-4 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                >
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  Aplicar fusión ({mergeCount(g)})
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
      <span className="text-stone-500">{label}:</span> <span className="font-semibold text-stone-900">{value}</span>
    </div>
  );
}

function Seg({ on, cls, onClick, children }: { on: boolean; cls: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`px-2.5 py-1 ${on ? `${cls} text-white` : "bg-white text-stone-500 hover:bg-stone-50"}`}>
      {children}
    </button>
  );
}
