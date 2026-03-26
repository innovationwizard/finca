// =============================================================================
// src/app/(authenticated)/admin/usuarios/page.tsx — User management (MASTER only)
// =============================================================================

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guards";
import { UsersManager } from "./users-manager";

export const metadata = { title: "Gestión de Usuarios" };

export default async function UsuariosPage() {
  const currentUser = await requireRole("MASTER");

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  const serialized = users.map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-finca-900">
          Gestión de Usuarios
        </h1>
        <p className="mt-1 text-sm text-finca-500">
          Crear, editar y administrar los usuarios del sistema. Solo visible para MASTER.
        </p>
      </div>
      <UsersManager users={serialized} currentUserId={currentUser.id} />
    </div>
  );
}
