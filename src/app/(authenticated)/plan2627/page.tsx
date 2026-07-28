// =============================================================================
// src/app/(authenticated)/plan2627/page.tsx — Plan Anual de Actividades 26/27
// Cosecha 26/27 = 1 October 2026 → 30 September 2027. Pinned: this route shows
// that cosecha and no other. The body lives in @/components/plan/plan-overview,
// shared with every other cosecha's route.
// =============================================================================

import { PlanOverview } from "@/components/plan/plan-overview";

export const metadata = { title: "Plan Anual 26/27" };

const COSECHA = "2627";
const BASE_PATH = "/plan2627";

type Props = {
  searchParams: Promise<{ loteId?: string }>;
};

export default async function Plan2627Page({ searchParams }: Props) {
  const params = await searchParams;
  return (
    <PlanOverview
      agriculturalYear={COSECHA}
      basePath={BASE_PATH}
      loteId={params.loteId ?? null}
    />
  );
}
