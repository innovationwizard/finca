// =============================================================================
// src/app/api/workers/route.ts — Worker list + create
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, READ_ALL_ROLES, WRITE_ROLES } from "@/lib/auth/guards";
import { workerCreateSchema } from "@/lib/validators/worker";

export async function GET(request: NextRequest) {
  const auth = await apiRequireRole(...READ_ALL_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("active") === "true";
  const filter = searchParams.get("filter"); // "active" | "inactive" | "all"

  const where =
    filter === "active"
      ? { isActive: true }
      : filter === "inactive"
        ? { isActive: false }
        : activeOnly
          ? { isActive: true }
          : undefined;

  const workers = await prisma.worker.findMany({
    where,
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

  return NextResponse.json(
    workers.map((w) => ({
      ...w,
      startDate: w.startDate?.toISOString().split("T")[0] ?? null,
    })),
  );
}

export async function POST(request: NextRequest) {
  const auth = await apiRequireRole(...WRITE_ROLES);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "JSON inválido" },
      { status: 400 },
    );
  }

  const parsed = workerCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { startDate, endDate, ...rest } = parsed.data;

  // Check DPI uniqueness if provided
  if (rest.dpi) {
    const existing = await prisma.worker.findUnique({
      where: { dpi: rest.dpi },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Ya existe un trabajador con ese DPI" },
        { status: 409 },
      );
    }
  }

  const worker = await prisma.worker.create({
    data: {
      ...rest,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    },
  });

  return NextResponse.json(
    {
      id: worker.id,
      fullName: worker.fullName,
      dpi: worker.dpi,
      isActive: worker.isActive,
    },
    { status: 201 },
  );
}
