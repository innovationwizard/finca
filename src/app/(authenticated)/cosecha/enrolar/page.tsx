import { requireRole, HARVEST_ROLES, SETTINGS_ROLES } from "@/lib/auth/guards";
import { EnrolarClient } from "./enrolar-client";

export const metadata = { title: "Enrolar" };

export default async function EnrolarPage() {
  const user = await requireRole(...HARVEST_ROLES);
  return <EnrolarClient role={user.role} canLinkPending={SETTINGS_ROLES.includes(user.role)} />;
}
