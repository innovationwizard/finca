"use client";

// =============================================================================
// Worker resolution step for batch photo imports.
//
// Appears when AI extraction returns names with no DB match.
// For each unmatched name the user either:
//   (a) keeps the default checkbox checked → worker will be created in DB
//   (b) unchecks → picks an existing worker from a searchable dropdown
//
// All decisions are collected on a single screen; a single "Continuar"
// click creates the new workers and returns the completed name→id map.
//
// Design rationale: docs/ux-worker-resolution.md
// =============================================================================

import { useState, useEffect, useMemo } from "react";
import { CheckCircle, UserPlus, Link, AlertCircle, Loader2 } from "lucide-react";

export type UnmatchedItem = {
  extractedName: string;
  candidates: { id: string; fullName: string; score: number }[];
};

export type WorkerResolutionResult = {
  extractedName: string;
  workerId: string;
  workerFullName: string;
  wasCreated: boolean;
};

type RowState = {
  createNew: boolean;      // checkbox: true = create, false = map
  mapToId: string;         // selected existing worker id (when createNew=false)
  mapToName: string;       // display name for the selected worker
  search: string;          // search string for the dropdown
};

type Props = {
  unmatched: UnmatchedItem[];
  onResolved: (results: WorkerResolutionResult[]) => void;
  onCancel: () => void;
};

