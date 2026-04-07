import { requireOrgManager, isAuthError } from "@/lib/auth-guard";
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { randomBytes } from "crypto";

export async function POST(req: Request) {
  try {
    const authResult = await requireOrgManager();
    if (isAuthError(authResult)) {
      return authResult;
    }

    const body = await req.json();
    const { name } = body;

    if (!name) {
      return ApiErrors.BAD_REQUEST("Name is required");
    }

    const key = "sk_" + randomBytes(24).toString("hex");

    const apiKey = await db.apiKey.create({
      data: {
        name,
        key,
        organizationId: authResult.user.organizationId!,
      },
    });

    return apiSuccess(apiKey, "API key created", 201);
  } catch (error) {
    logApiError("[API_KEYS_POST]", error);
    return ApiErrors.INTERNAL_ERROR();
  }
}

export async function DELETE(req: Request) {
  try {
    const authResult = await requireOrgManager();
    if (isAuthError(authResult)) {
      return authResult;
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return ApiErrors.BAD_REQUEST("ID is required");
    }

    const deleted = await db.apiKey.deleteMany({
      where: {
        id,
        organizationId: authResult.user.organizationId!,
      },
    });

    if (!deleted.count) {
      return ApiErrors.NOT_FOUND("API key");
    }

    return apiSuccess({ deleted: true });
  } catch (error) {
    logApiError("[API_KEYS_DELETE]", error);
    return ApiErrors.INTERNAL_ERROR();
  }
}
