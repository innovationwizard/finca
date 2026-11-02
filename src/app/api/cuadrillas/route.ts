import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, HARVEST_DESK_ROLES, HARVEST_ROLES } from "@/lib/auth/guards";
import { cuadrillaWriteSchema } from "@/lib/validators/cuadrilla";

function serialize(row: {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date | null;
}) {
  return {
    id: row.id,
    name: row.name,
    startDate: row.startDate.toISOString().slice(0, 10),
    endDate: row.endDate ? row.endDate.toISOString().slice(0, 10) : null,
  };
}

export async function GET() {
  const auth = await apiRequireRole(...HARVEST_ROLES);
  if (auth instanceof NextResponse) return auth;

  const rows = await prisma.cuadrilla.findMany({
    orderBy: [{ name: "asc" }, { startDate: "asc" }],
  });
  return NextResponse.json(rows.map(serialize));
}

export async function POST(request: NextRequest) {
  const auth = await apiRequireRole(...HARVEST_DESK_ROLES);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = cuadrillaWriteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const row = await prisma.cuadrilla.create({
    data: {
      name: parsed.data.name,
      startDate: new Date(`${parsed.data.startDate}T00:00:00.000Z`),
      endDate: parsed.data.endDate ? new Date(`${parsed.data.endDate}T00:00:00.000Z`) : null,
    },
  });
  return NextResponse.json(serialize(row), { status: 201 });
}
