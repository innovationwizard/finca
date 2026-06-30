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
 * Returns null if not authenticated OR if the account is deactivated — so
 * setting a user's isActive=false immediately blocks all access app-wide
 * (the primitive for offboarding; see /admin/usuarios).
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  if (!supabaseUser) return null;

  const user = await prisma.user.findUnique({
    where: { supabaseId: supabaseUser.id },
    select: { id: true, supabaseId: true, email: true, name: true, role: true, isActive: true },
  });

  if (!user || !user.isActive) return null;

  return {
    id: user.id,
    supabaseId: user.supabaseId,
    email: user.email,
    name: user.name,
    role: user.role,
  };
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
export const READ_ALL_ROLES: UserRole[] = ["MASTER", "ADMIN", "MANAGER", "CEO", "CFO", "CONSULTANT"];

/** Roles that can create/edit operational data */
export const WRITE_ROLES: UserRole[] = ["MASTER", "ADMIN", "FIELD"];

/**
 * Captura Semanal write access. MANAGER (Manuel, the payroll preparer) enters the
 * weekly grid but is NOT a general editor (not in WRITE_ROLES), so captura grants
 * it explicitly here rather than broadening WRITE_ROLES across the app.
 */
export const CAPTURA_WRITE_ROLES: UserRole[] = ["MASTER", "ADMIN", "FIELD", "MANAGER"];

/**
 * Payroll adjustments (descuentos / adicionales) for the open period.
 * MASTER + MANAGER input; ADMIN + CFO may open the page read-only (review).
 * These feed PayrollEntry.totalToPay → the bank file, so the write set is kept
 * deliberately narrow.
 */
export const PAY_ADJUST_WRITE_ROLES: UserRole[] = ["MASTER", "MANAGER"];
export const PAY_ADJUST_VIEW_ROLES: UserRole[] = ["MASTER", "MANAGER", "ADMIN", "CFO"];

/**
 * Payroll review & authorization screen (Revisión y Autorización). CFO audits
 * read-only; MASTER/ADMIN (SETTINGS_ROLES) additionally authorize payment, which
 * closes the open period via the existing close endpoint.
 */
export const PAYROLL_REVIEW_ROLES: UserRole[] = ["MASTER", "ADMIN", "CFO"];

/**
 * Where a user lands after login. Plan Anual (/plan) for everyone who can view
 * it; FIELD (caporal, data entry only — not in READ_ALL_ROLES) lands on the
 * Planilla so they don't hit an authorization error.
 */
export function landingPathForRole(role: UserRole): "/plan" | "/planilla" {
  return READ_ALL_ROLES.includes(role) ? "/plan" : "/planilla";
}

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
