import { requireRole, HARVEST_ROLES, SETTINGS_ROLES } from "@/lib/auth/guards";
import { RegistrarClient } from "./registrar-client";

export const metadata = { title: "Registrar persona" };

export default async function RegistrarPage() {
  const user = await requireRole(...HARVEST_ROLES);
  return <RegistrarClient role={user.role} canLinkPending={SETTINGS_ROLES.includes(user.role)} />;
}
