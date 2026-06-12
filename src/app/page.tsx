// =============================================================================
// src/app/page.tsx — Maintenance notice (scheduled downtime)
// Temporarily replaces the root landing redirect while the system is being
// updated. To restore normal behavior, revert this file (git) to the prior
// role-aware redirect.
// =============================================================================

import { Sprout, Wrench } from "lucide-react";

export const metadata = {
  title: "Mantenimiento",
};

export default function MaintenancePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-finca-50 px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-finca-200 bg-white px-8 py-10 text-center shadow-sm">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-finca-100">
          <Wrench className="h-8 w-8 text-finca-700" />
        </div>

        <h1 className="text-2xl font-semibold text-finca-900">
          Página en mantenimiento
        </h1>

        <p className="mt-3 leading-relaxed text-finca-600">
          Estamos poniendo a punto el sistema de la finca&nbsp;🌱
          <br />
          Volvemos muy pronto.
        </p>

        <p className="mt-6 text-sm text-finca-500">
          Gracias por su paciencia.
        </p>

        <div className="mt-8 flex items-center justify-center gap-2 text-finca-400">
          <Sprout className="h-4 w-4" aria-hidden="true" />
          <span className="text-xs font-medium">Finca Danilandia</span>
        </div>
      </div>
    </main>
  );
}
