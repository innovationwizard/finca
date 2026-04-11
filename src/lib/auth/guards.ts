// =============================================================================
// src/lib/auth/guards.ts — Role-based access control
// =============================================================================

import { UserRole } from "@prisma/client";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export type AuthenticatedUser = {
  id: string;
  supabaseId: string;
  email: string;
  name: string;
  role: UserRole;
};

/**
 * Authenticates the current request and returns the user.
 * Returns null if not authenticated.
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  if (!supabaseUser) return null;

  const user = await prisma.user.findUnique({
    where: { supabaseId: supabaseUser.id },
    select: { id: true, supabaseId: true, email: true, name: true, role: true },
  });

  return user;
}

/**
 * Checks if the current user has one of the allowed roles.
 * Use in Server Components and API routes.
 */
export async function requireRole(
  ...allowedRoles: UserRole[]
): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }

  if (!allowedRoles.includes(user.role)) {
    throw new Error("UNAUTHORIZED");
  }

  return user;
}

/** Roles that can access settings management pages */
export const SETTINGS_ROLES: UserRole[] = ["MASTER", "ADMIN"];

/** Roles that can view all data */
export const READ_ALL_ROLES: UserRole[] = ["MASTER", "ADMIN", "MANAGER", "CEO", "CFO"];

/** Roles that can create/edit operational data */
export const WRITE_ROLES: UserRole[] = ["MASTER", "ADMIN", "FIELD"];

/**
 * API route helper: returns 401/403 NextResponse if unauthorized.
 * Use in route handlers.
 */
export async function apiRequireRole(
  ...allowedRoles: UserRole[]
): Promise<AuthenticatedUser | NextResponse> {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!allowedRoles.includes(user.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  return user;
}
