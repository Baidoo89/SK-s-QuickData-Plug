import { requireAuthAndOrg, isAuthError } from "@/lib/auth-guard";
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response";
import { db as prisma } from "@/lib/db";
import { z } from "zod";

const updateOrganizationSchema = z.object({
  name: z.string().min(2),
});

export async function PUT(req: Request) {
  try {
    const authResult = await requireAuthAndOrg();
    if (isAuthError(authResult)) {
      return authResult;
    }

    const json = await req.json();
    const body = updateOrganizationSchema.parse(json);

    const organization = await prisma.organization.findUnique({
      where: { id: authResult.user.organizationId! },
      select: { id: true },
    });

    if (!organization) {
      return ApiErrors.NOT_FOUND("Organization");
    }

    const updated = await prisma.organization.update({
      where: {
        id: organization.id,
      },
      data: {
        name: body.name,
        slug: body.name.toLowerCase().replace(/\s+/g, "-"),
      },
    });

    return apiSuccess(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return ApiErrors.VALIDATION_ERROR(error.flatten().fieldErrors);
    }
    logApiError("[ORGANIZATION_UPDATE]", error);
    return ApiErrors.INTERNAL_ERROR();
  }
}
