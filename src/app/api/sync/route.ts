// =============================================================================
// src/app/api/sync/route.ts — Offline outbox sync endpoint
// Harvest enrollments and weighings are applied here. Older activity_records
// and coffee_intakes upserts stay as they were, and stay on WRITE_ROLES.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, HARVEST_ROLES, WRITE_ROLES } from "@/lib/auth/guards";
import { syncEnrollment, syncFaceEnrollment } from "@/lib/harvest/sync-enrollment";
import { syncWeighing, type WeighingPayload } from "@/lib/harvest/sync-weighing";

type SyncRecord = {
  clientId: string;
  data: Record<string, unknown>;
};

type SyncBody = {
  table: string;
  records: SyncRecord[];
};

const HARVEST_TABLES = new Set(["enrollments", "face_enrollments", "weighings"]);

export async function POST(request: NextRequest) {
  const auth = await apiRequireRole(...HARVEST_ROLES);
  if (auth instanceof NextResponse) return auth;

  let body: SyncBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const { table, records } = body;
  if (!table || !records?.length) {
    return NextResponse.json({ error: "table and records are required" }, { status: 400 });
  }

  if (!HARVEST_TABLES.has(table) && !WRITE_ROLES.includes(auth.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const syncedClientIds: string[] = [];
  const held: { clientId: string; error: string; retry: boolean }[] = [];

  if (table === "enrollments") {
    for (const record of records) {
      const result = await syncEnrollment(record.clientId, record.data);
      if (result.ok) syncedClientIds.push(record.clientId);
      else held.push({ clientId: record.clientId, error: result.error, retry: result.retry });
    }
  } else if (table === "face_enrollments") {
    for (const record of records) {
      const result = await syncFaceEnrollment(record.clientId, record.data);
      if (result.ok) syncedClientIds.push(record.clientId);
      else held.push({ clientId: record.clientId, error: result.error, retry: result.retry });
    }
  } else if (table === "weighings") {
    for (const record of records) {
      const result = await syncWeighing(record.clientId, record.data as unknown as WeighingPayload);
      if (result.ok) syncedClientIds.push(record.clientId);
      else held.push({ clientId: record.clientId, error: result.error, retry: result.retry });
    }
  } else if (table === "activity_records") {
    for (const record of records) {
      try {
        await prisma.activityRecord.upsert({
          where: { clientId: record.clientId },
          update: { syncedAt: new Date() },
          create: {
            clientId: record.clientId,
            date: new Date(record.data.date as string),
            payPeriodId: record.data.payPeriodId as string,
            workerId: record.data.workerId as string,
            activityId: record.data.activityId as string,
            loteId: (record.data.loteId as string) || null,
            quantity: record.data.quantity as number,
            unitPrice: record.data.unitPrice as number,
            totalEarned: record.data.totalEarned as number,
            notes: (record.data.notes as string) || null,
            syncedAt: new Date(),
          },
        });
        syncedClientIds.push(record.clientId);
      } catch (err) {
        console.error(`Failed to sync activity_record ${record.clientId}:`, err);
        held.push({ clientId: record.clientId, error: "No se pudo guardar el registro", retry: true });
      }
    }
  } else if (table === "coffee_intakes") {
    for (const record of records) {
      try {
        await prisma.coffeeIntake.upsert({
          where: { clientId: record.clientId },
          update: { syncedAt: new Date() },
          create: {
            clientId: record.clientId,
            code: record.data.code as string,
            date: new Date(record.data.date as string),
            coffeeType: record.data.coffeeType as "CEREZA" | "PERGAMINO" | "ORO",
            source: record.data.source as "COSECHA" | "COMPRA",
            loteId: (record.data.loteId as string) || null,
            supplierName: (record.data.supplierName as string) || null,
            bultos: (record.data.bultos as number) || null,
            pesoNetoQq: record.data.pesoNetoQq as number,
            pesoPergaminoQq: (record.data.pesoPergaminoQq as number) || null,
            rendimiento: (record.data.rendimiento as number) || null,
            status: (record.data.status as string) as "RECIBIDO",
            notes: (record.data.notes as string) || null,
            syncedAt: new Date(),
          },
        });
        syncedClientIds.push(record.clientId);
      } catch (err) {
        console.error(`Failed to sync coffee_intake ${record.clientId}:`, err);
        held.push({ clientId: record.clientId, error: "No se pudo guardar el ingreso", retry: true });
      }
    }
  } else {
    return NextResponse.json({ error: `Unknown table: ${table}` }, { status: 400 });
  }

  return NextResponse.json({
    syncedClientIds,
    held,
    total: records.length,
    synced: syncedClientIds.length,
    failed: records.length - syncedClientIds.length,
  });
}
