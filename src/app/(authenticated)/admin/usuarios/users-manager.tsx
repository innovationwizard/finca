"use client";

// =============================================================================
// src/app/(authenticated)/admin/usuarios/users-manager.tsx
// Full user management: list, create, edit role, toggle active, delete
// =============================================================================

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  Shield,
  ShieldCheck,
  Eye,
  Radio,
  Crown,
  Pencil,
  Trash2,
  X,
  Check,
  Loader2,
} from "lucide-react";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
};

const ROLES = [
  { value: "MASTER", label: "Master", icon: Crown, description: "Control total del sistema" },
  { value: "ADMIN", label: "Admin", icon: ShieldCheck, description: "CRUD completo, planilla, datos" },
  { value: "MANAGER", label: "Manager", icon: Shield, description: "Lectura, aprobaciones, dashboard" },
  { value: "FIELD", label: "Field", icon: Radio, description: "Ingreso de datos móvil" },
  { value: "CEO", label: "CEO", icon: Eye, description: "Solo dashboard (futuro)" },
] as const;

const CREATABLE_ROLES = ROLES.filter((r) => r.value !== "MASTER");

function roleBadgeColor(role: string) {
  switch (role) {
    case "MASTER": return "bg-finca-900 text-white";
    case "ADMIN": return "bg-finca-700 text-white";
    case "MANAGER": return "bg-earth-600 text-white";
    case "FIELD": return "bg-finca-500 text-white";
    case "CEO": return "bg-earth-400 text-white";
    default: return "bg-finca-200 text-finca-800";
  }
}

