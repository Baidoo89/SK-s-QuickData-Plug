import { requireAuthAndOrg, isAuthError } from "@/lib/auth-guard";
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response";
import { db as prisma } from "@/lib/db";
import { refreshSubscriberStorefrontSlug, slugifyStorefrontHandle } from "@/lib/storefront-links";
import { z } from "zod";

const updateOrganizationSchema = z.object({
  name: z.string().min(2),
});

async function uniqueOrganizationSlug(base: string, ignoreId: string) {
  const cleanBase = slugifyStorefrontHandle(base) || "organization";
  let candidate = cleanBase;
  let suffix = 2;

  while (true) {
    const existing = await prisma.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing || existing.id === ignoreId) return candidate;
    candidate = `${cleanBase}-${suffix}`;
    suffix += 1;
  }
}

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

    const nextSlug = await uniqueOrganizationSlug(body.name, organization.id);

    const updated = await prisma.organization.update({
      where: {
        id: organization.id,
      },
      data: {
        name: body.name,
        slug: nextSlug,
      },
    });

    const storePath = await refreshSubscriberStorefrontSlug({
      organizationId: updated.id,
      organizationName: updated.name,
      organizationSlug: updated.slug,
    });

    return apiSuccess({ ...updated, storePath });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return ApiErrors.VALIDATION_ERROR(error.flatten().fieldErrors);
    }
    logApiError("[ORGANIZATION_UPDATE]", error);
    return ApiErrors.INTERNAL_ERROR();
  }
}
