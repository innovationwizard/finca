// =============================================================================
// src/app/api/admin/lotes/route.ts — Lote management API
// Access: MASTER, ADMIN only
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, SETTINGS_ROLES } from "@/lib/auth/guards";
import { loteCreateSchema, loteUpdateSchema } from "@/lib/validators/settings";
import { slugify, uniqueSlug } from "@/lib/utils/slug";

export async function GET() {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const lotes = await prisma.lote.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      areaManzanas: true,
      plantCount: true,
      density: true,
      variety: true,
      altitudeMasl: true,
      isActive: true,
      sortOrder: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(lotes);
}

export async function POST(request: NextRequest) {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const parsed = loteCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { name, areaManzanas, plantCount, density, variety, isActive } = parsed.data;

  // The name is the finca's own label, stored verbatim. The duplicate check
  // ignores casing so "CORONA" and "Corona" can't both exist.
  const duplicate = await prisma.lote.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { name: true },
  });
  if (duplicate) {
    return NextResponse.json(
      { error: `Ya existe un lote con el nombre "${duplicate.name}"` },
      { status: 409 },
    );
  }

  const [taken, maxSort] = await Promise.all([
    prisma.lote.findMany({ select: { slug: true } }),
    prisma.lote.aggregate({ _max: { sortOrder: true } }),
  ]);
  const slug = uniqueSlug(slugify(name), new Set(taken.map((l) => l.slug)));

  let created;
  try {
    created = await prisma.lote.create({
      data: {
        name,
        slug,
        areaManzanas,
        plantCount,
        density: density ?? null,
        variety: variety ?? null,
        isActive,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    });
  } catch (e) {
    // Two admins creating at once can both clear the checks above; the unique
    // index is the real arbiter, so report its rejection in Spanish.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: `Ya existe un lote con el nombre "${name}"` },
        { status: 409 },
      );
    }
    throw e;
  }

  await prisma.auditLog.create({
    data: {
      userId: auth.id,
      action: "CREATE",
      tableName: "lotes",
      recordId: created.id,
      newValues: {
        name,
        slug,
        areaManzanas: areaManzanas?.toString() ?? null,
        plantCount,
        density: density ?? null,
        variety: variety ?? null,
        isActive,
      },
    },
  });

  return NextResponse.json(created, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const parsed = loteUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { id, ...data } = parsed.data;

  const existing = await prisma.lote.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
  }

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: auth.id,
      action: "UPDATE",
      tableName: "lotes",
      recordId: id,
      oldValues: {
        areaManzanas: existing.areaManzanas?.toString() ?? null,
        plantCount: existing.plantCount,
        density: existing.density,
        isActive: existing.isActive,
      },
      newValues: data,
    },
  });

  const updated = await prisma.lote.update({
    where: { id },
    data: {
      areaManzanas: data.areaManzanas,
      plantCount: data.plantCount,
      density: data.density,
      variety: data.variety,
      altitudeMasl: data.altitudeMasl,
      isActive: data.isActive,
    },
  });

  return NextResponse.json(updated);
}
