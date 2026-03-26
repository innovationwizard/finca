"use client";

// =============================================================================
// src/app/(authenticated)/trabajadores/nuevo/page.tsx — New worker form
// =============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateISO } from "@/lib/utils/format";

export default function NuevoTrabajadorPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    fullName: "",
    dpi: "",
    nit: "",
    bankAccount: "",
    phone: "",
    isMinor: false,
    startDate: formatDateISO(new Date()),
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (field: string, value: string | boolean) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    if (!form.fullName.trim()) {
      setError("El nombre es requerido");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          dpi: form.dpi.trim() || null,
          nit: form.nit.trim() || null,
          bankAccount: form.bankAccount.trim() || null,
          phone: form.phone.trim() || null,
          isMinor: form.isMinor,
          isActive: true,
          startDate: form.startDate || null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/trabajadores/${data.id}` as never);
      } else {
        const err = await res.json();
        setError(err.error ?? "Error al guardar");
      }
    } catch {
      setError("Error de conexión");
    }

    setSaving(false);
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-8 sm:px-6">
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="mb-4 text-sm text-finca-500 hover:text-finca-700"
        >
          ← Volver a Trabajadores
        </button>
        <h1 className="text-2xl font-semibold tracking-tight text-finca-900">
          Nuevo Trabajador
        </h1>
        <p className="mt-1 text-sm text-finca-500">
          Registrar un nuevo trabajador en el directorio
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Full Name */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-finca-700">
            Nombre completo <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.fullName}
            onChange={(e) => handleChange("fullName", e.target.value)}
            required
            className="w-full rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400 touch-target"
            placeholder="Nombre y apellidos"
          />
        </div>

        {/* DPI */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-finca-700">
            DPI <span className="font-normal text-finca-400">(13 dígitos)</span>
          </label>
          <input
            type="text"
            value={form.dpi}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "").slice(0, 13);
              handleChange("dpi", val);
            }}
            inputMode="numeric"
            maxLength={13}
            className="w-full rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm tabular-nums text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400 touch-target"
            placeholder="0000000000000"
          />
        </div>

        {/* NIT */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-finca-700">
            NIT <span className="font-normal text-finca-400">(opcional)</span>
          </label>
          <input
            type="text"
            value={form.nit}
            onChange={(e) => handleChange("nit", e.target.value)}
            className="w-full rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400 touch-target"
            placeholder="000000-0"
          />
        </div>

        {/* Bank Account + Phone side by side */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-finca-700">
              Cuenta bancaria <span className="font-normal text-finca-400">(opcional)</span>
            </label>
            <input
              type="text"
              value={form.bankAccount}
              onChange={(e) => handleChange("bankAccount", e.target.value)}
              className="w-full rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400 touch-target"
              placeholder="Número de cuenta"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-finca-700">
              Teléfono <span className="font-normal text-finca-400">(opcional)</span>
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
              className="w-full rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400 touch-target"
              placeholder="0000-0000"
            />
          </div>
        </div>

        {/* Start Date */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-finca-700">
            Fecha de inicio
          </label>
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => handleChange("startDate", e.target.value)}
            className="w-full rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400 touch-target"
          />
        </div>

        {/* Is Minor */}
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <input
            type="checkbox"
            id="isMinor"
            checked={form.isMinor}
            onChange={(e) => handleChange("isMinor", e.target.checked)}
            className="h-4 w-4 rounded border-finca-300 text-earth-600 focus:ring-earth-400"
          />
          <label htmlFor="isMinor" className="text-sm text-amber-800">
            Es menor de edad
          </label>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-finca-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-finca-800 disabled:opacity-50 touch-target"
        >
          {saving ? "Guardando..." : "Crear Trabajador"}
        </button>
      </form>
    </div>
  );
}
