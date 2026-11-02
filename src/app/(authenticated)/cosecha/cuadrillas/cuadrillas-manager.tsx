"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cuadrillaLabel } from "@/lib/harvest/cuadrilla-label";

type Row = {
  id: string;
  name: string;
  startDate: string;
  endDate: string | null;
};

const empty = { name: "", startDate: "", endDate: "" };

export function CuadrillasManager({ initialRows }: { initialRows: Row[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState(empty);
  const [editing, setEditing] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/cuadrillas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name,
        startDate: draft.startDate,
        endDate: draft.endDate || null,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "No se pudo crear");
      return;
    }
    setDraft(empty);
    router.refresh();
  }

  async function saveEdit() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/cuadrillas/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editing.name,
        startDate: editing.startDate,
        endDate: editing.endDate,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "No se pudo guardar");
      return;
    }
    setEditing(null);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar esta cuadrilla?")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/cuadrillas/${id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "No se pudo eliminar");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-4 space-y-4">
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="grid gap-3 rounded-xl border border-finca-200 bg-white p-3 sm:grid-cols-4">
        <label className="text-sm text-finca-700">
          Nombre
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="mt-1 w-full rounded-lg border border-finca-200 px-3 py-2" />
        </label>
        <label className="text-sm text-finca-700">
          Inicio
          <input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} className="mt-1 w-full rounded-lg border border-finca-200 px-3 py-2" />
        </label>
        <label className="text-sm text-finca-700">
          Fin
          <input type="date" value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} className="mt-1 w-full rounded-lg border border-finca-200 px-3 py-2" />
        </label>
        <button type="button" disabled={busy} onClick={() => void create()} className="self-end rounded-lg bg-finca-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40">
          Crear
        </button>
      </div>
      <ul className="divide-y divide-finca-100 rounded-xl border border-finca-200 bg-white">
        {initialRows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3">
            {editing?.id === row.id ? (
              <div className="grid flex-1 gap-2 sm:grid-cols-3">
                <input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} className="rounded-lg border border-finca-200 px-3 py-2 text-sm" />
                <input type="date" value={editing.startDate} onChange={(event) => setEditing({ ...editing, startDate: event.target.value })} className="rounded-lg border border-finca-200 px-3 py-2 text-sm" />
                <input type="date" value={editing.endDate ?? ""} onChange={(event) => setEditing({ ...editing, endDate: event.target.value || null })} className="rounded-lg border border-finca-200 px-3 py-2 text-sm" />
              </div>
            ) : (
              <p className="text-sm text-finca-900">{cuadrillaLabel(row)}</p>
            )}
            <div className="flex gap-2">
              {editing?.id === row.id ? (
                <>
                  <button type="button" disabled={busy} onClick={() => void saveEdit()} className="text-sm font-medium text-earth-700">Guardar</button>
                  <button type="button" onClick={() => setEditing(null)} className="text-sm text-finca-500">Cancelar</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setEditing(row)} className="text-sm font-medium text-finca-700">Editar</button>
                  <button type="button" disabled={busy} onClick={() => void remove(row.id)} className="text-sm text-red-700">Eliminar</button>
                </>
              )}
            </div>
          </li>
        ))}
        {initialRows.length === 0 && <li className="px-3 py-8 text-center text-sm text-finca-400">No hay cuadrillas</li>}
      </ul>
    </div>
  );
}
