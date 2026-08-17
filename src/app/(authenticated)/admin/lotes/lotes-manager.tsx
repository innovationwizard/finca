"use client";

// =============================================================================
// src/app/(authenticated)/admin/lotes/lotes-manager.tsx
// Inline-editable table for lot area/plant configuration
// =============================================================================

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

type LoteRow = {
  id: string;
  name: string;
  slug: string;
  areaManzanas: number | null;
  plantCount: number | null;
  density: string | null;
  variety: string | null;
  altitudeMasl: number | null;
  isActive: boolean;
  sortOrder: number;
  updatedAt: string;
};

// `id` is "NEW" while creating a lote. The name is only editable then —
// renaming an existing lote would break its slug and every URL that uses it.
const NEW = "NEW";

type EditingState = {
  id: string;
  name: string;
  areaManzanas: string;
  plantCount: string;
  density: string;
  variety: string;
  isActive: boolean;
};

export function LotesManager({ initialData }: { initialData: LoteRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const startEdit = useCallback((lote: LoteRow) => {
    setError(null);
    setSuccess(null);
    setEditing({
      id: lote.id,
      name: lote.name,
      areaManzanas: lote.areaManzanas?.toString() ?? "",
      plantCount: lote.plantCount?.toString() ?? "",
      density: lote.density ?? "",
      variety: lote.variety ?? "",
      isActive: lote.isActive,
    });
  }, []);

  // A new lote may be saved with only its name — area and plants are often
  // measured after it is opened, and cost centers never have them.
  const startCreate = useCallback(() => {
    setError(null);
    setSuccess(null);
    setEditing({
      id: NEW,
      name: "",
      areaManzanas: "",
      plantCount: "",
      density: "",
      variety: "",
      isActive: true,
    });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditing(null);
    setError(null);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editing) return;

    const isCreate = editing.id === NEW;

    const areaManzanas = parseFloat(editing.areaManzanas);
    const plantCount = parseInt(editing.plantCount, 10);

    const areaMzValue = editing.areaManzanas ? areaManzanas : null;
    const plantCountValue = editing.plantCount ? plantCount : null;

    if (isCreate && !editing.name.trim()) {
      setError("El nombre del lote es requerido");
      return;
    }
    if (areaMzValue !== null && (isNaN(areaManzanas) || areaManzanas <= 0)) {
      setError("El área debe ser un número positivo");
      return;
    }
    if (plantCountValue !== null && (isNaN(plantCount) || plantCount < 0)) {
      setError("La cantidad de plantas debe ser un número entero no negativo");
      return;
    }

    try {
      const res = await fetch("/api/admin/lotes", {
        method: isCreate ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isCreate ? { name: editing.name.trim() } : { id: editing.id }),
          areaManzanas: areaMzValue,
          plantCount: plantCountValue,
          density: editing.density || null,
          variety: editing.variety || null,
          isActive: editing.isActive,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Error al guardar");
        return;
      }

      setSuccess(isCreate ? "Lote creado" : "Lote actualizado");
      setEditing(null);
      startTransition(() => router.refresh());

      setTimeout(() => setSuccess(null), 3000);
    } catch {
      setError("Error de conexión");
    }
  }, [editing, router]);

  return (
    <div>
      {/* Status messages */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      )}

      {/* Add button */}
      <div className="mb-4 flex justify-end">
        <button
          onClick={startCreate}
          disabled={editing !== null}
          className="inline-flex items-center gap-1 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> Agregar lote
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50">
              <th className="px-4 py-3 font-medium text-stone-600">Lote</th>
              <th className="px-4 py-3 font-medium text-stone-600 text-right">
                Área (mz)
              </th>
              <th className="px-4 py-3 font-medium text-stone-600 text-right">
                Plantas
              </th>
              <th className="px-4 py-3 font-medium text-stone-600">Densidad</th>
              <th className="px-4 py-3 font-medium text-stone-600">Variedad</th>
              <th className="px-4 py-3 font-medium text-stone-600 text-center">
                Activo
              </th>
              <th className="px-4 py-3 font-medium text-stone-600 text-right">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {/* New lote row (if creating) */}
            {editing?.id === NEW && (
              <CreateRow
                editing={editing}
                setEditing={setEditing}
                onSave={saveEdit}
                onCancel={cancelEdit}
                isPending={isPending}
              />
            )}

            {initialData.map((lote) => {
              const isEditing = editing?.id === lote.id;

              return (
                <tr
                  key={lote.id}
                  className={`transition-colors ${
                    isEditing
                      ? "bg-amber-50"
                      : lote.plantCount == null
                        ? "bg-orange-50/40"
                        : "hover:bg-stone-50"
                  }`}
                >
                  {/* Name (always read-only) */}
                  <td className="px-4 py-3 font-medium text-stone-900">
                    {lote.name}
                    {lote.plantCount == null && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                        Sin datos
                      </span>
                    )}
                  </td>

                  {/* Area */}
                  <td className="px-4 py-3 text-right">
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={editing.areaManzanas}
                        onChange={(e) =>
                          setEditing({ ...editing, areaManzanas: e.target.value })
                        }
                        className="w-24 rounded-md border border-stone-300 px-2 py-1 text-right text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    ) : (
                      <span className="tabular-nums">{lote.areaManzanas ?? "—"}</span>
                    )}
                  </td>

                  {/* Plant count */}
                  <td className="px-4 py-3 text-right">
                    {isEditing ? (
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={editing.plantCount}
                        onChange={(e) =>
                          setEditing({ ...editing, plantCount: e.target.value })
                        }
                        className="w-28 rounded-md border border-stone-300 px-2 py-1 text-right text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    ) : (
                      <span className="tabular-nums">
                        {lote.plantCount?.toLocaleString("es-GT") ?? "—"}
                      </span>
                    )}
                  </td>

                  {/* Density */}
                  <td className="px-4 py-3 text-stone-500">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editing.density}
                        onChange={(e) =>
                          setEditing({ ...editing, density: e.target.value })
                        }
                        placeholder="ej. 3500 pl/mz"
                        className="w-32 rounded-md border border-stone-300 px-2 py-1 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    ) : (
                      (lote.density ?? "—")
                    )}
                  </td>

                  {/* Variety */}
                  <td className="px-4 py-3 text-stone-500">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editing.variety}
                        onChange={(e) =>
                          setEditing({ ...editing, variety: e.target.value })
                        }
                        placeholder="ej. Bourbon"
                        className="w-28 rounded-md border border-stone-300 px-2 py-1 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    ) : (
                      (lote.variety ?? "—")
                    )}
                  </td>

                  {/* Active toggle */}
                  <td className="px-4 py-3 text-center">
                    {isEditing ? (
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({ ...editing, isActive: !editing.isActive })
                        }
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                          editing.isActive ? "bg-emerald-500" : "bg-stone-300"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow-sm ring-0 transition-transform ${
                            editing.isActive ? "translate-x-4" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    ) : (
                      <span
                        className={`inline-flex h-2 w-2 rounded-full ${
                          lote.isActive ? "bg-emerald-500" : "bg-stone-300"
                        }`}
                      />
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-right">
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={saveEdit}
                          disabled={isPending}
                          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {isPending ? "..." : "Guardar"}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(lote)}
                        disabled={editing !== null}
                        className="rounded-md border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 hover:border-stone-300 hover:bg-stone-50 disabled:opacity-40"
                      >
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <p className="mt-4 text-xs text-stone-400">
        Los lotes marcados &quot;Sin datos&quot; no tienen área ni plantas configuradas.
        Actualizar con datos reales de la finca.
      </p>
    </div>
  );
}

