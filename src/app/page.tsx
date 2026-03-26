// =============================================================================
// src/app/page.tsx — Root redirect
// =============================================================================

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";

export default async function RootPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  redirect("/planilla");
}
