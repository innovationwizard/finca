// =============================================================================
// src/app/(authenticated)/plan2526/[loteSlug]/page.tsx — one lote, cosecha 25/26
// =============================================================================

import { prisma } from "@/lib/prisma";
import { PlanLoteDetail } from "@/components/plan/plan-lote-detail";

const COSECHA = "2526";
const BASE_PATH = "/plan2526";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ loteSlug: string }>;
}) {
  const { loteSlug } = await params;
  const lote = await prisma.lote.findUnique({
    where: { slug: loteSlug },
    select: { name: true },
  });
  return { title: lote ? `Plan 25/26 — ${lote.name}` : "Plan 25/26 — Lote" };
}

type Props = {
  params: Promise<{ loteSlug: string }>;
};

export default async function Plan2526LotePage({ params }: Props) {
  const { loteSlug } = await params;
  return (
    <PlanLoteDetail
      agriculturalYear={COSECHA}
      basePath={BASE_PATH}
      loteSlug={loteSlug}
    />
  );
}
