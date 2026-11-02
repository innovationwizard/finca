"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type DayPoint = { day: string; libras: number };
export type LotePoint = { lote: string; libras: number };
export type MadurezPoint = { name: string; libras: number };

export function KpiCharts({
  days,
  lotes,
  madurez,
}: {
  days: DayPoint[];
  lotes: LotePoint[];
  madurez: MadurezPoint[];
}) {
  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      <Chart title="Libras por día · período abierto" data={days} x="day" />
      <Chart title="Libras por pante · período abierto" data={lotes} x="lote" />
      <Chart title="Maduro e inmaduro · período abierto" data={madurez} x="name" />
    </div>
  );
}

function Chart({
  title,
  data,
  x,
}: {
  title: string;
  data: { libras: number; [key: string]: string | number }[];
  x: string;
}) {
  return (
    <section className="rounded-xl border border-finca-200 bg-white p-3">
      <h2 className="mb-2 text-sm font-medium text-finca-800">{title}</h2>
      {data.length === 0 ? (
        <p className="py-8 text-center text-sm text-finca-400">Sin entregas</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8F5EE" />
            <XAxis dataKey={x} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value) => [`${Number(value).toFixed(2)} lb`, "Libras"]} />
            <Bar dataKey="libras" fill="#245C3E" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
