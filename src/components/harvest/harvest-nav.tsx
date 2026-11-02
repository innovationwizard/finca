"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CUI_FALLBACK_ROLE_NAMES,
  HARVEST_DESK_ROLE_NAMES,
  HARVEST_ROLE_NAMES,
} from "@/lib/auth/roles";

const LINKS = [
  { href: "/cosecha/entrega", label: "Entrega", roles: HARVEST_ROLE_NAMES },
  { href: "/cosecha/registrar", label: "Registrar persona", roles: HARVEST_ROLE_NAMES },
  { href: "/cosecha/kpis", label: "KPIs", roles: HARVEST_DESK_ROLE_NAMES },
  { href: "/cosecha/contabilidad", label: "Contabilidad", roles: HARVEST_DESK_ROLE_NAMES },
];

export function HarvestNav({ role }: { role: string }) {
  const pathname = usePathname();
  const links = LINKS.filter((link) => (link.roles as readonly string[]).includes(role));
  return (
    <nav className="flex gap-2 overflow-x-auto pb-1">
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href as never}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
              active ? "bg-finca-900 text-white" : "bg-finca-100 text-finca-700"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function canTypeCui(role: string): boolean {
  return (CUI_FALLBACK_ROLE_NAMES as readonly string[]).includes(role);
}
