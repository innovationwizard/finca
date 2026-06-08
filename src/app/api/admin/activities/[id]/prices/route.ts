// =============================================================================
// src/app/api/admin/activities/[id]/prices/route.ts
// Effective-dated price vigencias for an activity.
//   GET    — list the activity's price schedule
//   POST   — add a vigencia { price, effectiveFrom, note? } (start date may be future)
//   DELETE — remove a vigencia (?priceId=...), keeping at least one
// Access: MASTER, ADMIN. Past ActivityRecord.unitPrice snapshots are never touched.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, SETTINGS_ROLES } from "@/lib/auth/guards";
import { activityPriceCreateSchema } from "@/lib/validators/settings";
import { toPriceSchedule, todayISOGuatemala } from "@/lib/pricing/activity-prices";
import { currentPrice } from "@/lib/pricing/resolve-price";

// Recompute Activity.defaultPrice = price effective today, after any change.
async function resyncDefaultPrice(activityId: string) {
  const prices = await prisma.activityPrice.findMany({
    where: { activityId },
    orderBy: { effectiveFrom: "asc" },
  });
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    select: { defaultPrice: true },
  });
  const fallback = activity?.defaultPrice != null ? Number(activity.defaultPrice) : null;
  const today = todayISOGuatemala();
  const current = currentPrice(toPriceSchedule(prices), fallback, today);
  await prisma.activity.update({ where: { id: activityId }, data: { defaultPrice: current } });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const prices = await prisma.activityPrice.findMany({
    where: { activityId: id },
    orderBy: { effectiveFrom: "asc" },
  });
  return NextResponse.json(toPriceSchedule(prices));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await request.json();
  const parsed = activityPriceCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const activity = await prisma.activity.findUnique({ where: { id } });
  if (!activity) {
    return NextResponse.json({ error: "Actividad no encontrada" }, { status: 404 });
  }

  const effectiveFrom = new Date(parsed.data.effectiveFrom);

  const clash = await prisma.activityPrice.findUnique({
    where: { activityId_effectiveFrom: { activityId: id, effectiveFrom } },
  });
  if (clash) {
    return NextResponse.json(
      { error: `Ya existe un precio con vigencia ${parsed.data.effectiveFrom}` },
      { status: 409 },
    );
  }

  const created = await prisma.activityPrice.create({
    data: {
      activityId: id,
      price: parsed.data.price,
      effectiveFrom,
      note: parsed.data.note ?? null,
      createdBy: auth.id,
    },
  });

  await resyncDefaultPrice(id);

  await prisma.auditLog.create({
    data: {
      userId: auth.id,
      action: "CREATE",
      tableName: "activity_prices",
      recordId: created.id,
      newValues: { activityId: id, price: parsed.data.price, effectiveFrom: parsed.data.effectiveFrom },
    },
  });

  return NextResponse.json(created, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const effectiveFromStr = new URL(request.url).searchParams.get("effectiveFrom");
  if (!effectiveFromStr || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFromStr)) {
    return NextResponse.json({ error: "effectiveFrom (AAAA-MM-DD) es requerido" }, { status: 400 });
  }

  const count = await prisma.activityPrice.count({ where: { activityId: id } });
  if (count <= 1) {
    return NextResponse.json(
      { error: "No se puede eliminar el único precio de la actividad" },
      { status: 409 },
    );
  }

  const price = await prisma.activityPrice.findUnique({
    where: { activityId_effectiveFrom: { activityId: id, effectiveFrom: new Date(effectiveFromStr) } },
  });
  if (!price) {
    return NextResponse.json({ error: "Precio no encontrado" }, { status: 404 });
  }

  await prisma.activityPrice.delete({ where: { id: price.id } });
  await resyncDefaultPrice(id);

  await prisma.auditLog.create({
    data: {
      userId: auth.id,
      action: "DELETE",
      tableName: "activity_prices",
      recordId: price.id,
      oldValues: { price: Number(price.price), effectiveFrom: effectiveFromStr },
    },
  });

  return NextResponse.json({ ok: true });
}
