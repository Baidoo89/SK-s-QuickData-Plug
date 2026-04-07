import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ApiErrors, logApiError } from "@/lib/api-response";
import { Session } from "next-auth";
import { NextResponse } from "next/server";
import { ApiErrorResponse } from "@/lib/api-response";

export type UserRole = "SUPERADMIN" | "SUBSCRIBER" | "AGENT" | "RESELLER";

export interface AuthenticatedRequest {
  session: Session;
  user: {
    id: string;
    email: string;
    role: string;
    organizationId: string | null;
  };
}

/**
 * Type guard to check if result is an error response
 */
export function isAuthError(
  result: AuthenticatedRequest | NextResponse<ApiErrorResponse>
): result is NextResponse<ApiErrorResponse> {
  return result instanceof NextResponse;
}

/**
 * Type guard to check if result is successful
 */
export function isAuthSuccess(
  result: AuthenticatedRequest | NextResponse<ApiErrorResponse>
): result is AuthenticatedRequest {
  return !isAuthError(result);
}

/**
 * Authenticate request and verify user exists
 */
export async function authenticateRequest(): Promise<AuthenticatedRequest | null> {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return null;
    }

    const user = await db.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        email: true,
        role: true,
        organizationId: true,
      },
    });

    if (!user || !user.email) {
      return null;
    }

    return {
      session,
      user: {
        ...user,
        email: user.email,
      },
    };
  } catch (error) {
    logApiError("authenticateRequest", error);
    return null;
  }
}

/**
 * Check if user has required role
 */
export function hasRole(
  user: { role: string },
  requiredRoles: string | string[]
): boolean {
  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
  return roles.includes(user.role);
}

/**
 * Check if user has organization
 */
export function hasOrganization(user: { organizationId: string | null }): boolean {
  return user.organizationId !== null;
}

/**
 * Check if user is agent (has agent account)
 */
export async function isAgentUser(userId: string): Promise<boolean> {
  try {
    const agent = await db.agent.findFirst({
      where: {
        user: {
          id: userId,
        },
      },
      select: { id: true },
    });
    return !!agent;
  } catch (error) {
    logApiError("isAgentUser", error);
    return false;
  }
}

/**
 * Guard: Require authentication
 */
export async function requireAuth() {
  const auth = await authenticateRequest();
  if (!auth) {
    return ApiErrors.UNAUTHORIZED();
  }
  return auth;
}

/**
 * Guard: Require specific role
 */
export async function requireRole(requiredRoles: string | string[]) {
  const auth = await authenticateRequest();
  if (!auth) {
    return ApiErrors.UNAUTHORIZED();
  }

  if (!hasRole(auth.user, requiredRoles)) {
    const roleStr = Array.isArray(requiredRoles)
      ? requiredRoles.join(" or ")
      : requiredRoles;
    return ApiErrors.INVALID_ROLE(roleStr);
  }

  return auth;
}

/**
 * Guard: Require organization
 */
export async function requireOrganization() {
  const auth = await authenticateRequest();
  if (!auth) {
    return ApiErrors.UNAUTHORIZED();
  }

  if (!hasOrganization(auth.user)) {
    return ApiErrors.INVALID_ORGANIZATION();
  }

  return auth;
}

/**
 * Guard: Require authentication and organization
 */
export async function requireAuthAndOrg() {
  const auth = await authenticateRequest();
  if (!auth) {
    return ApiErrors.UNAUTHORIZED();
  }

  if (!hasOrganization(auth.user)) {
    return ApiErrors.INVALID_ORGANIZATION();
  }

  return auth;
}

/**
 * Guard: Require organization and a manager role.
 * In this project, organization managers are SUPERADMIN or SUBSCRIBER.
 */
export async function requireOrgManager() {
  const auth = await requireAuthAndOrg();
  if (isAuthError(auth)) {
    return auth;
  }

  if (!hasRole(auth.user, ["SUPERADMIN", "SUBSCRIBER"])) {
    return ApiErrors.FORBIDDEN();
  }

  return auth;
}

/**
 * Guard: Require SUPERADMIN role
 */
export async function requireAdmin() {
  return requireRole("SUPERADMIN");
}

/**
 * Guard: Require AGENT role (in User model)
 */
export async function requireAgentRole() {
  return requireRole("AGENT");
}
