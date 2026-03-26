// =============================================================================
// src/app/(authenticated)/ingreso-cafe/[id]/page.tsx — Coffee intake detail
// =============================================================================

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, READ_ALL_ROLES } from "@/lib/auth/guards";
import { IntakeDetail } from "./intake-detail";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const intake = await prisma.coffeeIntake.findUnique({
    where: { id },
    select: { code: true },
  });
  return { title: intake ? `Ingreso ${intake.code}` : "Ingreso de Café" };
}

export default async function IntakeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole(...READ_ALL_ROLES);
  const { id } = await params;

  const intake = await prisma.coffeeIntake.findUnique({
    where: { id },
    include: {
      lote: { select: { id: true, name: true } },
    },
  });

  if (!intake) {
    notFound();
  }

  const serialized = {
    id: intake.id,
    code: intake.code,
    date: intake.date.toISOString().split("T")[0],
    coffeeType: intake.coffeeType,
    source: intake.source,
    loteId: intake.loteId,
    supplierName: intake.supplierName,
    procedencia: intake.procedencia,
    supplierAccount: intake.supplierAccount,
    pricePerQq: intake.pricePerQq ? Number(intake.pricePerQq) : null,
    paymentStatus: intake.paymentStatus,
    bultos: intake.bultos,
    pesoNetoQq: Number(intake.pesoNetoQq),
    pesoPergaminoQq: intake.pesoPergaminoQq
      ? Number(intake.pesoPergaminoQq)
      : null,
    rendimiento: intake.rendimiento ? Number(intake.rendimiento) : null,
    status: intake.status,
    processedDate: intake.processedDate
      ? intake.processedDate.toISOString().split("T")[0]
      : null,
    dispatchDate: intake.dispatchDate
      ? intake.dispatchDate.toISOString().split("T")[0]
      : null,
    dispatchCode: intake.dispatchCode,
    cuppingScore: intake.cuppingScore ? Number(intake.cuppingScore) : null,
    notes: intake.notes,
    lote: intake.lote,
    createdAt: intake.createdAt.toISOString(),
  };

  const canWrite =
    user.role === "MASTER" || user.role === "ADMIN" || user.role === "FIELD";

  return <IntakeDetail intake={serialized} canWrite={canWrite} />;
}
