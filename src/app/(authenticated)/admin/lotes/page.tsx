// =============================================================================
// src/app/(authenticated)/admin/lotes/page.tsx — Lot Area Management
// Access: MASTER, ADMIN
// =============================================================================

import { prisma } from "@/lib/prisma";
import { requireRole, SETTINGS_ROLES } from "@/lib/auth/guards";
import { LotesManager } from "./lotes-manager";

export const metadata = { title: "Gestión de Lotes — Finca Danilandia" };

export default async function LotesAdminPage() {
  await requireRole(...SETTINGS_ROLES);

  const lotes = await prisma.lote.findMany({
    orderBy: { sortOrder: "asc" },
  });

  // Serialize Decimal fields for client component
  const serialized = lotes.map((l) => ({
    ...l,
    areaManzanas: l.areaManzanas ? Number(l.areaManzanas) : null,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          Gestión de Lotes
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Configurar área, plantas y estado de cada lote de la finca.
        </p>
      </div>
      <LotesManager initialData={serialized} />
    </div>
  );
}