// ── New lote row ─────────────────────────────────────────────────────────────
// Same columns as the table, with the name editable (only possible at creation).

function CreateRow({
  editing,
  setEditing,
  onSave,
  onCancel,
  isPending,
}: {
  editing: EditingState;
  setEditing: (s: EditingState) => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <tr className="bg-amber-50">
      <td className="px-4 py-2">
        <input
          type="text"
          value={editing.name}
          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          placeholder="Nombre del lote"
          maxLength={60}
          autoFocus
          className="w-full rounded-md border border-stone-300 px-2 py-1 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </td>
      <td className="px-4 py-2 text-right">
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={editing.areaManzanas}
          onChange={(e) => setEditing({ ...editing, areaManzanas: e.target.value })}
          placeholder="—"
          className="w-24 rounded-md border border-stone-300 px-2 py-1 text-right text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </td>
      <td className="px-4 py-2 text-right">
        <input
          type="number"
          step="1"
          min="0"
          value={editing.plantCount}
          onChange={(e) => setEditing({ ...editing, plantCount: e.target.value })}
          placeholder="—"
          className="w-28 rounded-md border border-stone-300 px-2 py-1 text-right text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="text"
          value={editing.density}
          onChange={(e) => setEditing({ ...editing, density: e.target.value })}
          placeholder="ej. 3500 pl/mz"
          maxLength={40}
          className="w-32 rounded-md border border-stone-300 px-2 py-1 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="text"
          value={editing.variety}
          onChange={(e) => setEditing({ ...editing, variety: e.target.value })}
          placeholder="ej. Bourbon"
          maxLength={120}
          className="w-28 rounded-md border border-stone-300 px-2 py-1 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </td>
      <td className="px-4 py-2 text-center">
        <button
          type="button"
          onClick={() => setEditing({ ...editing, isActive: !editing.isActive })}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
            editing.isActive ? "bg-emerald-500" : "bg-stone-300"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow-sm ring-0 transition-transform ${
              editing.isActive ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
      </td>
      <td className="px-4 py-2 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onSave}
            disabled={isPending}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {isPending ? "..." : "Guardar"}
          </button>
          <button
            onClick={onCancel}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50"
          >
            Cancelar
          </button>
        </div>
      </td>
    </tr>
  );
}
