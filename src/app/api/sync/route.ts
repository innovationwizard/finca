// =============================================================================
// src/app/api/sync/route.ts — Offline outbox sync endpoint
// Receives batched records from the client outbox and upserts via Prisma.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, WRITE_ROLES } from "@/lib/auth/guards";

type SyncPayload = {
  table: "activity_records" | "coffee_intakes";
  records: Array<{
    clientId: string;
    data: Record<string, unknown>;
  }>;
};

export async function POST(request: NextRequest) {
  const auth = await apiRequireRole(...WRITE_ROLES);
  if (auth instanceof NextResponse) return auth;

  const body: SyncPayload = await request.json();
  const { table, records } = body;

  if (!table || !records?.length) {
    return NextResponse.json(
      { error: "table and records are required" },
      { status: 400 },
    );
  }

  const syncedClientIds: string[] = [];

  if (table === "activity_records") {
    for (const record of records) {
      try {
        await prisma.activityRecord.upsert({
          where: { clientId: record.clientId },
          update: {
            syncedAt: new Date(),
          },
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
      }
    }
  } else if (table === "coffee_intakes") {
    for (const record of records) {
      try {
        await prisma.coffeeIntake.upsert({
          where: { clientId: record.clientId },
          update: {
            syncedAt: new Date(),
          },
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
      }
    }
  } else {
    return NextResponse.json({ error: `Unknown table: ${table}` }, { status: 400 });
  }

  return NextResponse.json({
    syncedClientIds,
    total: records.length,
    synced: syncedClientIds.length,
    failed: records.length - syncedClientIds.length,
  });
}
