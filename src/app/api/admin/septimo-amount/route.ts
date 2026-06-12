// =============================================================================
// src/app/api/admin/septimo-amount/route.ts — Read/set the séptimo bonus amount.
// GET (read-all): current amount (with default fallback). PUT (settings roles):
// upsert the SystemSetting (it may not exist yet). Audited.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, READ_ALL_ROLES, SETTINGS_ROLES } from "@/lib/auth/guards";
import {
  getSeptimoAmount,
  SEPTIMO_AMOUNT_KEY,
  SEPTIMO_AMOUNT_GROUP,
  SEPTIMO_AMOUNT_LABEL,
} from "@/lib/payroll/septimo";

export async function GET() {
  const auth = await apiRequireRole(...READ_ALL_ROLES);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ amount: await getSeptimoAmount() });
}

export async function PUT(request: NextRequest) {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const amount = (body as { amount?: unknown }).amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: "Monto inválido" }, { status: 400 });
  }
  const value = String(Math.round(amount * 100) / 100);

  const existing = await prisma.systemSetting.findUnique({ where: { key: SEPTIMO_AMOUNT_KEY } });
  const s = await prisma.systemSetting.upsert({
    where: { key: SEPTIMO_AMOUNT_KEY },
    update: { value, updatedBy: auth.id },
    create: { key: SEPTIMO_AMOUNT_KEY, value, label: SEPTIMO_AMOUNT_LABEL, group: SEPTIMO_AMOUNT_GROUP, updatedBy: auth.id },
  });

  await prisma.auditLog.create({
    data: {
      userId: auth.id,
      action: existing ? "UPDATE" : "CREATE",
      tableName: "system_settings",
      recordId: s.id,
      oldValues: existing ? { value: existing.value } : undefined,
      newValues: { key: SEPTIMO_AMOUNT_KEY, value },
    },
  });

  return NextResponse.json({ amount: Number(value) });
}
