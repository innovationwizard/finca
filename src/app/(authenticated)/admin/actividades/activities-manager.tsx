"use client";

// =============================================================================
// src/app/(authenticated)/admin/actividades/activities-manager.tsx
// Full CRUD table for the activity catalog
// =============================================================================

import { Fragment, useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { resolveActivityPrice, nextScheduled, type PriceVigencia } from "@/lib/pricing/resolve-price";

function todayISO(): string {
  // Local calendar date; server is authoritative for stored prices.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const UNIT_OPTIONS = [
  { value: "QUINTAL", label: "Quintal (qq)" },
  { value: "MANZANA", label: "Manzana (mz)" },
  { value: "HECTAREA", label: "Hectárea (ha)" },
  { value: "DIA", label: "Día" },
] as const;

const UNIT_ABBR: Record<string, string> = {
  QUINTAL: "qq",
  MANZANA: "mz",
  HECTAREA: "ha",
  DIA: "día",
};

type ActivityRow = {
  id: string;
  name: string;
  unit: string;
  defaultPrice: number;
  isHarvest: boolean;
  isBeneficio: boolean;
  isActive: boolean;
  minQtyAlert: number | null;
  maxQtyAlert: number | null;
  sortOrder: number;
  priceSchedule: PriceVigencia[];
};

type EditState = {
  id: string; // "NEW" for create
  name: string;
  unit: string;
  defaultPrice: string;
  isHarvest: boolean;
  isBeneficio: boolean;
  isActive: boolean;
  minQtyAlert: string;
  maxQtyAlert: string;
};

export function ActivitiesManager({
  initialData,
}: {
  initialData: ActivityRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<EditState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pricesFor, setPricesFor] = useState<string | null>(null);

  const startEdit = useCallback((a: ActivityRow) => {
    setError(null);
    setSuccess(null);
    setEditing({
      id: a.id,
      name: a.name,
      unit: a.unit,
      defaultPrice: a.defaultPrice.toString(),
      isHarvest: a.isHarvest,
      isBeneficio: a.isBeneficio,
      isActive: a.isActive,
      minQtyAlert: a.minQtyAlert?.toString() ?? "",
      maxQtyAlert: a.maxQtyAlert?.toString() ?? "",
    });
  }, []);

  const startCreate = useCallback(() => {
    setError(null);
    setSuccess(null);
    setEditing({
      id: "NEW",
      name: "",
      unit: "DIA",
      defaultPrice: "100",
      isHarvest: false,
      isBeneficio: false,
      isActive: true,
      minQtyAlert: "",
      maxQtyAlert: "",
    });
  }, []);

  const cancel = useCallback(() => {
    setEditing(null);
    setError(null);
  }, []);

  const save = useCallback(async () => {
    if (!editing) return;

    const price = parseFloat(editing.defaultPrice);
    if (isNaN(price) || price < 0) {
      setError("El precio debe ser un número no negativo");
      return;
    }
    if (!editing.name.trim()) {
      setError("El nombre es requerido");
      return;
    }

    const payload = {
      ...(editing.id !== "NEW" && { id: editing.id }),
      name: editing.name.trim(),
      unit: editing.unit,
      defaultPrice: price,
      isHarvest: editing.isHarvest,
      isBeneficio: editing.isBeneficio,
      isActive: editing.isActive,
      minQtyAlert: editing.minQtyAlert ? parseFloat(editing.minQtyAlert) : null,
      maxQtyAlert: editing.maxQtyAlert ? parseFloat(editing.maxQtyAlert) : null,
    };

    try {
      const res = await fetch("/api/admin/activities", {
        method: editing.id === "NEW" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Error al guardar");
        return;
      }

      setSuccess(editing.id === "NEW" ? "Actividad creada" : "Actividad actualizada");
      setEditing(null);
      startTransition(() => router.refresh());
      setTimeout(() => setSuccess(null), 3000);
    } catch {
      setError("Error de conexión");
    }
  }, [editing, router]);

  return (
    <div>
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
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-40"
        >
          + Nueva Actividad
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50">
              <th className="px-4 py-3 font-medium text-stone-600">Actividad</th>
              <th className="px-4 py-3 font-medium text-stone-600">Unidad</th>
              <th className="px-4 py-3 font-medium text-stone-600 text-right">
                Precio (Q)
              </th>
              <th className="px-4 py-3 font-medium text-stone-600 text-center">
                Cosecha
              </th>
              <th className="px-4 py-3 font-medium text-stone-600 text-center">
                Beneficio
              </th>
              <th className="px-4 py-3 font-medium text-stone-600 text-center">
                Activo
              </th>
              <th className="px-4 py-3 font-medium text-stone-600 text-right">
                Alerta Mín
              </th>
              <th className="px-4 py-3 font-medium text-stone-600 text-right">
                Alerta Máx
              </th>
              <th className="px-4 py-3 font-medium text-stone-600 text-right">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {/* New row (if creating) */}
            {editing?.id === "NEW" && (
              <EditRow editing={editing} setEditing={setEditing} onSave={save} onCancel={cancel} isPending={isPending} />
            )}

            {initialData.map((activity) => {
              const isEditing = editing?.id === activity.id;

              if (isEditing && editing) {
                return (
                  <EditRow
                    key={activity.id}
                    editing={editing}
                    setEditing={setEditing}
                    onSave={save}
                    onCancel={cancel}
                    isPending={isPending}
                  />
                );
              }

              return (
                <Fragment key={activity.id}>
                <tr
                  className={`transition-colors hover:bg-stone-50 ${
                    !activity.isActive ? "opacity-50" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-stone-900">
                    {activity.name}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-700">
                      {UNIT_ABBR[activity.unit] ?? activity.unit}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    Q{resolveActivityPrice(activity.priceSchedule, activity.defaultPrice, todayISO()).toFixed(2)}
                    {(() => {
                      const next = nextScheduled(activity.priceSchedule, todayISO());
                      return next ? (
                        <div className="text-[11px] font-normal text-amber-600">
                          → Q{next.price.toFixed(2)} el {next.effectiveFrom}
                        </div>
                      ) : null;
                    })()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {activity.isHarvest ? "✓" : ""}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {activity.isBeneficio ? "✓" : ""}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex h-2 w-2 rounded-full ${
                        activity.isActive ? "bg-emerald-500" : "bg-stone-300"
                      }`}
                    />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-stone-500">
                    {activity.minQtyAlert ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-stone-500">
                    {activity.maxQtyAlert ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setPricesFor(pricesFor === activity.id ? null : activity.id)}
                        disabled={editing !== null}
                        className={`rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
                          pricesFor === activity.id
                            ? "border-amber-300 bg-amber-50 text-amber-700"
                            : "border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50"
                        }`}
                      >
                        Precios
                      </button>
                      <button
                        onClick={() => startEdit(activity)}
                        disabled={editing !== null}
                        className="rounded-md border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 hover:border-stone-300 hover:bg-stone-50 disabled:opacity-40"
                      >
                        Editar
                      </button>
                    </div>
                  </td>
                </tr>
                {pricesFor === activity.id && (
                  <tr>
                    <td colSpan={9} className="bg-stone-50 px-4 py-4">
                      <PricePanel
                        activityId={activity.id}
                        schedule={activity.priceSchedule}
                        onChanged={() => startTransition(() => router.refresh())}
                        onError={setError}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legal minimum wage notice */}
      <p className="mt-4 text-xs text-stone-400">
        Salario mínimo agrícola CE2 vigente 2026: Q119.21/día (Acuerdo Gubernativo
        256-2025). Los precios configurados aquí son los que la finca paga por unidad
        de trabajo — verificar cumplimiento.
      </p>
    </div>
  );
}

// ── Inline edit row ──────────────────────────────────────────────────────────

function EditRow({
  editing,
  setEditing,
  onSave,
  onCancel,
  isPending,
}: {
  editing: EditState;
  setEditing: (s: EditState) => void;
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
          placeholder="Nombre de actividad"
          className="w-full rounded-md border border-stone-300 px-2 py-1 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          autoFocus={editing.id === "NEW"}
        />
      </td>
      <td className="px-4 py-2">
        <select
          value={editing.unit}
          onChange={(e) => setEditing({ ...editing, unit: e.target.value })}
          className="w-full rounded-md border border-stone-300 px-2 py-1 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        >
          {UNIT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2">
        <input
          type="number"
          step="0.01"
          min="0"
          value={editing.defaultPrice}
          onChange={(e) =>
            setEditing({ ...editing, defaultPrice: e.target.value })
          }
          className="w-24 rounded-md border border-stone-300 px-2 py-1 text-right text-sm tabular-nums focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </td>
      <td className="px-4 py-2 text-center">
        <input
          type="checkbox"
          checked={editing.isHarvest}
          onChange={(e) =>
            setEditing({ ...editing, isHarvest: e.target.checked })
          }
          className="h-4 w-4 rounded border-stone-300 text-amber-600 focus:ring-amber-500"
        />
      </td>
      <td className="px-4 py-2 text-center">
        <input
          type="checkbox"
          checked={editing.isBeneficio}
          onChange={(e) =>
            setEditing({ ...editing, isBeneficio: e.target.checked })
          }
          className="h-4 w-4 rounded border-stone-300 text-amber-600 focus:ring-amber-500"
        />
      </td>
      <td className="px-4 py-2 text-center">
        <input
          type="checkbox"
          checked={editing.isActive}
          onChange={(e) =>
            setEditing({ ...editing, isActive: e.target.checked })
          }
          className="h-4 w-4 rounded border-stone-300 text-amber-600 focus:ring-amber-500"
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="number"
          step="0.1"
          min="0"
          value={editing.minQtyAlert}
          onChange={(e) =>
            setEditing({ ...editing, minQtyAlert: e.target.value })
          }
          placeholder="—"
          className="w-20 rounded-md border border-stone-300 px-2 py-1 text-right text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="number"
          step="0.1"
          min="0"
          value={editing.maxQtyAlert}
          onChange={(e) =>
            setEditing({ ...editing, maxQtyAlert: e.target.value })
          }
          placeholder="—"
          className="w-20 rounded-md border border-stone-300 px-2 py-1 text-right text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
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

// ── Price history panel (effective-dated pricing) ────────────────────────────

function PricePanel({
  activityId,
  schedule,
  onChanged,
  onError,
}: {
  activityId: string;
  schedule: PriceVigencia[];
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const [price, setPrice] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(todayISO());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const today = todayISO();
  const current = resolveActivityPrice(schedule, null, today);
  const upcoming = nextScheduled(schedule, today);
  const sorted = [...schedule].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));

  const add = useCallback(async () => {
    const p = parseFloat(price);
    if (isNaN(p) || p < 0) { onError("El precio debe ser un número no negativo"); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) { onError("Fecha de vigencia inválida"); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/activities/${activityId}/prices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price: p, effectiveFrom, note: note.trim() || null }),
      });
      if (!res.ok) { onError((await res.json()).error ?? "Error al guardar precio"); return; }
      setPrice(""); setNote(""); setEffectiveFrom(todayISO());
      onChanged();
    } catch {
      onError("Error de conexión");
    } finally {
      setBusy(false);
    }
  }, [price, effectiveFrom, note, activityId, onChanged, onError]);

  const remove = useCallback(async (effFrom: string) => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/activities/${activityId}/prices?effectiveFrom=${encodeURIComponent(effFrom)}`,
        { method: "DELETE" },
      );
      if (!res.ok) { onError((await res.json()).error ?? "Error al eliminar"); return; }
      onChanged();
    } catch {
      onError("Error de conexión");
    } finally {
      setBusy(false);
    }
  }, [activityId, onChanged, onError]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="text-stone-600">
          Precio vigente hoy: <span className="font-semibold tabular-nums text-stone-900">Q{current.toFixed(2)}</span>
        </span>
        {upcoming && (
          <span className="text-amber-700">
            Próximo: <span className="font-semibold tabular-nums">Q{upcoming.price.toFixed(2)}</span> desde {upcoming.effectiveFrom}
          </span>
        )}
      </div>

      {/* History */}
      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50 text-stone-500">
              <th className="px-3 py-2 font-medium">Vigente desde</th>
              <th className="px-3 py-2 font-medium text-right">Precio (Q)</th>
              <th className="px-3 py-2 font-medium">Nota</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {sorted.map((v) => (
              <tr key={v.effectiveFrom} className={v.effectiveFrom > today ? "bg-amber-50/40" : ""}>
                <td className="px-3 py-2 tabular-nums">{v.effectiveFrom}{v.effectiveFrom > today && <span className="ml-1 text-amber-600">(programado)</span>}</td>
                <td className="px-3 py-2 text-right tabular-nums">Q{v.price.toFixed(2)}</td>
                <td className="px-3 py-2 text-stone-500">{v.note ?? ""}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => remove(v.effectiveFrom)}
                    disabled={busy || schedule.length <= 1}
                    className="text-stone-400 hover:text-red-500 disabled:opacity-30"
                    title={schedule.length <= 1 ? "No se puede eliminar el único precio" : "Eliminar"}
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add new vigencia */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-stone-200 bg-white p-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-600">Nuevo precio (Q)</label>
          <input
            type="number" step="0.01" min="0" value={price} inputMode="decimal"
            onChange={(e) => setPrice(e.target.value)} placeholder="0.00"
            className="w-28 rounded-md border border-stone-300 px-2 py-1 text-right text-sm tabular-nums focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-600">Vigente desde</label>
          <input
            type="date" value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            className="rounded-md border border-stone-300 px-2 py-1 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="mb-1 block text-xs font-medium text-stone-600">Nota (opcional)</label>
          <input
            type="text" value={note} maxLength={200}
            onChange={(e) => setNote(e.target.value)} placeholder="Motivo del cambio…"
            className="w-full rounded-md border border-stone-300 px-2 py-1 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
        <button
          onClick={add}
          disabled={busy || !price}
          className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "..." : "Agregar precio"}
        </button>
      </div>
      <p className="text-xs text-stone-400">
        Un precio nuevo solo aplica a partir de su fecha de vigencia. Las semanas
        anteriores conservan su precio; puede programar un precio futuro.
      </p>
    </div>
  );
}
