"use client";

// =============================================================================
// src/app/(authenticated)/pagos/pagos-view.tsx — Bank CSV export
//
// Pick one of the 3 most recent ended pay periods + the payment type (A/P),
// preview the exact file that will be sent to the bank, and download it. The
// preview IS the file, 1:1. Workers who cannot be paid by file (no bank account,
// or nothing to pay) are listed by name in a warning so none vanish silently.
//
// CSV line (semicolon-delimited, no header):
//   tipo+MM+YY ; bankAccount ; bankCode ; totalToPay(2dp) ; acctType ; FIRSTNAME
//   e.g.  P0526;4029152121;16;452.50;4;ADISTER
// =============================================================================

import { useState, useEffect, useCallback, useMemo } from "react";
import { Download, Loader2, AlertCircle } from "lucide-react";
import { formatGTQ } from "@/lib/utils/format";

// ─── Types ───────────────────────────────────────────────────────────────────

type PayPeriod = {
  id: string;
  periodNumber: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  type: string;
  isClosed: boolean;
};

type PaymentRow = {
  workerId: string;
  workerName: string;
  bankAccount: string;
  totalToPay: number;
};

type PaymentType = "A" | "P";

const PAYMENT_TYPES: { value: PaymentType; label: string }[] = [
  { value: "P", label: "Planilla" },
  { value: "A", label: "Anticipo" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Account type = first digit of the bank account (bank convention:
// 3 = Monetaria, 4 = Ahorro). Column 5 of the CSV line.
function getAccountType(bankAccount: string): string {
  return bankAccount.charAt(0);
}

// Period code = tipo + MM + YY, derived from the period's start date.
// e.g. Planilla, May 2026 → "P0526". Column 1 of the CSV line.
function buildPeriodCode(paymentType: PaymentType, startDateIso: string): string {
  const [year, month] = startDateIso.split("-");
  return `${paymentType}${month}${year.slice(-2)}`;
}

// Timezone-safe short date from a YYYY-MM-DD string (avoids Date parse drift).
function formatDateShort(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}/${y}`;
}

// One CSV line for a payable row. Must stay byte-identical to the file.
function buildCsvLine(
  row: PaymentRow,
  periodCode: string,
  bankCode: string,
): string {
  const amount = row.totalToPay.toFixed(2);
  const acctType = getAccountType(row.bankAccount);
  const firstName = row.workerName.split(" ")[0].toUpperCase();
  return `${periodCode};${row.bankAccount};${bankCode};${amount};${acctType};${firstName}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PagosView({
  periods,
  bankCode,
}: {
  periods: PayPeriod[];
  bankCode: string;
}) {
  const [selectedPeriodId, setSelectedPeriodId] = useState(periods[0]?.id ?? "");
  const [paymentType, setPaymentType] = useState<PaymentType>("P");

  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPeriod = useMemo(
    () => periods.find((p) => p.id === selectedPeriodId) ?? null,
    [periods, selectedPeriodId],
  );

  // ─── Fetch payroll rows for the selected period ──────────────────────────

  const fetchData = useCallback(async () => {
    if (!selectedPeriodId) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/pagos?periodId=${selectedPeriodId}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al cargar datos");
        setRows([]);
      } else {
        setRows(data.rows as PaymentRow[]);
      }
    } catch {
      setError("Error de conexión");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [selectedPeriodId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Partition: what goes IN the file vs what is excluded ────────────────

  // A row is payable (written to the file) iff it has a bank account AND a
  // positive amount. Everything else is surfaced by name so no worker is ever
  // silently left out of a payment file.
  const { included, excluded } = useMemo(() => {
    const inc: PaymentRow[] = [];
    const exc: { row: PaymentRow; reason: string }[] = [];
    for (const r of rows) {
      if (!r.bankAccount) {
        exc.push({ row: r, reason: "sin cuenta bancaria" });
      } else if (r.totalToPay <= 0) {
        exc.push({ row: r, reason: "sin monto a pagar" });
      } else {
        inc.push(r);
      }
    }
    return { included: inc, excluded: exc };
  }, [rows]);

  // ─── CSV content (preview === file, 1:1) ─────────────────────────────────

  const periodCode = selectedPeriod
    ? buildPeriodCode(paymentType, selectedPeriod.startDate)
    : "";

  const csvLines = useMemo(
    () =>
      selectedPeriod
        ? included.map((r) => buildCsvLine(r, periodCode, bankCode))
        : [],
    [included, periodCode, bankCode, selectedPeriod],
  );

  const grandTotal = included.reduce((s, r) => s + r.totalToPay, 0);

  // ─── Download ────────────────────────────────────────────────────────────

  function downloadCSV() {
    if (csvLines.length === 0) return;
    const blob = new Blob([csvLines.join("\n") + "\n"], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${periodCode}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ─── Filter bar: 3 period buttons + tipo de pago ──────────────────── */}
      <div className="rounded-xl border border-finca-200 bg-white p-4 shadow-sm">
        {periods.length === 0 ? (
          <p className="text-sm text-finca-500">
            No hay períodos de pago finalizados todavía.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-finca-500">
                Período de pago
              </label>
              <div className="flex flex-wrap gap-2">
                {periods.map((p, i) => {
                  const selected = p.id === selectedPeriodId;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPeriodId(p.id)}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        selected
                          ? "border-finca-900 bg-finca-900 text-white"
                          : "border-finca-200 bg-finca-50 text-finca-700 hover:bg-finca-100"
                      }`}
                    >
                      <span className="block text-sm font-semibold">
                        Sem {p.periodNumber}
                        {i === 0 ? " · más reciente" : ""}
                      </span>
                      <span
                        className={`block text-xs ${
                          selected ? "text-finca-100" : "text-finca-400"
                        }`}
                      >
                        {formatDateShort(p.startDate)} — {formatDateShort(p.endDate)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-finca-500">
                Tipo de pago
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
        )}
      </div>

      {/* ─── Summary cards: Total a Pagar + Trabajadores (of the FILE) ─────── */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:max-w-md">
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
            {included.length}
          </p>
        </div>
      </div>

      {/* ─── Excluded-workers warning (nobody silently left unpaid) ────────── */}
      {excluded.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {excluded.length}{" "}
            {excluded.length === 1
              ? "trabajador no se incluye"
              : "trabajadores no se incluyen"}{" "}
            en el archivo
          </p>
          <ul className="mt-2 space-y-0.5 text-sm text-amber-700">
            {excluded.map((e) => (
              <li key={e.row.workerId}>
                {e.row.workerName} — {e.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ─── File preview (raw CSV) + download ────────────────────────────── */}
      <div className="mt-6 rounded-xl border border-finca-200 bg-white shadow-sm">
        <div className="border-b border-finca-100 px-4 py-3">
          <p className="text-sm font-medium text-finca-600">
            Vista previa del archivo
            {periodCode ? (
              <span className="ml-2 font-mono text-finca-400">
                {periodCode}.csv
              </span>
            ) : null}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-finca-400" />
            <span className="ml-2 text-sm text-finca-500">Cargando...</span>
          </div>
        ) : error ? (
          <div className="px-4 py-8 text-center text-sm text-red-600">
            {error}
          </div>
        ) : csvLines.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-finca-500">
            No hay pagos para incluir en el archivo.
          </div>
        ) : (
          <pre className="overflow-x-auto px-4 py-3 font-mono text-sm leading-relaxed text-finca-800">
            {csvLines.join("\n")}
          </pre>
        )}

        <div className="border-t border-finca-100 px-4 py-3">
          <button
            onClick={downloadCSV}
            disabled={csvLines.length === 0 || loading}
            className="inline-flex items-center gap-2 rounded-lg bg-earth-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-earth-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Descargar CSV
          </button>
        </div>
      </div>
    </div>
  );
}
