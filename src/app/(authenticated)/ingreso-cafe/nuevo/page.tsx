"use client";

// =============================================================================
// src/app/(authenticated)/ingreso-cafe/nuevo/page.tsx — New coffee intake form
// =============================================================================

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { formatDateISO } from "@/lib/utils/format";

type LoteOption = {
  id: string;
  name: string;
};

type FormState = {
  date: string;
  coffeeType: "CEREZA" | "PERGAMINO" | "ORO";
  source: "COSECHA" | "COMPRA";
  loteId: string;
  supplierName: string;
  procedencia: string;
  supplierAccount: string;
  pricePerQq: string;
  bultos: string;
  pesoNetoQq: string;
  notes: string;
};

export default function NuevoIngresoPage() {
  const router = useRouter();

  const [lotes, setLotes] = useState<LoteOption[]>([]);
  const [form, setForm] = useState<FormState>({
    date: formatDateISO(new Date()),
    coffeeType: "CEREZA",
    source: "COSECHA",
    loteId: "",
    supplierName: "",
    procedencia: "",
    supplierAccount: "",
    pricePerQq: "",
    bultos: "",
    pesoNetoQq: "",
    notes: "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load lotes from API
  useEffect(() => {
    async function loadLotes() {
      try {
        const res = await fetch("/api/lotes?active=true");
        if (res.ok) {
          const data = await res.json();
          setLotes(data);
        }
      } catch {
        // Lotes will be empty — user can still register COMPRA
      }
    }
    loadLotes();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);

    // Client-side validation
    if (form.source === "COSECHA" && !form.loteId) {
      setError("Seleccionar lote para café de cosecha propia");
      setSaving(false);
      return;
    }
    if (form.source === "COMPRA" && !form.supplierName.trim()) {
      setError("Ingresar nombre del proveedor para compras");
      setSaving(false);
      return;
    }

    const pesoNeto = parseFloat(form.pesoNetoQq);
    if (!pesoNeto || pesoNeto <= 0) {
      setError("El peso neto debe ser mayor a 0");
      setSaving(false);
      return;
    }

    const payload = {
      date: form.date,
      coffeeType: form.coffeeType,
      source: form.source,
      loteId: form.source === "COSECHA" ? form.loteId || null : null,
      supplierName:
        form.source === "COMPRA" ? form.supplierName.trim() || null : null,
      procedencia:
        form.source === "COMPRA" ? form.procedencia.trim() || null : null,
      supplierAccount:
        form.source === "COMPRA"
          ? form.supplierAccount.trim() || null
          : null,
      pricePerQq:
        form.source === "COMPRA" && form.pricePerQq
          ? parseFloat(form.pricePerQq)
          : null,
      bultos: form.bultos ? parseInt(form.bultos, 10) : null,
      pesoNetoQq: pesoNeto,
      notes: form.notes.trim() || null,
    };

    try {
      const res = await fetch("/api/ingreso-cafe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const created = await res.json();
        setSuccess(`Ingreso ${created.code} creado exitosamente`);
        setTimeout(() => {
          router.push("/ingreso-cafe" as never);
        }, 1500);
      } else {
        const err = await res.json();
        setError(err.error ?? "Error al guardar");
      }
    } catch {
      setError("Error de conexión. Intentar de nuevo.");
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
          &larr; Volver a Ingreso de Café
        </button>
        <h1 className="text-2xl font-semibold tracking-tight text-finca-900">
          Nuevo Ingreso de Café
        </h1>
        <p className="mt-1 text-sm text-finca-500">
          Registrar café recibido en el beneficio
        </p>
      </div>

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

        {/* Coffee Type */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-finca-700">
            Tipo de Café
          </label>
          <div className="flex gap-2">
            {(["CEREZA", "PERGAMINO", "ORO"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setForm({ ...form, coffeeType: type })}
                className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                  form.coffeeType === type
                    ? "border-earth-500 bg-earth-50 text-earth-700"
                    : "border-finca-200 bg-white text-finca-600 hover:bg-finca-50"
                }`}
              >
                {type === "CEREZA"
                  ? "Cereza"
                  : type === "PERGAMINO"
                    ? "Pergamino"
                    : "Oro"}
              </button>
            ))}
          </div>
        </div>

        {/* Source toggle */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-finca-700">
            Origen
          </label>
          <div className="flex gap-2">
            {(["COSECHA", "COMPRA"] as const).map((src) => (
              <button
                key={src}
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    source: src,
                    loteId: "",
                    supplierName: "",
                    procedencia: "",
                    supplierAccount: "",
                    pricePerQq: "",
                  })
                }
                className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                  form.source === src
                    ? "border-finca-700 bg-finca-900 text-white"
                    : "border-finca-200 bg-white text-finca-600 hover:bg-finca-50"
                }`}
              >
                {src === "COSECHA" ? "Cosecha Propia" : "Compra"}
              </button>
            ))}
          </div>
        </div>

        {/* COSECHA: Lote dropdown */}
        {form.source === "COSECHA" && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-finca-700">
              Lote
            </label>
            <select
              value={form.loteId}
              onChange={(e) => setForm({ ...form, loteId: e.target.value })}
              required
              className="w-full rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400 touch-target"
            >
              <option value="">Seleccionar lote...</option>
              {lotes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* COMPRA: Supplier fields */}
        {form.source === "COMPRA" && (
          <>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-finca-700">
                Nombre del Proveedor
              </label>
              <input
                type="text"
                value={form.supplierName}
                onChange={(e) =>
                  setForm({ ...form, supplierName: e.target.value })
                }
                required
                maxLength={200}
                className="w-full rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400 touch-target"
                placeholder="Nombre completo del proveedor"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-finca-700">
                Procedencia{" "}
                <span className="font-normal text-finca-400">(opcional)</span>
              </label>
              <input
                type="text"
                value={form.procedencia}
                onChange={(e) =>
                  setForm({ ...form, procedencia: e.target.value })
                }
                maxLength={200}
                className="w-full rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400 touch-target"
                placeholder="Lugar de origen del café"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-finca-700">
                Cuenta Bancaria{" "}
                <span className="font-normal text-finca-400">(opcional)</span>
              </label>
              <input
                type="text"
                value={form.supplierAccount}
                onChange={(e) =>
                  setForm({ ...form, supplierAccount: e.target.value })
                }
                maxLength={100}
                className="w-full rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400 touch-target"
                placeholder="Número de cuenta para pago"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-finca-700">
                Precio por QQ (Q){" "}
                <span className="font-normal text-finca-400">(opcional)</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.pricePerQq}
                onChange={(e) =>
                  setForm({ ...form, pricePerQq: e.target.value })
                }
                inputMode="decimal"
                className="w-full rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm tabular-nums text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400 touch-target"
                placeholder="0.00"
              />
            </div>
          </>
        )}

        {/* Bultos + Peso neto */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-finca-700">
              Bultos{" "}
              <span className="font-normal text-finca-400">(opcional)</span>
            </label>
            <input
              type="number"
              step="1"
              min="0"
              value={form.bultos}
              onChange={(e) => setForm({ ...form, bultos: e.target.value })}
              inputMode="numeric"
              className="w-full rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm tabular-nums text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400 touch-target"
              placeholder="0"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-finca-700">
              Peso Neto (qq)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={form.pesoNetoQq}
              onChange={(e) => setForm({ ...form, pesoNetoQq: e.target.value })}
              required
              inputMode="decimal"
              className="w-full rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm tabular-nums text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400 touch-target"
              placeholder="0.00"
            />
          </div>
        </div>

        {/* Calculated total for COMPRA */}
        {form.source === "COMPRA" &&
          form.pricePerQq &&
          form.pesoNetoQq &&
          parseFloat(form.pricePerQq) > 0 &&
          parseFloat(form.pesoNetoQq) > 0 && (
            <div className="rounded-lg bg-earth-50 px-4 py-3">
              <p className="text-sm text-earth-700">
                Total compra:{" "}
                <span className="font-semibold tabular-nums">
                  Q
                  {(
                    parseFloat(form.pricePerQq) * parseFloat(form.pesoNetoQq)
                  ).toLocaleString("es-GT", { minimumFractionDigits: 2 })}
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
            maxLength={1000}
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
          {saving ? "Guardando..." : "Registrar Ingreso"}
        </button>
      </form>
    </div>
  );
}
