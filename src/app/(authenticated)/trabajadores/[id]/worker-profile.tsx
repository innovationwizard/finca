"use client";

// =============================================================================
// src/app/(authenticated)/trabajadores/[id]/worker-profile.tsx — Editable profile
// =============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X, Save, User, Phone, CreditCard, Hash, AlertTriangle } from "lucide-react";
import { formatDateShort, formatGTQ } from "@/lib/utils/format";

// ── Types ────────────────────────────────────────────────────────────────────

type ActivityRecord = {
  id: string;
  date: string;
  quantity: number;
  unitPrice: number;
  totalEarned: number;
  activityName: string;
  activityUnit: string;
  loteName: string | null;
};

type PayrollEntry = {
  id: string;
  totalEarned: number;
  totalToPay: number;
  bonification: number;
  advances: number;
  deductions: number;
  isPaid: boolean;
  periodNumber: number;
  agriculturalYear: string;
  startDate: string;
  endDate: string;
};

export type WorkerProfileData = {
  id: string;
  fullName: string;
  dpi: string | null;
  nit: string | null;
  bankAccount: string | null;
  phone: string | null;
  photoUrl: string | null;
  isMinor: boolean;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  activityRecords: ActivityRecord[];
  payrollEntries: PayrollEntry[];
};

type WorkerProfileProps = {
  worker: WorkerProfileData;
  canEdit: boolean;
};

// ── Component ────────────────────────────────────────────────────────────────

