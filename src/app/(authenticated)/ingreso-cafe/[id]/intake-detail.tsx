"use client";

// =============================================================================
// src/app/(authenticated)/ingreso-cafe/[id]/intake-detail.tsx — Detail + edit + delete
// =============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  formatDateShort,
  formatDecimal,
  formatGTQ,
  formatRendimiento,
} from "@/lib/utils/format";
import {
  Coffee,
  Truck,
  MapPin,
  Landmark,
  Package,
  Scale,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Pencil,
  Trash2,
} from "lucide-react";

type IntakeData = {
  id: string;
  code: string;
  date: string;
  coffeeType: string;
  source: string;
  loteId: string | null;
  supplierName: string | null;
  procedencia: string | null;
  supplierAccount: string | null;
  pricePerQq: number | null;
  paymentStatus: string | null;
  bultos: number | null;
  pesoNetoQq: number;
  pesoPergaminoQq: number | null;
  rendimiento: number | null;
  status: string;
  processedDate: string | null;
  dispatchDate: string | null;
  dispatchCode: string | null;
  cuppingScore: number | null;
  notes: string | null;
  lote: { id: string; name: string } | null;
  createdAt: string;
};

type LoteOption = {
  id: string;
  name: string;
};

type EditForm = {
  date: string;
  coffeeType: string;
  source: string;
  loteId: string;
  supplierName: string;
  procedencia: string;
  supplierAccount: string;
  pricePerQq: string;
  bultos: string;
  pesoNetoQq: string;
  notes: string;
};

const STATUS_ORDER = [
  "RECIBIDO",
  "DESPULPADO",
  "SECANDO",
  "PERGAMINO",
  "ENVASADO",
  "DESPACHADO",
] as const;

const STATUS_LABELS: Record<string, string> = {
  RECIBIDO: "Recibido",
  DESPULPADO: "Despulpado",
  SECANDO: "Secando",
  PERGAMINO: "Pergamino",
  ENVASADO: "Envasado",
  DESPACHADO: "Despachado",
};

const COFFEE_TYPE_LABELS: Record<string, string> = {
  CEREZA: "Cereza",
  PERGAMINO: "Pergamino",
  ORO: "Oro",
};

