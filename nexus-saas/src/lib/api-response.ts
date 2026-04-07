import { NextResponse } from "next/server";

export interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Standard success response
 */
export function apiSuccess<T>(
  data: T,
  message?: string,
  status: number = 200
): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      ...(message && { message }),
    },
    { status }
  );
}

/**
 * Standard error response
 */
export function apiError(
  code: string,
  message: string,
  status: number = 400,
  details?: Record<string, any>
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        ...(details && { details }),
      },
    },
    { status }
  );
}

/**
 * Common error handlers
 */
export const ApiErrors = {
  UNAUTHORIZED: () =>
    apiError("UNAUTHORIZED", "Authentication required", 401),

  FORBIDDEN: () =>
    apiError("FORBIDDEN", "You do not have permission to access this resource", 403),

  NOT_FOUND: (resource: string = "Resource") =>
    apiError("NOT_FOUND", `${resource} not found`, 404),

  BAD_REQUEST: (message: string = "Invalid request") =>
    apiError("BAD_REQUEST", message, 400),

  VALIDATION_ERROR: (details: Record<string, any>) =>
    apiError(
      "VALIDATION_ERROR",
      "Request validation failed",
      400,
      details
    ),

  CONFLICT: (message: string = "Resource already exists") =>
    apiError("CONFLICT", message, 409),

  INTERNAL_ERROR: (details?: Record<string, any>) =>
    apiError(
      "INTERNAL_ERROR",
      "An internal server error occurred",
      500,
      details
    ),

  INVALID_ORGANIZATION: () =>
    apiError("INVALID_ORGANIZATION", "User has no organization", 400),

  INVALID_ROLE: (role: string) =>
    apiError(
      "INVALID_ROLE",
      `You must be an ${role} to access this resource`,
      403
    ),
};

/**
 * Type-safe error logging
 */
export function logApiError(context: string, error: any): void {
  console.error(`[${context}]`, error instanceof Error ? error.message : error);
}
