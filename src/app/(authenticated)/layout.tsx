// =============================================================================
// src/app/(authenticated)/layout.tsx — Shell with sidebar nav + sync status
// =============================================================================

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { SyncProvider } from "@/components/providers/sync-provider";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <SyncProvider>
      <div className="flex min-h-dvh">
        {/* Desktop sidebar */}
        <Sidebar user={user} />

        {/* Main content */}
        <main className="flex-1 pb-20 lg:pb-0">
          {children}
        </main>

        {/* Mobile bottom nav */}
        <MobileNav user={user} />
      </div>
    </SyncProvider>
  );
}
