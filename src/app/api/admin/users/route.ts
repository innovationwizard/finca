// =============================================================================
// src/app/api/admin/users/route.ts — User management API (MASTER only)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { apiRequireRole } from "@/lib/auth/guards";
import { z } from "zod";

// Supabase admin client (service role — can create/manage auth users)
function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET — list all users
export async function GET() {
  const auth = await apiRequireRole("MASTER");
  if (auth instanceof NextResponse) return auth;

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      supabaseId: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  return NextResponse.json(users);
}

// POST — create new user (auth + db)
const createUserSchema = z.object({
  email: z.string().email("Correo electrónico inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  name: z.string().min(1, "El nombre es requerido").max(100),
  role: z.enum(["ADMIN", "MANAGER", "FIELD", "CEO", "CFO", "CONSULTANT"]),
});

export async function POST(request: NextRequest) {
  const auth = await apiRequireRole("MASTER");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const parsed = createUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { email, password, name, role } = parsed.data;

  // Check email uniqueness in our DB
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: `Ya existe un usuario con el correo "${email}"` },
      { status: 409 },
    );
  }

  // Create in Supabase Auth
  const supabase = getAdminSupabase();
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    return NextResponse.json(
      { error: `Error al crear usuario en autenticación: ${authError.message}` },
      { status: 500 },
    );
  }

  // Create in our users table
  const user = await prisma.user.create({
    data: {
      supabaseId: authData.user.id,
      email,
      name,
      role,
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: auth.id,
      action: "CREATE",
      tableName: "users",
      recordId: user.id,
      newValues: { email, name, role },
    },
  });

  return NextResponse.json(user, { status: 201 });
}

// PATCH — update user (role, active status, name)
const updateUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  role: z.enum(["MASTER", "ADMIN", "MANAGER", "FIELD", "CEO", "CFO", "CONSULTANT"]).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: NextRequest) {
  const auth = await apiRequireRole("MASTER");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const parsed = updateUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { id, ...data } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  // Prevent deactivating yourself
  if (id === auth.id && data.isActive === false) {
    return NextResponse.json(
      { error: "No puedes desactivar tu propia cuenta" },
      { status: 400 },
    );
  }

  // Prevent demoting yourself from MASTER
  if (id === auth.id && data.role && data.role !== "MASTER") {
    return NextResponse.json(
      { error: "No puedes cambiar tu propio rol de MASTER" },
      { status: 400 },
    );
  }

  // If deactivating, also ban in Supabase Auth
  if (data.isActive === false && existing.isActive) {
    const supabase = getAdminSupabase();
    await supabase.auth.admin.updateUserById(existing.supabaseId, {
      ban_duration: "876600h", // ~100 years
    });
  }

  // If reactivating, unban in Supabase Auth
  if (data.isActive === true && !existing.isActive) {
    const supabase = getAdminSupabase();
    await supabase.auth.admin.updateUserById(existing.supabaseId, {
      ban_duration: "none",
    });
  }

  await prisma.auditLog.create({
    data: {
      userId: auth.id,
      action: "UPDATE",
      tableName: "users",
      recordId: id,
      oldValues: { name: existing.name, role: existing.role, isActive: existing.isActive },
      newValues: data,
    },
  });

  const updated = await prisma.user.update({ where: { id }, data });

  return NextResponse.json(updated);
}

// DELETE — remove user (auth + db)
export async function DELETE(request: NextRequest) {
  const auth = await apiRequireRole("MASTER");
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  }

  if (id === auth.id) {
    return NextResponse.json(
      { error: "No puedes eliminar tu propia cuenta" },
      { status: 400 },
    );
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  // Delete from Supabase Auth
  const supabase = getAdminSupabase();
  await supabase.auth.admin.deleteUser(existing.supabaseId);

  // Delete from our DB
  await prisma.user.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      userId: auth.id,
      action: "DELETE",
      tableName: "users",
      recordId: id,
      oldValues: { email: existing.email, name: existing.name, role: existing.role },
    },
  });

  return NextResponse.json({ success: true });
}
