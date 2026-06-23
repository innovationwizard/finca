// =============================================================================
// src/app/(authenticated)/admin/actividades/page.tsx — Activity & Pay Settings
// Access: MASTER, ADMIN
// =============================================================================

import { prisma } from "@/lib/prisma";
import { requireRole, SETTINGS_ROLES } from "@/lib/auth/guards";
import { toPriceSchedule } from "@/lib/pricing/activity-prices";
import { ActivitiesManager } from "./activities-manager";
import { PayCycleSettings } from "./pay-cycle-settings";
import { SeptimoHolidaysSettings } from "./septimo-holidays-settings";

export const metadata = { title: "Actividades y Configuración — Finca Danilandia" };

export default async function ActivitiesAdminPage() {
  await requireRole(...SETTINGS_ROLES);

  const [activities, settings, holidays] = await Promise.all([
    prisma.activity.findMany({
      orderBy: { sortOrder: "asc" },
      include: { prices: { orderBy: { effectiveFrom: "asc" } } },
    }),
    prisma.systemSetting.findMany({ orderBy: [{ group: "asc" }, { key: "asc" }] }),
    prisma.holiday.findMany({ orderBy: { date: "asc" } }),
  ]);

  const serializedHolidays = holidays.map((h) => ({
    id: h.id,
    date: h.date.toISOString().split("T")[0],
    name: h.name,
    recurringAnnual: h.recurringAnnual,
  }));

  const serializedActivities = activities.map(({ prices, ...a }) => ({
    ...a,
    defaultPrice: Number(a.defaultPrice),
    minQtyAlert: a.minQtyAlert ? Number(a.minQtyAlert) : null,
    maxQtyAlert: a.maxQtyAlert ? Number(a.maxQtyAlert) : null,
    priceSchedule: toPriceSchedule(prices),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }));

  const serializedSettings = settings.map((s) => ({
    ...s,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Pay Cycle Settings */}
      <div className="mb-12">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          Configuración de Planilla
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Período de pago y parámetros generales.
        </p>
        <div className="mt-6">
          <PayCycleSettings settings={serializedSettings} />
        </div>
      </div>

      {/* Séptimo + holidays */}
      <div className="mb-12">
        <h2 className="text-xl font-semibold tracking-tight text-stone-900">
          Feriados
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Días no laborables. Reducen los días requeridos para ganar el séptimo. (El
          monto del séptimo se configura arriba.)
        </p>
        <div className="mt-6">
          <SeptimoHolidaysSettings holidays={serializedHolidays} />
        </div>
      </div>

      {/* Activity Catalog */}
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-stone-900">
          Catálogo de Actividades
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Configurar unidades de medida, precios y alertas por actividad.
        </p>
        <div className="mt-6">
          <ActivitiesManager initialData={serializedActivities} />
        </div>
      </div>
    </div>
  );
}