export function WorkerResolution({ unmatched, onResolved, onCancel }: Props) {
  const [allWorkers, setAllWorkers] = useState<{ id: string; fullName: string }[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialise rows: all default to createNew=true
  useEffect(() => {
    const initial: Record<string, RowState> = {};
    for (const item of unmatched) {
      initial[item.extractedName] = {
        createNew: true,
        mapToId: "",
        mapToName: "",
        search: "",
      };
    }
    setRows(initial);
  }, [unmatched]);

  // Fetch all active workers for the mapping dropdown
  useEffect(() => {
    fetch("/api/workers?active=true")
      .then((r) => r.json())
      .then((data) => setAllWorkers(Array.isArray(data) ? data : []))
      .catch(() => setAllWorkers([]));
  }, []);

  function updateRow(name: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [name]: { ...prev[name], ...patch } }));
    // Clear any previous error for this row
    setErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  // A row is resolved when: createNew=true OR (createNew=false AND mapToId is set)
  function isResolved(name: string): boolean {
    const row = rows[name];
    if (!row) return false;
    return row.createNew || Boolean(row.mapToId);
  }

  const resolvedCount = unmatched.filter((u) => isResolved(u.extractedName)).length;
  const allResolved = resolvedCount === unmatched.length;

  // Filtered worker list for a given row's search string
  function filteredWorkers(name: string): { id: string; fullName: string }[] {
    const search = rows[name]?.search?.toLowerCase() ?? "";
    if (!search) return allWorkers;
    return allWorkers.filter((w) => w.fullName.toLowerCase().includes(search));
  }

  async function handleContinue() {
    setSaving(true);
    setErrors({});
    const results: WorkerResolutionResult[] = [];
    const newErrors: Record<string, string> = {};

    for (const item of unmatched) {
      const row = rows[item.extractedName];
      if (!row) continue;

      if (row.createNew) {
        // Create a new worker via the existing POST /api/workers endpoint
        try {
          const res = await fetch("/api/workers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fullName: item.extractedName }),
          });
          const data = await res.json();
          if (!res.ok) {
            newErrors[item.extractedName] =
              data.error || "Error al crear el trabajador";
            continue;
          }
          results.push({
            extractedName: item.extractedName,
            workerId: data.id,
            workerFullName: data.fullName,
            wasCreated: true,
          });
        } catch {
          newErrors[item.extractedName] = "Error de conexión";
        }
      } else {
        // Map to existing worker
        if (!row.mapToId) {
          newErrors[item.extractedName] = "Selecciona un trabajador";
          continue;
        }
        results.push({
          extractedName: item.extractedName,
          workerId: row.mapToId,
          workerFullName: row.mapToName,
          wasCreated: false,
        });
      }
    }

    setSaving(false);

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onResolved(results);
  }

  // Candidate suggestions for a given unmatched item (score ≥ 65 only)
  function candidatesForItem(item: UnmatchedItem) {
    return item.candidates.filter((c) => c.score >= 65);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-finca-900">
          Personas no encontradas en la base de datos
        </h2>
        <p className="mt-1 text-sm text-finca-500">
          El sistema no reconoció{" "}
          {unmatched.length === 1
            ? "este nombre"
            : `estos ${unmatched.length} nombres`}
          . Por defecto se agregarán como nuevas personas.
          Desmarca la casilla para vincular a alguien ya registrado.
        </p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-finca-100">
          <div
            className="h-2 rounded-full bg-finca-600 transition-all"
            style={{ width: `${(resolvedCount / unmatched.length) * 100}%` }}
          />
        </div>
        <span className="shrink-0 text-xs tabular-nums text-finca-500">
          {resolvedCount} / {unmatched.length}
        </span>
      </div>

      {/* Resolution list */}
      <div className="divide-y divide-finca-100 rounded-lg border border-finca-200">
        {unmatched.map((item) => {
          const row = rows[item.extractedName];
          if (!row) return null;
          const resolved = isResolved(item.extractedName);
          const hasCandidates = candidatesForItem(item).length > 0;
          const workers = filteredWorkers(item.extractedName);
          const rowError = errors[item.extractedName];

          return (
            <div
              key={item.extractedName}
              className={`px-4 py-3 transition-colors ${
                resolved
                  ? "bg-white"
                  : "border-l-2 border-l-amber-400 bg-amber-50/30"
              }`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
                {/* Resolved badge or pending indicator */}
                <div className="mt-0.5 shrink-0">
                  {resolved ? (
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                  )}
                </div>

                {/* Extracted name */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-finca-900">
                    {item.extractedName}
                  </p>

                  {/* Checkbox: Agregar como nueva persona */}
                  <label className="mt-2 flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={row.createNew}
                      onChange={(e) =>
                        updateRow(item.extractedName, {
                          createNew: e.target.checked,
                          mapToId: "",
                          mapToName: "",
                          search: "",
                        })
                      }
                      className="h-4 w-4 rounded border-finca-300 text-finca-700 focus:ring-finca-500"
                    />
                    <span className="flex items-center gap-1.5 text-sm text-finca-700">
                      <UserPlus className="h-3.5 w-3.5 shrink-0 text-finca-400" />
                      Agregar como nueva persona
                    </span>
                  </label>

                  {/* Map-to section — only visible when createNew=false */}
                  {!row.createNew && (
                    <div className="mt-2 space-y-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-finca-600">
                        <Link className="h-3.5 w-3.5" />
                        Vincular a persona existente
                      </label>

                      {/* Search input */}
                      <input
                        type="text"
                        placeholder="Buscar por nombre..."
                        value={row.search}
                        onChange={(e) =>
                          updateRow(item.extractedName, { search: e.target.value })
                        }
                        className="w-full rounded-md border border-finca-200 px-3 py-1.5 text-sm focus:border-finca-400 focus:outline-none focus:ring-1 focus:ring-finca-400"
                      />

                      {/* Suggestions + full list */}
                      <div className="max-h-48 overflow-y-auto rounded-md border border-finca-200 bg-white">
                        {hasCandidates && !row.search && (
                          <>
                            <div className="px-3 py-1 text-xs font-medium text-finca-400 bg-finca-50">
                              Sugerencias
                            </div>
                            {candidatesForItem(item).map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() =>
                                  updateRow(item.extractedName, {
                                    mapToId: c.id,
                                    mapToName: c.fullName,
                                  })
                                }
                                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-finca-50 ${
                                  row.mapToId === c.id ? "bg-finca-100 font-medium" : ""
                                }`}
                              >
                                <span>{c.fullName}</span>
                                <span className="ml-2 shrink-0 text-xs text-finca-400">
                                  {c.score}%
                                </span>
                              </button>
                            ))}
                            <div className="px-3 py-1 text-xs font-medium text-finca-400 bg-finca-50">
                              Todas las personas
                            </div>
                          </>
                        )}
                        {workers.length === 0 ? (
                          <p className="px-3 py-2 text-sm text-finca-400">
                            Sin resultados
                          </p>
                        ) : (
                          workers.map((w) => (
                            <button
                              key={w.id}
                              type="button"
                              onClick={() =>
                                updateRow(item.extractedName, {
                                  mapToId: w.id,
                                  mapToName: w.fullName,
                                })
                              }
                              className={`flex w-full items-center px-3 py-2 text-left text-sm hover:bg-finca-50 ${
                                row.mapToId === w.id ? "bg-finca-100 font-medium" : ""
                              }`}
                            >
                              {w.fullName}
                            </button>
                          ))
                        )}
                      </div>

                      {/* Selected worker chip */}
                      {row.mapToId && (
                        <p className="text-xs text-finca-600">
                          Vinculado a:{" "}
                          <span className="font-medium">{row.mapToName}</span>
                        </p>
                      )}
                    </div>
                  )}

                  {rowError && (
                    <p className="mt-1.5 text-xs text-red-600">{rowError}</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleContinue}
          disabled={!allResolved || saving}
          className="inline-flex items-center gap-2 rounded-lg bg-finca-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-finca-800 disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <CheckCircle className="h-4 w-4" />
              Continuar
            </>
          )}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg border border-finca-200 px-4 py-2.5 text-sm font-medium text-finca-600 transition-colors hover:bg-finca-50 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
