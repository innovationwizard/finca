"use client";

// =============================================================================
// Inline wizard shown when no open pay period exists.
// Guides non-technical field users step-by-step through creating one.
// =============================================================================

import { useState, useEffect } from "react";
import { Calendar, CheckCircle2, ChevronRight, Loader2 } from "lucide-react";
import { formatDateISO } from "@/lib/utils/format";

type Props = {
  onCreated: (period: { id: string; periodNumber: number; startDate: string; endDate: string }) => void;
  suggestedStartDate?: string;
  initialStep?: 1 | 2 | 3;
};

type Step = 1 | 2 | 3;

const STEP_LABELS: Record<Step, string> = {
  1: "Entender el problema",
  2: "Elegir fechas",
  3: "Crear período",
};

export function CreatePayPeriodWizard({ onCreated, suggestedStartDate, initialStep = 1 }: Props) {
  const [step, setStep] = useState<Step>(initialStep);
  const [startDate, setStartDate] = useState(suggestedStartDate ?? "");
  const [endDate, setEndDate] = useState("");
  const [periodType, setPeriodType] = useState<"SEMANAL" | "CATORCENA">("SEMANAL");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch configured period type to auto-calculate end date
  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((settings: { key: string; value: string }[] | null) => {
        if (!settings) return;
        const setting = settings.find((s) => s.key === "pay_period_type");
        if (setting?.value) {
          const parsed = JSON.parse(setting.value);
          if (parsed === "CATORCENA" || parsed === "SEMANAL") {
            setPeriodType(parsed);
          }
        }
      })
      .catch(() => {});
  }, []);

  // Auto-suggest: use suggestedStartDate if provided, otherwise today
  useEffect(() => {
    if (!startDate) {
      setStartDate(suggestedStartDate ?? formatDateISO(new Date()));
    }
  }, [startDate, suggestedStartDate]);

  // Auto-calculate end date when start date or period type changes
  useEffect(() => {
    if (startDate) {
      const start = new Date(startDate + "T00:00:00");
      const days = periodType === "CATORCENA" ? 13 : 6;
      const end = new Date(start);
      end.setDate(end.getDate() + days);
      setEndDate(formatDateISO(end));
    }
  }, [startDate, periodType]);

  const handleCreate = async () => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/pay-periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al crear el período");
        setSaving(false);
        return;
      }

      const created = await res.json();
      onCreated({
        id: created.id,
        periodNumber: created.periodNumber,
        startDate: created.startDate?.split?.("T")?.[0] ?? startDate,
        endDate: created.endDate?.split?.("T")?.[0] ?? endDate,
      });
    } catch {
      setError("Error de conexión. Verifique su internet e intente de nuevo.");
      setSaving(false);
    }
  };

  const daysLabel = periodType === "CATORCENA" ? "14 días" : "7 días";

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5">
      {/* ── Progress indicator ─────────────────────────────────────────── */}
      <div className="mb-6 flex items-center gap-1">
        {([1, 2, 3] as Step[]).map((s) => (
          <div key={s} className="flex items-center gap-1">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                s < step
                  ? "bg-emerald-500 text-white"
                  : s === step
                    ? "bg-amber-500 text-white"
                    : "bg-stone-200 text-stone-400"
              }`}
            >
              {s < step ? <CheckCircle2 className="h-4 w-4" /> : s}
            </div>
            <span
              className={`hidden text-xs sm:inline ${
                s === step ? "font-semibold text-amber-800" : s < step ? "text-emerald-700" : "text-stone-400"
              }`}
            >
              {STEP_LABELS[s]}
            </span>
            {s < 3 && (
              <ChevronRight className="mx-1 h-3 w-3 text-stone-300" />
            )}
          </div>
        ))}
      </div>

      {/* ── Step 1: Explain ────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <Calendar className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <h3 className="text-sm font-semibold text-amber-900">
                Falta crear un período de pago
              </h3>
              <p className="mt-1 text-sm text-amber-800">
                Para registrar actividades, primero necesita un período de pago activo.
                Un período de pago define el rango de fechas para agrupar los registros
                de trabajo (por ejemplo, del lunes al domingo).
              </p>
              <p className="mt-2 text-sm text-amber-800">
                Vamos a crear uno ahora. Solo necesita confirmar las fechas.
              </p>
            </div>
          </div>
          <button
            onClick={() => setStep(2)}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-700"
          >
            Entendido, continuar
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Step 2: Pick dates ─────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-amber-900">
              Fechas del período de pago
            </h3>
            <p className="mt-1 text-xs text-amber-700">
              Su configuración es: <strong>{periodType === "CATORCENA" ? "Catorcena" : "Semanal"}</strong> ({daysLabel}).
              La fecha de fin se calcula automáticamente.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-amber-900">
                Fecha de inicio
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-amber-300 bg-white px-4 py-2.5 text-sm text-stone-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-amber-900">
                Fecha de fin
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-amber-300 bg-white px-4 py-2.5 text-sm text-stone-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>

          {startDate && endDate && (
            <div className="rounded-lg bg-white/70 px-4 py-3">
              <p className="text-sm text-amber-900">
                Se creará el período:{" "}
                <strong>
                  {new Date(startDate + "T00:00:00").toLocaleDateString("es-GT", { day: "numeric", month: "long", year: "numeric" })}
                </strong>
                {" — "}
                <strong>
                  {new Date(endDate + "T00:00:00").toLocaleDateString("es-GT", { day: "numeric", month: "long", year: "numeric" })}
                </strong>
              </p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => setStep(1)}
              className="rounded-lg border border-amber-300 px-4 py-2.5 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100"
            >
              Atrás
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!startDate || !endDate}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
            >
              Revisar y crear
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Confirm and create ─────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-amber-900">
              Confirmar nuevo período de pago
            </h3>
          </div>

          <div className="rounded-lg bg-white/70 px-4 py-3 text-sm text-amber-900 space-y-1">
            <p>
              <span className="text-amber-600">Tipo:</span>{" "}
              <strong>{periodType === "CATORCENA" ? "Catorcena" : "Semanal"}</strong>
            </p>
            <p>
              <span className="text-amber-600">Inicio:</span>{" "}
              <strong>
                {new Date(startDate + "T00:00:00").toLocaleDateString("es-GT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </strong>
            </p>
            <p>
              <span className="text-amber-600">Fin:</span>{" "}
              <strong>
                {new Date(endDate + "T00:00:00").toLocaleDateString("es-GT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </strong>
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => setStep(2)}
              disabled={saving}
              className="rounded-lg border border-amber-300 px-4 py-2.5 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
            >
              Atrás
            </button>
            <button
              onClick={handleCreate}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Crear período de pago
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