export function IntakeDetail({
  intake,
  canWrite,
  canDelete,
  lotes,
}: {
  intake: IntakeData;
  canWrite: boolean;
  canDelete: boolean;
  lotes: LoteOption[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({
    date: intake.date,
    coffeeType: intake.coffeeType,
    source: intake.source,
    loteId: intake.loteId ?? "",
    supplierName: intake.supplierName ?? "",
    procedencia: intake.procedencia ?? "",
    supplierAccount: intake.supplierAccount ?? "",
    pricePerQq: intake.pricePerQq?.toString() ?? "",
    bultos: intake.bultos?.toString() ?? "",
    pesoNetoQq: intake.pesoNetoQq.toString(),
    notes: intake.notes ?? "",
  });

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Pergamino weight form
  const [pesoPergamino, setPesoPergamino] = useState(
    intake.pesoPergaminoQq?.toString() ?? "",
  );

  const currentStatusIdx = STATUS_ORDER.indexOf(
    intake.status as (typeof STATUS_ORDER)[number],
  );
  const nextStatus =
    currentStatusIdx < STATUS_ORDER.length - 1
      ? STATUS_ORDER[currentStatusIdx + 1]
      : null;

  // Computed rendimiento from form
  const formPergamino = parseFloat(pesoPergamino);
  const computedRendimiento =
    formPergamino > 0 ? intake.pesoNetoQq / formPergamino : null;

  const rendimientoAlert =
    computedRendimiento !== null &&
    (computedRendimiento < 4.0 || computedRendimiento > 7.0);

  const handleStartEdit = () => {
    setEditForm({
      date: intake.date,
      coffeeType: intake.coffeeType,
      source: intake.source,
      loteId: intake.loteId ?? "",
      supplierName: intake.supplierName ?? "",
      procedencia: intake.procedencia ?? "",
      supplierAccount: intake.supplierAccount ?? "",
      pricePerQq: intake.pricePerQq?.toString() ?? "",
      bultos: intake.bultos?.toString() ?? "",
      pesoNetoQq: intake.pesoNetoQq.toString(),
      notes: intake.notes ?? "",
    });
    setEditing(true);
    setError(null);
    setSuccess(null);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setError(null);
  };

  const handleSaveEdit = async () => {
    setError(null);
    setSuccess(null);

    const pesoNeto = parseFloat(editForm.pesoNetoQq);
    if (!pesoNeto || pesoNeto <= 0) {
      setError("El peso neto debe ser mayor a 0");
      return;
    }

    if (editForm.source === "COSECHA" && !editForm.loteId) {
      setError("Seleccionar lote para café de cosecha propia");
      return;
    }
    if (editForm.source === "COMPRA" && !editForm.supplierName.trim()) {
      setError("Ingresar nombre del proveedor para compras");
      return;
    }

    setSaving(true);

    const payload: Record<string, unknown> = {
      date: editForm.date,
      coffeeType: editForm.coffeeType,
      source: editForm.source,
      loteId:
        editForm.source === "COSECHA" ? editForm.loteId || null : null,
      supplierName:
        editForm.source === "COMPRA"
          ? editForm.supplierName.trim() || null
          : null,
      procedencia:
        editForm.source === "COMPRA"
          ? editForm.procedencia.trim() || null
          : null,
      supplierAccount:
        editForm.source === "COMPRA"
          ? editForm.supplierAccount.trim() || null
          : null,
      pricePerQq:
        editForm.source === "COMPRA" && editForm.pricePerQq
          ? parseFloat(editForm.pricePerQq)
          : null,
      bultos: editForm.bultos ? parseInt(editForm.bultos, 10) : null,
      pesoNetoQq: pesoNeto,
      notes: editForm.notes.trim() || null,
    };

    try {
      const res = await fetch(`/api/ingreso-cafe/${intake.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setSuccess("Ingreso actualizado exitosamente");
        setEditing(false);
        setTimeout(() => router.refresh(), 800);
      } else {
        let msg = "Error al actualizar";
        try {
          const err = await res.json();
          msg = err.error ?? msg;
        } catch {
          msg = `Error del servidor (${res.status})`;
        }
        setError(msg);
      }
    } catch {
      setError("Error de conexión");
    }

    setSaving(false);
  };

  const handleDelete = async () => {
    setError(null);
    setSaving(true);

    try {
      const res = await fetch(`/api/ingreso-cafe/${intake.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        router.push("/ingreso-cafe" as never);
      } else {
        let msg = "Error al eliminar";
        try {
          const err = await res.json();
          msg = err.error ?? msg;
        } catch {
          msg = `Error del servidor (${res.status})`;
        }
        setError(msg);
        setConfirmDelete(false);
      }
    } catch {
      setError("Error de conexión");
      setConfirmDelete(false);
    }

    setSaving(false);
  };

  const handleAdvanceStatus = async () => {
    if (!nextStatus) return;
    setError(null);
    setSuccess(null);
    setSaving(true);

    const payload: Record<string, unknown> = { status: nextStatus };

    if (
      STATUS_ORDER.indexOf(nextStatus) >= STATUS_ORDER.indexOf("PERGAMINO") &&
      formPergamino > 0
    ) {
      payload.pesoPergaminoQq = formPergamino;
    }

    if (nextStatus === "DESPULPADO") {
      payload.processedDate = new Date().toISOString().split("T")[0];
    }

    try {
      const res = await fetch(`/api/ingreso-cafe/${intake.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setSuccess(`Estado actualizado a ${STATUS_LABELS[nextStatus]}`);
        setTimeout(() => router.refresh(), 1000);
      } else {
        const err = await res.json();
        setError(err.error ?? "Error al actualizar");
      }
    } catch {
      setError("Error de conexión");
    }

    setSaving(false);
  };

  const handleSavePergamino = async () => {
    if (!formPergamino || formPergamino <= 0) {
      setError("Ingresar peso pergamino válido");
      return;
    }

    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      const res = await fetch(`/api/ingreso-cafe/${intake.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pesoPergaminoQq: formPergamino }),
      });

      if (res.ok) {
        setSuccess("Peso pergamino actualizado");
        setTimeout(() => router.refresh(), 1000);
      } else {
        const err = await res.json();
        setError(err.error ?? "Error al actualizar");
      }
    } catch {
      setError("Error de conexión");
    }

    setSaving(false);
  };

  // ─── Input class helper ────────────────────────────────────────────
  const inputClass =
    "w-full rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400 touch-target";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Back link */}
      <Link
        href={"/ingreso-cafe" as never}
        className="mb-4 inline-block text-sm text-finca-500 hover:text-finca-700"
      >
        &larr; Volver a Ingreso de Café
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-finca-900">
            {intake.code}
          </h1>
          <p className="mt-1 text-sm text-finca-500">
            {formatDateShort(intake.date)} &middot;{" "}
            {COFFEE_TYPE_LABELS[intake.coffeeType] ?? intake.coffeeType}{" "}
            &middot;{" "}
            {intake.source === "COSECHA" ? "Cosecha Propia" : "Compra"}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <span
            className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${
              intake.status === "DESPACHADO"
                ? "bg-finca-100 text-finca-800"
                : "bg-blue-100 text-blue-800"
            }`}
          >
            {STATUS_LABELS[intake.status] ?? intake.status}
          </span>
          {canWrite && !editing && (
            <button
              onClick={handleStartEdit}
              className="inline-flex items-center gap-1.5 rounded-lg border border-finca-200 bg-white px-3 py-1.5 text-sm font-medium text-finca-600 transition-colors hover:bg-finca-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </button>
          )}
          {canDelete && !editing && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
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

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-4">
          <p className="mb-3 text-sm font-medium text-red-800">
            ¿Eliminar ingreso {intake.code}? Esta acción no se puede deshacer.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              disabled={saving}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {saving ? "Eliminando..." : "Sí, eliminar"}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              disabled={saving}
              className="rounded-lg border border-finca-200 bg-white px-4 py-2 text-sm font-medium text-finca-600 transition-colors hover:bg-finca-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── EDIT FORM ── */}
      {editing && (
        <div className="mb-6 rounded-xl border border-earth-300 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-earth-600">
            Editar Ingreso
          </h2>
          <div className="space-y-4">
            {/* Date */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-finca-700">
                Fecha
              </label>
              <input
                type="date"
                value={editForm.date}
                onChange={(e) =>
                  setEditForm({ ...editForm, date: e.target.value })
                }
                required
                className={inputClass}
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
                    onClick={() =>
                      setEditForm({ ...editForm, coffeeType: type })
                    }
                    className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                      editForm.coffeeType === type
                        ? "border-earth-500 bg-earth-50 text-earth-700"
                        : "border-finca-200 bg-white text-finca-600 hover:bg-finca-50"
                    }`}
                  >
                    {COFFEE_TYPE_LABELS[type]}
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
                      setEditForm({
                        ...editForm,
                        source: src,
                        loteId: "",
                        supplierName: "",
                        procedencia: "",
                        supplierAccount: "",
                        pricePerQq: "",
                      })
                    }
                    className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                      editForm.source === src
                        ? "border-finca-700 bg-finca-900 text-white"
                        : "border-finca-200 bg-white text-finca-600 hover:bg-finca-50"
                    }`}
                  >
                    {src === "COSECHA" ? "Cosecha Propia" : "Compra"}
                  </button>
                ))}
              </div>
            </div>

            {/* COSECHA: Lote */}
            {editForm.source === "COSECHA" && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-finca-700">
                  Lote
                </label>
                <select
                  value={editForm.loteId}
                  onChange={(e) =>
                    setEditForm({ ...editForm, loteId: e.target.value })
                  }
                  required
                  className={inputClass}
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
            {editForm.source === "COMPRA" && (
              <>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-finca-700">
                    Nombre del Proveedor
                  </label>
                  <input
                    type="text"
                    value={editForm.supplierName}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        supplierName: e.target.value,
                      })
                    }
                    required
                    maxLength={200}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-finca-700">
                    Procedencia{" "}
                    <span className="font-normal text-finca-400">
                      (opcional)
                    </span>
                  </label>
                  <input
                    type="text"
                    value={editForm.procedencia}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        procedencia: e.target.value,
                      })
                    }
                    maxLength={200}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-finca-700">
                    Cuenta Bancaria{" "}
                    <span className="font-normal text-finca-400">
                      (opcional)
                    </span>
                  </label>
                  <input
                    type="text"
                    value={editForm.supplierAccount}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        supplierAccount: e.target.value,
                      })
                    }
                    maxLength={100}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-finca-700">
                    Precio por QQ (Q){" "}
                    <span className="font-normal text-finca-400">
                      (opcional)
                    </span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.pricePerQq}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        pricePerQq: e.target.value,
                      })
                    }
                    inputMode="decimal"
                    className={`${inputClass} tabular-nums`}
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
                  value={editForm.bultos}
                  onChange={(e) =>
                    setEditForm({ ...editForm, bultos: e.target.value })
                  }
                  inputMode="numeric"
                  className={`${inputClass} tabular-nums`}
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
                  value={editForm.pesoNetoQq}
                  onChange={(e) =>
                    setEditForm({ ...editForm, pesoNetoQq: e.target.value })
                  }
                  required
                  inputMode="decimal"
                  className={`${inputClass} tabular-nums`}
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-finca-700">
                Notas{" "}
                <span className="font-normal text-finca-400">(opcional)</span>
              </label>
              <textarea
                value={editForm.notes}
                onChange={(e) =>
                  setEditForm({ ...editForm, notes: e.target.value })
                }
                rows={2}
                maxLength={1000}
                className="w-full rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={saving}
                className="rounded-lg bg-finca-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-finca-800 disabled:opacity-50"
              >
                {saving ? "Guardando..." : "Guardar Cambios"}
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={saving}
                className="rounded-lg border border-finca-200 bg-white px-5 py-2.5 text-sm font-medium text-finca-600 transition-colors hover:bg-finca-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Pipeline */}
      <div className="mb-8 rounded-xl border border-finca-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-finca-400">
          Estado del Proceso
        </h2>
        <div className="flex items-center gap-1 overflow-x-auto">
          {STATUS_ORDER.map((status, idx) => {
            const isCurrent = intake.status === status;
            const isPast = idx < currentStatusIdx;
            const isFuture = idx > currentStatusIdx;

            return (
              <div key={status} className="flex items-center">
                {idx > 0 && (
                  <ArrowRight
                    className={`mx-1 h-4 w-4 flex-shrink-0 ${
                      isPast ? "text-emerald-400" : "text-finca-200"
                    }`}
                  />
                )}
                <div
                  className={`flex-shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    isCurrent
                      ? "bg-earth-100 text-earth-800 ring-2 ring-earth-400"
                      : isPast
                        ? "bg-emerald-50 text-emerald-700"
                        : isFuture
                          ? "bg-finca-50 text-finca-300"
                          : ""
                  }`}
                >
                  {isPast && (
                    <CheckCircle2 className="mr-1 inline-block h-3 w-3" />
                  )}
                  {STATUS_LABELS[status]}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Info Card (read-only view — hidden when editing) */}
      {!editing && (
        <div className="mb-6 rounded-xl border border-finca-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-finca-400">
            Información del Ingreso
          </h2>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex items-start gap-3">
              <Coffee className="mt-0.5 h-4 w-4 text-finca-400" />
              <div>
                <dt className="text-xs text-finca-400">Tipo de Café</dt>
                <dd className="text-sm font-medium text-finca-900">
                  {COFFEE_TYPE_LABELS[intake.coffeeType] ?? intake.coffeeType}
                </dd>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Package className="mt-0.5 h-4 w-4 text-finca-400" />
              <div>
                <dt className="text-xs text-finca-400">Bultos</dt>
                <dd className="text-sm font-medium text-finca-900">
                  {intake.bultos ?? "—"}
                </dd>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Scale className="mt-0.5 h-4 w-4 text-finca-400" />
              <div>
                <dt className="text-xs text-finca-400">Peso Neto</dt>
                <dd className="text-sm font-medium text-finca-900">
                  {formatDecimal(intake.pesoNetoQq)} qq
                </dd>
              </div>
            </div>

            {intake.pesoPergaminoQq !== null && (
              <div className="flex items-start gap-3">
                <Scale className="mt-0.5 h-4 w-4 text-emerald-500" />
                <div>
                  <dt className="text-xs text-finca-400">Peso Pergamino</dt>
                  <dd className="text-sm font-medium text-finca-900">
                    {formatDecimal(intake.pesoPergaminoQq)} qq
                  </dd>
                </div>
              </div>
            )}

            {intake.rendimiento !== null && (
              <div className="flex items-start gap-3">
                <Coffee className="mt-0.5 h-4 w-4 text-earth-600" />
                <div>
                  <dt className="text-xs text-finca-400">Rendimiento</dt>
                  <dd className="text-sm font-medium text-finca-900">
                    {formatRendimiento(intake.rendimiento)}
                  </dd>
                </div>
              </div>
            )}

            {/* Source-specific fields */}
            {intake.source === "COSECHA" && intake.lote && (
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 text-finca-400" />
                <div>
                  <dt className="text-xs text-finca-400">Lote</dt>
                  <dd className="text-sm font-medium text-finca-900">
                    {intake.lote.name}
                  </dd>
                </div>
              </div>
            )}

            {intake.source === "COMPRA" && (
              <>
                <div className="flex items-start gap-3">
                  <Truck className="mt-0.5 h-4 w-4 text-finca-400" />
                  <div>
                    <dt className="text-xs text-finca-400">Proveedor</dt>
                    <dd className="text-sm font-medium text-finca-900">
                      {intake.supplierName ?? "—"}
                    </dd>
                  </div>
                </div>

                {intake.procedencia && (
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-4 w-4 text-finca-400" />
                    <div>
                      <dt className="text-xs text-finca-400">Procedencia</dt>
                      <dd className="text-sm font-medium text-finca-900">
                        {intake.procedencia}
                      </dd>
                    </div>
                  </div>
                )}

                {intake.supplierAccount && (
                  <div className="flex items-start gap-3">
                    <Landmark className="mt-0.5 h-4 w-4 text-finca-400" />
                    <div>
                      <dt className="text-xs text-finca-400">
                        Cuenta Bancaria
                      </dt>
                      <dd className="text-sm font-medium text-finca-900">
                        {intake.supplierAccount}
                      </dd>
                    </div>
                  </div>
                )}

                {intake.pricePerQq !== null && (
                  <div className="flex items-start gap-3">
                    <Landmark className="mt-0.5 h-4 w-4 text-earth-600" />
                    <div>
                      <dt className="text-xs text-finca-400">Precio por QQ</dt>
                      <dd className="text-sm font-medium text-finca-900">
                        {formatGTQ(intake.pricePerQq)}
                      </dd>
                    </div>
                  </div>
                )}

                {intake.paymentStatus && (
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-finca-400" />
                    <div>
                      <dt className="text-xs text-finca-400">
                        Estado de Pago
                      </dt>
                      <dd className="text-sm font-medium text-finca-900">
                        {intake.paymentStatus}
                      </dd>
                    </div>
                  </div>
                )}
              </>
            )}

            {intake.dispatchCode && (
              <div className="flex items-start gap-3">
                <Truck className="mt-0.5 h-4 w-4 text-finca-400" />
                <div>
                  <dt className="text-xs text-finca-400">
                    Código de Despacho
                  </dt>
                  <dd className="text-sm font-medium text-finca-900">
                    {intake.dispatchCode}
                  </dd>
                </div>
              </div>
            )}

            {intake.dispatchDate && (
              <div className="flex items-start gap-3">
                <Truck className="mt-0.5 h-4 w-4 text-finca-400" />
                <div>
                  <dt className="text-xs text-finca-400">
                    Fecha de Despacho
                  </dt>
                  <dd className="text-sm font-medium text-finca-900">
                    {formatDateShort(intake.dispatchDate)}
                  </dd>
                </div>
              </div>
            )}

            {intake.cuppingScore !== null && (
              <div className="flex items-start gap-3">
                <Coffee className="mt-0.5 h-4 w-4 text-earth-600" />
                <div>
                  <dt className="text-xs text-finca-400">Puntaje Catación</dt>
                  <dd className="text-sm font-medium text-finca-900">
                    {intake.cuppingScore}
                  </dd>
                </div>
              </div>
            )}
          </dl>

          {intake.notes && (
            <div className="mt-4 border-t border-finca-100 pt-4">
              <p className="text-xs text-finca-400">Notas</p>
              <p className="mt-1 text-sm text-finca-700">{intake.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Pergamino Weight Input */}
      {canWrite &&
        !editing &&
        currentStatusIdx >= STATUS_ORDER.indexOf("SECANDO") &&
        intake.status !== "DESPACHADO" && (
          <div className="mb-6 rounded-xl border border-finca-200 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-finca-400">
              Peso Pergamino y Rendimiento
            </h2>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="mb-1.5 block text-sm font-medium text-finca-700">
                  Peso Pergamino (qq)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={pesoPergamino}
                  onChange={(e) => setPesoPergamino(e.target.value)}
                  inputMode="decimal"
                  className={`${inputClass} tabular-nums`}
                  placeholder="0.00"
                />
              </div>

              {computedRendimiento !== null && (
                <div className="flex-1">
                  <p className="text-sm text-finca-600">
                    Rendimiento:{" "}
                    <span className="font-semibold tabular-nums text-finca-900">
                      {formatRendimiento(computedRendimiento)}
                    </span>
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={handleSavePergamino}
                disabled={saving || !formPergamino || formPergamino <= 0}
                className="rounded-lg border border-earth-400 bg-earth-50 px-4 py-2.5 text-sm font-medium text-earth-700 transition-colors hover:bg-earth-100 disabled:opacity-50"
              >
                {saving ? "Guardando..." : "Guardar Peso"}
              </button>
            </div>

            {/* Rendimiento alert */}
            {rendimientoAlert && computedRendimiento !== null && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600" />
                <p className="text-sm text-amber-800">
                  Rendimiento fuera del rango normal (4.0 - 7.0).{" "}
                  {computedRendimiento < 4.0
                    ? "Rendimiento muy bajo — verificar pesaje."
                    : "Rendimiento muy alto — verificar pesaje."}
                </p>
              </div>
            )}
          </div>
        )}

      {/* Advance Status */}
      {canWrite && !editing && nextStatus && (
        <div className="rounded-xl border border-finca-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-finca-400">
            Avanzar Estado
          </h2>
          <p className="mb-4 text-sm text-finca-600">
            Estado actual:{" "}
            <span className="font-medium text-finca-900">
              {STATUS_LABELS[intake.status]}
            </span>{" "}
            &rarr; Siguiente:{" "}
            <span className="font-medium text-finca-900">
              {STATUS_LABELS[nextStatus]}
            </span>
          </p>
          <button
            type="button"
            onClick={handleAdvanceStatus}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-finca-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-finca-800 disabled:opacity-50"
          >
            {saving ? (
              "Actualizando..."
            ) : (
              <>
                Avanzar a {STATUS_LABELS[nextStatus]}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
