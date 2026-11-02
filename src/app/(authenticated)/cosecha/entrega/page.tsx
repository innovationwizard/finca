import { requireRole, HARVEST_ROLES } from "@/lib/auth/guards";
import { EntregaClient } from "./entrega-client";

export const metadata = { title: "Entrega" };

export default async function EntregaPage() {
  const user = await requireRole(...HARVEST_ROLES);
  return <EntregaClient role={user.role} />;
}