export function WorkerProfile({ worker, canEdit }: WorkerProfileProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    fullName: worker.fullName,
    dpi: worker.dpi ?? "",
    nit: worker.nit ?? "",
    bankAccount: worker.bankAccount ?? "",
    phone: worker.phone ?? "",
    isMinor: worker.isMinor,
    isActive: worker.isActive,
    startDate: worker.startDate ?? "",
    endDate: worker.endDate ?? "",
  });

  const handleChange = (field: string, value: string | boolean) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const handleSave = async () => {
    setError(null);
    setSaving(true);

    try {
      const res = await fetch(`/api/workers/${worker.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          dpi: form.dpi.trim() || null,
          nit: form.nit.trim() || null,
          bankAccount: form.bankAccount.trim() || null,
          phone: form.phone.trim() || null,
          isMinor: form.isMinor,
          isActive: form.isActive,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
        }),
      });

      if (res.ok) {
        setIsEditing(false);
        router.refresh();
      } else {
        const err = await res.json();
        setError(err.error ?? "Error al guardar");
      }
    } catch {
      setError("Error de conexión");
    }

    setSaving(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setError(null);
    setForm({
      fullName: worker.fullName,
      dpi: worker.dpi ?? "",
      nit: worker.nit ?? "",
      bankAccount: worker.bankAccount ?? "",
      phone: worker.phone ?? "",
      isMinor: worker.isMinor,
      isActive: worker.isActive,
      startDate: worker.startDate ?? "",
      endDate: worker.endDate ?? "",
    });
  };

  // Aggregate earnings
  const totalEarned = worker.payrollEntries.reduce(
    (sum, p) => sum + p.totalEarned,
    0,
  );
  const totalPaid = worker.payrollEntries.reduce(
    (sum, p) => sum + p.totalToPay,
    0,
  );

  return (
    <div className="space-y-6">
      {/* Personal data card */}
      <div className="rounded-xl border border-finca-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-finca-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-finca-100">
              <User className="h-5 w-5 text-finca-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-finca-900">
                {worker.fullName}
              </h2>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  worker.isActive
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-finca-100 text-finca-500"
                }`}
              >
                {worker.isActive ? "Activo" : "Inactivo"}
              </span>
              {worker.isMinor && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                  <AlertTriangle className="h-3 w-3" />
                  Menor
                </span>
              )}
            </div>
          </div>
          {canEdit && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm font-medium text-finca-700 transition-colors hover:bg-finca-50"
            >
              <Pencil className="h-4 w-4" />
              Editar
            </button>
          )}
          {isEditing && (
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-finca-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-finca-800 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? "Guardando..." : "Guardar"}
              </button>
              <button
                onClick={handleCancel}
                className="inline-flex items-center gap-1.5 rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm font-medium text-finca-500 transition-colors hover:bg-finca-50"
              >
                <X className="h-4 w-4" />
                Cancelar
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
          {/* Full Name */}
          {isEditing ? (
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-finca-400">
                Nombre completo
              </label>
              <input
                type="text"
                value={form.fullName}
                onChange={(e) => handleChange("fullName", e.target.value)}
                className="w-full rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400"
              />
            </div>
          ) : null}

          {/* DPI */}
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-finca-400">
              <Hash className="h-3 w-3" />
              DPI
            </label>
            {isEditing ? (
              <input
                type="text"
                value={form.dpi}
                onChange={(e) =>
                  handleChange("dpi", e.target.value.replace(/\D/g, "").slice(0, 13))
                }
                maxLength={13}
                className="w-full rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm tabular-nums text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400"
              />
            ) : (
              <p className="text-sm tabular-nums text-finca-900">
                {worker.dpi ?? "—"}
              </p>
            )}
          </div>

          {/* NIT */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-finca-400">
              NIT
            </label>
            {isEditing ? (
              <input
                type="text"
                value={form.nit}
                onChange={(e) => handleChange("nit", e.target.value)}
                className="w-full rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400"
              />
            ) : (
              <p className="text-sm text-finca-900">{worker.nit ?? "—"}</p>
            )}
          </div>

          {/* Bank Account */}
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-finca-400">
              <CreditCard className="h-3 w-3" />
              Cuenta bancaria
            </label>
            {isEditing ? (
              <input
                type="text"
                value={form.bankAccount}
                onChange={(e) => handleChange("bankAccount", e.target.value)}
                className="w-full rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400"
              />
            ) : (
              <p className="text-sm text-finca-900">
                {worker.bankAccount ?? "—"}
              </p>
            )}
          </div>

          {/* Phone */}
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-finca-400">
              <Phone className="h-3 w-3" />
              Teléfono
            </label>
            {isEditing ? (
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => handleChange("phone", e.target.value)}
                className="w-full rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400"
              />
            ) : (
              <p className="text-sm text-finca-900">{worker.phone ?? "—"}</p>
            )}
          </div>

          {/* Dates */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-finca-400">
              Fecha inicio
            </label>
            {isEditing ? (
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => handleChange("startDate", e.target.value)}
                className="w-full rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400"
              />
            ) : (
              <p className="text-sm text-finca-900">
                {worker.startDate ? formatDateShort(worker.startDate) : "—"}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-finca-400">
              Fecha fin
            </label>
            {isEditing ? (
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => handleChange("endDate", e.target.value)}
                className="w-full rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400"
              />
            ) : (
              <p className="text-sm text-finca-900">
                {worker.endDate ? formatDateShort(worker.endDate) : "—"}
              </p>
            )}
          </div>

          {/* Is Minor + Is Active toggles in edit mode */}
          {isEditing && (
            <div className="flex gap-6 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm text-finca-700">
                <input
                  type="checkbox"
                  checked={form.isMinor}
                  onChange={(e) => handleChange("isMinor", e.target.checked)}
                  className="h-4 w-4 rounded border-finca-300 text-earth-600 focus:ring-earth-400"
                />
                Menor de edad
              </label>
              <label className="flex items-center gap-2 text-sm text-finca-700">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => handleChange("isActive", e.target.checked)}
                  className="h-4 w-4 rounded border-finca-300 text-earth-600 focus:ring-earth-400"
                />
                Activo
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Earnings summary */}
      {worker.payrollEntries.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-medium text-finca-600">
            Resumen de Pagos
          </h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-finca-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wider text-finca-400">
                Total Devengado
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-finca-900">
                {formatGTQ(totalEarned)}
              </p>
            </div>
            <div className="rounded-xl border border-finca-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wider text-finca-400">
                Total a Pagar
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-finca-900">
                {formatGTQ(totalPaid)}
              </p>
            </div>
            <div className="hidden rounded-xl border border-finca-200 bg-white px-4 py-3 shadow-sm sm:block">
              <p className="text-xs font-medium uppercase tracking-wider text-finca-400">
                Períodos
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-finca-900">
                {worker.payrollEntries.length}
              </p>
            </div>
          </div>

          {/* Payroll entries table */}
          <div className="mt-4 overflow-x-auto rounded-xl border border-finca-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-finca-100 bg-finca-50/50">
                  <th className="px-4 py-3 font-medium text-finca-600">Período</th>
                  <th className="px-4 py-3 font-medium text-finca-600">Año</th>
                  <th className="px-4 py-3 text-right font-medium text-finca-600">
                    Devengado
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-finca-600">
                    A Pagar
                  </th>
                  <th className="px-4 py-3 font-medium text-finca-600">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-finca-50">
                {worker.payrollEntries.map((p) => (
                  <tr
                    key={p.id}
                    className="transition-colors hover:bg-finca-50/30"
                  >
                    <td className="px-4 py-2.5 text-finca-900">
                      Sem. {p.periodNumber}
                    </td>
                    <td className="px-4 py-2.5 text-finca-600">
                      {p.agriculturalYear}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-finca-700">
                      {formatGTQ(p.totalEarned)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-finca-900">
                      {formatGTQ(p.totalToPay)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          p.isPaid
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {p.isPaid ? "Pagado" : "Pendiente"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Activity history */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-finca-600">
          Historial de Actividades
          <span className="ml-2 font-normal text-finca-400">
            (últimos {worker.activityRecords.length} registros)
          </span>
        </h3>

        {worker.activityRecords.length === 0 ? (
          <div className="rounded-xl border border-finca-200 bg-white px-6 py-8 text-center">
            <p className="text-sm text-finca-500">
              No hay registros de actividades para este trabajador.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-finca-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-finca-100 bg-finca-50/50">
                  <th className="px-4 py-3 font-medium text-finca-600">Fecha</th>
                  <th className="px-4 py-3 font-medium text-finca-600">
                    Actividad
                  </th>
                  <th className="px-4 py-3 font-medium text-finca-600">Lote</th>
                  <th className="px-4 py-3 text-right font-medium text-finca-600">
                    Cantidad
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-finca-600">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-finca-50">
                {worker.activityRecords.map((r) => (
                  <tr
                    key={r.id}
                    className="transition-colors hover:bg-finca-50/30"
                  >
                    <td className="px-4 py-2.5 text-finca-600">
                      {formatDateShort(r.date)}
                    </td>
                    <td className="px-4 py-2.5 text-finca-900">
                      {r.activityName}
                    </td>
                    <td className="px-4 py-2.5 text-finca-500">
                      {r.loteName ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-finca-700">
                      {r.quantity.toLocaleString("es-GT", {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-finca-900">
                      {formatGTQ(r.totalEarned)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
