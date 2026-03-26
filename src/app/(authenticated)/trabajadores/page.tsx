// =============================================================================
// src/app/(authenticated)/trabajadores/page.tsx — Worker directory
// =============================================================================

import { prisma } from "@/lib/prisma";
import { requireRole, READ_ALL_ROLES, WRITE_ROLES } from "@/lib/auth/guards";
import { WorkersList } from "./workers-list";
import Link from "next/link";

export const metadata = { title: "Trabajadores" };

export default async function TrabajadoresPage() {
  const user = await requireRole(...READ_ALL_ROLES);

  const workers = await prisma.worker.findMany({
    select: {
      id: true,
      fullName: true,
      dpi: true,
      phone: true,
      isActive: true,
      isMinor: true,
      startDate: true,
    },
    orderBy: { fullName: "asc" },
  });

  const serialized = workers.map((w) => ({
    ...w,
    startDate: w.startDate?.toISOString().split("T")[0] ?? null,
  }));

  const canWrite = WRITE_ROLES.includes(user.role);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-finca-900">
            Trabajadores
          </h1>
          <p className="mt-1 text-sm text-finca-500">
            Directorio de personal · {workers.filter((w) => w.isActive).length} activos de{" "}
            {workers.length} total
          </p>
        </div>
        {canWrite && (
          <Link
            href={"/trabajadores/nuevo" as never}
            className="inline-flex items-center justify-center rounded-lg bg-finca-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-finca-800 touch-target"
          >
            + Nuevo Trabajador
          </Link>
        )}
      </div>

      {/* Worker list */}
      <div className="mt-6">
        <WorkersList workers={serialized} />
      </div>
    </div>
  );
}
