"use client";

// =============================================================================
// src/components/layout/sidebar.tsx — Desktop sidebar
// =============================================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sprout } from "lucide-react";
import { SyncIndicator } from "./sync-indicator";
import { LogoutButton } from "./logout-button";

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type NavItem = {
  href: string;
  label: string;
  icon: string;
  roles?: string[];
};

const NAV_ITEMS: NavItem[] = [
  { href: "/planilla", label: "Planilla", icon: "📋" },
  { href: "/ingreso-cafe", label: "Ingreso Café", icon: "☕" },
  { href: "/plan", label: "Plan Anual", icon: "📅" },
  { href: "/estimaciones", label: "Estimaciones", icon: "📊" },
  { href: "/trabajadores", label: "Trabajadores", icon: "👷" },
  { href: "/lotes", label: "Lotes", icon: "🌱" },
  { href: "/dashboard", label: "Dashboard", icon: "📈", roles: ["MASTER", "ADMIN", "MANAGER", "CEO"] },
];

const ADMIN_ITEMS: NavItem[] = [
  { href: "/admin/lotes", label: "Config. Lotes", icon: "⚙️" },
  { href: "/admin/actividades", label: "Config. Actividades", icon: "🔧" },
];

export function Sidebar({ user }: { user: User }) {
  const pathname = usePathname();

  const visibleNav = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(user.role),
  );

  const showAdmin = user.role === "MASTER" || user.role === "ADMIN";

  return (
    <aside className="hidden w-64 shrink-0 border-r border-finca-200 bg-white lg:flex lg:flex-col">
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-finca-100 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-finca-900">
          <Sprout className="h-5 w-5 text-finca-100" />
        </div>
        <div>
          <p className="text-sm font-semibold text-finca-900">Finca Danilandia</p>
          <p className="text-xs text-finca-400">Grupo Orión</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {visibleNav.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href as never}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-earth-50 text-earth-700"
                      : "text-finca-600 hover:bg-finca-50 hover:text-finca-900"
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Admin section */}
        {showAdmin && (
          <>
            <div className="my-4 border-t border-finca-100" />
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-finca-400">
              Administración
            </p>
            <ul className="space-y-1">
              {ADMIN_ITEMS.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href as never}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-earth-50 text-earth-700"
                          : "text-finca-600 hover:bg-finca-50 hover:text-finca-900"
                      }`}
                    >
                      <span className="text-base">{item.icon}</span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </nav>

      {/* Footer: sync + user */}
      <div className="border-t border-finca-100 px-4 py-3">
        <SyncIndicator />
        <div className="mt-3 flex items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-finca-900">
              {user.name}
            </p>
            <p className="truncate text-xs text-finca-400">{user.role}</p>
          </div>
          <LogoutButton />
        </div>
      </div>
    </aside>
  );
}
