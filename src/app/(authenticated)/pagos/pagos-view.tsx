"use client";

// =============================================================================
// src/app/(authenticated)/pagos/pagos-view.tsx — Payments view with filters & CSV
// =============================================================================

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Download,
  Search,
  Calendar,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { formatGTQ } from "@/lib/utils/format";

// ─── Types ───────────────────────────────────────────────────────────────────

type PayPeriod = {
  id: string;
  periodNumber: number;
  startDate: string;
  endDate: string;
  type: string;
  isClosed: boolean;
};

type PaymentRow = {
  workerId: string;
  workerName: string;
  bankAccount: string;
  totalToPay: number;
  totalEarned: number;
  bonification: number;
  advances: number;
  deductions: number;
  periodNumber: number;
  periodStart: string;
  periodEnd: string;
  payPeriodId: string;
};

type FilterMode = "period" | "month" | "week" | "range";
type PaymentType = "A" | "P";

const PAYMENT_TYPES: { value: PaymentType; label: string }[] = [
  { value: "A", label: "Anticipo" },
  { value: "P", label: "Planilla" },
];

const MONTHS = [
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAccountType(bankAccount: string): string {
  const firstDigit = bankAccount.charAt(0);
  if (firstDigit === "3") return "3";
  if (firstDigit === "4") return "4";
  return firstDigit;
}

function getAccountTypeLabel(bankAccount: string): string {
  const firstDigit = bankAccount.charAt(0);
  if (firstDigit === "3") return "Monetaria";
  if (firstDigit === "4") return "Ahorro";
  return "—";
}

function buildPeriodCode(
  paymentType: PaymentType,
  month: number,
  year: number,
): string {
  const mm = String(month).padStart(2, "0");
  const yy = String(year).slice(-2);
  return `${paymentType}${mm}${yy}`;
}

function getISOWeeksForYear(year: number): { value: number; label: string }[] {
  const weeks: { value: number; label: string }[] = [];
  // Calculate week 1 start (Monday of the week containing Jan 4)
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const week1Start = new Date(jan4);
  week1Start.setDate(jan4.getDate() - dayOfWeek + 1);

  for (let w = 1; w <= 53; w++) {
    const start = new Date(week1Start);
    start.setDate(week1Start.getDate() + (w - 1) * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    if (start.getFullYear() > year && w > 1) break;
    const fmt = (d: Date) =>
      d.toLocaleDateString("es-GT", { day: "numeric", month: "short" });
    weeks.push({
      value: w,
      label: `Sem ${w} (${fmt(start)} – ${fmt(end)})`,
    });
  }
  return weeks;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PagosView({
  periods,
  agriculturalYear,
  bankCode,
}: {
  periods: PayPeriod[];
  agriculturalYear: string;
  bankCode: string;
}) {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();

  // Filter state
  const [mode, setMode] = useState<FilterMode>("month");
  const [selectedPeriodId, setSelectedPeriodId] = useState(periods[0]?.id ?? "");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [showRange, setShowRange] = useState(false);
  const [paymentType, setPaymentType] = useState<PaymentType>("A");

  // Data state
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search filter
  const [search, setSearch] = useState("");

  // Available weeks for selected year
  const availableWeeks = useMemo(
    () => getISOWeeksForYear(selectedYear),
    [selectedYear],
  );

  // Available years (from agricultural year)
  const startYear = 2000 + parseInt(agriculturalYear.slice(0, 2), 10);
  const endYear = 2000 + parseInt(agriculturalYear.slice(2, 4), 10);
  const availableYears = [startYear, endYear];

  // ─── Fetch data ──────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("mode", mode);

    if (mode === "period") {
      if (!selectedPeriodId) {
        setLoading(false);
        return;
      }
      params.set("periodId", selectedPeriodId);
    } else if (mode === "month") {
      params.set("month", String(selectedMonth));
      params.set("year", String(selectedYear));
    } else if (mode === "week") {
      params.set("week", String(selectedWeek));
      params.set("year", String(selectedYear));
    } else if (mode === "range") {
      if (!rangeFrom || !rangeTo) {
        setLoading(false);
        return;
      }
      params.set("from", rangeFrom);
      params.set("to", rangeTo);
    }

    try {
      const res = await fetch(`/api/pagos?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al cargar datos");
        setRows([]);
      } else {
        // Aggregate by worker when multiple periods
        const aggregated = aggregateByWorker(data.rows);
        setRows(aggregated);
      }
    } catch {
      setError("Error de conexión");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [mode, selectedPeriodId, selectedMonth, selectedYear, selectedWeek, rangeFrom, rangeTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Aggregate by worker (sum payments across periods) ───────────────────

  function aggregateByWorker(rawRows: PaymentRow[]): PaymentRow[] {
    const map = new Map<string, PaymentRow>();
    for (const row of rawRows) {
      const existing = map.get(row.workerId);
      if (existing) {
        existing.totalToPay += row.totalToPay;
        existing.totalEarned += row.totalEarned;
        existing.bonification += row.bonification;
        existing.advances += row.advances;
        existing.deductions += row.deductions;
      } else {
        map.set(row.workerId, { ...row });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.workerName.localeCompare(b.workerName, "es"),
    );
  }

  // ─── Filtered rows ──────────────────────────────────────────────────────

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.workerName.toLowerCase().includes(q) ||
        r.bankAccount.includes(q),
    );
  }, [rows, search]);

  // ─── Totals ──────────────────────────────────────────────────────────────

  const grandTotal = filteredRows.reduce((s, r) => s + r.totalToPay, 0);
  const missingAccounts = filteredRows.filter((r) => !r.bankAccount).length;

  // ─── CSV download ────────────────────────────────────────────────────────

  function downloadCSV() {
    // Determine month/year for period code
    let codeMonth = selectedMonth;
    let codeYear = selectedYear;

    if (mode === "period") {
      const period = periods.find((p) => p.id === selectedPeriodId);
      if (period) {
        const d = new Date(period.startDate);
        codeMonth = d.getMonth() + 1;
        codeYear = d.getFullYear();
      }
    } else if (mode === "range" && rangeFrom) {
      const d = new Date(rangeFrom);
      codeMonth = d.getMonth() + 1;
      codeYear = d.getFullYear();
    } else if (mode === "week") {
      // Use the week start date
      const jan4 = new Date(selectedYear, 0, 4);
      const dayOfWeek = jan4.getDay() || 7;
      const weekStart = new Date(jan4);
      weekStart.setDate(jan4.getDate() - dayOfWeek + 1 + (selectedWeek - 1) * 7);
      codeMonth = weekStart.getMonth() + 1;
      codeYear = weekStart.getFullYear();
    }

    const periodCode = buildPeriodCode(paymentType, codeMonth, codeYear);

    const csvLines = filteredRows
      .filter((r) => r.totalToPay > 0)
      .map((r) => {
        const acctType = r.bankAccount ? getAccountType(r.bankAccount) : "";
        const amount = r.totalToPay.toFixed(2);
        // Use first name only (match CSV pattern)
        const name = r.workerName.split(" ")[0].toUpperCase();
        return `${periodCode};${r.bankAccount};${bankCode};${amount};${acctType};${name}`;
      })
      .join("\n");

    const blob = new Blob([csvLines + "\n"], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${periodCode}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Resolve context label ─────────────────────────────────────────────

  function getContextLabel(): string {
    if (mode === "period") {
      const p = periods.find((pp) => pp.id === selectedPeriodId);
      return p ? `Período ${p.periodNumber} (${p.startDate} — ${p.endDate})` : "";
    }
    if (mode === "month") {
      const m = MONTHS.find((mm) => mm.value === selectedMonth);
      return `${m?.label ?? ""} ${selectedYear}`;
    }
    if (mode === "week") {
      const w = availableWeeks.find((ww) => ww.value === selectedWeek);
      return w?.label ?? "";
    }
    if (mode === "range") return `${rangeFrom} — ${rangeTo}`;
    return "";
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ─── Filter bar ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-finca-200 bg-white p-4 shadow-sm">
        {/* Mode tabs */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setMode("month")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "month"
                ? "bg-finca-900 text-white"
                : "bg-finca-50 text-finca-600 hover:bg-finca-100"
            }`}
          >
            Por Mes
          </button>
          <button
            onClick={() => setMode("week")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "week"
                ? "bg-finca-900 text-white"
                : "bg-finca-50 text-finca-600 hover:bg-finca-100"
            }`}
          >
            Por Semana
          </button>
          <button
            onClick={() => setMode("period")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "period"
                ? "bg-finca-900 text-white"
                : "bg-finca-50 text-finca-600 hover:bg-finca-100"
            }`}
          >
            Por Período de Pago
          </button>
          <button
            onClick={() => {
              setMode("range");
              setShowRange(true);
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "range"
                ? "bg-finca-900 text-white"
                : "bg-finca-50 text-finca-600 hover:bg-finca-100"
            }`}
          >
            Rango Personalizado
          </button>
        </div>

        {/* Mode-specific controls */}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          {/* Month mode */}
          {mode === "month" && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-finca-500">
                  Mes
                </label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="rounded-lg border border-finca-200 px-3 py-2 text-sm text-finca-900 outline-none focus:border-finca-500 focus:ring-2 focus:ring-finca-100"
                >
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-finca-500">
                  Año
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="rounded-lg border border-finca-200 px-3 py-2 text-sm text-finca-900 outline-none focus:border-finca-500 focus:ring-2 focus:ring-finca-100"
                >
                  {availableYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Week mode */}
          {mode === "week" && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-finca-500">
                  Año
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="rounded-lg border border-finca-200 px-3 py-2 text-sm text-finca-900 outline-none focus:border-finca-500 focus:ring-2 focus:ring-finca-100"
                >
                  {availableYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-[240px]">
                <label className="mb-1 block text-xs font-medium text-finca-500">
                  Semana
                </label>
                <select
                  value={selectedWeek}
                  onChange={(e) => setSelectedWeek(Number(e.target.value))}
                  className="w-full rounded-lg border border-finca-200 px-3 py-2 text-sm text-finca-900 outline-none focus:border-finca-500 focus:ring-2 focus:ring-finca-100"
                >
                  {availableWeeks.map((w) => (
                    <option key={w.value} value={w.value}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Period mode */}
          {mode === "period" && (
            <div className="min-w-[280px]">
              <label className="mb-1 block text-xs font-medium text-finca-500">
                Período de Pago
              </label>
              <select
                value={selectedPeriodId}
                onChange={(e) => setSelectedPeriodId(e.target.value)}
                className="w-full rounded-lg border border-finca-200 px-3 py-2 text-sm text-finca-900 outline-none focus:border-finca-500 focus:ring-2 focus:ring-finca-100"
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    Sem {p.periodNumber} · {p.startDate} — {p.endDate}
                    {p.isClosed ? "" : " (abierto)"}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Range mode */}
          {mode === "range" && showRange && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-finca-500">
                  Desde
                </label>
                <input
                  type="date"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  className="rounded-lg border border-finca-200 px-3 py-2 text-sm text-finca-900 outline-none focus:border-finca-500 focus:ring-2 focus:ring-finca-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-finca-500">
                  Hasta
                </label>
                <input
                  type="date"
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                  className="rounded-lg border border-finca-200 px-3 py-2 text-sm text-finca-900 outline-none focus:border-finca-500 focus:ring-2 focus:ring-finca-100"
                />
              </div>
            </>
          )}

          {/* Payment type */}
          <div>
            <label className="mb-1 block text-xs font-medium text-finca-500">
              Tipo de Pago
            </label>
            <select
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value as PaymentType)}
              className="rounded-lg border border-finca-200 px-3 py-2 text-sm text-finca-900 outline-none focus:border-finca-500 focus:ring-2 focus:ring-finca-100"
            >
              {PAYMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Search + download row */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-finca-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar trabajador o cuenta..."
              className="w-full rounded-lg border border-finca-200 py-2 pl-9 pr-3 text-sm text-finca-900 outline-none focus:border-finca-500 focus:ring-2 focus:ring-finca-100"
            />
          </div>
          <button
            onClick={downloadCSV}
            disabled={filteredRows.length === 0 || loading}
            className="inline-flex items-center gap-2 rounded-lg bg-earth-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-earth-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Descargar CSV
          </button>
        </div>
      </div>

      {/* ─── Summary cards ────────────────────────────────────────────── */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-finca-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-finca-400">
            Total a Pagar
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-finca-900">
            {formatGTQ(grandTotal)}
          </p>
        </div>
        <div className="rounded-xl border border-finca-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-finca-400">
            Trabajadores
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-finca-900">
            {filteredRows.length}
          </p>
        </div>
        <div className="rounded-xl border border-finca-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-finca-400">
            Período
          </p>
          <p className="mt-1 text-sm font-medium text-finca-700">
            {getContextLabel()}
          </p>
        </div>
        {missingAccounts > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-amber-600">
              Sin Cuenta
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xl font-semibold tabular-nums text-amber-700">
              <AlertCircle className="h-4 w-4" />
              {missingAccounts}
            </p>
          </div>
        )}
      </div>

      {/* ─── Data table ───────────────────────────────────────────────── */}
      <div className="mt-6 overflow-x-auto rounded-xl border border-finca-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-finca-400" />
            <span className="ml-2 text-sm text-finca-500">Cargando...</span>
          </div>
        ) : error ? (
          <div className="px-6 py-8 text-center">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <Calendar className="mx-auto h-8 w-8 text-finca-300" />
            <p className="mt-2 text-sm text-finca-500">
              No hay registros de pago para el período seleccionado.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-finca-100 bg-finca-50/50">
                <th className="px-4 py-3 font-medium text-finca-600">
                  Trabajador
                </th>
                <th className="px-4 py-3 font-medium text-finca-600">
                  Cuenta Bancaria
                </th>
                <th className="px-4 py-3 font-medium text-finca-600">
                  Tipo Cuenta
                </th>
                <th className="px-4 py-3 font-medium text-finca-600 text-right">
                  Devengado
                </th>
                <th className="px-4 py-3 font-medium text-finca-600 text-right">
                  Bonificación
                </th>
                <th className="px-4 py-3 font-medium text-finca-600 text-right">
                  Anticipos
                </th>
                <th className="px-4 py-3 font-medium text-finca-600 text-right">
                  Deducciones
                </th>
                <th className="px-4 py-3 font-medium text-finca-600 text-right">
                  A Pagar
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-finca-50">
              {filteredRows.map((r) => (
                <tr key={r.workerId} className="hover:bg-finca-50/30">
                  <td className="px-4 py-2.5 font-medium text-finca-900">
                    {r.workerName}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-finca-600">
                    {r.bankAccount || (
                      <span className="text-amber-500">Sin cuenta</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-finca-500">
                    {r.bankAccount ? getAccountTypeLabel(r.bankAccount) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-finca-700">
                    {formatGTQ(r.totalEarned)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-finca-500">
                    {formatGTQ(r.bonification)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-finca-500">
                    {formatGTQ(r.advances)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-finca-500">
                    {formatGTQ(r.deductions)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-finca-900">
                    {formatGTQ(r.totalToPay)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-finca-200 bg-finca-50/30">
                <td className="px-4 py-3 font-semibold text-finca-900">
                  Total
                </td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-finca-900">
                  {formatGTQ(
                    filteredRows.reduce((s, r) => s + r.totalEarned, 0),
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-finca-500">
                  {formatGTQ(
                    filteredRows.reduce((s, r) => s + r.bonification, 0),
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-finca-500">
                  {formatGTQ(
                    filteredRows.reduce((s, r) => s + r.advances, 0),
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-finca-500">
                  {formatGTQ(
                    filteredRows.reduce((s, r) => s + r.deductions, 0),
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-bold text-finca-900">
                  {formatGTQ(grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* ─── CSV format note ──────────────────────────────────────────── */}
      <p className="mt-4 text-xs text-finca-400">
        El archivo CSV descargado utiliza el formato requerido por el banco:
        código de período, cuenta bancaria, código de banco ({bankCode}), monto,
        tipo de cuenta, nombre. Separador: punto y coma. Sin encabezados.
        Trabajadores sin cuenta bancaria se excluyen del archivo.
      </p>
    </div>
  );
}
