import { requireRole, HARVEST_ROLES } from "@/lib/auth/guards";
import { PesajeClient } from "./pesaje-client";

export const metadata = { title: "Pesaje" };

export default async function PesajePage() {
  const user = await requireRole(...HARVEST_ROLES);
  return <PesajeClient role={user.role} />;
}
