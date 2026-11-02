import { requireRole, HARVEST_DESK_ROLES } from "@/lib/auth/guards";
import { harvestLedger } from "@/lib/harvest/ledger";
import { HarvestNav } from "@/components/harvest/harvest-nav";
import { ContabilidadClient } from "./contabilidad-client";

export const metadata = { title: "Contabilidad de cosecha" };

export default async function ContabilidadPage() {
  const user = await requireRole(...HARVEST_DESK_ROLES);
  const { rows, openPeriod } = await harvestLedger();
  return (
    <div className="mx-auto max-w-6xl px-4 py-4">
      <HarvestNav role={user.role} />
      <h1 className="mt-4 text-2xl font-semibold text-finca-900">Contabilidad de cosecha</h1>
      <p className="text-sm text-finca-500">Monto a pagar de Entrega de Café. El libro lista todas las filas.</p>
      <ContabilidadClient rows={rows} openPeriod={openPeriod} />
    </div>
  );
}
