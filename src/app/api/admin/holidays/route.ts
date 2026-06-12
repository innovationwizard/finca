// =============================================================================
// src/app/api/admin/holidays/route.ts — Holiday list + create
// Access: list = read-all roles; create = settings roles. Audited.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, READ_ALL_ROLES, SETTINGS_ROLES } from "@/lib/auth/guards";
import { holidayCreateSchema } from "@/lib/validators/holiday";

const isoDate = (d: Date) => d.toISOString().split("T")[0];

export async function GET() {
  const auth = await apiRequireRole(...READ_ALL_ROLES);
  if (auth instanceof NextResponse) return auth;

  const holidays = await prisma.holiday.findMany({ orderBy: { date: "asc" } });
  return NextResponse.json(
    holidays.map((h) => ({ id: h.id, date: isoDate(h.date), name: h.name, recurringAnnual: h.recurringAnnual })),
  );
}

export async function POST(request: NextRequest) {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = holidayCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const date = new Date(`${parsed.data.date}T00:00:00.000Z`);
  const existing = await prisma.holiday.findUnique({ where: { date } });
  if (existing) {
    return NextResponse.json({ error: "Ya existe un feriado en esa fecha" }, { status: 409 });
  }

  const h = await prisma.holiday.create({
    data: { date, name: parsed.data.name, recurringAnnual: parsed.data.recurringAnnual },
  });

  await prisma.auditLog.create({
    data: {
      userId: auth.id,
      action: "CREATE",
      tableName: "holidays",
      recordId: h.id,
      newValues: { date: parsed.data.date, name: h.name, recurringAnnual: h.recurringAnnual },
    },
  });

  return NextResponse.json(
    { id: h.id, date: isoDate(h.date), name: h.name, recurringAnnual: h.recurringAnnual },
    { status: 201 },
  );
}
