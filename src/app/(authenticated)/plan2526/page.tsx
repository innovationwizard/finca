// =============================================================================
// src/app/(authenticated)/plan2526/page.tsx — Plan Anual de Actividades 25/26
// Cosecha 25/26 = 1 October 2025 → 30 September 2026. Pinned: this route shows
// that cosecha and no other. The body lives in @/components/plan/plan-overview,
// shared with every other cosecha's route.
// =============================================================================

import { PlanOverview } from "@/components/plan/plan-overview";

export const metadata = { title: "Plan Anual 25/26" };

const COSECHA = "2526";
const BASE_PATH = "/plan2526";

type Props = {
  searchParams: Promise<{ loteId?: string }>;
};

export default async function Plan2526Page({ searchParams }: Props) {
  const params = await searchParams;
  return (
    <PlanOverview
      agriculturalYear={COSECHA}
      basePath={BASE_PATH}
      loteId={params.loteId ?? null}
    />
  );
}
