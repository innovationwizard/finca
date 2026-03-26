"use client";

// =============================================================================
// src/components/layout/mobile-nav.tsx — Mobile bottom tab bar
// =============================================================================

import Link from "next/link";
import { usePathname } from "next/navigation";

type User = { role: string };

const MOBILE_TABS = [
  { href: "/planilla", label: "Planilla", icon: "📋" },
  { href: "/ingreso-cafe", label: "Café", icon: "☕" },
  { href: "/trabajadores", label: "Personal", icon: "👷" },
  { href: "/dashboard", label: "Dashboard", icon: "📈" },
] as const;

export function MobileNav({ user: _user }: { user: User }) {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-finca-200 bg-white/95 backdrop-blur-sm safe-area-inset-bottom lg:hidden">
      <div className="flex items-center justify-around px-2 py-1">
        {MOBILE_TABS.map((tab) => {
          const isActive = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href as never}
              className={`flex min-w-0 flex-col items-center gap-0.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors touch-target ${
                isActive
                  ? "text-earth-600"
                  : "text-finca-400 active:text-finca-600"
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span className="truncate">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
