"use client";

// =============================================================================
// src/components/layout/mobile-nav.tsx — Mobile bottom tab bar
// =============================================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  Coffee,
  Users,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";

type User = { role: string };

type MobileTab = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const MOBILE_TABS: MobileTab[] = [
  { href: "/planilla", label: "Planilla", icon: ClipboardList },
  { href: "/ingreso-cafe", label: "Café", icon: Coffee },
  { href: "/trabajadores", label: "Personal", icon: Users },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

export function MobileNav({ user: _user }: { user: User }) {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-finca-200 bg-white/95 backdrop-blur-sm safe-area-inset-bottom lg:hidden">
      <div className="flex items-center justify-around px-2 py-1">
        {MOBILE_TABS.map((tab) => {
          const isActive = pathname.startsWith(tab.href);
          const Icon = tab.icon;
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
              <Icon className="h-5 w-5" />
              <span className="truncate">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
