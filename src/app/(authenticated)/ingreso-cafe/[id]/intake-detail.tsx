"use client";

// =============================================================================
// src/app/(authenticated)/ingreso-cafe/[id]/intake-detail.tsx — Detail + actions
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
}: {
  intake: IntakeData;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

  const handleAdvanceStatus = async () => {
    if (!nextStatus) return;
    setError(null);
    setSuccess(null);
    setSaving(true);

    const payload: Record<string, unknown> = { status: nextStatus };

    // If advancing to PERGAMINO or beyond and we have pergamino weight
    if (
      STATUS_ORDER.indexOf(nextStatus) >= STATUS_ORDER.indexOf("PERGAMINO") &&
      formPergamino > 0
    ) {
      payload.pesoPergaminoQq = formPergamino;
    }

    // If advancing to DESPULPADO, set processedDate
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
            {COFFEE_TYPE_LABELS[intake.coffeeType] ?? intake.coffeeType} &middot;{" "}
            {intake.source === "COSECHA" ? "Cosecha Propia" : "Compra"}
          </p>
        </div>
        <span
          className={`inline-flex self-start rounded-full px-3 py-1 text-sm font-medium ${
            intake.status === "DESPACHADO"
              ? "bg-finca-100 text-finca-800"
              : "bg-blue-100 text-blue-800"
          }`}
        >
          {STATUS_LABELS[intake.status] ?? intake.status}
        </span>
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

      {/* Info Card */}
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
                    <dt className="text-xs text-finca-400">Cuenta Bancaria</dt>
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
                    <dt className="text-xs text-finca-400">Estado de Pago</dt>
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
                <dt className="text-xs text-finca-400">Código de Despacho</dt>
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
                <dt className="text-xs text-finca-400">Fecha de Despacho</dt>
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

      {/* Pergamino Weight Input (show when status >= PERGAMINO or to pre-fill) */}
      {canWrite &&
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
                  className="w-full rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm tabular-nums text-finca-900 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400 touch-target"
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
      {canWrite && nextStatus && (
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
