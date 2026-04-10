"use client";

// =============================================================================
// src/app/(authenticated)/planilla/nueva/page.tsx — New activity record
// Offline-aware: writes to IndexedDB + outbox when offline,
// POSTs directly when online.
// =============================================================================

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Camera } from "lucide-react";
import { useSyncStatus } from "@/hooks/use-sync-status";
import { offlineDb } from "@/lib/offline/db";
import { addToOutbox } from "@/lib/offline/sync-engine";
import { generateClientId } from "@/lib/utils/code-generators";
import { calcTotalEarned } from "@/lib/utils/calculations";
import { formatDateISO } from "@/lib/utils/format";
import { UploadFoto } from "./upload-foto";
import { CreatePayPeriodWizard } from "./create-pay-period-wizard";
import type { CachedWorker, CachedActivity, CachedLote, CachedPayPeriod } from "@/lib/offline/db";

export default function NuevaActividadPage() {
  const router = useRouter();
  const { isOnline } = useSyncStatus();
  const [mode, setMode] = useState<"manual" | "foto">("manual");

  // Reference data (from IndexedDB cache)
  const [workers, setWorkers] = useState<CachedWorker[]>([]);
  const [activities, setActivities] = useState<CachedActivity[]>([]);
  const [lotes, setLotes] = useState<CachedLote[]>([]);
  const [_periods, setPeriods] = useState<CachedPayPeriod[]>([]);

  // Form state
  const [form, setForm] = useState({
    date: formatDateISO(new Date()),
    payPeriodId: "",
    workerId: "",
    activityId: "",
    loteId: "",
    quantity: "",
    unitPrice: "",
    notes: "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load reference data from IndexedDB
  useEffect(() => {
    async function load() {
      try {
        const [w, a, l, p] = await Promise.all([
          offlineDb.workers.toArray(),
          offlineDb.activities.toArray(),
          offlineDb.lotes.toArray(),
          offlineDb.payPeriods.toArray(),
        ]);
        setWorkers(w.filter((x) => x.isActive));
        setActivities(a.filter((x) => x.isActive));
        setLotes(l.filter((x) => x.isActive));
        setPeriods(p.filter((x) => !x.isClosed));

        // Auto-select current open period
        if (p.length > 0) {
          const open = p.find((pp) => !pp.isClosed);
          if (open) setForm((f) => ({ ...f, payPeriodId: open.id }));
        }
      } catch {
        // IndexedDB not ready — try fetching from API
        if (navigator.onLine) {
          try {
            const [wRes, aRes, lRes, pRes] = await Promise.all([
              fetch("/api/workers?active=true"),
              fetch("/api/activities?active=true"),
              fetch("/api/lotes?active=true"),
              fetch("/api/pay-periods?current=true"),
            ]);
            if (wRes.ok) setWorkers(await wRes.json());
            if (aRes.ok) setActivities(await aRes.json());
            if (lRes.ok) setLotes(await lRes.json());
            if (pRes.ok) {
              const pp = await pRes.json();
              setPeriods(pp);
              if (pp.length > 0) {
                setForm((f) => ({ ...f, payPeriodId: pp[0].id }));
              }
            }
          } catch {
            setError("No se pudieron cargar los datos de referencia");
          }
        }
      }
    }
    load();
  }, []);

  // When activity changes, auto-fill unit price
  const handleActivityChange = useCallback(
    (activityId: string) => {
      const activity = activities.find((a) => a.id === activityId);
      setForm((f) => ({
        ...f,
        activityId,
        unitPrice: activity ? String(activity.defaultPrice) : "",
      }));
    },
    [activities],
  );

  // Selected activity for displaying unit
  const selectedActivity = activities.find((a) => a.id === form.activityId);

  // Calculate total
  const quantity = parseFloat(form.quantity) || 0;
  const unitPrice = parseFloat(form.unitPrice) || 0;
  const totalEarned = calcTotalEarned(quantity, unitPrice);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);

    // Validation
    if (!form.payPeriodId) {
      setError("No hay período de pago activo");
      setSaving(false);
      return;
    }
    if (!form.workerId) {
      setError("Seleccionar trabajador");
      setSaving(false);
      return;
    }
    if (!form.activityId) {
      setError("Seleccionar actividad");
      setSaving(false);
      return;
    }
    if (quantity <= 0) {
      setError("La cantidad debe ser mayor a 0");
      setSaving(false);
      return;
    }

    const clientId = generateClientId();

    const record = {
      clientId,
      date: form.date,
      payPeriodId: form.payPeriodId,
      workerId: form.workerId,
      activityId: form.activityId,
      loteId: form.loteId || null,
      quantity,
      unitPrice,
      totalEarned,
      notes: form.notes || null,
      createdAt: new Date().toISOString(),
      syncedAt: null,
    };

    try {
      if (isOnline) {
        // Try direct POST
        const res = await fetch("/api/planilla", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(record),
        });

        if (res.ok) {
          setSuccess("Registro guardado");
        } else {
          // Server rejected — fall through to offline save
          throw new Error("Server error");
        }
      } else {
        throw new Error("Offline");
      }
    } catch {
      // Save offline
      await offlineDb.activityRecords.put(record);
      await addToOutbox("activity_records", clientId, record);
      setSuccess("Guardado offline · Se sincronizará automáticamente");
    }

    setSaving(false);

    // Reset form for quick sequential entry (keep date, period, lote)
    setForm((f) => ({
      ...f,
      workerId: "",
      activityId: "",
      quantity: "",
      unitPrice: "",
      notes: "",
    }));

    setTimeout(() => setSuccess(null), 4000);
  };

  return (
    <div className={`mx-auto px-4 py-8 sm:px-6 ${mode === "foto" ? "max-w-5xl" : "max-w-lg"}`}>
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="mb-4 text-sm text-finca-500 hover:text-finca-700"
        >
          ← Volver a Planilla
        </button>
        <h1 className="text-2xl font-semibold tracking-tight text-finca-900">
          Nuevo Registro
        </h1>
        <p className="mt-1 text-sm text-finca-500">
          {mode === "manual"
            ? isOnline ? "En línea" : "Sin conexión — se guardará localmente"
            : "Subir foto del cuaderno para extraer datos automáticamente"}
        </p>

        {/* Mode toggle */}
        <div className="mt-4 flex rounded-lg border border-finca-200 bg-finca-50 p-1">
          <button
            onClick={() => setMode("manual")}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              mode === "manual"
                ? "bg-white text-finca-900 shadow-sm"
                : "text-finca-500 hover:text-finca-700"
            }`}
          >
            <ClipboardList className="h-4 w-4" />
            Registro Manual
          </button>
          <button
            onClick={() => setMode("foto")}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              mode === "foto"
                ? "bg-white text-finca-900 shadow-sm"
                : "text-finca-500 hover:text-finca-700"
            }`}
          >
            <Camera className="h-4 w-4" />
            Subir Foto de Cuaderno
          </button>
        </div>
      </div>

      {mode === "foto" ? (
        <UploadFoto />
      ) : (
      <>
      {/* Wizard: shown when no pay period exists */}
      {!form.payPeriodId && (
        <div className="mb-6">
          <CreatePayPeriodWizard
            onCreated={(period) => {
              setForm((f) => ({ ...f, payPeriodId: period.id }));
              setPeriods((prev) => [
                ...prev,
                {
                  id: period.id,
                  type: "SEMANAL",
                  periodNumber: period.periodNumber,
                  agriculturalYear: "",
                  startDate: period.startDate,
                  endDate: period.endDate,
                  isClosed: false,
                },
              ]);
            }}
          />
        </div>
      )}

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

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Date */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-finca-700">
            Fecha
          </label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            required
            className="w-full rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400 touch-target"
          />
        </div>

        {/* Worker */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-finca-700">
            Trabajador
          </label>
          <select
            value={form.workerId}
            onChange={(e) => setForm({ ...form, workerId: e.target.value })}
            required
            className="w-full rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400 touch-target"
          >
            <option value="">Seleccionar...</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.fullName}
              </option>
            ))}
          </select>
        </div>

        {/* Activity */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-finca-700">
            Actividad
          </label>
          <select
            value={form.activityId}
            onChange={(e) => handleActivityChange(e.target.value)}
            required
            className="w-full rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400 touch-target"
          >
            <option value="">Seleccionar...</option>
            {activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        {/* Lote — optional for beneficio activities */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-finca-700">
            Lote
            {selectedActivity?.isBeneficio && (
              <span className="ml-1 font-normal text-finca-400">(opcional)</span>
            )}
          </label>
          <select
            value={form.loteId}
            onChange={(e) => setForm({ ...form, loteId: e.target.value })}
            className="w-full rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400 touch-target"
          >
            <option value="">Sin lote</option>
            {lotes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        {/* Quantity + Unit Price (side by side) */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-finca-700">
              Cantidad
              {selectedActivity && (
                <span className="ml-1 font-normal text-finca-400">
                  ({selectedActivity.unit.toLowerCase()})
                </span>
              )}
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              required
              inputMode="decimal"
              className="w-full rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm tabular-nums text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400 touch-target"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-finca-700">
              Precio (Q)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.unitPrice}
              onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
              required
              inputMode="decimal"
              className="w-full rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm tabular-nums text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400 touch-target"
              placeholder="0.00"
            />
          </div>
        </div>

        {/* Calculated total */}
        {quantity > 0 && unitPrice > 0 && (
          <div className="rounded-lg bg-earth-50 px-4 py-3">
            <p className="text-sm text-earth-700">
              Total devengado:{" "}
              <span className="font-semibold tabular-nums">
                Q{totalEarned.toLocaleString("es-GT", { minimumFractionDigits: 2 })}
              </span>
            </p>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-finca-700">
            Notas <span className="font-normal text-finca-400">(opcional)</span>
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            maxLength={500}
            className="w-full rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400"
            placeholder="Observaciones..."
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-finca-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-finca-800 disabled:opacity-50 touch-target"
        >
          {saving
            ? "Guardando..."
            : isOnline
              ? "Guardar"
              : "Guardar Offline"}
        </button>
      </form>
      </>
      )}
    </div>
  );
}
