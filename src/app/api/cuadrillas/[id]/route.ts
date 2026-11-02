import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, HARVEST_DESK_ROLES } from "@/lib/auth/guards";
import { cuadrillaWriteSchema } from "@/lib/validators/cuadrilla";

type Params = { params: Promise<{ id: string }> };

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

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await apiRequireRole(...HARVEST_DESK_ROLES);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

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

  try {
    const row = await prisma.cuadrilla.update({
      where: { id },
      data: {
        name: parsed.data.name,
        startDate: new Date(`${parsed.data.startDate}T00:00:00.000Z`),
        endDate: parsed.data.endDate ? new Date(`${parsed.data.endDate}T00:00:00.000Z`) : null,
      },
    });
    return NextResponse.json(serialize(row));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Cuadrilla no encontrada" }, { status: 404 });
    }
    throw err;
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await apiRequireRole(...HARVEST_DESK_ROLES);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  try {
    await prisma.cuadrilla.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Cuadrilla no encontrada" }, { status: 404 });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json(
        { error: "Hay personas en esta cuadrilla" },
        { status: 409 },
      );
    }
    throw err;
  }
  return NextResponse.json({ ok: true });
}
