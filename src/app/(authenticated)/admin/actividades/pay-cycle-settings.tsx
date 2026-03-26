"use client";

// =============================================================================
// src/app/(authenticated)/admin/actividades/pay-cycle-settings.tsx
// Pay period type + payroll-related system settings
// =============================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Setting = {
  id: string;
  key: string;
  value: string;
  label: string;
  group: string;
};

const PAY_PERIOD_OPTIONS = [
  { value: "SEMANAL", label: "Semanal (cada 7 días)" },
  { value: "CATORCENA", label: "Catorcena (cada 14 días)" },
] as const;

export function PayCycleSettings({ settings }: { settings: Setting[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const payrollSettings = settings.filter((s) => s.group === "payroll");
  const alertSettings = settings.filter((s) => s.group === "alerts");
  const productionSettings = settings.filter((s) => s.group === "production");

  const saveSetting = async (key: string, value: string) => {
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Error al guardar");
        return;
      }

      setSuccess("Configuración actualizada");
      startTransition(() => router.refresh());
      setTimeout(() => setSuccess(null), 3000);
    } catch {
      setError("Error de conexión");
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* Pay period type — special handling */}
        {payrollSettings.map((setting) => (
          <SettingCard
            key={setting.key}
            setting={setting}
            onSave={saveSetting}
            isPending={isPending}
            options={
              setting.key === "pay_period_type" ? PAY_PERIOD_OPTIONS : undefined
            }
          />
        ))}

        {/* Alert thresholds */}
        {alertSettings.map((setting) => (
          <SettingCard
            key={setting.key}
            setting={setting}
            onSave={saveSetting}
            isPending={isPending}
          />
        ))}

        {/* Production targets */}
        {productionSettings.map((setting) => (
          <SettingCard
            key={setting.key}
            setting={setting}
            onSave={saveSetting}
            isPending={isPending}
          />
        ))}
      </div>
    </div>
  );
}

// ── Individual setting card ──────────────────────────────────────────────────

function SettingCard({
  setting,
  onSave,
  isPending,
  options,
}: {
  setting: Setting;
  onSave: (key: string, value: string) => Promise<void>;
  isPending: boolean;
  options?: readonly { value: string; label: string }[];
}) {
  const parsed = JSON.parse(setting.value);
  const [localValue, setLocalValue] = useState<string>(
    typeof parsed === "string" ? parsed : String(parsed),
  );
  const [isDirty, setIsDirty] = useState(false);

  const handleChange = (val: string) => {
    setLocalValue(val);
    const original = typeof parsed === "string" ? parsed : String(parsed);
    setIsDirty(val !== original);
  };

  const handleSave = async () => {
    // Re-encode: if original was a number, store as number JSON
    const encoded =
      typeof parsed === "number"
        ? JSON.stringify(parseFloat(localValue))
        : JSON.stringify(localValue);

    await onSave(setting.key, encoded);
    setIsDirty(false);
  };

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <label className="block text-sm font-medium text-stone-700">
        {setting.label}
      </label>
      <div className="mt-2">
        {options ? (
          <select
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : typeof parsed === "number" ? (
          <input
            type="number"
            step="any"
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm tabular-nums focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        ) : (
          <input
            type="text"
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        )}
      </div>
      {isDirty && (
        <button
          onClick={handleSave}
          disabled={isPending}
          className="mt-3 w-full rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {isPending ? "Guardando..." : "Guardar cambio"}
        </button>
      )}
      <p className="mt-2 text-xs text-stone-400">
        {setting.key}
      </p>
    </div>
  );
}
