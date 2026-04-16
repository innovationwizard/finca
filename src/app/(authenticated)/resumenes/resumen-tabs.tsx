"use client";

// =============================================================================
// src/app/(authenticated)/resumenes/resumen-tabs.tsx — Tab UI for resúmenes
// =============================================================================

import { useState } from "react";
import { formatGTQ } from "@/lib/utils/format";

type WeeklyRow = {
  periodNumber: number;
  startDate: string;
  endDate: string;
  workerName: string;
  totalEarned: number;
  totalToPay: number;
};

type PersonalRow = {
  workerName: string;
  totalEarned: number;
  bonification: number;
  advances: number;
  totalToPay: number;
  dpi: string;
  bankAccount: string;
  bank: string;
};

type LoteRow = {
  loteName: string;
  activityName: string;
  totalEarned: number;
};

type Tab = "semana" | "persona" | "lote";

const TABS: { key: Tab; label: string }[] = [
  { key: "semana", label: "Por Semana" },
  { key: "persona", label: "Por Persona" },
  { key: "lote", label: "Por Lote" },
];

export function ResumenTabs({
  weeklyRows,
  personalRows,
  loteRows,
}: {
  weeklyRows: WeeklyRow[];
  personalRows: PersonalRow[];
  loteRows: LoteRow[];
}) {
  const [tab, setTab] = useState<Tab>("semana");

  return (
    <div>
      {/* Tab bar */}
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-lg bg-finca-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-white text-finca-900 shadow-sm"
                : "text-finca-500 hover:text-finca-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "semana" && <TabSemana rows={weeklyRows} />}
      {tab === "persona" && <TabPersona rows={personalRows} />}
      {tab === "lote" && <TabLote rows={loteRows} />}
    </div>
  );
}

// ── Por Semana ──────────────────────────────────────────────────────────────

