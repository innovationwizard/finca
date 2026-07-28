// =============================================================================
// src/app/(authenticated)/plan2627/[loteSlug]/page.tsx — one lote, cosecha 26/27
// =============================================================================

import { prisma } from "@/lib/prisma";
import { PlanLoteDetail } from "@/components/plan/plan-lote-detail";

const COSECHA = "2627";
const BASE_PATH = "/plan2627";

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
  return { title: lote ? `Plan 26/27 — ${lote.name}` : "Plan 26/27 — Lote" };
}

type Props = {
  params: Promise<{ loteSlug: string }>;
};

export default async function Plan2627LotePage({ params }: Props) {
  const { loteSlug } = await params;
  return (
    <PlanLoteDetail
      agriculturalYear={COSECHA}
      basePath={BASE_PATH}
      loteSlug={loteSlug}
    />
  );
}
