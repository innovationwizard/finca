// =============================================================================
// src/lib/plan/plan-routes.ts — The cosechas that have a plan page.
//
// Each cosecha gets its own pinned route rather than one /plan with a year
// dropdown, so a plan page can never show a season other than the one its title
// and URL name. That means a route folder per cosecha — this list is what keeps
// the navigation, the post-login landing and the folders from drifting apart.
//
// ADDING A COSECHA: create src/app/(authenticated)/plan<code>/page.tsx and
// plan<code>/[loteSlug]/page.tsx (copy the previous pair, change the two
// constants at the top), then add a line here. Keep the list in chronological
// order — the navigation renders it as-is and the landing falls back to the last
// entry.
// =============================================================================

import { getCurrentAgriculturalYear } from "@/lib/utils/agricultural-year";

export const PLAN_ROUTES = [
  { year: "2526", path: "/plan2526", label: "Plan Anual 25/26" },
  { year: "2627", path: "/plan2627", label: "Plan Anual 26/27" },
] as const;

export type PlanRoutePath = (typeof PLAN_ROUTES)[number]["path"];

/**
 * The plan page for the cosecha we are in today. Falls back to the most recent
 * one on the list when the current cosecha has no page yet — the alternative is
 * landing users on a 404 the day a season rolls over.
 */
export function currentPlanRoute(): PlanRoutePath {
  const year = getCurrentAgriculturalYear();
  const match = PLAN_ROUTES.find((r) => r.year === year);
  return match?.path ?? PLAN_ROUTES[PLAN_ROUTES.length - 1].path;
}