function TabSemana({ rows }: { rows: WeeklyRow[] }) {
  // Group by period
  const periods = new Map<number, { startDate: string; endDate: string; rows: WeeklyRow[] }>();
  for (const r of rows) {
    const existing = periods.get(r.periodNumber);
    if (existing) {
      existing.rows.push(r);
    } else {
      periods.set(r.periodNumber, { startDate: r.startDate, endDate: r.endDate, rows: [r] });
    }
  }

  const grandTotal = rows.reduce((s, r) => s + r.totalEarned, 0);

  return (
    <div className="space-y-6">
      {/* Grand total */}
      <div className="rounded-xl border border-earth-200 bg-earth-50 px-6 py-4">
        <p className="text-sm font-medium text-earth-600">Total general</p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-earth-900">
          {formatGTQ(grandTotal)}
        </p>
      </div>

      {[...periods.entries()]
        .sort(([a], [b]) => a - b)
        .map(([periodNum, period]) => {
          const periodTotal = period.rows.reduce((s, r) => s + r.totalEarned, 0);
          const fmtStart = new Date(period.startDate + "T00:00:00").toLocaleDateString("es-GT", { day: "numeric", month: "short" });
          const fmtEnd = new Date(period.endDate + "T00:00:00").toLocaleDateString("es-GT", { day: "numeric", month: "short", year: "numeric" });

          return (
            <div key={periodNum}>
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-finca-900">
                  Semana {periodNum}
                  <span className="ml-2 font-normal text-finca-400">
                    {fmtStart} — {fmtEnd}
                  </span>
                </h3>
                <span className="text-sm font-semibold tabular-nums text-finca-700">
                  {formatGTQ(periodTotal)}
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-finca-200 bg-white shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-finca-100 bg-finca-50/50">
                      <th className="px-4 py-3 font-medium text-finca-600">Nombre Trabajador</th>
                      <th className="px-4 py-3 text-right font-medium text-finca-600">Total Devengado</th>
                      <th className="px-4 py-3 text-right font-medium text-finca-600">Total a Pagar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-finca-50">
                    {period.rows
                      .sort((a, b) => a.workerName.localeCompare(b.workerName))
                      .map((r, i) => (
                        <tr key={i} className="hover:bg-finca-50/30">
                          <td className="px-4 py-2.5 font-medium text-finca-900">{r.workerName}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-finca-700">
                            {formatGTQ(r.totalEarned)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-finca-900">
                            {formatGTQ(r.totalToPay)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-finca-200 bg-finca-50/30">
                      <td className="px-4 py-3 font-semibold text-finca-900">Total</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-finca-900">
                        {formatGTQ(periodTotal)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-finca-900">
                        {formatGTQ(periodTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          );
        })}
    </div>
  );
}

// ── Por Persona ─────────────────────────────────────────────────────────────

function TabPersona({ rows }: { rows: PersonalRow[] }) {
  const grandTotalEarned = rows.reduce((s, r) => s + r.totalEarned, 0);
  const grandBonification = rows.reduce((s, r) => s + r.bonification, 0);
  const grandAdvances = rows.reduce((s, r) => s + r.advances, 0);
  const grandTotalToPay = rows.reduce((s, r) => s + r.totalToPay, 0);

  return (
    <div className="space-y-6">
      {/* Grand total */}
      <div className="rounded-xl border border-earth-200 bg-earth-50 px-6 py-4">
        <p className="text-sm font-medium text-earth-600">Total a pagar</p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-earth-900">
          {formatGTQ(grandTotalToPay)}
        </p>
        <p className="mt-1 text-xs text-earth-500">
          {rows.length} trabajadores
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-finca-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-finca-100 bg-finca-50/50">
              <th className="px-4 py-3 font-medium text-finca-600">Nombre Trabajador</th>
              <th className="px-4 py-3 text-right font-medium text-finca-600">Total Devengado</th>
              <th className="px-4 py-3 text-right font-medium text-finca-600">Bonificación</th>
              <th className="px-4 py-3 text-right font-medium text-finca-600">Anticipos</th>
              <th className="px-4 py-3 text-right font-medium text-finca-600">Total a Pagar</th>
              <th className="px-4 py-3 font-medium text-finca-600">DPI</th>
              <th className="px-4 py-3 font-medium text-finca-600"># de Cuenta</th>
              <th className="px-4 py-3 font-medium text-finca-600">Banco</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-finca-50">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-finca-50/30">
                <td className="px-4 py-2.5 font-medium text-finca-900">{r.workerName}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-finca-700">
                  {formatGTQ(r.totalEarned)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-finca-700">
                  {r.bonification > 0 ? formatGTQ(r.bonification) : <span className="text-finca-300">—</span>}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-finca-700">
                  {r.advances > 0 ? formatGTQ(r.advances) : <span className="text-finca-300">—</span>}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-finca-900">
                  {formatGTQ(r.totalToPay)}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-finca-500">
                  {r.dpi || <span className="text-finca-300">—</span>}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-finca-500">
                  {r.bankAccount || <span className="text-finca-300">—</span>}
                </td>
                <td className="px-4 py-2.5 text-finca-500">
                  {r.bank || <span className="text-finca-300">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-finca-200 bg-finca-50/30">
              <td className="px-4 py-3 font-semibold text-finca-900">Total</td>
              <td className="px-4 py-3 text-right tabular-nums font-semibold text-finca-900">
                {formatGTQ(grandTotalEarned)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-semibold text-finca-900">
                {grandBonification > 0 ? formatGTQ(grandBonification) : "—"}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-semibold text-finca-900">
                {grandAdvances > 0 ? formatGTQ(grandAdvances) : "—"}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-bold text-finca-900">
                {formatGTQ(grandTotalToPay)}
              </td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Por Lote ────────────────────────────────────────────────────────────────

function TabLote({ rows }: { rows: LoteRow[] }) {
  // Group by lote
  const lotes = new Map<string, { activities: { name: string; total: number }[]; total: number }>();
  for (const r of rows) {
    const existing = lotes.get(r.loteName);
    if (existing) {
      existing.activities.push({ name: r.activityName, total: r.totalEarned });
      existing.total += r.totalEarned;
    } else {
      lotes.set(r.loteName, {
        activities: [{ name: r.activityName, total: r.totalEarned }],
        total: r.totalEarned,
      });
    }
  }

  const grandTotal = rows.reduce((s, r) => s + r.totalEarned, 0);

  return (
    <div className="space-y-6">
      {/* Grand total */}
      <div className="rounded-xl border border-earth-200 bg-earth-50 px-6 py-4">
        <p className="text-sm font-medium text-earth-600">Total por lotes</p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-earth-900">
          {formatGTQ(grandTotal)}
        </p>
        <p className="mt-1 text-xs text-earth-500">
          {lotes.size} lotes
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-finca-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-finca-100 bg-finca-50/50">
              <th className="px-4 py-3 font-medium text-finca-600">Lote</th>
              <th className="px-4 py-3 font-medium text-finca-600">Actividad</th>
              <th className="px-4 py-3 text-right font-medium text-finca-600">Total Devengado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-finca-50">
            {[...lotes.entries()]
              .sort(([, a], [, b]) => b.total - a.total)
              .map(([loteName, data]) => (
                <>
                  {data.activities
                    .sort((a, b) => b.total - a.total)
                    .map((act, i) => (
                      <tr key={`${loteName}-${act.name}`} className="hover:bg-finca-50/30">
                        {i === 0 ? (
                          <td
                            className="px-4 py-2.5 font-semibold text-finca-900"
                            rowSpan={data.activities.length}
                          >
                            {loteName}
                          </td>
                        ) : null}
                        <td className="px-4 py-2.5 text-finca-700">{act.name}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-finca-700">
                          {formatGTQ(act.total)}
                        </td>
                      </tr>
                    ))}
                  {/* Lote subtotal */}
                  <tr className="bg-finca-50/40">
                    <td className="px-4 py-2 text-xs font-semibold text-finca-500" colSpan={2}>
                      Subtotal {loteName}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-xs font-semibold text-finca-700">
                      {formatGTQ(data.total)}
                    </td>
                  </tr>
                </>
              ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-finca-200 bg-finca-50/30">
              <td className="px-4 py-3 font-semibold text-finca-900" colSpan={2}>
                Total
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-bold text-finca-900">
                {formatGTQ(grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