export function UsersManager({
  users: initialUsers,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create form state
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    role: "FIELD",
  });
  const [creating, setCreating] = useState(false);

  const showMessage = useCallback((msg: string, isError = false) => {
    if (isError) {
      setError(msg);
      setSuccess(null);
    } else {
      setSuccess(msg);
      setError(null);
    }
    setTimeout(() => { setError(null); setSuccess(null); }, 4000);
  }, []);

  // CREATE
  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) {
        showMessage(data.error || "Error al crear usuario", true);
        setCreating(false);
        return;
      }

      showMessage(`Usuario "${form.name}" creado exitosamente`);
      setForm({ email: "", password: "", name: "", role: "FIELD" });
      setShowCreate(false);
      setCreating(false);
      startTransition(() => router.refresh());
    } catch {
      showMessage("Error de conexión", true);
      setCreating(false);
    }
  }, [form, router, showMessage]);

  // UPDATE ROLE
  const handleUpdateRole = useCallback(async (id: string) => {
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, role: editRole }),
      });

      const data = await res.json();
      if (!res.ok) {
        showMessage(data.error || "Error al actualizar", true);
        return;
      }

      showMessage("Rol actualizado");
      setEditingId(null);
      startTransition(() => router.refresh());
    } catch {
      showMessage("Error de conexión", true);
    }
  }, [editRole, router, showMessage]);

  // TOGGLE ACTIVE
  const handleToggleActive = useCallback(async (user: UserRow) => {
    const action = user.isActive ? "desactivar" : "activar";
    if (!confirm(`¿Estás seguro de ${action} a ${user.name}?`)) return;

    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, isActive: !user.isActive }),
      });

      const data = await res.json();
      if (!res.ok) {
        showMessage(data.error || "Error", true);
        return;
      }

      showMessage(`Usuario ${user.isActive ? "desactivado" : "activado"}`);
      startTransition(() => router.refresh());
    } catch {
      showMessage("Error de conexión", true);
    }
  }, [router, showMessage]);

  // DELETE
  const handleDelete = useCallback(async (user: UserRow) => {
    if (!confirm(`¿Eliminar permanentemente a ${user.name} (${user.email})?\n\nEsta acción no se puede deshacer.`)) return;

    try {
      const res = await fetch(`/api/admin/users?id=${user.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        showMessage(data.error || "Error al eliminar", true);
        return;
      }

      showMessage(`Usuario "${user.name}" eliminado`);
      startTransition(() => router.refresh());
    } catch {
      showMessage("Error de conexión", true);
    }
  }, [router, showMessage]);

  return (
    <div>
      {/* Messages */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      )}

      {/* Create button */}
      {!showCreate && (
        <button
          onClick={() => setShowCreate(true)}
          className="mb-6 inline-flex items-center gap-2 rounded-lg bg-finca-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-finca-800"
        >
          <UserPlus className="h-4 w-4" />
          Nuevo Usuario
        </button>
      )}

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="mb-6 rounded-xl border border-finca-200 bg-white p-6 shadow-sm"
        >
          <h2 className="mb-4 text-lg font-semibold text-finca-900">Crear Nuevo Usuario</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-finca-700">
                Nombre completo
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Luis Castellanos"
                className="w-full rounded-lg border border-finca-200 px-3 py-2 text-sm text-finca-900 outline-none focus:border-finca-500 focus:ring-2 focus:ring-finca-100"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-finca-700">
                Correo electrónico
              </label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="usuario@correo.com"
                className="w-full rounded-lg border border-finca-200 px-3 py-2 text-sm text-finca-900 outline-none focus:border-finca-500 focus:ring-2 focus:ring-finca-100"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-finca-700">
                Contraseña
              </label>
              <input
                type="text"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Mínimo 6 caracteres"
                className="w-full rounded-lg border border-finca-200 px-3 py-2 text-sm text-finca-900 outline-none focus:border-finca-500 focus:ring-2 focus:ring-finca-100"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-finca-700">
                Rol
              </label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full rounded-lg border border-finca-200 px-3 py-2 text-sm text-finca-900 outline-none focus:border-finca-500 focus:ring-2 focus:ring-finca-100"
              >
                {CREATABLE_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label} — {r.description}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-lg bg-finca-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-finca-800 disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {creating ? "Creando..." : "Crear Usuario"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-finca-200 px-4 py-2 text-sm font-medium text-finca-600 transition-colors hover:bg-finca-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Users table */}
      <div className="overflow-x-auto rounded-xl border border-finca-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-finca-100 bg-finca-50">
              <th className="px-4 py-3 font-medium text-finca-600">Nombre</th>
              <th className="px-4 py-3 font-medium text-finca-600">Correo</th>
              <th className="px-4 py-3 font-medium text-finca-600">Rol</th>
              <th className="px-4 py-3 font-medium text-finca-600 text-center">Estado</th>
              <th className="px-4 py-3 font-medium text-finca-600 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-finca-100">
            {initialUsers.map((user) => {
              const isMe = user.id === currentUserId;
              const isEditing = editingId === user.id;

              return (
                <tr
                  key={user.id}
                  className={`transition-colors ${
                    !user.isActive ? "bg-finca-50/50 opacity-60" : "hover:bg-finca-50/30"
                  }`}
                >
                  {/* Name */}
                  <td className="px-4 py-3 font-medium text-finca-900">
                    {user.name}
                    {isMe && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-finca-100 px-2 py-0.5 text-xs font-medium text-finca-700">
                        Tú
                      </span>
                    )}
                  </td>

                  {/* Email */}
                  <td className="px-4 py-3 text-finca-600">{user.email}</td>

                  {/* Role */}
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value)}
                          className="rounded-md border border-finca-300 px-2 py-1 text-xs focus:border-finca-500 focus:outline-none"
                        >
                          {ROLES.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleUpdateRole(user.id)}
                          className="rounded-md bg-finca-700 p-1 text-white hover:bg-finca-600"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="rounded-md border border-finca-200 p-1 text-finca-500 hover:bg-finca-50"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${roleBadgeColor(user.role)}`}
                      >
                        {user.role}
                      </span>
                    )}
                  </td>

                  {/* Active status */}
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggleActive(user)}
                      disabled={isMe}
                      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
                        isMe ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                      } ${user.isActive ? "bg-emerald-500" : "bg-finca-300"}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow-sm transition-transform ${
                          user.isActive ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {!isMe && (
                        <>
                          <button
                            onClick={() => {
                              setEditingId(user.id);
                              setEditRole(user.role);
                            }}
                            title="Cambiar rol"
                            className="rounded-md border border-finca-200 p-1.5 text-finca-500 transition-colors hover:bg-finca-50 hover:text-finca-700"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(user)}
                            title="Eliminar usuario"
                            className="rounded-md border border-red-200 p-1.5 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Role legend */}
      <div className="mt-6 rounded-lg border border-finca-100 bg-finca-50/50 px-4 py-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-finca-400">
          Roles del Sistema
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ROLES.map((r) => {
            const Icon = r.icon;
            return (
              <div key={r.value} className="flex items-center gap-2 text-xs text-finca-600">
                <Icon className="h-3.5 w-3.5 text-finca-400" />
                <span className="font-medium">{r.label}</span>
                <span className="text-finca-400">— {r.description}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
