// =============================================================================
// POST /api/planilla/resolve-code
// Resolves an unrecognized activity/lote code from a planilla import, following
// the "¿existe o es nuevo?" tree:
//   mode "map"    → link the code to an existing catalog entry
//   mode "create" → create a new catalog entry (activity: name+unit+price;
//                   lote: name → auto-slug)
// In BOTH cases the code→canonical mapping is LEARNED (NotebookDictionary), so
// the same code resolves automatically on every future import — no re-prompting.
// Access: WRITE_ROLES (the data-entry/import roles).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, WRITE_ROLES } from "@/lib/auth/guards";
import { learnCorrection } from "@/lib/ai/notebook-dictionary";
import { toPriceSchedule, todayISOGuatemala } from "@/lib/pricing/activity-prices";

// Sentinel canonical for "this lote code means no lote" — learned so the same
// code is not re-prompted on future imports.
export const NO_LOTE_SENTINEL = "(sin lote)";

const schema = z.object({
  kind: z.enum(["activity", "lote"]),
  code: z.string().min(1), // the raw code as written in the sheet
  mode: z.enum(["map", "create", "none"]),
  // map:
  targetId: z.string().uuid().optional(),
  // create (activity):
  name: z.string().min(1).max(100).optional(),
  unit: z.enum(["QUINTAL", "MANZANA", "HECTAREA", "DIA"]).optional(),
  price: z.number().min(0).max(100000).optional(),
});

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function POST(request: NextRequest) {
  const auth = await apiRequireRole(...WRITE_ROLES);
  if (auth instanceof NextResponse) return auth;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { kind, code, mode } = parsed.data;

  // "Sin lote" — learn that this lote code maps to no lote, then return empty.
  if (mode === "none") {
    if (kind !== "lote") {
      return NextResponse.json({ error: "'none' solo aplica a lotes" }, { status: 400 });
    }
    await learnCorrection("lote", code, NO_LOTE_SENTINEL);
    return NextResponse.json({ id: "", name: NO_LOTE_SENTINEL });
  }

  let resolved: { id: string; name: string };

  if (mode === "map") {
    if (!parsed.data.targetId) {
      return NextResponse.json({ error: "targetId es requerido" }, { status: 400 });
    }
    const target =
      kind === "activity"
        ? await prisma.activity.findUnique({ where: { id: parsed.data.targetId }, select: { id: true, name: true } })
        : await prisma.lote.findUnique({ where: { id: parsed.data.targetId }, select: { id: true, name: true } });
    if (!target) return NextResponse.json({ error: "Entrada no encontrada" }, { status: 404 });
    resolved = target;
  } else {
    // create
    const name = (parsed.data.name ?? code).trim();
    if (kind === "activity") {
      if (!parsed.data.unit) {
        return NextResponse.json({ error: "La unidad es requerida para una actividad nueva" }, { status: 400 });
      }
      const exists = await prisma.activity.findUnique({ where: { name } });
      if (exists) {
        resolved = { id: exists.id, name: exists.name };
      } else {
        const maxSort = await prisma.activity.aggregate({ _max: { sortOrder: true } });
        const price = parsed.data.price ?? 0;
        const created = await prisma.activity.create({
          data: { name, unit: parsed.data.unit, defaultPrice: price, sortOrder: (maxSort._max.sortOrder ?? 0) + 1 },
        });
        // Seed today's price vigencia so effective-dated pricing is consistent.
        await prisma.activityPrice.create({
          data: { activityId: created.id, price, effectiveFrom: new Date(todayISOGuatemala()), note: "Precio inicial", createdBy: auth.id },
        });
        await prisma.auditLog.create({
          data: { userId: auth.id, action: "CREATE", tableName: "activities", recordId: created.id, newValues: { name, unit: parsed.data.unit, price } },
        });
        resolved = { id: created.id, name: created.name };
      }
    } else {
      // lote
      const exists = await prisma.lote.findFirst({ where: { name } });
      if (exists) {
        resolved = { id: exists.id, name: exists.name };
      } else {
        let slug = slugify(name);
        if (await prisma.lote.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString().slice(-4)}`;
        const maxSort = await prisma.lote.aggregate({ _max: { sortOrder: true } });
        const created = await prisma.lote.create({
          data: { name, slug, sortOrder: (maxSort._max.sortOrder ?? 0) + 1 },
        });
        await prisma.auditLog.create({
          data: { userId: auth.id, action: "CREATE", tableName: "lotes", recordId: created.id, newValues: { name, slug } },
        });
        resolved = { id: created.id, name: created.name };
      }
    }
  }

  // Learn the mapping: this raw code → the resolved catalog entry, forever.
  await learnCorrection(kind, code, resolved.name, resolved.id);

  // For activities, return the price schedule so the importer can fill the
  // unit price by work date without a re-fetch.
  if (kind === "activity") {
    const act = await prisma.activity.findUnique({
      where: { id: resolved.id },
      select: { defaultPrice: true, prices: { select: { effectiveFrom: true, price: true }, orderBy: { effectiveFrom: "asc" } } },
    });
    return NextResponse.json({
      id: resolved.id,
      name: resolved.name,
      defaultPrice: act?.defaultPrice != null ? Number(act.defaultPrice) : 0,
      priceSchedule: act ? toPriceSchedule(act.prices) : [],
    });
  }

  return NextResponse.json({ id: resolved.id, name: resolved.name });
}
