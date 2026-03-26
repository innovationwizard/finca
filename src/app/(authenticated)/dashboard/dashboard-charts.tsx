// =============================================================================
// src/app/(authenticated)/dashboard/dashboard-charts.tsx — Client charts
// =============================================================================
"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WeeklyCoffeeData = {
  week: string;
  qq: number;
};

export type CostPerLoteData = {
  lote: string;
  costo: number;
};

// ---------------------------------------------------------------------------
// Weekly Coffee Intake Chart
// ---------------------------------------------------------------------------

export function WeeklyCoffeeChart({ data }: { data: WeeklyCoffeeData[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-finca-400">
        Sin datos de ingreso de cafe para esta temporada.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E8F5EE" />
        <XAxis
          dataKey="week"
          tick={{ fontSize: 12, fill: "#4DB882" }}
          axisLine={{ stroke: "#C6E5D4" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "#4DB882" }}
          axisLine={{ stroke: "#C6E5D4" }}
          tickLine={false}
          tickFormatter={(v: number) => `${v} qq`}
        />
        <Tooltip
          formatter={(value) => [`${Number(value).toFixed(2)} qq`, "Peso Neto"]}
          labelFormatter={(label) => `Semana ${label}`}
          contentStyle={{
            borderRadius: "0.5rem",
            border: "1px solid #C6E5D4",
            fontSize: "0.875rem",
          }}
        />
        <Bar dataKey="qq" fill="#245C3E" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Cost per Lote Chart
// ---------------------------------------------------------------------------

export function CostPerLoteChart({ data }: { data: CostPerLoteData[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-finca-400">
        Sin datos de costo por lote para esta temporada.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E8F5EE" />
        <XAxis
          dataKey="lote"
          tick={{ fontSize: 12, fill: "#4DB882" }}
          axisLine={{ stroke: "#C6E5D4" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "#4DB882" }}
          axisLine={{ stroke: "#C6E5D4" }}
          tickLine={false}
          tickFormatter={(v: number) => `Q${v.toLocaleString()}`}
        />
        <Tooltip
          formatter={(value) => [
            `Q${Number(value).toLocaleString("es-GT", { minimumFractionDigits: 2 })}`,
            "Costo",
          ]}
          contentStyle={{
            borderRadius: "0.5rem",
            border: "1px solid #C6E5D4",
            fontSize: "0.875rem",
          }}
        />
        <Bar dataKey="costo" fill="#8B6914" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
