// =============================================================================
// src/app/(authenticated)/admin/trabajadores-duplicados/page.tsx
// Review & merge duplicate worker records. Access: MASTER, ADMIN.
// =============================================================================

import { prisma } from "@/lib/prisma";
import { requireRole, SETTINGS_ROLES } from "@/lib/auth/guards";
import { clusterDuplicates, type WorkerLite } from "@/lib/workers/duplicate-clusters";
import { DedupClient } from "./dedup-client";

export const metadata = { title: "Trabajadores Duplicados — Finca Danilandia" };

export default async function DuplicateWorkersPage() {
  await requireRole(...SETTINGS_ROLES);

  const ws = await prisma.worker.findMany({
    where: { isActive: true },
    select: { id: true, fullName: true, _count: { select: { activityRecords: true, payrollEntries: true } } },
    orderBy: { fullName: "asc" },
  });

  const workers: WorkerLite[] = ws.map((w) => ({
    id: w.id,
    fullName: w.fullName,
    recs: w._count.activityRecords,
    pays: w._count.payrollEntries,
    active: true,
  }));

  const { clusters, singles } = clusterDuplicates(workers);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-stone-900">Trabajadores Duplicados</h1>
      <p className="mt-1 text-sm text-stone-500">
        Registros que parecen ser la misma persona escrita de varias formas. Revíselos y fusione los
        duplicados. Las fusiones reasignan los registros de trabajo y pago al registro que conserve, y
        desactivan los demás (es reversible).
      </p>
      <DedupClient
        clusters={clusters}
        singleCount={singles.length}
        totalWorkers={workers.length}
      />
    </div>
  );
}
