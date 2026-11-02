import { requireRole, HARVEST_DESK_ROLES } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { HarvestNav } from "@/components/harvest/harvest-nav";
import { CuadrillasManager } from "./cuadrillas-manager";

export const metadata = { title: "Cuadrillas" };

export default async function CuadrillasPage() {
  const user = await requireRole(...HARVEST_DESK_ROLES);
  const rows = await prisma.cuadrilla.findMany({
    orderBy: [{ name: "asc" }, { startDate: "asc" }],
  });
  const serialized = rows.map((row) => ({
    id: row.id,
    name: row.name,
    startDate: row.startDate.toISOString().slice(0, 10),
    endDate: row.endDate ? row.endDate.toISOString().slice(0, 10) : null,
  }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-4">
      <HarvestNav role={user.role} />
      <h1 className="mt-4 text-2xl font-semibold text-finca-900">Cuadrillas</h1>
      <p className="text-sm text-finca-500">
        Una lista. Cada persona pertenece a una. Cambiar el nombre cambia a todas las personas de esa cuadrilla.
      </p>
      <CuadrillasManager initialRows={serialized} />
    </div>
  );
}
